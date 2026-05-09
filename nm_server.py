"""NM MCP server.

Exposes inspection + lookup tools over the v2 standardized trace tables
(sessions / messages / content_blocks / tool_calls / file_touches) plus the
existing notes / file_note_edges product graph.

Capture and injection happen automatically via Claude Code hooks
(nm_capture.py + nm_inject.py); these MCP tools are for explicit inspection,
debugging, and use by other agents (Note Manager / Guardian / GC / dashboard).

INTEGRATIONS NOTICE
  - find_notes_semantic uses nm_nia (Nia when configured, local cosine
    fallback otherwise). See SPEC.md > Nia.
  - Read paths still hit local SQLite for low latency. The Vercel dashboard
    reads the Convex mirror, not this MCP server. See SPEC.md > Convex.
"""

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from nm_db import DB_PATH, connect as _connect, init_db as _init_db, canonical_path

_init_db()


mcp = FastMCP(
    "nm",
    instructions=(
        "NM is the shared-memory layer for this org's coding agents. Capture and "
        "injection are automatic via Claude Code hooks — you do NOT need to call "
        "these tools as part of normal operation.\n"
        "\n"
        "Tools below are for explicit inspection / debugging / agent-to-agent access:\n"
        "  - get_relevant_notes(file_paths): notes attached to a file (hook does this for you)\n"
        "  - list_sessions / get_messages / get_tool_calls: walk the standardized trace\n"
        "  - get_file_touches(path): everything done to a file across sessions\n"
        "  - list_recent_injections / list_notes: read the audit + product tables"
    ),
)


# ---------------------------------------------------------------------------
# Notes lookup (used by both the model on-demand and the inject hook)
# ---------------------------------------------------------------------------

@mcp.tool()
def get_relevant_notes(file_paths: list[str], limit: int = 5) -> dict:
    """Return notes attached to any of the given file paths.

    Lookup matches paths case-insensitively and tolerates Windows/Unix
    separator differences. Notes are ranked by (edge_weight * importance) and
    de-duplicated across multiple matched paths. Notes with t_invalid set are
    excluded.

    Args:
        file_paths: One or more file paths the agent is about to touch.
        limit:      Max notes to return (default 5).

    Returns:
        {"notes": [...], "count": N}
    """
    if not file_paths:
        return {"notes": [], "count": 0}

    norm_paths: list[str] = []
    for p in file_paths:
        if not isinstance(p, str) or not p:
            continue
        cp = canonical_path(p)
        if cp:
            norm_paths.append(cp.lower())
        norm = p.replace("\\", "/").lower()
        norm_paths.append(norm)
        bn = norm.rsplit("/", 1)[-1]
        if bn and bn != norm:
            norm_paths.append(bn)
    norm_paths = list(dict.fromkeys(norm_paths))  # dedupe, preserve order

    if not norm_paths:
        return {"notes": [], "count": 0}

    conn = _connect()
    cur = conn.cursor()
    placeholders = ",".join("?" for _ in norm_paths)
    suffix_clauses = " OR ".join(
        "LOWER(REPLACE(e.path,'\\','/')) LIKE ?" for _ in norm_paths
    )
    like_args = [f"%{p}" for p in norm_paths]

    cur.execute(
        f"""
        SELECT n.id, n.symptom, n.root_cause, n.correction, n.importance,
               n.inject_count, n.created_at, n.last_injected_at,
               e.path, e.weight
        FROM file_note_edges e
        JOIN notes n ON n.id = e.note_id
        WHERE n.t_invalid IS NULL
          AND (
              LOWER(REPLACE(e.path,'\\','/')) IN ({placeholders})
              OR {suffix_clauses}
          )
        ORDER BY (e.weight * n.importance) DESC
        """,
        (*norm_paths, *like_args),
    )
    rows = cur.fetchall()

    seen: set[str] = set()
    notes: list[dict] = []
    for r in rows:
        nid = r[0]
        if nid in seen:
            continue
        seen.add(nid)
        notes.append({
            "id": nid,
            "file": r[8],
            "edge_weight": r[9],
            "symptom": r[1],
            "root_cause": r[2],
            "correction": r[3],
            "importance": r[4],
            "inject_count": r[5],
            "created_at": r[6],
            "last_injected_at": r[7],
        })
        if len(notes) >= limit:
            break

    if notes:
        ts = datetime.now(timezone.utc).isoformat()
        ids = [n["id"] for n in notes]
        cur.executemany(
            "UPDATE notes SET inject_count = inject_count + 1, last_injected_at = ? WHERE id = ?",
            [(ts, nid) for nid in ids],
        )
        conn.commit()
    conn.close()
    return {"notes": notes, "count": len(notes)}


# ---------------------------------------------------------------------------
# Trace walking (v2 standardized tables)
# ---------------------------------------------------------------------------

@mcp.tool()
def list_sessions(limit: int = 20, include_meta_only: bool = False) -> list[dict]:
    """Recent sessions with message counts.

    Args:
        limit: Max sessions to return.
        include_meta_only: If True, count meta entries (ai-title, attachments) too.
    """
    conn = _connect()
    where = "" if include_meta_only else "WHERE m.is_meta = 0"
    rows = conn.execute(
        f"""
        SELECT s.session_id,
               s.agent_vendor,
               s.cwd,
               s.started_at,
               s.last_seen_at,
               COUNT(m.id) AS msgs
        FROM sessions s
        LEFT JOIN messages m ON m.session_id = s.session_id
        {where}
        GROUP BY s.session_id
        ORDER BY s.last_seen_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return [
        {
            "session_id": r[0],
            "agent_vendor": r[1],
            "cwd": r[2],
            "started_at": r[3],
            "last_seen_at": r[4],
            "messages": r[5],
        }
        for r in rows
    ]


@mcp.tool()
def get_messages(
    session_id: str,
    limit: int = 100,
    offset: int = 0,
    include_meta: bool = False,
    role: str | None = None,
) -> list[dict]:
    """Walk a session's messages in order, optionally filtered.

    Each message row includes its content blocks parsed into structured fields
    (text/thinking text, tool_use name+input, tool_result text+error flag).
    Use this in preference to reading transcript_entries.

    Args:
        session_id:   Session to read.
        limit:        Max messages to return.
        offset:       Pagination offset.
        include_meta: If True, include ai-title / queue-op / attachment rows.
        role:         Optional filter ('user' | 'assistant').
    """
    conn = _connect()
    where = ["session_id = ?"]
    params: list = [session_id]
    if not include_meta:
        where.append("is_meta = 0")
    if role:
        where.append("role = ?")
        params.append(role)
    params.extend([limit, offset])

    rows = conn.execute(
        f"""
        SELECT id, uuid, parent_uuid, ts, type, role, is_meta
        FROM messages
        WHERE {' AND '.join(where)}
        ORDER BY id ASC
        LIMIT ? OFFSET ?
        """,
        params,
    ).fetchall()

    out: list[dict] = []
    for mr in rows:
        mid = mr[0]
        blocks = conn.execute(
            """
            SELECT block_index, type, text, tool_use_id, tool_name,
                   input_json, output_text, is_error
            FROM content_blocks
            WHERE message_id = ?
            ORDER BY block_index ASC
            """,
            (mid,),
        ).fetchall()
        out.append({
            "id": mid,
            "uuid": mr[1],
            "parent_uuid": mr[2],
            "ts": mr[3],
            "type": mr[4],
            "role": mr[5],
            "is_meta": bool(mr[6]),
            "blocks": [
                {
                    "index": b[0],
                    "type": b[1],
                    "text": b[2],
                    "tool_use_id": b[3],
                    "tool_name": b[4],
                    "input_json": b[5],
                    "output_text": b[6],
                    "is_error": bool(b[7]) if b[7] is not None else None,
                }
                for b in blocks
            ],
        })
    conn.close()
    return out


@mcp.tool()
def get_tool_calls(
    session_id: str | None = None,
    tool_name: str | None = None,
    file_path: str | None = None,
    is_error: bool | None = None,
    limit: int = 50,
) -> list[dict]:
    """Search the tool_calls projection. Joins file_touches when file_path given."""
    conn = _connect()
    where: list[str] = []
    params: list = []
    if session_id:
        where.append("tc.session_id = ?")
        params.append(session_id)
    if tool_name:
        where.append("tc.tool_name = ?")
        params.append(tool_name)
    if is_error is not None:
        where.append("tc.is_error = ?")
        params.append(1 if is_error else 0)

    join = ""
    if file_path:
        cp = canonical_path(file_path) or file_path
        join = "JOIN file_touches ft ON ft.tool_call_id = tc.id"
        where.append("LOWER(ft.path) = LOWER(?)")
        params.append(cp)

    sql = f"""
        SELECT tc.id, tc.tool_use_id, tc.session_id, tc.tool_name,
               tc.input_json, tc.output_text, tc.is_error,
               tc.started_at, tc.finished_at
        FROM tool_calls tc
        {join}
        {('WHERE ' + ' AND '.join(where)) if where else ''}
        ORDER BY tc.id DESC
        LIMIT ?
    """
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [
        {
            "id": r[0],
            "tool_use_id": r[1],
            "session_id": r[2],
            "tool_name": r[3],
            "input_json": r[4],
            "output_text": r[5],
            "is_error": bool(r[6]) if r[6] is not None else None,
            "started_at": r[7],
            "finished_at": r[8],
        }
        for r in rows
    ]


@mcp.tool()
def get_file_touches(file_path: str, limit: int = 50) -> list[dict]:
    """Every tool call that touched a given file, newest first. Uses canonical paths."""
    cp = canonical_path(file_path) or file_path
    conn = _connect()
    rows = conn.execute(
        """
        SELECT ft.id, ft.session_id, ft.tool_name, ft.path, ft.ts,
               tc.tool_use_id, tc.is_error
        FROM file_touches ft
        LEFT JOIN tool_calls tc ON tc.id = ft.tool_call_id
        WHERE LOWER(ft.path) = LOWER(?)
        ORDER BY ft.id DESC
        LIMIT ?
        """,
        (cp, limit),
    ).fetchall()
    conn.close()
    return [
        {
            "id": r[0],
            "session_id": r[1],
            "tool_name": r[2],
            "path": r[3],
            "ts": r[4],
            "tool_use_id": r[5],
            "is_error": bool(r[6]) if r[6] is not None else None,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Audit / lifecycle
# ---------------------------------------------------------------------------

@mcp.tool()
def list_recent_injections(limit: int = 50, since_minutes: int | None = None) -> list[dict]:
    """Recent injection events from the audit log."""
    conn = _connect()
    where = ""
    params: list = []
    if since_minutes is not None:
        cutoff = (
            datetime.now(timezone.utc).timestamp() - since_minutes * 60
        )
        # Compare as ISO strings — close enough for short windows.
        cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
        where = "WHERE ts >= ?"
        params.append(cutoff_iso)
    params.append(limit)
    rows = conn.execute(
        f"""
        SELECT id, ts, session_id, path, tool_name, note_id, accepted, reason
        FROM injections
        {where}
        ORDER BY id DESC
        LIMIT ?
        """,
        params,
    ).fetchall()
    conn.close()
    return [
        {
            "id": r[0], "ts": r[1], "session_id": r[2], "path": r[3],
            "tool_name": r[4], "note_id": r[5],
            "accepted": bool(r[6]), "reason": r[7],
        }
        for r in rows
    ]


@mcp.tool()
def find_notes_semantic(query: str, limit: int = 5) -> list[dict]:
    """Semantic note lookup. Hits Nia when configured, falls back to a local
    cosine ranker over notes when not. See SPEC.md > Nia.

    Use when you have a query / topic but no specific file path — the
    file-path-keyed `get_relevant_notes` returns nothing in that case.
    """
    try:
        import nm_nia
        return nm_nia.semantic_lookup(query, limit=limit)
    except Exception:
        return []


@mcp.tool()
def list_notes(limit: int = 50, include_invalidated: bool = False) -> list[dict]:
    """Browse the notes graph (debugging / dashboard)."""
    conn = _connect()
    where = "" if include_invalidated else "WHERE n.t_invalid IS NULL"
    rows = conn.execute(
        f"""
        SELECT n.id, n.symptom, n.root_cause, n.correction, n.importance,
               n.inject_count, n.created_at, n.last_injected_at,
               GROUP_CONCAT(e.path)
        FROM notes n
        LEFT JOIN file_note_edges e ON e.note_id = n.id
        {where}
        GROUP BY n.id
        ORDER BY n.importance DESC, n.created_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return [
        {
            "id": r[0],
            "symptom": r[1],
            "root_cause": r[2],
            "correction": r[3],
            "importance": r[4],
            "inject_count": r[5],
            "created_at": r[6],
            "last_injected_at": r[7],
            "files": r[8].split(",") if r[8] else [],
        }
        for r in rows
    ]


if __name__ == "__main__":
    mcp.run()
