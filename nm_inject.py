"""PreToolUse hook helper for Claude Code.

Reads the hook payload (JSON) from stdin, pulls the file path(s) the tool is
about to act on, queries NM for matching notes, emits them back to Claude
Code as `additionalContext`, and logs every match to the `injections` audit
table (drives the on-stage "47 injections in the last 15 min" metric).

Configured in .claude/settings.json under hooks.PreToolUse with a matcher of
Read|Edit|Write|MultiEdit. Errors are swallowed so a broken hook never blocks
the agent.

INTEGRATIONS NOTICE
  - Convex mirror: every injection row written to local `injections` is also
    POSTed to Convex via nm_convex.sync_injection. Best-effort, fail-open.
  - Nia fallback: when path-key match returns zero notes, optionally fall
    through to nm_nia.semantic_lookup.
  - See SPEC.md > Integrations.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from nm_db import connect, init_db, canonical_path  # noqa: E402


def _format_note(n: dict) -> str:
    return (
        f"NM note for {n.get('file', '?')}:\n"
        f"  symptom:    {n.get('symptom', '')}\n"
        f"  root_cause: {n.get('root_cause', '')}\n"
        f"  correction: {n.get('correction', '')}"
    )


def _extract_paths(tool_input: dict) -> list[str]:
    out: list[str] = []
    if not isinstance(tool_input, dict):
        return out
    for k in ("file_path", "path", "notebook_path", "filepath"):
        v = tool_input.get(k)
        if isinstance(v, str) and v:
            out.append(v)
    edits = tool_input.get("edits")
    if isinstance(edits, list):
        for e in edits:
            if isinstance(e, dict):
                for k in ("file_path", "path", "filepath"):
                    v = e.get(k)
                    if isinstance(v, str) and v:
                        out.append(v)
    return out


def _log_injections(session_id, tool_name, path, notes, accepted_ids):
    if not notes:
        return
    ts = datetime.now(timezone.utc).isoformat()
    try:
        init_db()
        conn = connect()
        rows = [
            (ts, session_id, path, tool_name, n.get("id"),
             1 if n.get("id") in accepted_ids else 0,
             None if n.get("id") in accepted_ids else "filtered")
            for n in notes
        ]
        conn.executemany(
            "INSERT INTO injections (ts, session_id, path, tool_name, note_id, accepted, reason) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.commit()
        conn.close()
    except Exception:
        pass

    # Convex mirror — best-effort, never blocks. See SPEC.md > Convex.
    try:
        import nm_convex
        if nm_convex.is_enabled():
            for n in notes:
                accepted = n.get("id") in accepted_ids
                nm_convex.sync_injection({
                    "ts": ts,
                    "sessionId": session_id,
                    "path": path,
                    "toolName": tool_name,
                    "noteId": n.get("id"),
                    "accepted": accepted,
                    "reason": None if accepted else "filtered",
                })
    except Exception:
        pass


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return

    tool_input = payload.get("tool_input") or {}
    tool_name = payload.get("tool_name")
    session_id = payload.get("session_id")

    raw_paths = _extract_paths(tool_input)
    if not raw_paths:
        return

    canonical = [canonical_path(p) for p in raw_paths]
    canonical = [c for c in canonical if c]

    try:
        from nm_server import get_relevant_notes  # noqa: E402
        # Pass canonical-first, raw-fallback so server-side suffix matching still works.
        result = get_relevant_notes(canonical + raw_paths)
    except Exception:
        return

    notes = result.get("notes", []) if isinstance(result, dict) else []
    if not notes:
        return

    primary_path = canonical[0] if canonical else (raw_paths[0] if raw_paths else None)
    accepted_ids = {n.get("id") for n in notes}
    _log_injections(session_id, tool_name, primary_path, notes, accepted_ids)

    additional = "\n\n".join(_format_note(n) for n in notes)
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": additional,
            }
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
