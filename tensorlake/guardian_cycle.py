"""Tensorlake-deployed Guardian Agent cycle.

Runs the Guardian's `npm run agent:once` cycle inside a Tensorlake sandbox.
Each invocation is one full WAKE → PLAN → SCAN → ANALYZE → HANDOFF →
RECONCILE → SLEEP cycle. The Node agent talks to Convex, Nia, OpenAI,
GitHub, and Devin directly via its own .env-loaded credentials.

Trigger: webhook (Tensorlake's standard execution model). For cron-like
behaviour, an external scheduler (GitHub Actions, Vercel cron, plain
launchd/cron) hits the function URL on whatever interval you want. The
function is idempotent — multiple overlapping invocations write to Convex
under different cycle numbers and dedup via the finding fingerprint.

Required env on the Tensorlake function (mirror the root .env):
    NIA_API_KEY, NIA_MCP_URL, CONVEX_URL, OPENAI_API_KEY, OPENAI_MODEL,
    OPENAI_CRITIQUE_MODEL, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO,
    DEVIN_API_KEY, GUARDIAN_CYCLE_INTERVAL_S, GUARDIAN_PRIORITY_BUDGET,
    GUARDIAN_JUDGMENT_BUDGET, USE_MOCK_LLM=0, USE_MOCK_DEVIN=0, SKIP_NIA=0,
    DEMO_REPO_LOCAL_PATH

Deploy:
    pip install tensorlake
    export TENSORLAKE_API_KEY=<your key>
    tensorlake deploy tensorlake/guardian_cycle.py
"""

import os
import subprocess
from pathlib import Path

from pydantic import BaseModel


class CycleInput(BaseModel):
    """Optional payload — Tensorlake invokers pass {} by default."""

    note: str = ""


class CycleResult(BaseModel):
    exit_code: int
    stdout_tail: str
    stderr_tail: str

_ROOT = Path(__file__).resolve().parent.parent

try:
    from tensorlake.applications import Image, application, function  # type: ignore

    # Image carries Node 20 + git only. Agent source is git-cloned at function
    # execution time so we never need to walk above the build context.
    _IMAGE = (
        Image(name="guardian-runtime")
        .run("apt-get update && apt-get install -y curl ca-certificates git")
        .run(
            "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && "
            "apt-get install -y nodejs"
        )
    )

    _AGENT_REPO_URL = "https://github.com/AlfredSjoqvist/context-cloud.git"
    _AGENT_REPO_BRANCH = "nicolas/plan-1-foundation"
    _DEMO_REPO_URL = "https://github.com/NewCoder3294/demo-target.git"
    _DEMO_REPO_BRANCH = "main"

    _SECRETS = [
        "NIA_API_KEY",
        "NIA_MCP_URL",
        "CONVEX_URL",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "OPENAI_CRITIQUE_MODEL",
        "GITHUB_TOKEN",
        "GITHUB_OWNER",
        "GITHUB_REPO",
        "DEVIN_API_KEY",
        "GUARDIAN_CYCLE_INTERVAL_S",
        "GUARDIAN_PRIORITY_BUDGET",
        "GUARDIAN_JUDGMENT_BUDGET",
        "USE_MOCK_LLM",
        "USE_MOCK_DEVIN",
        "SKIP_NIA",
        "DEMO_REPO_LOCAL_PATH",
    ]
except Exception:  # pragma: no cover — local fallback
    Image = None  # type: ignore
    _IMAGE = None  # type: ignore
    _SECRETS = []  # type: ignore

    def application(**_kwargs):  # type: ignore
        def deco(fn):
            return fn

        return deco

    def function(**_kwargs):  # type: ignore
        def deco(fn):
            return fn

        return deco


def _run_cycle_local() -> CycleResult:
    """Local-dev path: run cycle from the checked-out repo on this machine."""
    env = os.environ.copy()
    env.setdefault(
        "DEMO_REPO_LOCAL_PATH",
        str(_ROOT.parent / "guardian-demo-target"),
    )
    try:
        proc = subprocess.run(
            ["npm", "run", "agent:once"],
            cwd=_ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=170,
        )
        return CycleResult(
            exit_code=proc.returncode,
            stdout_tail=proc.stdout[-2000:],
            stderr_tail=proc.stderr[-2000:],
        )
    except subprocess.TimeoutExpired:
        return CycleResult(
            exit_code=124,
            stdout_tail="",
            stderr_tail="agent cycle exceeded 170s timeout",
        )


def _run_cycle_in_sandbox(
    agent_repo: str,
    agent_branch: str,
    demo_repo: str,
    demo_branch: str,
) -> CycleResult:
    """Sandbox path: git-clone agent + demo target, npm install, run one cycle."""
    APP = Path("/tmp/guardian-app")
    DEMO = Path("/tmp/guardian-demo")

    if not APP.exists():
        cp = subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", agent_branch, agent_repo, str(APP)],
            capture_output=True,
            text=True,
        )
        if cp.returncode != 0:
            return CycleResult(
                exit_code=cp.returncode,
                stdout_tail=cp.stdout[-2000:],
                stderr_tail=("agent clone failed: " + cp.stderr)[-2000:],
            )
        cp = subprocess.run(
            ["npm", "install"], cwd=APP, capture_output=True, text=True, timeout=240
        )
        if cp.returncode != 0:
            return CycleResult(
                exit_code=cp.returncode,
                stdout_tail=cp.stdout[-2000:],
                stderr_tail=("npm install failed: " + cp.stderr)[-2000:],
            )

    if not DEMO.exists():
        cp = subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", demo_branch, demo_repo, str(DEMO)],
            capture_output=True,
            text=True,
        )
        if cp.returncode != 0:
            return CycleResult(
                exit_code=cp.returncode,
                stdout_tail=cp.stdout[-2000:],
                stderr_tail=("demo clone failed: " + cp.stderr)[-2000:],
            )

    env = os.environ.copy()
    env["DEMO_REPO_LOCAL_PATH"] = str(DEMO)

    try:
        proc = subprocess.run(
            ["npm", "run", "agent:once"],
            cwd=APP,
            env=env,
            capture_output=True,
            text=True,
            timeout=170,
        )
        return CycleResult(
            exit_code=proc.returncode,
            stdout_tail=proc.stdout[-2000:],
            stderr_tail=proc.stderr[-2000:],
        )
    except subprocess.TimeoutExpired:
        return CycleResult(
            exit_code=124,
            stdout_tail="",
            stderr_tail="agent cycle exceeded 170s timeout",
        )


if _IMAGE is not None:

    @application()
    @function(image=_IMAGE, timeout=240, secrets=_SECRETS)
    def cycle(payload: CycleInput) -> CycleResult:
        """One Guardian cycle, executed inside the Tensorlake sandbox."""
        return _run_cycle_in_sandbox(
            agent_repo=_AGENT_REPO_URL,
            agent_branch=_AGENT_REPO_BRANCH,
            demo_repo=_DEMO_REPO_URL,
            demo_branch=_DEMO_REPO_BRANCH,
        )
else:

    def cycle(payload: CycleInput) -> CycleResult:
        return _run_cycle_local()


if __name__ == "__main__":
    import sys

    result = cycle(CycleInput())
    print(result.model_dump_json(indent=2))
    sys.exit(0 if result.exit_code == 0 else 1)
