# Tensorlake — Background Agents

Three always-on functions deploy here, each driving a different rubric line:

| File | Trigger | What it does |
|---|---|---|
| `guardian_cycle.py` | cron (every minute) | Runs one Guardian cycle: WAKE → PLAN → SCAN → ANALYZE → CRITIQUE → HANDOFF → RECONCILE |
| `note_manager.py` | webhook (POST from Claude Code Stop hook) | Distills hurdles in a captured session into notes |
| `gc.py` | cron (`*/15 * * * *`) | Decay → merge → prune the note graph |

Guardian and the NM agents share one Convex deployment but write to disjoint tables (Guardian: `cycles / findings / devinRuns / events / docsIngestRuns / fileScanHistory`; NM: `sessions / notes / files / noteFiles / hurdles / injections / gcActions`). Either side can run alone; nothing breaks if one is offline.

## Why a Python wrapper for Guardian

Tensorlake's first-class SDK is Python; the Guardian agent is Node/TypeScript. `guardian_cycle.py` is a thin `subprocess.run(["npm", "run", "agent:once"])` shim — it inherits the function's environment (so all credentials live in Tensorlake secrets, not the repo), captures stdout/stderr tails, and returns a structured result for the Tensorlake event log.

Local dev parity: with `pip install tensorlake` absent, the decorator becomes a no-op and `python tensorlake/guardian_cycle.py` runs the same cycle directly. No drift between sandbox and local.

## Deploy

```bash
pip install tensorlake
export TENSORLAKE_API_KEY=<your hackathon key>
export OPENAI_API_KEY=...                       # used by Note Manager + Guardian critique
export CONVEX_URL=https://colorless-porcupine-926.convex.cloud
export NM_SYNC_TOKEN=<shared secret>            # if your Convex deployment requires it

tensorlake deploy tensorlake/guardian_cycle.py --name guardian-cycle --schedule '* * * * *'
tensorlake deploy tensorlake/note_manager.py   --name nm-note-manager
tensorlake deploy tensorlake/gc.py             --name nm-gc
```

After the Note Manager deploy returns a webhook URL, point Claude Code's `Stop` hook at it (in `.claude/settings.json`). The local capture hooks keep working unchanged; only extraction moves off-machine.

## Function secrets (Guardian)

Set these via the Tensorlake CLI or web console (mirror the local `.env`, **never** commit them):

| Key                          | Source                                      |
|------------------------------|---------------------------------------------|
| `NIA_API_KEY`                | nk_…                                        |
| `NIA_MCP_URL`                | `https://apigcp.trynia.ai/mcp`              |
| `CONVEX_URL`                 | `https://colorless-porcupine-926.convex.cloud`    |
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

Tensorlake's runtime needs `node>=20` + `npm` available; bake those into the function's image.

## Cycle semantics inside Tensorlake (Guardian)

- **One tick = one cycle.** No persistent process, so SIGINT/SIGTERM handling on the Node side is moot — the function just returns when the cycle finishes.
- **Idempotency** is preserved by the cycle's own state machine: every mutation lands in Convex before the next phase, so a sandbox dying mid-cycle is retried by the next tick reading from Convex. No special restart logic needed here.
- **Reconcile runs every cycle**, so PR-merge events are picked up within the cron interval (≤60s lag in this config).

## Local equivalents (NM)

Both NM agents work locally without Tensorlake — useful for the demo if the deploy doesn't land in time:

```bash
python nm_extract.py --all                 # one-shot extract over every captured session
python nm_gc.py --loop --interval 900      # GC every 15 min, in foreground
```

The on-stage live cron tick can come from either: the Tensorlake schedule firing, or `nm_gc.py --loop` running in a separate terminal.

## State + idempotency (NM)

- Note Manager tracks `extract_state.last_message_id` per session in `nm.db`; calling it twice on the same session is a no-op.
- GC reads `notes.invalidated_at IS NULL`; pruned/merged notes can't be re-pruned.
- All side-effects are mirrored to Convex via the local sync hooks — no duplicate writes when run from Tensorlake vs. locally.

## Demo dashboard

The Vercel-hosted UI at `ui/` subscribes live to Convex events. With Tensorlake firing all three functions on schedule, the dashboard streams in parallel: Guardian's WAKE → PLAN → SCAN → finding → filed issue → devin spawned → reconcile pr_open → pr_merged → resolved/sharpened, alongside NM's session-captured → hurdle-detected → note-extracted → injected → gc-pruned. Both rows update without human input during the demo.
