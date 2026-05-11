#!/usr/bin/env python3
"""Eval: NM GC's decay → merge → prune cycle removes stale notes from the
injection surface and writes correct gc_actions rows.

Covers the core invariants of nm_gc.{decay,merge,prune}:
  - decay reduces importance for notes idle longer than DECAY_HALF_LIFE_DAYS
  - prune sets t_invalid on notes whose decayed importance is below
    PRUNE_THRESHOLD (so get_relevant_notes-style queries skip them)
  - merge invalidates duplicate notes (overlapping files + similar text)
  - every action lands as a gc_actions row with the right action label

# self-test (proves this eval has bite):
#   1. Set PRUNE_THRESHOLD = 0.0 in nm_gc.py → test_low_importance_idle_note_gets_pruned
#      MUST fail (no notes ever fall below 0.0).
#   2. Set DECAY_HALF_LIFE_DAYS = 36500.0 in nm_gc.py → test_decay_writes_gc_action
#      MUST fail (a 100-year half-life means a 30-day-old note retains
#      essentially full importance).
#   3. Set MERGE_FILE_OVERLAP_MIN = 1.5 (impossible) in nm_gc.py →
#      test_duplicate_notes_get_merged MUST fail (no pair will satisfy
#      the threshold).
# Verified manually 2026-05-10.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir)))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# We control NM_DB *before* importing nm_db so DB_PATH points at our
# temp file. Each test gets a fresh db.

_TMPDIR = tempfile.TemporaryDirectory()
os.environ["NM_DB"] = str(Path(_TMPDIR.name) / "nm.db")

import nm_db  # noqa: E402
import nm_gc  # noqa: E402


def _reset_db() -> None:
    """Drop and recreate the test DB."""
    if Path(nm_db.DB_PATH).exists():
        Path(nm_db.DB_PATH).unlink()
    nm_db.init_db()


def _iso_days_ago(n: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


def _insert_note(
    nid: str,
    *,
    importance: float,
    last_injected_days_ago: float | None = None,
    created_days_ago: float = 30.0,
    correction: str = "",
    files: tuple[str, ...] = (),
) -> None:
    conn = nm_db.connect()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO notes (id, symptom, root_cause, correction, importance, "
        "created_at, last_injected_at, t_invalid) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
        (
            nid,
            f"symptom-for-{nid}",
            f"root-for-{nid}",
            correction,
            importance,
            _iso_days_ago(created_days_ago),
            _iso_days_ago(last_injected_days_ago) if last_injected_days_ago is not None else None,
        ),
    )
    for path in files:
        cur.execute(
            "INSERT OR IGNORE INTO files (path, type, first_seen, last_seen) "
            "VALUES (?, 'ts', ?, ?)",
            (path, _iso_days_ago(created_days_ago), _iso_days_ago(0)),
        )
        cur.execute(
            "INSERT INTO file_note_edges (note_id, path, weight) VALUES (?, ?, 1.0)",
            (nid, path),
        )
    conn.commit()
    conn.close()


def _read_active_ids() -> list[str]:
    conn = nm_db.connect()
    cur = conn.cursor()
    cur.execute("SELECT id FROM notes WHERE t_invalid IS NULL ORDER BY id")
    rows = [r[0] for r in cur.fetchall()]
    conn.close()
    return rows


def _read_gc_actions() -> list[tuple[str, str | None]]:
    conn = nm_db.connect()
    cur = conn.cursor()
    cur.execute("SELECT action, note_id FROM gc_actions ORDER BY id")
    rows = [(r[0], r[1]) for r in cur.fetchall()]
    conn.close()
    return rows


class GCPruningEval(unittest.TestCase):
    """End-to-end nm_gc cycle on a synthetic SQLite db."""

    def setUp(self):
        _reset_db()

    # --- decay ------------------------------------------------------------

    def test_decay_writes_gc_action(self):
        # 30-day idle, importance 1.0. Half-life 7d → ~ 1.0 * 0.5**(30/7) ≈ 0.052.
        _insert_note("idle-old", importance=1.0, last_injected_days_ago=30.0,
                     created_days_ago=30.0)
        conn = nm_db.connect()
        actions = nm_gc.decay(conn)
        conn.close()
        self.assertEqual(len(actions), 1)
        self.assertEqual(actions[0]["action"], "decay")
        gc = _read_gc_actions()
        self.assertIn(("decay", "idle-old"), gc)

    def test_decay_skips_recent_note(self):
        # 0 days idle → factor ~ 1.0 → no decay row.
        _insert_note("fresh", importance=1.0, last_injected_days_ago=0.0,
                     created_days_ago=0.0)
        conn = nm_db.connect()
        actions = nm_gc.decay(conn)
        conn.close()
        self.assertEqual(actions, [])

    # --- prune ------------------------------------------------------------

    def test_low_importance_idle_note_gets_pruned(self):
        # Pre-decayed below threshold. prune() invalidates and writes action.
        _insert_note("dead", importance=0.05, created_days_ago=30.0)
        conn = nm_db.connect()
        actions = nm_gc.prune(conn)
        conn.close()
        self.assertEqual(len(actions), 1)
        self.assertEqual(actions[0]["action"], "prune")
        # Pruned: not in active set anymore.
        self.assertNotIn("dead", _read_active_ids())
        # gc_actions row exists.
        self.assertIn(("prune", "dead"), _read_gc_actions())

    def test_above_threshold_note_is_not_pruned(self):
        _insert_note("live", importance=nm_gc.PRUNE_THRESHOLD + 0.1,
                     created_days_ago=30.0)
        conn = nm_db.connect()
        actions = nm_gc.prune(conn)
        conn.close()
        self.assertEqual(actions, [])
        self.assertIn("live", _read_active_ids())

    # --- merge ------------------------------------------------------------

    def test_duplicate_notes_get_merged(self):
        # Two notes attached to the same file, with overlapping correction
        # vocabulary. Higher-importance one wins; lower one is invalidated.
        same_files = ("src/api/auth.ts",)
        common_text = (
            "always validate the bearer token using crypto timingSafeEqual "
            "before responding with ok true to the caller"
        )
        _insert_note("primary", importance=0.9, created_days_ago=10.0,
                     correction=common_text + " always", files=same_files)
        _insert_note("dup", importance=0.5, created_days_ago=10.0,
                     correction=common_text + " always", files=same_files)
        conn = nm_db.connect()
        actions = nm_gc.merge(conn)
        conn.close()
        self.assertEqual(len(actions), 1, f"expected 1 merge, got {actions}")
        self.assertEqual(actions[0]["action"], "merge")
        # Loser is invalidated; winner remains.
        active = _read_active_ids()
        self.assertIn("primary", active)
        self.assertNotIn("dup", active)
        self.assertIn(("merge", "dup"), _read_gc_actions())

    def test_unrelated_notes_are_not_merged(self):
        _insert_note("a", importance=0.9, created_days_ago=10.0,
                     correction="redact bearer tokens before persisting tool inputs",
                     files=("src/lib/redaction.ts",))
        _insert_note("b", importance=0.8, created_days_ago=10.0,
                     correction="rate limit counters must decay over time",
                     files=("src/api/rateLimit.ts",))
        conn = nm_db.connect()
        actions = nm_gc.merge(conn)
        conn.close()
        self.assertEqual(actions, [])
        self.assertEqual(_read_active_ids(), ["a", "b"])

    # --- end-to-end run_once orchestrator --------------------------------

    def test_run_once_reports_action_counts(self):
        # `dead` is already below threshold and gets pruned directly.
        # `idle` is at 1.0 today but 30 days idle → after decay it's
        # ~0.052 which is also below threshold → also gets pruned.
        # So both notes prune by end of run_once.
        _insert_note("dead", importance=0.05, created_days_ago=30.0)
        _insert_note("idle", importance=1.0, last_injected_days_ago=30.0,
                     created_days_ago=30.0)
        result = nm_gc.run_once()
        self.assertGreaterEqual(result["decay"], 1, "idle note should decay")
        self.assertEqual(result["pruned"], 2,
                         "both `dead` (already low) and `idle` (decayed below "
                         "threshold) must prune in one cycle")


if __name__ == "__main__":
    unittest.main()
