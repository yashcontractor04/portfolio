"""Estimate pi by throwing random points at a square.

A point (x, y) with x, y in [0, 1) lies inside the quarter circle of radius 1
when x*x + y*y < 1. The quarter circle covers pi/4 of the square, so
pi is about 4 * (points inside) / (points thrown).

This is the reference runner: small, real computation, no external data.
"""

from __future__ import annotations

import math
import random
import time

from pydantic import BaseModel, ConfigDict, Field

from ..contract import Context, Result, Series, Table


class Params(BaseModel):
    model_config = ConfigDict(extra="forbid")
    samples: int = Field(default=1_000_000, ge=1_000, le=5_000_000)
    seed: int = Field(default=42, ge=0, le=1_000_000)


def run(params: Params, ctx: Context) -> Result:
    rng = random.Random(params.seed)  # fixed seed: the same inputs always give the same result
    checkpoints = 60
    step = max(params.samples // checkpoints, 1)
    inside = 0
    estimate_line: list[tuple[float, float]] = []
    rows: list[list[str | float | int | None]] = []
    started = time.perf_counter()

    ctx.log(f"Throwing {params.samples:,} random points (seed {params.seed})")
    for n in range(1, params.samples + 1):
        x, y = rng.random(), rng.random()
        if x * x + y * y < 1.0:
            inside += 1
        if n % step == 0 or n == params.samples:
            estimate = 4 * inside / n
            estimate_line.append((n, round(estimate, 6)))
            if len(estimate_line) % 10 == 0 or n == params.samples:
                rows.append([n, round(estimate, 6), round(abs(estimate - math.pi), 6)])
            if len(estimate_line) == checkpoints // 2:
                ctx.log(f"Halfway: estimate {estimate:.5f}")

    estimate = 4 * inside / params.samples
    seconds = time.perf_counter() - started
    ctx.log(f"Done: {estimate:.6f} (off by {abs(estimate - math.pi):.6f}) in {seconds:.2f}s")

    return Result(
        summary={
            "estimate": round(estimate, 6),
            "error": round(abs(estimate - math.pi), 6),
            "samples": params.samples,
            "seconds": round(seconds, 2),
        },
        series=[
            Series(name="estimate", points=estimate_line),
            Series(name="pi", points=[(estimate_line[0][0], math.pi), (params.samples, math.pi)]),
        ],
        tables=[Table(title="Convergence", columns=["samples", "estimate", "error"], rows=rows)],
    )
