"""Registry of runners: project slug -> module.

To add a runner: create worker/runners/<name>.py with `Params` and `run`
(see worker/contract.py) and add one line here. The key must equal the project
folder name under projects/.
"""

import os
from types import ModuleType

from . import monte_carlo_pi, stock_sim

REGISTRY: dict[str, ModuleType] = {
    "monte-carlo-pi": monte_carlo_pi,
    "stock-sim": stock_sim,
}

if os.environ.get("WORKER_ENABLE_TEST_RUNNERS") == "1":  # never set in production
    from . import _sleep

    REGISTRY["test-sleep"] = _sleep
