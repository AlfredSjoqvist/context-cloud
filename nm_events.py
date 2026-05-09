"""Trace → normalized Event stream.

Reads from the v2 standardized trace (messages + content_blocks). When v2 has
no rows for a given session — e.g. an old transcript that predates v2 capture
— falls back to the v1 transcript_entries table.

A single message can fan out into several events. Example: an assistant turn
that emits text + two tool_use blocks becomes:
    assistant_msg, tool_call, tool_call.

Public surface:
  Event             — dataclass; te_id field carries messages.id (v2) or
                      transcript_entries.id (v1) for provenance.
  events_for_session(conn, session_id) -> list[Event]
  events_from_rows(rows)               -> list[Event]   # v1 path, used in tests
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any, Iterable


@dataclass
class Event:
    idx: int                       # position in the session sequence (0-based)
    te_id: int                     # provenance: messages.id (v2) or transcript_entries.id (v1)
    ts: str
    kind: str                      # user_msg | assistant_msg | tool_call | tool_result | thinking
    text: str = ""
    tool_name: str = ""
    tool_input: dict[str, Any] = field(default_factory=dict)
    tool_use_id: str = ""
    is_error: bool = False
    stop_reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "idx": self.idx,
            "te_id": self.te_id,
            "ts": self.ts,
            "kind": self.kind,
            "text": self.text,
            "tool_name": self.tool_name,
            "tool_input": self.tool_input,
            "tool_use_id": self.tool_use_id,
            "is_error": self.is_error,
            "stop_reason": self.stop_reason,
        }


# --- shared helpers --------------------------------------------------------

def _safe_load(s: Any) -> Any:
    if s is None:
        return None
    if not isinstance(s, str):
        return s
    try:
        return json.loads(s)
    except Exception:
        return None


def _stop_reason_from_raw(raw_json: str | None) -> str:
    raw = _safe_load(raw_json) or {}
    if not isinstance(raw, dict):
        return ""
    msg = raw.get("message")
    if isinstance(msg, dict):
        return msg.get("stop_reason") or ""
    return raw.get("stop_reason") or ""


# --- v2 reader: messages + content_blocks ----------------------------------

def _events_from_v2(conn: sqlite3.Connection, session_id: str) -> list[Event]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, ts, type, role, raw_json
        FROM messages
        WHERE session_id = ? AND is_meta = 0
        ORDER BY id ASC
        """,
        (session_id,),
    )
    msgs = cur.fetchall()
    if not msgs:
        return []

    out: list[Event] = []
    idx = 0
    for mid, ts, mtype, role, raw_json in msgs:
        stop_reason = _stop_reason_from_raw(raw_json)
        is_user = (role == "user") or (mtype == "user")

        cur.execute(
            """
            SELECT block_index, type, text, tool_use_id, tool_name,
                   input_json, output_text, output_json, is_error
            FROM content_blocks
            WHERE message_id = ?
            ORDER BY block_index ASC
            """,
            (mid,),
        )
        blocks = cur.fetchall()
        for (_bi, btype, text, tool_use_id, tool_name,
             input_json, output_text, output_json, is_error) in blocks:

            if btype == "text":
                kind = "user_msg" if is_user else "assistant_msg"
                out.append(Event(
                    idx=idx, te_id=mid, ts=ts, kind=kind,
                    text=text or "",
                    stop_reason=stop_reason if kind == "assistant_msg" else "",
                ))
                idx += 1
            elif btype == "thinking":
                out.append(Event(
                    idx=idx, te_id=mid, ts=ts, kind="thinking",
                    text=text or "",
                ))
                idx += 1
            elif btype == "tool_use":
                tool_input = _safe_load(input_json) or {}
                if not isinstance(tool_input, dict):
                    tool_input = {"_raw": tool_input}
                out.append(Event(
                    idx=idx, te_id=mid, ts=ts, kind="tool_call",
                    tool_name=tool_name or "",
                    tool_input=tool_input,
                    tool_use_id=tool_use_id or "",
                    stop_reason=stop_reason,
                ))
                idx += 1
            elif btype == "tool_result":
                if output_text:
                    text_val = output_text
                elif output_json:
                    text_val = output_json
                else:
                    text_val = text or ""
                out.append(Event(
                    idx=idx, te_id=mid, ts=ts, kind="tool_result",
                    text=text_val,
                    tool_use_id=tool_use_id or "",
                    is_error=bool(is_error),
                ))
                idx += 1
            # 'image' and unknown types: skip
    return out


# --- v1 fallback: transcript_entries ---------------------------------------

def _parse_content(raw: Any) -> list[dict[str, Any]]:
    """Claude Code's content can be a string OR a list of blocks. Normalize."""
    if raw is None:
        return []
    if isinstance(raw, str):
        return [{"type": "text", "text": raw}]
    if isinstance(raw, list):
        return [b for b in raw if isinstance(b, dict)]
    return []


def events_from_rows(rows: Iterable[tuple]) -> list[Event]:
    """Convert transcript_entries rows into a flat Event list (v1 path).

    Expected row shape: (id, ts, type, role, content_json, raw_json).
    """
    out: list[Event] = []
    idx = 0
    for row in rows:
        te_id, ts, etype, role, content_json, raw_json = row
        content = _safe_load(content_json)
        stop_reason = _stop_reason_from_raw(raw_json)
        blocks = _parse_content(content)

        is_user = (etype == "user") or (role == "user")
        is_assistant = (etype == "assistant") or (role == "assistant")

        if is_user:
            for b in blocks:
                bt = b.get("type")
                if bt == "tool_result":
                    inner = b.get("content")
                    text = inner if isinstance(inner, str) else json.dumps(inner)
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="tool_result",
                        text=text or "",
                        tool_use_id=b.get("tool_use_id", "") or "",
                        is_error=bool(b.get("is_error")),
                    ))
                    idx += 1
                elif bt == "text":
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="user_msg",
                        text=b.get("text", "") or "",
                    ))
                    idx += 1
            continue

        if is_assistant:
            for b in blocks:
                bt = b.get("type")
                if bt == "text":
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="assistant_msg",
                        text=b.get("text", "") or "",
                        stop_reason=stop_reason,
                    ))
                    idx += 1
                elif bt == "thinking":
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="thinking",
                        text=b.get("thinking", "") or "",
                    ))
                    idx += 1
                elif bt == "tool_use":
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="tool_call",
                        tool_name=b.get("name", "") or "",
                        tool_input=b.get("input", {}) or {},
                        tool_use_id=b.get("id", "") or "",
                        stop_reason=stop_reason,
                    ))
                    idx += 1
            continue
    return out


def _events_from_v1(conn: sqlite3.Connection, session_id: str) -> list[Event]:
    cur = conn.cursor()
    cur.execute(
        "SELECT id, ts, type, role, content_json, raw_json "
        "FROM transcript_entries WHERE session_id = ? ORDER BY id ASC",
        (session_id,),
    )
    return events_from_rows(cur.fetchall())


# --- public entrypoint -----------------------------------------------------

def events_for_session(conn: sqlite3.Connection, session_id: str) -> list[Event]:
    """Return the normalized event stream for a session.

    Prefers v2 (messages + content_blocks). Falls back to v1 transcript_entries
    when v2 has no rows for the session. Reading both layers means extraction
    works on old captures and new captures during the v1→v2 transition.
    """
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM messages WHERE session_id = ? LIMIT 1", (session_id,))
    if cur.fetchone():
        return _events_from_v2(conn, session_id)
    return _events_from_v1(conn, session_id)
