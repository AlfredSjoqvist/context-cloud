#!/usr/bin/env python3
"""Eval: if `mock_org/<sub-org>/.context-map/library/` exists, every leaf
under it is byte-identical to the same path under the repo-root seed.

Why: Guardian reads constraints from `<DEMO_REPO_LOCAL_PATH>/.context-map/library/`
(see `agent/main.ts` → `filesystemRoot`). The canonical seed lives at the
repo root. SETUP.md step 4 copies the seed into the demo target. If
someone edits the canonical seed and forgets to re-copy, the demo
diverges from the eval-verified source — Guardian cites lines that
don't match the latest constraints, and citations silently break.

This eval makes the mirror enforceable: edit canonical → mirror MUST
update too, or the eval turns red.

Tolerates the case where no demo target has been bootstrapped yet
(skips with an explanation rather than failing).

# self-test (proves this eval has bite):
#   1. Run the SETUP step 4 copy. Edit one rule line in
#      .context-map/library/auth/credentials-required.md without
#      mirroring → test_demo_target_copies_match_canonical MUST fail.
#   2. Add an extra .md file to mock_org/agent-gateway/.context-map/library/
#      that doesn't exist at the repo root →
#      test_demo_target_copies_match_canonical MUST fail (extra file is a drift signal).
# Verified manually 2026-05-10 (skipped path; the demo-target copy is
# created at setup time, not committed to git).
"""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir)))
CANONICAL_LIBRARY = REPO_ROOT / ".context-map" / "library"
MOCK_ORG = REPO_ROOT / "mock_org"


def _demo_target_libraries() -> list[Path]:
    """Find every `mock_org/<sub-org>/.context-map/library/` that exists."""
    if not MOCK_ORG.exists():
        return []
    found: list[Path] = []
    for sub in sorted(MOCK_ORG.iterdir()):
        if not sub.is_dir():
            continue
        candidate = sub / ".context-map" / "library"
        if candidate.exists() and candidate.is_dir():
            found.append(candidate)
    return found


def _relative_md_files(root: Path) -> set[Path]:
    return {p.relative_to(root) for p in root.rglob("*.md") if p.is_file()}


class SeedLibraryMirrorEval(unittest.TestCase):
    """Demo-target copies of the seed library must match canonical."""

    @classmethod
    def setUpClass(cls):
        cls.targets = _demo_target_libraries()
        if not cls.targets:
            raise unittest.SkipTest(
                f"No mock_org/<sub-org>/.context-map/library/ found. "
                f"Run SETUP.md step 4 to bootstrap one. Skipping mirror "
                f"verification (the canonical seed at "
                f"{CANONICAL_LIBRARY} is still verified by the other "
                f"evals)."
            )
        if not CANONICAL_LIBRARY.exists():
            raise unittest.SkipTest(
                f"Canonical library {CANONICAL_LIBRARY} missing — nothing to mirror against."
            )

    def test_demo_target_copies_match_canonical(self):
        canonical_files = _relative_md_files(CANONICAL_LIBRARY)
        for target_root in self.targets:
            target_files = _relative_md_files(target_root)

            extra = target_files - canonical_files
            self.assertFalse(
                extra,
                f"{target_root}: contains files not present at canonical "
                f"{CANONICAL_LIBRARY}: {sorted(map(str, extra))}. Either "
                f"add them to the canonical seed or remove them from the "
                f"mirror.",
            )

            missing = canonical_files - target_files
            self.assertFalse(
                missing,
                f"{target_root}: missing canonical files: "
                f"{sorted(map(str, missing))}. Re-run SETUP.md step 4 to "
                f"refresh the mirror.",
            )

            for rel in canonical_files & target_files:
                canon_text = (CANONICAL_LIBRARY / rel).read_text()
                target_text = (target_root / rel).read_text()
                self.assertEqual(
                    canon_text, target_text,
                    f"{target_root / rel} differs from "
                    f"{CANONICAL_LIBRARY / rel}. Edit the canonical "
                    f"version and re-run SETUP.md step 4 to mirror.",
                )


if __name__ == "__main__":
    unittest.main()
