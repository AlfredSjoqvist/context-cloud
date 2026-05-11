#!/usr/bin/env python3
"""Eval: NM hurdle scoring respects HURDLE_THRESHOLD and SIGNAL_CLUSTER_GAP.

Covers the core invariant of `nm_extract.expand_windows`:
  - A cluster only emits a HurdleWindow if accumulated weight >= threshold.
  - A signal joins the current cluster only if it is within SIGNAL_CLUSTER_GAP
    events of the previous signal.
  - The emitted window's `score` equals the exact sum of clustered signal
    weights (not approximate, not capped, not normalised).

# self-test (proves this eval has bite):
#   1. Edit nm_signals.py: set HURDLE_THRESHOLD = 0.5 → tests
#      `test_single_subthreshold_signal_emits_no_window` and
#      `test_two_signals_split_by_gap_emit_no_window` MUST fail.
#   2. Edit nm_extract.py: change `<= SIGNAL_CLUSTER_GAP` to `< SIGNAL_CLUSTER_GAP`
#      → `test_two_signals_at_gap_boundary_cluster` MUST fail.
#   3. Edit nm_extract.py: change `total = sum(s.weight for s in cluster)` to
#      `total = max(s.weight for s in cluster)` → `test_window_score_equals_sum`
#      MUST fail.
# Verified manually 2026-05-10.
"""
from __future__ import annotations

import os
import sys
import unittest

# Repo root is the parent of evals/.
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from nm_events import Event  # noqa: E402
from nm_extract import SIGNAL_CLUSTER_GAP, expand_windows  # noqa: E402
from nm_signals import HURDLE_THRESHOLD, Signal  # noqa: E402


def _ev(idx: int) -> Event:
    """Minimal tool_call Event at position `idx`. tool_input empty so
    _files_in_range returns []. Keeps the test focused on scoring logic."""
    return Event(idx=idx, te_id=idx, ts=f"2026-05-10T00:00:{idx:02d}", kind="tool_call",
                 tool_name="Read", tool_input={})


def _events(n: int) -> list[Event]:
    return [_ev(i) for i in range(n)]


def _sig(event_idx: int, weight: float, kind: str = "feedback") -> Signal:
    return Signal(kind=kind, event_idx=event_idx, weight=weight)


class HurdleThresholdEval(unittest.TestCase):
    """Threshold and cluster-gap behaviour of expand_windows."""

    # --- baseline assumptions on the constants we depend on ---------------
    def test_constants_match_documented_values(self):
        """If anyone bumps these, every other case in this file needs review."""
        self.assertEqual(HURDLE_THRESHOLD, 3.0)
        self.assertEqual(SIGNAL_CLUSTER_GAP, 12)

    # --- empty / no-op ----------------------------------------------------
    def test_empty_signals_emit_no_window(self):
        self.assertEqual(expand_windows(_events(20), []), [])

    # --- threshold --------------------------------------------------------
    def test_single_at_threshold_signal_emits_window(self):
        wins = expand_windows(_events(20), [_sig(5, HURDLE_THRESHOLD)])
        self.assertEqual(len(wins), 1)
        self.assertEqual(wins[0].score, HURDLE_THRESHOLD)

    def test_single_subthreshold_signal_emits_no_window(self):
        wins = expand_windows(_events(20), [_sig(5, HURDLE_THRESHOLD - 0.5)])
        self.assertEqual(wins, [])

    def test_single_just_above_threshold_emits_window(self):
        wins = expand_windows(_events(20), [_sig(5, HURDLE_THRESHOLD + 0.01)])
        self.assertEqual(len(wins), 1)

    # --- cluster gap ------------------------------------------------------
    def test_two_signals_within_gap_cluster_into_one_window(self):
        sigs = [_sig(0, 2.0), _sig(5, 2.0)]  # gap = 5, both weight-2
        wins = expand_windows(_events(40), sigs)
        self.assertEqual(len(wins), 1)
        self.assertEqual(wins[0].score, 4.0)

    def test_two_signals_at_gap_boundary_cluster(self):
        # diff = SIGNAL_CLUSTER_GAP exactly → must cluster (the rule is `<=`).
        a, b = 0, SIGNAL_CLUSTER_GAP
        wins = expand_windows(_events(40), [_sig(a, 2.0), _sig(b, 2.0)])
        self.assertEqual(len(wins), 1, "boundary case <= must include equal gap")
        self.assertEqual(wins[0].score, 4.0)

    def test_two_signals_split_by_gap_emit_no_window(self):
        # diff = SIGNAL_CLUSTER_GAP + 1 → cluster splits, neither half clears
        # threshold → 0 windows.
        a = 0
        b = SIGNAL_CLUSTER_GAP + 1
        wins = expand_windows(_events(40), [_sig(a, 2.0), _sig(b, 2.0)])
        self.assertEqual(wins, [])

    def test_three_signals_split_first_pair_clusters_third_alone_drops(self):
        # First two cluster (score 4.0 → window). Third is far → cluster of
        # one with weight 2.0, dropped. Total: 1 window.
        wins = expand_windows(
            _events(80),
            [_sig(0, 2.0), _sig(5, 2.0), _sig(50, 2.0)],
        )
        self.assertEqual(len(wins), 1)
        self.assertEqual(wins[0].score, 4.0)

    # --- score equals sum, not max / mean / count -------------------------
    def test_window_score_equals_sum(self):
        sigs = [_sig(0, 1.0), _sig(2, 1.0), _sig(4, 1.5)]
        wins = expand_windows(_events(20), sigs)
        self.assertEqual(len(wins), 1)
        self.assertAlmostEqual(wins[0].score, 3.5)
        # And the window remembers exactly the signals it was built from.
        self.assertEqual([s.weight for s in wins[0].signals], [1.0, 1.0, 1.5])

    # --- ordering: signals must already be sorted (caller's contract) -----
    # Detector functions in nm_signals.py emit signals in event order, so
    # verifying that ordering is preserved end-to-end protects against future
    # callers shuffling the list.
    def test_window_signals_preserve_order(self):
        sigs = [_sig(0, 1.5), _sig(3, 1.5), _sig(6, 1.5)]
        wins = expand_windows(_events(20), sigs)
        self.assertEqual([s.event_idx for s in wins[0].signals], [0, 3, 6])


if __name__ == "__main__":
    unittest.main()
