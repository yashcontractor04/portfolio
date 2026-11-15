"""Test-only runner that just waits. Registered only when WORKER_ENABLE_TEST_RUNNERS=1."""

import time

from pydantic import BaseModel, Field

from ..contract import Context, Result


class Params(BaseModel):
    seconds: float = Field(default=1, ge=0, le=60)


def run(params: Params, ctx: Context) -> Result:
    time.sleep(params.seconds)
    return Result(summary={"slept": params.seconds})
