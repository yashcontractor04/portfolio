"""The contract every runner follows.

A runner is a Python module in worker/runners/ with two things:

    class Params(BaseModel): ...          # the inputs, validated by pydantic
    def run(params: Params, ctx: Context) -> Result: ...

The worker never trusts what is stored in the database: it validates the job's
params with `Params` before calling `run`, even though the website validated
them already.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Series(BaseModel):
    """One line on a chart: a name and a list of [x, y] points."""

    model_config = ConfigDict(extra="forbid")
    name: str = Field(max_length=60)
    points: list[tuple[float, float]] = Field(max_length=2000)


class Table(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(max_length=80)
    columns: list[str] = Field(max_length=12)
    rows: list[list[str | float | int | None]] = Field(max_length=500)


class Result(BaseModel):
    """What a runner returns. The website renders it without knowing the runner:
    `summary` becomes stat tiles, `series` a line chart, `tables` tables."""

    model_config = ConfigDict(extra="forbid")
    summary: dict[str, str | float | int] = Field(default_factory=dict, max_length=12)
    series: list[Series] = Field(default_factory=list, max_length=8)
    tables: list[Table] = Field(default_factory=list, max_length=4)


@dataclass(frozen=True)
class Context:
    """What the worker hands to a runner."""

    job_id: str
    is_demo: bool
    log: Callable[[str], None]  # writes a line to the job's log (visible to the user)


class RunnerError(Exception):
    """Raise from a runner for an expected failure the user should see.

    retryable=True means "try again later" (e.g. a data provider timed out).
    """

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


JsonDict = dict[str, Any]
