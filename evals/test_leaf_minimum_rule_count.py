#!/usr/bin/env python3
"""Eval: every leaf under .context-map/library/ has at least N rules.

Why: a leaf with 1 or 2 rules is a stub — it costs Guardian a planner
slot and a citation lookup but doesn't earn its keep. The current floor
is 4 (every shipped leaf has 4–7 rules; 4 is the lowest, in
`secrets/redaction-completeness.md`).

This is a soft minimum — bump it deliberately if the bar should be
higher. Lowering it should never happen silently.

# self-test (proves this eval has bite):
#   1. Add a stub leaf with 2 numbered rules → MUST fail.
#   2. Increase MIN_RULES to 10 → every existing leaf MUST fail.
# Verified manually 2026-05-10.
"""
from __future__ import annotations

import os
import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir)))
LIBRARY_ROOT = REPO_ROOT / ".context-map" / "library"

NUMBERED_RULE = re.compile(r"^(\d+)\. (.+)$")

# Floor on rules-per-leaf. Bump intentionally; never lower silently.
MIN_RULES = 4


def _all_md_leaves() -> list[Path]:
    if not LIBRARY_ROOT.exists():
        return []
    return sorted(p for p in LIBRARY_ROOT.rglob("*.md") if p.is_file())


def _count_numbered_rules(text: str) -> int:
    """Count `N. text` lines in the body, stopping at the first H2."""
    in_body = False
    n = 0
    for line in text.split("\n"):
        if line == "---":
            in_body = True if in_body else False
        if line.startswith("## "):
            break
        if NUMBERED_RULE.match(line):
            n += 1
    return n


class LeafMinimumRuleCountEval(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.leaves = _all_md_leaves()
        if not cls.leaves:
            raise unittest.SkipTest("no leaves to inspect")

    def test_every_leaf_meets_minimum(self):
        for leaf in self.leaves:
            with self.subTest(leaf=str(leaf.relative_to(REPO_ROOT))):
                n = _count_numbered_rules(leaf.read_text())
                self.assertGreaterEqual(
                    n, MIN_RULES,
                    f"leaf has {n} rules; minimum is {MIN_RULES}. Either "
                    f"flesh the leaf out or merge it into a sibling.",
                )


if __name__ == "__main__":
    unittest.main()
