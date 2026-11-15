import math
import os

import pytest
from pydantic import ValidationError

from worker.contract import Context, Result
from worker.execute import execute
from worker.runners import REGISTRY, monte_carlo_pi, stock_sim

os.environ["WORKER_ENABLE_TEST_RUNNERS"] = "1"  # inherited by the child processes

CTX = Context(job_id="test", is_demo=True, log=lambda _: None)


def test_pi_is_close_and_deterministic():
    params = monte_carlo_pi.Params(samples=200_000, seed=42)
    first = monte_carlo_pi.run(params, CTX)
    second = monte_carlo_pi.run(params, CTX)
    assert abs(first.summary["estimate"] - math.pi) < 0.02
    assert first == second  # same seed, same result: every demo run starts from the same state
    Result.model_validate(first)


def test_pi_rejects_out_of_range_inputs():
    with pytest.raises(ValidationError):
        monte_carlo_pi.Params(samples=10**9)
    with pytest.raises(ValidationError):
        monte_carlo_pi.Params(samples=1000, unknown_field=1)


def test_stock_sim_params_validation():
    ok = stock_sim.Params(tickers=["aapl", "MSFT"], weights=[60, 40], start_date="2019-01-01")
    assert ok.tickers == ["AAPL", "MSFT"]
    with pytest.raises(ValidationError, match="add up to 100"):
        stock_sim.Params(tickers=["AAPL", "MSFT"], weights=[60, 30], start_date="2019-01-01")
    with pytest.raises(ValidationError, match="one weight per ticker"):
        stock_sim.Params(tickers=["AAPL"], weights=[50, 50], start_date="2019-01-01")
    with pytest.raises(ValidationError):
        stock_sim.Params(tickers=["AAPL; drop table"], weights=[100], start_date="2019-01-01")


def test_every_runner_has_the_contract():
    for slug, module in REGISTRY.items():
        assert hasattr(module, "Params") and callable(module.run), slug


def _run(slug, params, timeout=20, heartbeat=lambda: True, every=15.0):
    logs = []
    outcome = execute(
        slug=slug,
        params=params,
        job_id="t",
        is_demo=True,
        timeout_seconds=timeout,
        on_log=logs.append,
        heartbeat=heartbeat,
        heartbeat_every=every,
    )
    return outcome, logs


def test_execute_success_collects_logs():
    outcome, logs = _run("monte-carlo-pi", {"samples": 50_000, "seed": 1})
    assert outcome.ok and outcome.result["summary"]["samples"] == 50_000
    assert any("Done" in line for line in logs)


def test_execute_invalid_params_is_a_clean_error():
    outcome, _ = _run("monte-carlo-pi", {"samples": "lots"})
    assert not outcome.ok and "invalid parameters" in outcome.error and not outcome.retryable


def test_execute_unknown_runner_and_unimplemented_runner():
    assert "no runner" in _run("nope", {})[0].error
    outcome, _ = _run("stock-sim", {"tickers": ["AAPL"], "weights": [100], "start_date": "2019-01-01"})
    assert not outcome.ok and "not implemented" in outcome.error


def test_execute_kills_a_job_that_runs_too_long():
    outcome, _ = _run("test-sleep", {"seconds": 30}, timeout=1)
    assert not outcome.ok and "timed out" in outcome.error


def test_execute_stops_when_the_job_is_cancelled():
    outcome, _ = _run("test-sleep", {"seconds": 30}, heartbeat=lambda: False, every=0.2)
    assert outcome.lost
