#!/usr/bin/env python3
"""Eval: structural consistency of `.context-map/library/**/*.md` frontmatter.

Catches the most common author errors when hand-writing or copy-pasting
a new leaf:

  - `library:` doesn't match the parent directory (copy-paste left the
    old library name → Guardian groups the leaf under the wrong shelf).
  - `chunk_id:` doesn't follow `<library>.<topic>.v<n>` where topic
    matches the filename stem (cross-shelf collisions become silent).
  - `applies_to:` rule count doesn't match numbered-rule body count
    (frontmatter is what docs-ingest reads; body is what Guardian
    cites — divergence means a finding cites a rule that's not
    declared, or vice versa).

These are pure structural checks on the markdown — no source needed.
Catches a class of error that the citation-precision eval cannot
(citation eval verifies bytewise equality at a line, not the *count*
of rules in frontmatter vs. body).

# self-test (proves this eval has bite):
#   1. Edit any leaf and change `library: auth` to `library: foo` →
#      test_library_matches_parent_directory MUST fail.
#   2. Edit any leaf and append a numbered rule to the body without
#      adding a corresponding entry under `rules:` →
#      test_rule_count_matches_frontmatter MUST fail.
#   3. Edit any leaf and change `chunk_id: auth.credentials-required.v1`
#      to `chunk_id: bogus` → test_chunk_id_format MUST fail.
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
CHUNK_ID_FORMAT = re.compile(r"^([a-z0-9-]+)\.([a-z0-9-]+)\.v(\d+)$")


def _all_md_leaves() -> list[Path]:
    if not LIBRARY_ROOT.exists():
        return []
    return sorted(p for p in LIBRARY_ROOT.rglob("*.md") if p.is_file())


def _split_frontmatter(text: str) -> tuple[dict[str, str], list[str], list[str]]:
    """Return (top-level frontmatter dict, raw frontmatter lines, body lines)."""
    lines = text.split("\n")
    if not lines or lines[0] != "---":
        return {}, [], lines
    try:
        end_idx = lines.index("---", 1)
    except ValueError:
        return {}, [], lines
    fm_raw = lines[1:end_idx]
    fm: dict[str, str] = {}
    for raw in fm_raw:
        if ":" not in raw or raw.startswith(" ") or raw.startswith("-"):
            continue
        k, _, v = raw.partition(":")
        fm[k.strip()] = v.strip()
    body = lines[end_idx + 1 :]
    return fm, fm_raw, body


def _count_rules_in_frontmatter(fm_raw: list[str]) -> int:
    """Count `- modality:` lines under the `rules:` block."""
    in_rules = False
    n = 0
    for raw in fm_raw:
        if raw.startswith("rules:"):
            in_rules = True
            continue
        if in_rules:
            stripped = raw.strip()
            if not raw.startswith(" ") and stripped and stripped != "":
                # left the rules block
                in_rules = False
                continue
            if stripped.startswith("- modality:"):
                n += 1
    return n


def _count_numbered_rules_in_body(body: list[str]) -> int:
    n = 0
    for line in body:
        if line.startswith("## "):
            break
        if NUMBERED_RULE.match(line):
            n += 1
    return n


class LeafMetadataConsistencyEval(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.leaves = _all_md_leaves()
        if not cls.leaves:
            raise unittest.SkipTest("No leaves to inspect.")

    def test_library_matches_parent_directory(self):
        for leaf in self.leaves:
            fm, _, _ = _split_frontmatter(leaf.read_text())
            parent = leaf.parent.name
            self.assertEqual(
                fm.get("library"), parent,
                f"{leaf}: frontmatter library={fm.get('library')!r} "
                f"but parent dir is {parent!r}. Either rename the dir or "
                f"fix the frontmatter — Guardian groups by `library`.",
            )

    def test_chunk_id_format(self):
        for leaf in self.leaves:
            fm, _, _ = _split_frontmatter(leaf.read_text())
            chunk_id = fm.get("chunk_id", "")
            m = CHUNK_ID_FORMAT.match(chunk_id)
            self.assertIsNotNone(
                m,
                f"{leaf}: chunk_id={chunk_id!r} does not match "
                f"`<library>.<topic>.v<n>`",
            )
            lib_part = m.group(1)
            topic_part = m.group(2)
            self.assertEqual(
                lib_part, fm.get("library"),
                f"{leaf}: chunk_id library segment {lib_part!r} != "
                f"frontmatter library {fm.get('library')!r}",
            )
            stem = leaf.stem
            self.assertEqual(
                topic_part, stem,
                f"{leaf}: chunk_id topic segment {topic_part!r} != "
                f"filename stem {stem!r}",
            )

    def test_rule_count_matches_frontmatter(self):
        for leaf in self.leaves:
            text = leaf.read_text()
            _, fm_raw, body = _split_frontmatter(text)
            fm_n = _count_rules_in_frontmatter(fm_raw)
            body_n = _count_numbered_rules_in_body(body)
            self.assertEqual(
                fm_n, body_n,
                f"{leaf}: frontmatter declares {fm_n} rules but body has "
                f"{body_n} numbered rules. The two MUST match — "
                f"frontmatter is what docs-ingest reads, body is what "
                f"Guardian cites.",
            )

    def test_source_uri_includes_library_and_topic(self):
        for leaf in self.leaves:
            fm, _, _ = _split_frontmatter(leaf.read_text())
            uri = fm.get("source_uri", "")
            lib = fm.get("library", "")
            topic = leaf.stem
            self.assertIn(
                lib, uri,
                f"{leaf}: source_uri={uri!r} should include library {lib!r}",
            )
            self.assertIn(
                topic, uri,
                f"{leaf}: source_uri={uri!r} should include topic {topic!r}",
            )


if __name__ == "__main__":
    unittest.main()
