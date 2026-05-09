# Tensorlake — Guardian Cycle

Always-on execution wrapper for the Guardian agent. The Node cycle (`npm run agent:once`) gets invoked from Python on a 60-second cron tick inside a Tensorlake sandbox.

## Why a Python wrapper

Tensorlake's first-class SDK is Python. Our agent is Node/TypeScript. The wrapper at `tensorlake/guardian_cycle.py` is a thin `subprocess.run(["npm", "run", "agent:once"])` shim — it inherits the function's environment (so all credentials live in Tensorlake secrets, not the repo), captures stdout/stderr tails, and returns a structured result for the Tensorlake event log.

Local dev parity: with `pip install tensorlake` absent, the decorator becomes a no-op and `python tensorlake/guardian_cycle.py` runs the same cycle directly. No drift between sandbox and local.

## Deploy

```bash
pip install tensorlake
export TENSORLAKE_API_KEY=<your hackathon key>
tensorlake deploy tensorlake/guardian_cycle.py \
  --name guardian-cycle \
  --schedule '* * * * *'   # every minute; tighten/loosen at will
```

## Function secrets

Set these via the Tensorlake CLI or web console (mirror the local `.env`, **never** commit them):

| Key                          | Source                                      |
|------------------------------|---------------------------------------------|
| `NIA_API_KEY`                | nk_…                                        |
| `NIA_MCP_URL`                | `https://apigcp.trynia.ai/mcp`              |
| `CONVEX_URL`                 | `https://acoustic-fish-389.convex.cloud`    |
| `OPENAI_API_KEY`             | sk-proj-…                                   |
| `OPENAI_MODEL`               | `gpt-5`                                     |
| `OPENAI_CRITIQUE_MODEL`      | `gpt-5-mini`                                |
| `GITHUB_TOKEN`               | PAT with `repo` scope on the demo target    |
| `GITHUB_OWNER`               | `NewCoder3294`                              |
| `GITHUB_REPO`                | `demo-target`                               |
| `DEVIN_API_KEY`              | Devin org/user key                          |
| `GUARDIAN_CYCLE_INTERVAL_S`  | `60`                                        |
| `GUARDIAN_PRIORITY_BUDGET`   | `3`                                         |
| `GUARDIAN_JUDGMENT_BUDGET`   | `1`                                         |
| `USE_MOCK_LLM`               | `0`                                         |
| `USE_MOCK_DEVIN`             | `0`                                         |
| `SKIP_NIA`                   | `0`                                         |
| `DEMO_REPO_LOCAL_PATH`       | sandbox-local clone path of the demo repo   |

Tensorlake's runtime needs `node>=20` + `npm` available; bake those into the function's image (Tensorlake's docs cover the deps file).

## Cycle semantics inside Tensorlake

- **One tick = one cycle.** No persistent process, so SIGINT/SIGTERM handling on the Node side is moot — the function just returns when the cycle finishes.
- **Idempotency** is preserved by the cycle's own state machine: every mutation lands in Convex before the next phase, so a sandbox dying mid-cycle is retried by the next tick reading from Convex. No special restart logic needed here.
- **Reconcile runs every cycle**, so PR-merge events are picked up within the cron interval (≤60s lag in this config).

## Demo dashboard

The Vercel-hosted UI at `ui/` subscribes live to Convex events. With Tensorlake firing cycles every minute, the dashboard streams: WAKE → PLAN → SCAN → analyze → finding → filed issue → devin spawned → reconcile pr_open → pr_merged → resolved/sharpened, all without human intervention.
