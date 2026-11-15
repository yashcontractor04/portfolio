"""Stock allocation simulator: SKELETON for Yash to implement.

What already works around this file:
  - the website builds the input form from projects/stock-sim/project.yaml
  - `Params` below validates those inputs again inside the worker
  - whatever `run` returns is stored and drawn by the website (see contract.Result)

What you implement: `run`. Suggested first version
  1. load daily closing prices for params.tickers (+ benchmark) from start_date
     (read the `price_bars` table first; fetch and insert only what is missing,
     so a ticker is downloaded once and shared by all users)
  2. buy the allocation on the first day with params.initial_capital
  3. on each rebalance date, reset the holdings to the target weights
  4. return summary (final value, total return, CAGR, max drawdown), a series for
     the portfolio and one for the benchmark, and a table of yearly returns

Raise RunnerError("message") for problems the user can fix (unknown ticker),
and RunnerError("...", retryable=True) when the data provider is temporarily down.

When it works: set `status: live` in projects/stock-sim/project.yaml, run
`python scripts/sync_runners.py`, and apply the printed SQL.
"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..contract import Context, Result

Ticker = str


class Params(BaseModel):
    """Mirrors runner.inputs in projects/stock-sim/project.yaml. Keep them in sync."""

    model_config = ConfigDict(extra="forbid")
    tickers: list[Ticker] = Field(min_length=1, max_length=10)
    weights: list[float] = Field(min_length=1, max_length=10)
    start_date: dt.date
    initial_capital: float = Field(default=10_000, ge=100, le=10_000_000)
    rebalance: Literal["never", "monthly", "quarterly", "yearly"] = "quarterly"
    benchmark: Ticker | None = "SPY"

    @field_validator("tickers")
    @classmethod
    def _tickers(cls, value: list[str]) -> list[str]:
        import re

        cleaned = [t.strip().upper() for t in value]
        if any(not re.fullmatch(r"[A-Z0-9.\-]{1,12}", t) for t in cleaned):
            raise ValueError("tickers may only contain letters, digits, dots and dashes")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("each ticker may appear only once")
        return cleaned

    @field_validator("start_date")
    @classmethod
    def _start(cls, value: dt.date) -> dt.date:
        if not dt.date(2005, 1, 1) <= value <= dt.date.today():
            raise ValueError("start_date must be between 2005-01-01 and today")
        return value

    @model_validator(mode="after")
    def _weights(self) -> Params:
        if len(self.weights) != len(self.tickers):
            raise ValueError("give exactly one weight per ticker")
        if any(w < 0 or w > 100 for w in self.weights):
            raise ValueError("each weight must be between 0 and 100")
        if abs(sum(self.weights) - 100) > 0.01:
            raise ValueError("weights must add up to 100")
        return self


def run(params: Params, ctx: Context) -> Result:
    raise NotImplementedError("The stock simulator is not implemented yet.")
