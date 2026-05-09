"""Tensorlake-deployed GC.

Wraps `nm_gc.run_once` so it runs as a scheduled Tensorlake function. The
schedule is the live cron tick judges see during the demo — every ~15 min,
GC decays / merges / prunes notes and writes one row per action to
`gc_actions`. Convex mirroring is built into nm_gc, so the dashboard updates
reactively.

Local: `python nm_gc.py --loop --interval 900` does the same thing.

Deploy:
    pip install tensorlake
    export TENSORLAKE_API_KEY=<your key>
    tensorlake deploy tensorlake/gc.py --name nm-gc --schedule '*/15 * * * *'
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from nm_gc import run_once  # noqa: E402

try:
    from tensorlake.functions_sdk.functions import tensorlake_function  # type: ignore
except Exception:
    def tensorlake_function(*_args, **_kwargs):  # type: ignore
        def deco(fn):
            return fn
        return deco


@tensorlake_function(
    name="nm-gc",
    timeout_seconds=180,
    schedule="*/15 * * * *",   # every 15 minutes
)
def run(_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    return run_once(dry_run=False)


if __name__ == "__main__":
    import json
    print(json.dumps(run({}), indent=2, default=str))
