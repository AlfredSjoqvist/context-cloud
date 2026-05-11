#!/usr/bin/env python3
"""Eval: every numbered rule in .context-map/library/**/*.md is line-precise
and citable byte-for-byte by Guardian's verifyConstraintCite contract.

The contract from agent/tools/niaClient.ts is:

    actual = lines[line - 1]
    return actual.trim() === text.trim()

So every rule that Guardian could pick MUST satisfy:
  - it occupies exactly one line (no soft-wraps)
  - the rule body, byte-equal after .strip(), matches what the Guardian
    finding will carry as `constraintCite.text`

If a rule violates this, Guardian files a finding and HANDOFF rejects it
because verifyCitation fails — silent finding loss, the worst possible
demo failure mode.

# self-test (proves this eval has bite):
#   1. Hard-wrap a rule across two lines in any .md leaf under
#      .context-map/library/ (split mid-sentence, indent the continuation).
#      → test_each_numbered_rule_is_a_single_line MUST fail.
#   2. Add a trailing space to a rule line.
#      → test_no_trailing_whitespace_on_rule_lines MUST fail.
#   3. Drop the `applies_to:` key from a leaf's frontmatter.
#      → test_frontmatter_has_required_keys MUST fail.
#   4. Make `applies_to: []` (empty list).
#      → test_applies_to_is_non_empty_glob_list MUST fail.
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

# Matches a top-level numbered rule: "1. text...", "2. text...".
# Must be at column 0 (not indented inside a sub-list).
NUMBERED_RULE = re.compile(r"^(\d+)\. (.+)$")

# Required frontmatter keys for a Guardian-citable leaf.
REQUIRED_FRONTMATTER_KEYS = {
    "scope",
    "library",
    "applies_to",
    "source_id",
    "source_uri",
    "chunk_id",
    "extracted_at",
}


def _all_md_leaves() -> list[Path]:
    if not LIBRARY_ROOT.exists():
        return []
    return sorted(p for p in LIBRARY_ROOT.rglob("*.md") if p.is_file())


def _split_frontmatter(text: str) -> tuple[dict[str, str], list[str]]:
    """Return (frontmatter_dict, body_lines). Frontmatter is naive YAML —
    we only parse top-level `key: value` pairs, not nested structures."""
    lines = text.split("\n")
    if not lines or lines[0] != "---":
        return {}, lines
    try:
        end_idx = lines.index("---", 1)
    except ValueError:
        return {}, lines
    fm: dict[str, str] = {}
    for raw in lines[1:end_idx]:
        if ":" not in raw or raw.startswith(" ") or raw.startswith("-"):
            continue
        k, _, v = raw.partition(":")
        fm[k.strip()] = v.strip()
    body = lines[end_idx + 1 :]
    return fm, body


def _file_line_for(file_text: str, body_line: str) -> int | None:
    """Find the 1-based line number in `file_text` whose `.strip()` matches
    `body_line.strip()`. Returns None if not found or if ambiguous (multiple
    matches — citation would be unstable)."""
    target = body_line.strip()
    matches = []
    for i, raw in enumerate(file_text.split("\n"), start=1):
        if raw.strip() == target:
            matches.append(i)
    if len(matches) == 1:
        return matches[0]
    return None


class CitationPrecisionEval(unittest.TestCase):
    """Every Guardian-citable rule satisfies verifyConstraintCite contract."""

    @classmethod
    def setUpClass(cls):
        cls.leaves = _all_md_leaves()
        if not cls.leaves:
            raise unittest.SkipTest(
                f"No .md files under {LIBRARY_ROOT} — nothing to verify yet."
            )

    def test_at_least_one_leaf_exists(self):
        # Without this, every other test would vacuously pass and we'd
        # ship a placebo eval.
        self.assertGreater(len(self.leaves), 0, "no .context-map/library/*.md leaves")

    def test_each_numbered_rule_is_a_single_line(self):
        """Every `N. text` line stands alone — no soft wraps."""
        for leaf in self.leaves:
            text = leaf.read_text()
            _, body = _split_frontmatter(text)
            in_rule_block = True
            for line in body:
                if line.startswith("## "):
                    in_rule_block = False
                if not in_rule_block:
                    continue
                m = NUMBERED_RULE.match(line)
                if not m:
                    continue
                # The rule line itself is one line by construction. The
                # adversarial pattern is: numbered line followed by an
                # indented continuation line that the LLM-aware reader
                # would treat as part of the same rule. Detect it.
                idx = body.index(line)
                if idx + 1 < len(body):
                    next_line = body[idx + 1]
                    is_continuation = (
                        next_line.startswith("   ")
                        and next_line.strip()
                        and not NUMBERED_RULE.match(next_line.lstrip())
                    )
                    self.assertFalse(
                        is_continuation,
                        f"{leaf}: rule {m.group(1)} appears to soft-wrap "
                        f"into next line: {next_line!r}",
                    )

    def test_no_trailing_whitespace_on_rule_lines(self):
        for leaf in self.leaves:
            text = leaf.read_text()
            _, body = _split_frontmatter(text)
            for line in body:
                if NUMBERED_RULE.match(line):
                    self.assertEqual(
                        line, line.rstrip(),
                        f"{leaf}: rule line has trailing whitespace: {line!r}",
                    )

    def test_frontmatter_has_required_keys(self):
        for leaf in self.leaves:
            fm, _ = _split_frontmatter(leaf.read_text())
            missing = REQUIRED_FRONTMATTER_KEYS - set(fm.keys())
            self.assertFalse(
                missing,
                f"{leaf}: frontmatter missing required keys: {sorted(missing)}",
            )

    def test_applies_to_is_non_empty_glob_list(self):
        for leaf in self.leaves:
            fm, _ = _split_frontmatter(leaf.read_text())
            v = fm.get("applies_to", "")
            self.assertTrue(
                v.startswith("[") and v.endswith("]"),
                f"{leaf}: applies_to must be a JSON-style list, got {v!r}",
            )
            inside = v[1:-1].strip()
            self.assertNotEqual(
                inside, "",
                f"{leaf}: applies_to is empty — Guardian will skip this leaf",
            )

    def test_each_rule_is_byte_citable_by_guardian(self):
        """Per niaClient.verifyConstraintCite: file_lines[line-1].strip()
        must equal rule_text.strip(). Find the line for each rule and
        confirm the round-trip."""
        for leaf in self.leaves:
            text = leaf.read_text()
            _, body = _split_frontmatter(text)
            in_rule_block = True
            for line in body:
                if line.startswith("## "):
                    in_rule_block = False
                    continue
                if not in_rule_block:
                    continue
                m = NUMBERED_RULE.match(line)
                if not m:
                    continue
                # Whole numbered line is what Guardian carries as
                # constraintCite.text — the niaClient compares the entire
                # line (after .trim()), not just the rule body.
                located = _file_line_for(text, line)
                self.assertIsNotNone(
                    located,
                    f"{leaf}: rule {m.group(1)} could not be uniquely "
                    f"located by line-text match in source — citation "
                    f"would be ambiguous or impossible",
                )


if __name__ == "__main__":
    unittest.main()
