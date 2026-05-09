"""Hook helper: ingest Claude Code's transcript JSONL into nm.db.

Wired into UserPromptSubmit, PostToolUse, Stop, and SubagentStop. On every
fire, opens the transcript file at `transcript_path` (provided by Claude Code
in the hook payload), reads any new lines since last invocation, and lands them
into BOTH:

  v1 (legacy):  transcript_entries
                — kept populated so existing nm_extract / nm_signals keep working.

  v2 (canonical, the one new readers should use):
       sessions       — one row per Claude Code session
       messages       — one row per transcript entry (≈ OTel span)
       content_blocks — one row per content block (≈ OTel event)
       tool_calls     — projection: tool_use joined to its tool_result
       file_touches   — projection: (tool_call, canonical path) pairs

Errors are swallowed; capture must never block the agent.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Resolve nm_db whether or not cwd is the project dir (hooks run with cwd=project).
sys.path.insert(0, str(Path(__file__).parent))
from nm_db import connect, init_db, canonical_path  # noqa: E402


# Tool-input fields that carry a single file path. Extend as new tools appear.
_PATH_FIELDS = ("file_path", "path", "notebook_path", "filepath")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_paths(tool_input) -> list[str]:
    """Pull every file path mentioned by a tool_use input. Best-effort, defensive."""
    if not isinstance(tool_input, dict):
        return []
    out: list[str] = []
    for k in _PATH_FIELDS:
        v = tool_input.get(k)
        if isinstance(v, str) and v:
            out.append(v)
    edits = tool_input.get("edits")
    if isinstance(edits, list):
        for e in edits:
            if isinstance(e, dict):
                for k in _PATH_FIELDS:
                    v = e.get(k)
                    if isinstance(v, str) and v:
                        out.append(v)
    return out


def _result_to_text(content) -> tuple[str | None, str | None]:
    """Best-effort flatten of a tool_result content into (text, structured_json)."""
    if content is None:
        return None, None
    if isinstance(content, str):
        return content, None
    if isinstance(content, list):
        texts = []
        for b in content:
            if isinstance(b, dict):
                if b.get("type") == "text" and isinstance(b.get("text"), str):
                    texts.append(b["text"])
        return ("\n".join(texts) if texts else None), json.dumps(content, ensure_ascii=False)
    if isinstance(content, dict):
        return None, json.dumps(content, ensure_ascii=False)
    return str(content), None


def _upsert_session(cur, session_id: str | None, transcript_path: str, ts: str, cwd: str | None):
    if not session_id:
        return
    cur.execute(
        """
        INSERT INTO sessions (session_id, agent_vendor, cwd, project_root, transcript_path, started_at, last_seen_at)
        VALUES (?, 'claude-code', ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            last_seen_at    = excluded.last_seen_at,
            transcript_path = COALESCE(sessions.transcript_path, excluded.transcript_path)
        """,
        (session_id, cwd, os.environ.get("CLAUDE_PROJECT_DIR"), transcript_path, ts, ts),
    )


def _persist_message_and_blocks(cur, entry: dict, raw_line: str, transcript_path: str, ingested_at: str) -> int | None:
    """Write one v2 messages row + N content_blocks rows. Returns messages.id or None."""
    uuid = entry.get("uuid")
    ts = entry.get("timestamp") or ingested_at
    session_id = entry.get("sessionId")
    parent_uuid = entry.get("parentUuid")
    etype = entry.get("type", "unknown")

    msg = entry.get("message") if isinstance(entry.get("message"), dict) else {}
    role = msg.get("role")
    content = msg.get("content")
    is_meta = 0 if etype in ("user", "assistant") else 1

    cur.execute(
        """
        INSERT OR IGNORE INTO messages
            (uuid, session_id, parent_uuid, ts, type, role, is_meta, raw_json, ingested_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (uuid, session_id, parent_uuid, ts, etype, role, is_meta, raw_line, ingested_at),
    )
    if cur.rowcount == 0:
        # Already ingested. Find existing id so callers can still link projections.
        if uuid:
            cur.execute("SELECT id FROM messages WHERE uuid = ?", (uuid,))
            r = cur.fetchone()
            return r[0] if r else None
        return None
    message_id = cur.lastrowid

    if isinstance(content, str):
        # Treat plain-string content as a single text block.
        cur.execute(
            """
            INSERT INTO content_blocks
                (message_id, block_index, type, text, raw_json)
            VALUES (?, 0, 'text', ?, ?)
            """,
            (message_id, content, json.dumps({"type": "text", "text": content})),
        )
    elif isinstance(content, list):
        for idx, b in enumerate(content):
            if not isinstance(b, dict):
                continue
            btype = b.get("type", "unknown")
            text = None
            tool_use_id = None
            tool_name = None
            input_json = None
            output_text = None
            output_json = None
            is_error = None

            if btype == "text":
                text = b.get("text")
            elif btype == "thinking":
                text = b.get("thinking")
            elif btype == "tool_use":
                tool_use_id = b.get("id")
                tool_name = b.get("name")
                inp = b.get("input")
                input_json = json.dumps(inp, ensure_ascii=False) if inp is not None else None
            elif btype == "tool_result":
                tool_use_id = b.get("tool_use_id")
                output_text, output_json = _result_to_text(b.get("content"))
                is_error = 1 if b.get("is_error") else 0

            cur.execute(
                """
                INSERT INTO content_blocks
                    (message_id, block_index, type, text, tool_use_id, tool_name,
                     input_json, output_text, output_json, is_error, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message_id, idx, btype, text, tool_use_id, tool_name,
                    input_json, output_text, output_json, is_error,
                    json.dumps(b, ensure_ascii=False),
                ),
            )

            if btype == "tool_use" and tool_use_id and tool_name:
                _upsert_tool_call_use(cur, tool_use_id, tool_name, session_id, message_id, input_json, ts)
                for raw_path in _extract_paths(b.get("input")):
                    cp = canonical_path(raw_path)
                    if cp:
                        _record_file_touch(cur, tool_use_id, session_id, tool_name, cp, ts)
            elif btype == "tool_result" and tool_use_id:
                _upsert_tool_call_result(cur, tool_use_id, session_id, message_id, output_text, is_error, ts)
    return message_id


def _upsert_tool_call_use(cur, tool_use_id: str, tool_name: str, session_id, use_message_id, input_json, ts):
    cur.execute(
        """
        INSERT INTO tool_calls
            (tool_use_id, session_id, tool_name, use_message_id, input_json, started_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tool_use_id) DO UPDATE SET
            session_id     = COALESCE(tool_calls.session_id, excluded.session_id),
            tool_name      = excluded.tool_name,
            use_message_id = COALESCE(tool_calls.use_message_id, excluded.use_message_id),
            input_json     = COALESCE(tool_calls.input_json, excluded.input_json),
            started_at     = COALESCE(tool_calls.started_at, excluded.started_at)
        """,
        (tool_use_id, session_id, tool_name, use_message_id, input_json, ts),
    )


def _upsert_tool_call_result(cur, tool_use_id: str, session_id, result_message_id, output_text, is_error, ts):
    cur.execute(
        """
        INSERT INTO tool_calls
            (tool_use_id, session_id, tool_name, result_message_id, output_text, is_error, finished_at)
        VALUES (?, ?, '?', ?, ?, ?, ?)
        ON CONFLICT(tool_use_id) DO UPDATE SET
            result_message_id = COALESCE(tool_calls.result_message_id, excluded.result_message_id),
            output_text       = COALESCE(tool_calls.output_text, excluded.output_text),
            is_error          = COALESCE(tool_calls.is_error, excluded.is_error),
            finished_at       = COALESCE(tool_calls.finished_at, excluded.finished_at)
        """,
        (tool_use_id, session_id, result_message_id, output_text, is_error, ts),
    )


def _record_file_touch(cur, tool_use_id, session_id, tool_name, path, ts):
    cur.execute("SELECT id FROM tool_calls WHERE tool_use_id = ?", (tool_use_id,))
    row = cur.fetchone()
    if not row:
        return
    tool_call_id = row[0]
    cur.execute(
        "INSERT INTO file_touches (tool_call_id, session_id, tool_name, path, ts) VALUES (?, ?, ?, ?, ?)",
        (tool_call_id, session_id, tool_name, path, ts),
    )


def _ingest(transcript_path: str, cwd: str | None) -> int:
    if not transcript_path or not os.path.exists(transcript_path):
        return 0

    init_db()
    conn = connect()
    cur = conn.cursor()
    cur.execute(
        "SELECT last_line FROM ingest_state WHERE transcript_path = ?",
        (transcript_path,),
    )
    row = cur.fetchone()
    last_line = row[0] if row else 0

    inserted = 0
    total_lines = last_line
    ingested_at = _now_iso()

    with open(transcript_path, "r", encoding="utf-8") as f:
        for i, raw in enumerate(f):
            total_lines = i + 1
            if i < last_line:
                continue
            line = raw.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except Exception:
                continue

            uuid = entry.get("uuid")
            ts = entry.get("timestamp") or ingested_at
            session_id = entry.get("sessionId")
            etype = entry.get("type", "unknown")
            msg = entry.get("message") if isinstance(entry.get("message"), dict) else {}
            role = msg.get("role")
            content = msg.get("content")
            content_json = json.dumps(content, ensure_ascii=False) if content is not None else "null"

            # v1 transcript_entries (legacy back-compat)
            try:
                cur.execute(
                    "INSERT OR IGNORE INTO transcript_entries "
                    "(uuid, ts, session_id, type, role, content_json, raw_json, transcript_path, ingested_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (uuid, ts, session_id, etype, role, content_json, line, transcript_path, ingested_at),
                )
                if cur.rowcount > 0:
                    inserted += 1
            except Exception:
                pass

            # v2 sessions / messages / content_blocks / tool_calls / file_touches
            try:
                _upsert_session(cur, session_id, transcript_path, ts, cwd)
                _persist_message_and_blocks(cur, entry, line, transcript_path, ingested_at)
            except Exception:
                continue

    cur.execute(
        "INSERT OR REPLACE INTO ingest_state (transcript_path, last_line, updated_at) VALUES (?, ?, ?)",
        (transcript_path, total_lines, ingested_at),
    )
    conn.commit()
    conn.close()
    return inserted


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    try:
        if not isinstance(payload, dict):
            return
        transcript_path = payload.get("transcript_path")
        cwd = payload.get("cwd")
        if transcript_path:
            _ingest(transcript_path, cwd)
    except Exception:
        # Capture must never block the agent.
        pass


if __name__ == "__main__":
    main()
