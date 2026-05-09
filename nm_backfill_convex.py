"""Replay nm.db into a Convex deployment.

The inline write hooks (`nm_extract`, `nm_inject`, `nm_capture`, `nm_gc`) only
mirror NEW writes to Convex. Anything that landed in nm.db before Convex was
deployed — including the 5 mock_traces sessions and any locally-extracted
notes — is invisible to the dashboard until backfilled.

This script reads every row from the v2 product/audit tables and POSTs them
through `nm_convex.sync_*`. Idempotent: Convex mutations upsert by their
canonical id (`noteId`, `hurdleId`, `sessionId`, `path`).

Usage (after `npx convex dev` has provisioned the deployment):

    $env:CONVEX_URL    = 'https://<deployment>.convex.site'
    $env:NM_SYNC_TOKEN = '<shared secret matching Convex env>'
    python nm_backfill_convex.py            # everything
    python nm_backfill_convex.py --notes    # subset (notes + edges only)
    python nm_backfill_convex.py --dry-run  # log what would be sent

Prints per-table counts. Failures are reported but don't abort the run; this
is best-effort, like every other Convex sync.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Callable

from nm_db import connect, init_db


def _drop_nones(x: Any) -> Any:
    """Recursively strip None-valued keys from dicts.

    Convex `v.optional(v.string())` accepts string-or-omitted, NOT string-or-null.
    Python `None` serializes to JSON `null`, which fails the validator. Drop the
    keys instead so optional fields are simply absent on the wire.
    """
    if isinstance(x, dict):
        return {k: _drop_nones(v) for k, v in x.items() if v is not None}
    if isinstance(x, list):
        return [_drop_nones(v) for v in x]
    return x


def _row_to_note_payload(r) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    note_id, symptom, root_cause, correction, importance, inject_count, \
        created_at, created_from_session, created_from_hurdle, \
        last_injected_at, t_invalid = r
    note = {
        "noteId": note_id,
        "symptom": symptom or "",
        "rootCause": root_cause or "",
        "correction": correction,
        "importance": float(importance) if importance is not None else 0.5,
        "injectCount": int(inject_count or 0),
        "lastInjectedAt": last_injected_at,
        "invalidatedAt": t_invalid,
        "createdAt": created_at,
        "createdFromSession": created_from_session,
        "createdFromHurdle": created_from_hurdle,
    }
    return note, []  # edges filled separately


def _push(label: str, fn: Callable[..., bool], *args, dry_run: bool, counts: dict[str, int]) -> None:
    if dry_run:
        counts[label] = counts.get(label, 0) + 1
        sys.stdout.write(f"  [dry-run] {label}\n")
        return
    ok = bool(fn(*args))
    key = f"{label}_ok" if ok else f"{label}_fail"
    counts[key] = counts.get(key, 0) + 1


def backfill_notes(conn, *, dry_run: bool, counts: dict[str, int]) -> None:
    import nm_convex
    cur = conn.cursor()

    cur.execute("""
        SELECT id, symptom, root_cause, correction, importance, inject_count,
               created_at, created_from_session, created_from_hurdle,
               last_injected_at, t_invalid
        FROM notes
    """)
    note_rows = cur.fetchall()

    edges_by_note: dict[str, list[dict[str, Any]]] = {}
    for note_id, path, weight in conn.execute(
        "SELECT note_id, path, weight FROM file_note_edges"
    ).fetchall():
        edges_by_note.setdefault(note_id, []).append(
            {"path": path, "weight": float(weight)}
        )

    for r in note_rows:
        note, _ = _row_to_note_payload(r)
        edges = edges_by_note.get(note["noteId"], [])
        _push("note", nm_convex.sync_note, _drop_nones(note), _drop_nones(edges),
              dry_run=dry_run, counts=counts)


def backfill_hurdles(conn, *, dry_run: bool, counts: dict[str, int]) -> None:
    import nm_convex
    rows = conn.execute("""
        SELECT id, session_id, score, signals_json, resolved, created_at
        FROM hurdles
    """).fetchall()
    for hid, sid, score, signals_json, resolved, created_at in rows:
        payload = {
            "hurdleId": int(hid),
            "sessionId": sid,
            "score": float(score) if score is not None else 0.0,
            "signalsJson": signals_json,
            "resolved": bool(resolved),
            "resolvedNoteId": None,
            "createdAt": created_at,
        }
        _push("hurdle", nm_convex.sync_hurdle, _drop_nones(payload), dry_run=dry_run, counts=counts)


def backfill_sessions(conn, *, dry_run: bool, counts: dict[str, int]) -> None:
    import nm_convex
    # Count messages per session for the dashboard's "messages" badge.
    msg_counts: dict[str, int] = {}
    for sid, n in conn.execute(
        "SELECT session_id, COUNT(*) FROM messages WHERE is_meta = 0 GROUP BY session_id"
    ).fetchall():
        if sid:
            msg_counts[sid] = int(n)

    rows = conn.execute("""
        SELECT session_id, agent_vendor, cwd, project_root, started_at, last_seen_at
        FROM sessions
    """).fetchall()
    for sid, vendor, cwd, project_root, started, last_seen in rows:
        payload = {
            "sessionId": sid,
            "agentVendor": vendor,
            "cwd": cwd,
            "projectRoot": project_root,
            "startedAt": started,
            "lastSeenAt": last_seen,
            "messageCount": msg_counts.get(sid, 0),
        }
        _push("session", nm_convex.sync_session, _drop_nones(payload), dry_run=dry_run, counts=counts)


def backfill_injections(conn, *, dry_run: bool, counts: dict[str, int]) -> None:
    """Replays injection audit entries. Skipped silently when the table doesn't
    exist yet — depends on schema.sql v2 having been applied."""
    import nm_convex
    try:
        rows = conn.execute("""
            SELECT ts, session_id, path, tool_name, note_id, accepted, reason
            FROM injections
        """).fetchall()
    except Exception:
        return
    for ts, sid, path, tool_name, note_id, accepted, reason in rows:
        payload = {
            "ts": ts,
            "sessionId": sid,
            "path": path,
            "toolName": tool_name,
            "noteId": note_id,
            "accepted": bool(accepted),
            "reason": reason,
        }
        _push("injection", nm_convex.sync_injection, _drop_nones(payload), dry_run=dry_run, counts=counts)


def backfill_gc(conn, *, dry_run: bool, counts: dict[str, int]) -> None:
    import nm_convex
    try:
        rows = conn.execute(
            "SELECT ts, action, note_id, details FROM gc_actions"
        ).fetchall()
    except Exception:
        return
    for ts, action, note_id, details in rows:
        payload = {
            "ts": ts,
            "action": action,
            "noteId": note_id,
            "details": details,
        }
        _push("gc", nm_convex.sync_gc_action, _drop_nones(payload), dry_run=dry_run, counts=counts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="Print what would be sent; don't POST.")
    ap.add_argument("--notes", action="store_true", help="Only notes + edges")
    ap.add_argument("--hurdles", action="store_true", help="Only hurdles")
    ap.add_argument("--sessions", action="store_true", help="Only sessions")
    ap.add_argument("--injections", action="store_true", help="Only injections")
    ap.add_argument("--gc", action="store_true", help="Only gc_actions")
    args = ap.parse_args()

    init_db()

    import nm_convex
    if not args.dry_run and not nm_convex.is_enabled():
        sys.stderr.write(
            "CONVEX_URL is unset (or NM_SYNC_DISABLE=1). Set it to a "
            "*.convex.site URL or pass --dry-run.\n"
        )
        sys.exit(2)

    selectors = [args.notes, args.hurdles, args.sessions, args.injections, args.gc]
    run_all = not any(selectors)

    conn = connect()
    counts: dict[str, int] = {}
    try:
        if run_all or args.sessions:    backfill_sessions(conn, dry_run=args.dry_run, counts=counts)
        if run_all or args.notes:       backfill_notes(conn, dry_run=args.dry_run, counts=counts)
        if run_all or args.hurdles:     backfill_hurdles(conn, dry_run=args.dry_run, counts=counts)
        if run_all or args.injections:  backfill_injections(conn, dry_run=args.dry_run, counts=counts)
        if run_all or args.gc:          backfill_gc(conn, dry_run=args.dry_run, counts=counts)
    finally:
        conn.close()

    print()
    print("backfill summary:")
    for k, v in sorted(counts.items()):
        print(f"  {k:20s} {v}")
    if not counts:
        print("  (nothing to push — tables empty)")


if __name__ == "__main__":
    main()
