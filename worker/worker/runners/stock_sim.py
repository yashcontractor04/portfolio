"""Stock allocation simulator: ADAPTER SKELETON for Yash to implement.

The simulator itself is NOT in this repo. It is its own backend:
    https://github.com/yashcontractor04/stock-simulator
This file only forwards a job to it and translates the answer. It should stay
thin: no finance, no pandas, no database.

What already works around this file:
  - the website builds the input form from projects/stock-sim/project.yaml
  - `Params` below validates those inputs again inside the worker
  - whatever `run` returns is stored and drawn by the website (see contract.Result)

What you implement: `run`. The contract you talk to is docs/openapi.yaml in the
simulator repo; the mapping table is in its docs/04-api.md.

  1. Read two settings from the environment (fail with a clear RunnerError if
     one is missing):
       SIM_API_URL        e.g. http://sim-api:8000  (private Docker network)
       SIM_SERVICE_TOKEN  the bearer token
  2. POST {SIM_API_URL}/v1/simulations with params.model_dump() as JSON.
     Send `Idempotency-Key: <ctx.job_id>`, so a retried portfolio job does not
     start a second simulation. Expect 202 (new) or 200 (already exists).
  3. Poll GET /v1/simulations/{id} until status is succeeded, failed or
     cancelled. Wait as long as the `Retry-After` header says (1-2 s). Stop
     before the runner timeout (120 s, see the manifest) and then DELETE the
     simulation so it does not keep running for nobody.
  4. Map the simulator's result to `Result` (limits are in contract.py):
       summary  8 numbers: final value, total return, CAGR, volatility, Sharpe,
                max drawdown, benchmark final value, benchmark CAGR
       series   "Portfolio" and "<benchmark> (benchmark)", x = months since
                the start, y = value. The simulator already sends at most 400
                points per line, the limit here is 2000.
       tables   allocation, yearly returns, outlook percentiles, warnings
                (at most 4 tables, 500 rows, 12 columns each)
  5. Map errors:
       status failed            -> RunnerError(error.message, retryable=error.retryable)
       HTTP 429 or 503          -> RunnerError(..., retryable=True)
       HTTP 422                 -> RunnerError(detail)  (the user can fix it)
       connection error/timeout -> RunnerError("The simulator is not reachable.", retryable=True)
     Never put the token or the internal URL into an error message or a log line.

Tests to write next to it (worker/tests): use httpx.MockTransport to fake the
simulator, so the tests need no network.

When it works: set `status: live` in projects/stock-sim/project.yaml, run
`python scripts/sync_runners.py`, apply the printed SQL, and rebuild the worker
with the extra compose file infra/docker-compose.sim.yml.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..contract import Context, Result

_ID = r"^[a-z0-9-]{1,40}$"


class Params(BaseModel):
    """Mirrors runner.inputs in projects/stock-sim/project.yaml and
    SimulationParams in the simulator's docs/openapi.yaml. Keep all three in sync."""

    model_config = ConfigDict(extra="forbid")
    capital: float = Field(default=10_000, ge=100, le=10_000_000)
    risk_level: Literal["low", "medium", "high"] = "medium"
    time_span_years: int = Field(default=10, ge=1, le=20)
    industries: list[str] = Field(default_factory=list, max_length=5)
    themes: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("industries", "themes")
    @classmethod
    def _ids(cls, value: list[str]) -> list[str]:
        import re

        cleaned = [v.strip().lower() for v in value]
        if any(not re.fullmatch(_ID, v) for v in cleaned):
            raise ValueError("ids may only contain lowercase letters, digits and dashes")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("each id may appear only once")
        return cleaned


def run(params: Params, ctx: Context) -> Result:
    raise NotImplementedError("The stock simulator adapter is not implemented yet.")
