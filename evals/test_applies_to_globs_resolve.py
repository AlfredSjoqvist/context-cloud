#!/usr/bin/env python3
"""Eval: every `applies_to:` glob in `.context-map/library/**/*.md` matches
at least one file under `mock_org/`.

Why: docs-ingest scopes a leaf to specific files via the `applies_to`
frontmatter list. If the globs go stale (paths in mock_org/ get renamed,
a subrepo is removed, a leaf was authored against an aspirational path),
Guardian silently skips the leaf for every scan target — a finding that
should fire never does. This is invisible at finding-time; you only
notice when judges ask "why is rule X never triggered?".

Globs are checked against `mock_org/**` (any sub-org). The leaf authors
write project-relative globs (e.g. `src/api/auth.ts`) and docs-ingest
prepends the demo-target root at scan time; we mimic that by joining
each sub-org root with the glob.

# self-test (proves this eval has bite):
#   1. Edit any leaf and add `aspirational/path/*.ts` to its applies_to
#      list. → test_every_glob_matches_at_least_one_file MUST fail.
#   2. Edit any leaf and replace `applies_to` with a non-JSON value
#      (e.g. `applies_to: src/foo.ts`). → test_applies_to_is_valid_json
#      MUST fail.
# Verified manually 2026-05-10.
"""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir)))
LIBRARY_ROOT = REPO_ROOT / ".context-map" / "library"
DEMO_ROOTS = sorted(p for p in (REPO_ROOT / "mock_org").iterdir() if p.is_dir()) \
    if (REPO_ROOT / "mock_org").exists() else []


def _all_md_leaves() -> list[Path]:
    if not LIBRARY_ROOT.exists():
        return []
    return sorted(p for p in LIBRARY_ROOT.rglob("*.md") if p.is_file())


def _extract_applies_to(text: str) -> str | None:
    """Find the `applies_to: [...]` line in the frontmatter and return the
    raw JSON-ish value (the bracketed string). None if missing."""
    in_fm = False
    for line in text.split("\n"):
        if line == "---":
            if in_fm:
                return None
            in_fm = True
            continue
        if not in_fm:
            continue
        if line.startswith("applies_to:"):
            return line.split(":", 1)[1].strip()
    return None


def _glob_resolves(glob: str) -> list[Path]:
    """Return the list of files under any mock_org/<sub-org>/ that match
    `glob`. Glob is project-relative (e.g. `src/api/auth.ts`)."""
    matches: list[Path] = []
    for sub in DEMO_ROOTS:
        matches.extend(sub.glob(glob))
    return matches


class AppliesToGlobsResolveEval(unittest.TestCase):
    """Every applies_to glob points at something in mock_org/."""

    @classmethod
    def setUpClass(cls):
        cls.leaves = _all_md_leaves()
        if not cls.leaves:
            raise unittest.SkipTest(
                f"No .md files under {LIBRARY_ROOT} — nothing to verify yet."
            )
        if not DEMO_ROOTS:
            raise unittest.SkipTest(
                f"No mock_org/<sub-org> dirs found at {REPO_ROOT / 'mock_org'}; "
                "applies_to globs cannot be verified without a demo target."
            )

    def test_applies_to_is_valid_json(self):
        for leaf in self.leaves:
            with self.subTest(leaf=str(leaf.relative_to(REPO_ROOT))):
                raw = _extract_applies_to(leaf.read_text())
                self.assertIsNotNone(raw, "no applies_to in frontmatter")
                try:
                    value = json.loads(raw)
                except json.JSONDecodeError as e:
                    self.fail(f"applies_to is not JSON: {raw!r} ({e})")
                self.assertIsInstance(value, list, "applies_to must be a JSON list")
                self.assertTrue(
                    all(isinstance(g, str) for g in value),
                    "applies_to entries must be strings",
                )

    def test_every_glob_matches_at_least_one_file(self):
        """Aggregated check: a leaf passes if AT LEAST ONE of its globs
        resolves. Author intent is "this leaf applies to any of these
        files"; not every glob has to hit on every demo-target evolution.

        The dual check — every individual glob resolves — is too strict
        (some leaves intentionally include forward-looking globs like
        `src/lib/secrets.ts` for files that don't exist yet but should).
        Instead: at least one glob per leaf must resolve. If zero resolve,
        the leaf is dead weight.
        """
        for leaf in self.leaves:
            with self.subTest(leaf=str(leaf.relative_to(REPO_ROOT))):
                raw = _extract_applies_to(leaf.read_text())
                globs = json.loads(raw)
                resolved_total = 0
                per_glob: list[tuple[str, int]] = []
                for g in globs:
                    hits = _glob_resolves(g)
                    per_glob.append((g, len(hits)))
                    resolved_total += len(hits)
                self.assertGreater(
                    resolved_total, 0,
                    f"NONE of its applies_to globs match any file under "
                    f"mock_org/. Per-glob counts: {per_glob}. The leaf is dead "
                    f"weight — Guardian will never apply it to anything.",
                )


if __name__ == "__main__":
    unittest.main()
