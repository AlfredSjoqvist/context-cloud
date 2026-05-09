"""GC agent — prunes the note graph.

Three actions, in order:

  1. DECAY   — every note's importance decays based on time since
               last_injected_at (or created_at if never injected).
               Notes used recently retain their weight; idle notes lose it.
  2. MERGE   — notes attached to overlapping file sets and with similar
               correction text are coalesced into the higher-importance one;
               the loser is invalidated with action='merge'.
  3. PRUNE   — notes whose decayed importance falls below PRUNE_THRESHOLD are
               invalidated with action='prune'.

Every action is written to `gc_actions` (audit) and mirrored to Convex.

Usage:
    python nm_gc.py                    # default decay + merge + prune
    python nm_gc.py --dry-run          # report only, no writes
    python nm_gc.py --once             # run once and exit (default)
    python nm_gc.py --loop --interval 900   # run every 900s (15 min) — for demo

Designed to be cheap (~ms per note) so it can fire on a tight schedule. The
Tensorlake wrapper at tensorlake/gc.py invokes the same code path.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from nm_db import connect, init_db, now_iso

# ---- knobs -----------------------------------------------------------------

DECAY_HALF_LIFE_DAYS = 7.0      # importance halves every N days of idleness
PRUNE_THRESHOLD = 0.10          # below this → invalidate with action='prune'
MERGE_FILE_OVERLAP_MIN = 0.6    # Jaccard between two notes' file sets
MERGE_TEXT_OVERLAP_MIN = 0.5    # cosine over correction text bags
TEXT_BAG_MIN_TOKENS = 4         # too few tokens → don't merge

_TOKEN_RE = __import__("re").compile(r"[A-Za-z0-9_]{3,}")


def _bag(text: str) -> Counter[str]:
    return Counter(t.lower() for t in _TOKEN_RE.findall(text or ""))


def _cosine(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    common = set(a) & set(b)
    if not common:
        return 0.0
    num = sum(a[t] * b[t] for t in common)
    da = math.sqrt(sum(v * v for v in a.values()))
    db = math.sqrt(sum(v * v for v in b.values()))
    if da == 0 or db == 0:
        return 0.0
    return num / (da * db)


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _decay_factor(reference_iso: str | None, now: datetime) -> float:
    """Exponential decay: factor = 0.5 ** (idle_days / half_life)."""
    ref = _parse_iso(reference_iso) or now
    idle = (now - ref).total_seconds() / 86400.0
    if idle <= 0:
        return 1.0
    return 0.5 ** (idle / DECAY_HALF_LIFE_DAYS)


# ---- the three passes ------------------------------------------------------

def _convex_safe(fn, *args) -> None:
    try:
        import nm_convex
        if nm_convex.is_enabled():
            fn(*args)
    except Exception:
        pass


def decay(conn, *, dry_run: bool = False) -> list[dict]:
    """Decay importance for active notes. Writes one gc_actions row per change."""
    now = datetime.now(timezone.utc)
    cur = conn.cursor()
    cur.execute(
        "SELECT id, importance, last_injected_at, created_at "
        "FROM notes WHERE t_invalid IS NULL"
    )
    actions: list[dict] = []
    for nid, imp, last_inj, created in cur.fetchall():
        ref = last_inj or created
        factor = _decay_factor(ref, now)
        new_imp = round(imp * factor, 4)
        if new_imp >= imp - 1e-4:
            continue
        actions.append({"action": "decay", "note_id": nid,
                        "details": json.dumps({"old": imp, "new": new_imp, "factor": round(factor, 4)})})
        if not dry_run:
            ts = now.isoformat()
            cur.execute("UPDATE notes SET importance = ? WHERE id = ?", (new_imp, nid))
            cur.execute(
                "INSERT INTO gc_actions (ts, action, note_id, details) VALUES (?, ?, ?, ?)",
                (ts, "decay", nid, actions[-1]["details"]),
            )
            import nm_convex
            _convex_safe(nm_convex.sync_gc_action, {
                "ts": ts, "action": "decay", "noteId": nid, "details": actions[-1]["details"],
            })
    if not dry_run:
        conn.commit()
    return actions


def _load_active(conn) -> list[dict]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT n.id, n.symptom, n.root_cause, n.correction, n.importance, n.created_at
        FROM notes n WHERE n.t_invalid IS NULL
        ORDER BY n.importance DESC
        """
    )
    rows = cur.fetchall()
    out = []
    for r in rows:
        cur.execute("SELECT path FROM file_note_edges WHERE note_id = ?", (r[0],))
        files = {p[0] for p in cur.fetchall()}
        out.append({
            "id": r[0], "symptom": r[1], "root_cause": r[2], "correction": r[3] or "",
            "importance": r[4], "created_at": r[5], "files": files,
        })
    return out


def merge(conn, *, dry_run: bool = False) -> list[dict]:
    """Coalesce duplicate notes (overlapping files + similar correction)."""
    notes = _load_active(conn)
    actions: list[dict] = []
    invalidated: set[str] = set()
    cur = conn.cursor()
    for i, a in enumerate(notes):
        if a["id"] in invalidated:
            continue
        bag_a = _bag(a["correction"])
        if sum(bag_a.values()) < TEXT_BAG_MIN_TOKENS:
            continue
        for b in notes[i + 1:]:
            if b["id"] in invalidated:
                continue
            if _jaccard(a["files"], b["files"]) < MERGE_FILE_OVERLAP_MIN:
                continue
            bag_b = _bag(b["correction"])
            if sum(bag_b.values()) < TEXT_BAG_MIN_TOKENS:
                continue
            if _cosine(bag_a, bag_b) < MERGE_TEXT_OVERLAP_MIN:
                continue
            # Merge: keep `a` (already higher importance via ORDER BY), invalidate `b`.
            details = json.dumps({"merged_into": a["id"], "from": b["id"]})
            actions.append({"action": "merge", "note_id": b["id"], "details": details})
            invalidated.add(b["id"])
            if not dry_run:
                ts = now_iso()
                cur.execute(
                    "UPDATE notes SET t_invalid = ? WHERE id = ?",
                    (ts, b["id"]),
                )
                cur.execute(
                    "INSERT INTO gc_actions (ts, action, note_id, details) VALUES (?, ?, ?, ?)",
                    (ts, "merge", b["id"], details),
                )
                import nm_convex
                _convex_safe(nm_convex.sync_gc_action, {
                    "ts": ts, "action": "merge", "noteId": b["id"], "details": details,
                })
    if not dry_run:
        conn.commit()
    return actions


def prune(conn, *, dry_run: bool = False) -> list[dict]:
    """Invalidate notes whose importance has decayed below PRUNE_THRESHOLD."""
    cur = conn.cursor()
    cur.execute(
        "SELECT id, importance FROM notes WHERE t_invalid IS NULL "
        "AND importance < ?",
        (PRUNE_THRESHOLD,),
    )
    actions: list[dict] = []
    for nid, imp in cur.fetchall():
        details = json.dumps({"importance": imp, "threshold": PRUNE_THRESHOLD})
        actions.append({"action": "prune", "note_id": nid, "details": details})
        if not dry_run:
            ts = now_iso()
            cur.execute(
                "UPDATE notes SET t_invalid = ? WHERE id = ?",
                (ts, nid),
            )
            cur.execute(
                "INSERT INTO gc_actions (ts, action, note_id, details) VALUES (?, ?, ?, ?)",
                (ts, "prune", nid, details),
            )
            import nm_convex
            _convex_safe(nm_convex.sync_gc_action, {
                "ts": ts, "action": "prune", "noteId": nid, "details": details,
            })
    if not dry_run:
        conn.commit()
    return actions


# ---- orchestrator ----------------------------------------------------------

def run_once(*, dry_run: bool = False) -> dict:
    init_db()
    conn = connect()
    try:
        decay_actions = decay(conn, dry_run=dry_run)
        merge_actions = merge(conn, dry_run=dry_run)
        prune_actions = prune(conn, dry_run=dry_run)
    finally:
        conn.close()
    return {
        "ts": now_iso(),
        "dry_run": dry_run,
        "decay": len(decay_actions),
        "merged": len(merge_actions),
        "pruned": len(prune_actions),
        "actions": {
            "decay": decay_actions[:20],
            "merge": merge_actions[:20],
            "prune": prune_actions[:20],
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Report only, don't persist")
    ap.add_argument("--loop", action="store_true", help="Run forever on --interval seconds")
    ap.add_argument("--interval", type=int, default=900, help="Seconds between runs in --loop mode")
    args = ap.parse_args()

    while True:
        result = run_once(dry_run=args.dry_run)
        print(json.dumps(result, indent=2, default=str))
        if not args.loop:
            return
        time.sleep(max(30, args.interval))


if __name__ == "__main__":
    main()
