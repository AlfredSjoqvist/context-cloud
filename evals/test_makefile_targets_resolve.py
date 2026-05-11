#!/usr/bin/env python3
"""Eval: every `make <target>` named in `make help` exists as an actual
Makefile recipe, and every recipe (except `help` itself) is named in
the help output.

Why: the Makefile's `help` recipe is hand-edited. It drifts. A target
listed in help but not defined exits with `make: *** No rule to make
target 'foo'`. A recipe defined but not in help is invisible to anyone
following the docs. Both are documentation lies.

# self-test (proves this eval has bite):
#   1. Add a fake target to the help block in Makefile (e.g. `make ghost`)
#      → test_help_targets_exist_as_recipes MUST fail.
#   2. Add a real recipe (e.g. `phantom: ; @echo hi`) without listing it
#      in help → test_recipes_are_documented_in_help MUST fail.
# Verified manually 2026-05-10.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir)))
MAKEFILE = REPO_ROOT / "Makefile"

# Lines like `target:` or `target: dep1 dep2` at column 0; not `.PHONY`.
RECIPE_LINE = re.compile(r"^([a-zA-Z][a-zA-Z0-9_-]*)\s*:")

# `make help` lines look like `  make foo           # comment`.
HELP_TARGET = re.compile(r"^\s+make\s+([a-zA-Z][a-zA-Z0-9_-]*)\b")


def _recipes_in_makefile() -> set[str]:
    out: set[str] = set()
    for line in MAKEFILE.read_text().splitlines():
        # Skip .PHONY: declarations + indented (recipe body) lines + comments.
        if line.startswith(".") or line.startswith("\t") or line.startswith("#"):
            continue
        m = RECIPE_LINE.match(line)
        if m:
            out.add(m.group(1))
    return out


def _help_targets() -> set[str]:
    """Run `make help` and parse the listed targets."""
    proc = subprocess.run(
        ["make", "-s", "help"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"`make help` failed: rc={proc.returncode} stderr={proc.stderr!r}"
        )
    out: set[str] = set()
    for line in proc.stdout.splitlines():
        m = HELP_TARGET.match(line)
        if m:
            out.add(m.group(1))
    return out


class MakefileTargetsResolveEval(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if not MAKEFILE.exists():
            raise unittest.SkipTest("Makefile not present")
        cls.recipes = _recipes_in_makefile()
        cls.help_targets = _help_targets()

    def test_makefile_has_recipes(self):
        # Sanity: if we parsed nothing, every other test would vacuously pass.
        self.assertGreater(len(self.recipes), 0, "no recipes parsed from Makefile")

    def test_help_targets_exist_as_recipes(self):
        missing = self.help_targets - self.recipes
        self.assertFalse(
            missing,
            f"`make help` advertises targets that don't exist: "
            f"{sorted(missing)}. Either add the recipe or remove from help.",
        )

    def test_recipes_are_documented_in_help(self):
        # `help` doesn't document itself. Anything else should be visible.
        undocumented = self.recipes - self.help_targets - {"help"}
        self.assertFalse(
            undocumented,
            f"recipes not listed in `make help`: {sorted(undocumented)}. "
            f"Either add a `make <name>` line under help or rename to "
            f"start with `_` if the target is intentionally internal.",
        )


if __name__ == "__main__":
    unittest.main()
