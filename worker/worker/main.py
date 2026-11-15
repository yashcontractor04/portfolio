"""The worker loop.

    while True:
        housekeeping once a minute (recover dead jobs, start due schedules, purge)
        claim one job   -> queue.claim_job()   (SELECT ... FOR UPDATE SKIP LOCKED)
        run it          -> execute.execute()   (child process, timeout, heartbeat)
        write it back   -> queue.complete_job() / queue.fail_job()

The worker only makes OUTBOUND connections (to Postgres). It listens on no port.
It talks to the database only through functions in the `queue` schema, using the
least-privilege role `app_worker`.
"""

from __future__ import annotations

import logging
import os
import signal
import socket
import sys
import time

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .execute import execute

log = logging.getLogger("worker")

POLL_SECONDS = 2.0
HOUSEKEEPING_SECONDS = 60.0
PURGE_SECONDS = 600.0


class Worker:
    def __init__(self, database_url: str, worker_id: str) -> None:
        self.database_url = database_url
        self.worker_id = worker_id
        self.conn: psycopg.Connection | None = None
        self.stopping = False
        self._last_housekeeping = 0.0
        self._last_purge = 0.0

    # -- database helpers ----------------------------------------------------
    def _connect(self) -> psycopg.Connection:
        # autocommit: every call is its own short transaction.
        conn = psycopg.connect(self.database_url, autocommit=True, row_factory=dict_row, connect_timeout=10)
        log.info("connected to database as %s", conn.info.user)
        return conn

    def _call(self, sql: str, *args: object) -> list[dict]:
        if self.conn is None or self.conn.closed:
            self.conn = self._connect()
        with self.conn.cursor() as cur:
            cur.execute(sql, args)  # parameters are always passed separately: no SQL injection
            return cur.fetchall() if cur.description else []

    # -- one iteration -------------------------------------------------------
    def housekeeping(self) -> None:
        now = time.monotonic()
        if now - self._last_housekeeping >= HOUSEKEEPING_SECONDS:
            self._last_housekeeping = now
            reaped = self._call("select queue.reap_stale() as n")[0]["n"]
            scheduled = self._call("select queue.enqueue_due_schedules() as n")[0]["n"]
            if reaped or scheduled:
                log.info(
                    "housekeeping: %s stale job(s) recovered, %s scheduled job(s) enqueued", reaped, scheduled
                )
        if now - self._last_purge >= PURGE_SECONDS:
            self._last_purge = now
            self._call("select queue.purge()")

    def run_one(self) -> bool:
        """Claim and run at most one job. Returns False when the queue is empty."""
        rows = self._call("select * from queue.claim_job(%s)", self.worker_id)
        if not rows:
            return False
        job = rows[0]
        job_id = str(job["id"])
        log.info(
            "job %s claimed: %s (%s, attempt %s)", job_id, job["runner_slug"], job["kind"], job["attempts"]
        )

        outcome = execute(
            slug=job["runner_slug"],
            params=job["params"],
            job_id=job_id,
            is_demo=job["kind"] == "demo",
            timeout_seconds=job["timeout_seconds"],
            on_log=lambda text: self._call(
                "select queue.append_log(%s, %s, 'info', %s)", job_id, self.worker_id, text
            ),
            heartbeat=lambda: self._call("select queue.heartbeat(%s, %s) as alive", job_id, self.worker_id)[
                0
            ]["alive"],
        )

        if outcome.lost:
            log.info("job %s was cancelled or reassigned; result discarded", job_id)
        elif outcome.ok and outcome.result is not None:
            self._call(
                "select queue.complete_job(%s, %s, %s, %s, %s)",
                job_id,
                self.worker_id,
                Jsonb(outcome.result["summary"]),
                Jsonb(outcome.result["series"]),
                Jsonb(outcome.result["tables"]),
            )
            log.info("job %s succeeded", job_id)
        else:
            sql = "select queue.fail_job(%s, %s, %s, %s) as status"
            status = self._call(sql, job_id, self.worker_id, outcome.error, outcome.retryable)[0]["status"]
            log.info("job %s failed (%s): %s", job_id, status, outcome.error)
        return True

    def run_forever(self) -> None:
        backoff = 1.0
        while not self.stopping:
            try:
                self.housekeeping()
                if not self.run_one():
                    time.sleep(POLL_SECONDS)
                backoff = 1.0
            except psycopg.OperationalError as exc:
                # Database unreachable: drop the connection and retry with backoff (max 60s).
                # The driver's message names the host and user but never the password.
                reason = " ".join(str(exc).split())[:400] or type(exc).__name__
                log.warning("database connection failed: %s; retrying in %.0fs", reason, backoff)
                if self.conn is not None:
                    self.conn.close()
                self.conn = None
                time.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
        log.info("stopped")

    def stop(self, *_: object) -> None:
        log.info("stop requested; finishing the current job first")
        self.stopping = True


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    database_url = os.environ.get("WORKER_DATABASE_URL")
    if not database_url:
        log.error("WORKER_DATABASE_URL is not set")
        return 1
    worker = Worker(database_url, os.environ.get("WORKER_ID") or f"worker-{socket.gethostname()}")
    signal.signal(signal.SIGTERM, worker.stop)
    signal.signal(signal.SIGINT, worker.stop)
    log.info("worker %s starting", worker.worker_id)
    worker.run_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
