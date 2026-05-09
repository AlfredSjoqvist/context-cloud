"""Tensorlake-deployed Guardian Agent cycle.

Runs the Guardian's `npm run agent:once` cycle inside a Tensorlake sandbox on
a 60-second cron schedule. Each tick is one full WAKE → PLAN → SCAN → ANALYZE
→ HANDOFF → RECONCILE → SLEEP cycle: the Node agent talks to Convex, Nia,
OpenAI, GitHub, and Devin directly via its own .env-loaded credentials.

Trigger: cron `* * * * *` (every minute, configurable at deploy time).

Local mode (no Tensorlake SDK installed): this file imports cleanly and the
decorator becomes a no-op, so `python tensorlake/guardian_cycle.py` still
runs the cycle once via subprocess. That keeps local dev parity with the
sandbox path.

Required env on the Tensorlake function (mirror our root .env):
    NIA_API_KEY, NIA_MCP_URL, CONVEX_URL, OPENAI_API_KEY, OPENAI_MODEL,
    OPENAI_CRITIQUE_MODEL, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO,
    DEVIN_API_KEY, GUARDIAN_CYCLE_INTERVAL_S, GUARDIAN_PRIORITY_BUDGET,
    GUARDIAN_JUDGMENT_BUDGET, USE_MOCK_LLM=0, USE_MOCK_DEVIN=0, SKIP_NIA=0,
    DEMO_REPO_LOCAL_PATH

Deploy:
    pip install tensorlake
    export TENSORLAKE_API_KEY=<your key>
    tensorlake deploy tensorlake/guardian_cycle.py \\
        --name guardian-cycle --schedule '* * * * *'
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

_ROOT = Path(__file__).resolve().parent.parent

try:
    from tensorlake.functions_sdk.functions import tensorlake_function  # type: ignore
except Exception:  # pragma: no cover — local fallback
    def tensorlake_function(*_args: Any, **_kwargs: Any):  # type: ignore
        def deco(fn):
            return fn

        return deco


@tensorlake_function(
    name="guardian-cycle",
    timeout_seconds=180,
)
def cycle(_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """One Guardian cycle. Returns exit code + tail of stdout/stderr."""
    env = os.environ.copy()
    # Demo target path defaults to a sibling directory; override via env on deploy.
    env.setdefault("DEMO_REPO_LOCAL_PATH", str(_ROOT.parent / "guardian-demo-target"))

    try:
        proc = subprocess.run(
            ["npm", "run", "agent:once"],
            cwd=_ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=150,
        )
        return {
            "exit_code": proc.returncode,
            "stdout_tail": proc.stdout[-2000:],
            "stderr_tail": proc.stderr[-2000:],
        }
    except subprocess.TimeoutExpired:
        return {
            "exit_code": 124,
            "stdout_tail": "",
            "stderr_tail": "agent cycle exceeded 150s timeout",
        }


if __name__ == "__main__":
    result = cycle({})
    print(result)
    sys.exit(0 if result["exit_code"] == 0 else 1)
