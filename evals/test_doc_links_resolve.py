#!/usr/bin/env python3
"""Eval: every relative-path link in the root markdown docs points at a
file that actually exists.

Why: README.md / SETUP.md / DEMO.md / PITCH-OUTLINE.md / CHANGELOG.md
all link to `agent/main.ts`, `evals/run_all.sh`, `.context-map/library/.../foo.md`,
etc. If a file is renamed or removed without updating the docs, the
link 404s — and the link is hyperlinked, so the reader doesn't even
get a "command not found" hint.

Scope: only relative paths (no `http(s)://`, no `mailto:`). Anchors
inside markdown (`#section`) are ignored — anchor validity is a different
class of check.

# self-test (proves this eval has bite):
#   1. Rename `seed-context-map.sh` to `seed-context-map.sh.bak` (or just
#      `mv`-then-`mv` it). README + SETUP + DEMO link to it →
#      test_every_relative_link_resolves MUST fail until you put it back.
#   2. Add `[ghost](does-not-exist.md)` to any tracked doc → MUST fail.
# Verified manually 2026-05-10.
"""
from __future__ import annotations

import os
import re
import sys
import unittest
from pathlib import Path
from urllib.parse import unquote, urlparse

REPO_ROOT = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir)))

DOC_FILES = [
    "README.md",
    "SETUP.md",
    "DEMO.md",
    "PITCH-OUTLINE.md",
    "CHANGELOG.md",
    "WORKLOG-content.md",
]

# `[label](target)` — the markdown link form. Inline-image `![alt](src)`
# is also matched; we don't differentiate.
MD_LINK = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")


def _is_external(target: str) -> bool:
    if target.startswith(("http://", "https://", "mailto:", "tel:")):
        return True
    parsed = urlparse(target)
    return bool(parsed.scheme)


def _strip_anchor(target: str) -> str:
    return target.split("#", 1)[0]


def _doc_paths() -> list[Path]:
    return [REPO_ROOT / name for name in DOC_FILES if (REPO_ROOT / name).exists()]


class DocLinksResolveEval(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.docs = _doc_paths()
        if not cls.docs:
            raise unittest.SkipTest("no doc files to scan")

    def test_at_least_one_doc_present(self):
        self.assertGreater(len(self.docs), 0)

    def test_every_relative_link_resolves(self):
        for doc in self.docs:
            text = doc.read_text()
            doc_dir = doc.parent
            for raw in MD_LINK.findall(text):
                if _is_external(raw):
                    continue
                path_part = _strip_anchor(raw)
                if not path_part:
                    # Pure anchor link like `(#section)`; skip.
                    continue
                with self.subTest(doc=str(doc.relative_to(REPO_ROOT)), link=raw):
                    decoded = unquote(path_part)
                    target = (doc_dir / decoded).resolve()
                    self.assertTrue(
                        target.exists(),
                        f"link `{raw}` in {doc.name} resolves to "
                        f"{target} which does not exist",
                    )


if __name__ == "__main__":
    unittest.main()
