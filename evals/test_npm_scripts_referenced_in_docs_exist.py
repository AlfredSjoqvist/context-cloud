#!/usr/bin/env python3
"""Eval: every `npm run <script>` reference in the root markdown docs
resolves to an actual script in the relevant package.json.

Why: README.md, SETUP.md, DEMO.md tell the reader to `npm run dev`,
`npm run agent`, `npm run agent:once` etc. If someone renames a
script in package.json without grep-and-replacing the docs, the
runbook silently lies to every new contributor.

Scope: only checks scripts mentioned by name in root *.md files
(README.md, SETUP.md, DEMO.md, PITCH-OUTLINE.md, CHANGELOG.md,
WORKLOG-content.md). Cross-references against the root `package.json`
and the `ui/package.json`.

# self-test (proves this eval has bite):
#   1. Add `npm run nonexistent-script` to README.md → eval MUST fail.
#   2. Rename `agent:once` to `agent:once-renamed` in package.json
#      without updating SETUP.md → eval MUST fail.
# Verified manually 2026-05-10.
"""
from __future__ import annotations

import json
import os
import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir)))

# `npm run <name>` or `npm test`. The script name allows kebab + colon
# (matches how npm script names are written: dev, agent:once, build:prod).
NPM_RUN = re.compile(r"npm\s+run\s+([a-zA-Z][a-zA-Z0-9_:-]*)")
NPM_BUILTIN = re.compile(r"npm\s+(test|install|ci|start)\b")
BUILTIN_SCRIPTS = {"test", "install", "ci", "start"}

# Doc files that may reference npm scripts. Anything else is out of scope.
DOC_FILES = [
    "README.md",
    "SETUP.md",
    "DEMO.md",
    "PITCH-OUTLINE.md",
    "CHANGELOG.md",
    "WORKLOG-content.md",
]


def _scripts_from(pkg_json_path: Path) -> set[str]:
    if not pkg_json_path.exists():
        return set()
    pkg = json.loads(pkg_json_path.read_text())
    return set((pkg.get("scripts") or {}).keys())


def _doc_text() -> dict[str, str]:
    out: dict[str, str] = {}
    for name in DOC_FILES:
        p = REPO_ROOT / name
        if p.exists():
            out[name] = p.read_text()
    return out


def _references_in(text: str) -> list[str]:
    """Return every `npm run <name>` script referenced in `text`. Excludes
    builtins (npm test / install / ci / start)."""
    return list(set(NPM_RUN.findall(text)))


class NpmScriptsReferencedInDocsExistEval(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Combined script catalog: any package.json in a directory the
        # docs reasonably tell the reader to `cd` into. Aggregating
        # rather than per-package because grepping context out of `cd
        # foo && npm run bar` is fragile (newlines, line continuations,
        # subshell parens). False-negative tradeoff: a script defined in
        # one package but referenced in the context of another won't be
        # caught — acceptable since both packages share the workspace.
        cls.all_scripts = set(BUILTIN_SCRIPTS)
        for pkg in (
            REPO_ROOT / "package.json",
            REPO_ROOT / "ui" / "package.json",
            REPO_ROOT / "dashboard" / "package.json",
            REPO_ROOT / "docs-ingest" / "package.json",
        ):
            cls.all_scripts |= _scripts_from(pkg)
        cls.docs = _doc_text()

    def test_at_least_one_doc_present(self):
        # Sanity: prevent a vacuous-pass placebo if the doc list is wrong.
        self.assertGreater(len(self.docs), 0, "no doc files found to scan")

    def test_every_referenced_npm_script_exists(self):
        for name, text in self.docs.items():
            refs = _references_in(text)
            for ref in refs:
                with self.subTest(doc=name, script=ref):
                    self.assertIn(
                        ref, self.all_scripts,
                        f"{name} references `npm run {ref}` but no "
                        f"package.json (root or ui/) defines it. "
                        f"Available: {sorted(self.all_scripts - BUILTIN_SCRIPTS)}",
                    )


if __name__ == "__main__":
    unittest.main()
