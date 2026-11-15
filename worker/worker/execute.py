"""Runs one job in a separate process, with a hard timeout.

Why a separate process: a runner is arbitrary Python. If it hangs or eats memory,
the worker can kill the child process and stay alive itself. A thread cannot be
killed; a process can.
"""

from __future__ import annotations

import multiprocessing as mp
import resource
import time
from collections.abc import Callable
from dataclasses import dataclass
from multiprocessing.connection import Connection

from pydantic import ValidationError

from .contract import Context, JsonDict, Result, RunnerError
from .runners import REGISTRY

MAX_RESULT_BYTES = 900_000  # the database refuses results over 1 MB
MAX_MEMORY_BYTES = 1_500_000_000
MAX_LOG_LINES = 200


@dataclass(frozen=True)
class Outcome:
    ok: bool
    result: JsonDict | None = None
    error: str | None = None
    retryable: bool = False
    lost: bool = False  # the job was cancelled or reaped while running: write nothing back


def _child(
    slug: str, raw_params: JsonDict, job_id: str, is_demo: bool, timeout: int, pipe: Connection
) -> None:
    """Runs inside the child process. Sends ("log", text) lines and one final message."""
    try:
        # Second line of defence behind the parent's timer: the OS stops the
        # process if it burns too much CPU time or memory.
        resource.setrlimit(resource.RLIMIT_CPU, (timeout + 5, timeout + 10))
        try:
            resource.setrlimit(resource.RLIMIT_AS, (MAX_MEMORY_BYTES, MAX_MEMORY_BYTES))
        except (ValueError, OSError):
            pass  # not supported on every platform (e.g. macOS)

        module = REGISTRY.get(slug)
        if module is None:
            pipe.send(("error", f"no runner registered for '{slug}'", False))
            return
        try:
            params = module.Params.model_validate(raw_params)
        except ValidationError as exc:
            problems = "; ".join(
                f"{'.'.join(map(str, e['loc'])) or 'input'}: {e['msg']}" for e in exc.errors()[:5]
            )
            pipe.send(("error", f"invalid parameters: {problems}", False))
            return

        sent = 0

        def log(message: str) -> None:
            nonlocal sent
            if sent < MAX_LOG_LINES:
                sent += 1
                pipe.send(("log", str(message)[:2000]))

        result = module.run(params, Context(job_id=job_id, is_demo=is_demo, log=log))
        payload = Result.model_validate(result).model_dump(mode="json")
        pipe.send(("ok", payload))
    except RunnerError as exc:
        pipe.send(("error", str(exc)[:2000], exc.retryable))
    except NotImplementedError as exc:
        pipe.send(("error", str(exc) or "this runner is not implemented yet", False))
    except MemoryError:
        pipe.send(("error", "the run used too much memory", False))
    except Exception as exc:  # noqa: BLE001 - last resort: never leak a traceback to the user
        pipe.send(("error", f"the run crashed ({type(exc).__name__})", False))
    finally:
        pipe.close()


def execute(
    *,
    slug: str,
    params: JsonDict,
    job_id: str,
    is_demo: bool,
    timeout_seconds: int,
    on_log: Callable[[str], None],
    heartbeat: Callable[[], bool],
    heartbeat_every: float = 15.0,
) -> Outcome:
    """Run the job; call heartbeat() regularly; kill the child on timeout or cancel."""
    ctx = mp.get_context("spawn")  # a clean interpreter: the child shares nothing with the worker
    parent_end, child_end = ctx.Pipe(duplex=False)
    process = ctx.Process(
        target=_child, args=(slug, params, job_id, is_demo, timeout_seconds, child_end), daemon=True
    )
    process.start()
    child_end.close()

    started = time.monotonic()
    last_beat = started
    outcome: Outcome | None = None
    try:
        while outcome is None:
            if parent_end.poll(0.5):
                try:
                    message = parent_end.recv()
                except EOFError:
                    break  # child died without a final message
                if message[0] == "log":
                    on_log(message[1])
                elif message[0] == "ok":
                    outcome = Outcome(ok=True, result=message[1])
                else:
                    outcome = Outcome(ok=False, error=message[1], retryable=message[2])
            elif not process.is_alive():
                break
            now = time.monotonic()
            if outcome is None and now - started > timeout_seconds:
                outcome = Outcome(ok=False, error=f"timed out after {timeout_seconds}s")
            elif outcome is None and now - last_beat >= heartbeat_every:
                last_beat = now
                if not heartbeat():
                    outcome = Outcome(ok=False, lost=True)
    finally:
        if process.is_alive():
            process.kill()
        process.join(timeout=5)
        parent_end.close()

    if outcome is None:
        return Outcome(ok=False, error="the run stopped unexpectedly (out of memory or CPU limit)")
    if outcome.ok:
        import json

        if len(json.dumps(outcome.result)) > MAX_RESULT_BYTES:
            return Outcome(ok=False, error="the result is too large to store")
    return outcome
