# Claude Code hooks

Hindsight wires into Claude Code via project-scoped hooks defined in
[`.claude/settings.json`](../../.claude/settings.json). Five hooks, two
Python scripts at the repo root:

| Hook | Script | Why |
|---|---|---|
| `UserPromptSubmit` | `nm_capture.py` | Ingest transcript whenever the user submits a prompt. |
| `PostToolUse` | `nm_capture.py` | Ingest any new transcript entries appended after a tool call. |
| `Stop` | `nm_capture.py` | Final flush when the agent stops. |
| `SubagentStop` | `nm_capture.py` | Final flush when a subagent stops. |
| `PreToolUse` (matcher `Read\|Edit\|Write\|MultiEdit`) | `nm_inject.py` | Pull NM notes attached to the file the tool is about to touch, emit as `additionalContext`. |

## Contract

- Claude Code runs hook commands with **cwd = the project root**, so the
  scripts can be invoked by relative path: `python3 nm_capture.py`.
- The hook payload is **JSON on stdin**. Both scripts tolerate `{}` and any
  partial payload; errors are swallowed by design so a broken hook never
  blocks the agent.
- Python ≥ 3.10 must be available as `python3` on the user's PATH. Windows
  users typically need to swap `python3` → `python` in `.claude/settings.json`.
- Both scripts write to a local `nm.db` SQLite database (auto-created,
  gitignored) and mirror touched rows to Convex if `CONVEX_URL` is set.

## Verifying

From the repo root, with no hook payload:

```bash
echo '{}' | python3 nm_capture.py ; echo "capture exit $?"
echo '{"tool_input":{"file_path":"agent/main.ts"}}' | python3 nm_inject.py ; echo "inject exit $?"
```

Both should exit 0 (errors swallowed). A realistic payload includes
`transcript_path` pointing at a Claude Code JSONL.
