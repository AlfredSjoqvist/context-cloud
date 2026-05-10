"""Atomic patch: two visual fixes.

  1. Repos at start: I forced "first expanded, others collapsed" in the
     accordion patch. User wants the original "all expanded" default at
     load. Accordion still kicks in on click (collapsed → expand & collapse
     others; expanded → just collapse).

  2. .canvas-status pill (Note Manager / GC next run / avg injection) was
     rendering vertically centered in the graph canvas. The CSS uses
     justify-content: space-between on .canvas-overlay with 3 children
     (legend, status, empty spacer), which puts status in the middle.
     Adding margin-top: auto on .canvas-status pins it to the bottom
     regardless of sibling order.

Idempotent: skips if NM_TREE_PILL_FIX_V1 marker present.
"""
import os
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "mock", "index.html")
MARKER = "NM_TREE_PILL_FIX_V1"

# --- Fix #1: revert forced first-only-expanded init ---
OLD_INIT = '''(function () {
  const repos = Array.from(document.querySelectorAll('.folder.repo'));
  // Sort by data-repo so "first" is deterministic regardless of DOM order.
  repos.sort((a, b) => (a.dataset.repo || '').localeCompare(b.dataset.repo || ''));
  repos.forEach((f, i) => {
    if (i === 0) f.classList.remove('collapsed');
    else f.classList.add('collapsed');
  });
})();'''

NEW_INIT = '''// NM_TREE_PILL_FIX_V1 — at load, leave every repo uncollapsed (the
// original default before the accordion patch). The accordion still
// applies on click: clicking a collapsed repo expands it AND collapses
// every other repo; clicking an expanded repo just collapses it.
(function () {
  document.querySelectorAll('.folder.repo').forEach(f => f.classList.remove('collapsed'));
})();'''

# --- Fix #2: pin .canvas-status to bottom ---
OLD_CSS = '''  .canvas-status {
    align-self: center;
    margin: 0 auto;
    background: var(--surface);'''

NEW_CSS = '''  .canvas-status {
    align-self: center;
    margin: auto auto 0;          /* NM_TREE_PILL_FIX_V1 — pin to bottom */
    background: var(--surface);'''


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    if MARKER in src:
        print("already patched (marker present); no changes")
        return 0

    if OLD_INIT not in src:
        print("ERROR: repo init block anchor not found", file=sys.stderr); return 2
    if OLD_CSS not in src:
        print("ERROR: .canvas-status CSS anchor not found", file=sys.stderr); return 2

    src = src.replace(OLD_INIT, NEW_INIT, 1)
    print("[1/2] reverted to all-repos-uncollapsed at load")
    src = src.replace(OLD_CSS, NEW_CSS, 1)
    print("[2/2] pinned .canvas-status to bottom of canvas")

    fd, tmp = tempfile.mkstemp(prefix=".idx-", suffix=".html", dir=os.path.dirname(PATH))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as out:
            out.write(src)
        os.replace(tmp, PATH)
    except Exception:
        try: os.unlink(tmp)
        except Exception: pass
        raise
    print(f"patched {PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
