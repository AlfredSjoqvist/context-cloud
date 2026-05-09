"""Transcript → normalized Event stream.

Claude Code stores each turn as a JSONL line with a content array of mixed
blocks (text, thinking, tool_use, tool_result). For signal detection we want a
flat sequence of typed events. This module is the bridge.

A single transcript entry can fan out into several events. For example, an
assistant turn that emits text + two tool_use blocks becomes:
    assistant_msg, tool_call, tool_call.

Public surface:
  Event             — dataclass, see fields below.
  events_for_session(conn, session_id) -> list[Event]
  events_from_rows(rows)               -> list[Event]   # for tests
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any, Iterable


@dataclass
class Event:
    idx: int                       # position in the session sequence (0-based)
    te_id: int                     # transcript_entries.id this event came from
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
    """Convert transcript_entries rows into a flat Event list.

    Expected row shape: (id, ts, type, role, content_json, raw_json).
    The id ordering of `rows` defines event order.
    """
    out: list[Event] = []
    idx = 0
    for row in rows:
        te_id, ts, etype, role, content_json, raw_json = row
        try:
            content = json.loads(content_json) if content_json else None
        except Exception:
            content = None

        try:
            raw = json.loads(raw_json) if raw_json else {}
        except Exception:
            raw = {}
        msg = raw.get("message") if isinstance(raw, dict) else None
        stop_reason = ""
        if isinstance(msg, dict):
            stop_reason = msg.get("stop_reason") or ""

        blocks = _parse_content(content)

        if etype == "user" or role == "user":
            # user-role messages can carry either user text or tool_result blocks
            for b in blocks:
                btype = b.get("type")
                if btype == "tool_result":
                    inner = b.get("content")
                    text = inner if isinstance(inner, str) else json.dumps(inner)
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="tool_result",
                        text=text or "",
                        tool_use_id=b.get("tool_use_id", "") or "",
                        is_error=bool(b.get("is_error")),
                    ))
                    idx += 1
                elif btype == "text":
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="user_msg",
                        text=b.get("text", "") or "",
                    ))
                    idx += 1
            continue

        if etype == "assistant" or role == "assistant":
            for b in blocks:
                btype = b.get("type")
                if btype == "text":
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="assistant_msg",
                        text=b.get("text", "") or "",
                        stop_reason=stop_reason,
                    ))
                    idx += 1
                elif btype == "thinking":
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="thinking",
                        text=b.get("thinking", "") or "",
                    ))
                    idx += 1
                elif btype == "tool_use":
                    out.append(Event(
                        idx=idx, te_id=te_id, ts=ts, kind="tool_call",
                        tool_name=b.get("name", "") or "",
                        tool_input=b.get("input", {}) or {},
                        tool_use_id=b.get("id", "") or "",
                        stop_reason=stop_reason,
                    ))
                    idx += 1
            continue

        # Other types (system, summary) — ignore for signal detection.
    return out


def events_for_session(conn: sqlite3.Connection, session_id: str) -> list[Event]:
    cur = conn.cursor()
    cur.execute(
        "SELECT id, ts, type, role, content_json, raw_json "
        "FROM transcript_entries WHERE session_id = ? ORDER BY id ASC",
        (session_id,),
    )
    return events_from_rows(cur.fetchall())
