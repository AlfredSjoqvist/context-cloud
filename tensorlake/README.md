# Tensorlake deployment

Two background agents NM runs in Tensorlake sandboxes:

| File | Trigger | What it does |
|---|---|---|
| `note_manager.py` | webhook (POST from Claude Code Stop hook) | distill hurdles in a session into notes |
| `gc.py` | schedule (`*/15 * * * *`) | decay → merge → prune the note graph |

Guardian (filter + per-injection budget) is owned by another agent; will land in this directory under `guardian.py`.

## Deploy

```bash
pip install tensorlake
export TENSORLAKE_API_KEY=...
export OPENAI_API_KEY=...                 # used by the Note Manager
export CONVEX_URL=https://<dep>.convex.site
export NM_SYNC_TOKEN=<shared secret>      # if your Convex deployment requires it

tensorlake deploy tensorlake/note_manager.py --name nm-note-manager
tensorlake deploy tensorlake/gc.py          --name nm-gc
```

After the Note Manager deploy returns a webhook URL, point Claude Code's `Stop` hook at it (in `.claude/settings.json`). The local capture hooks keep working unchanged; only extraction moves off-machine.

## Local equivalents

Both agents work locally without Tensorlake — useful for the demo if the deploy doesn't land in time:

```bash
python nm_extract.py --all          # one-shot extract over every captured session
python nm_gc.py --loop --interval 900   # GC every 15 min, in foreground
```

The on-stage live cron tick can come from either: the Tensorlake schedule firing, or `nm_gc.py --loop` running in a separate terminal.

## State + idempotency

- Note Manager tracks `extract_state.last_message_id` per session in nm.db; calling it twice on the same session is a no-op.
- GC reads `notes.invalidated_at IS NULL`; pruned/merged notes can't be re-pruned.
- All side-effects are mirrored to Convex via the local sync hooks — no duplicate writes when run from Tensorlake vs. locally.
