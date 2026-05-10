"""Atomic patch: dedupe FILES on Convex hydration.

Symptom: every file appears 2-3 times in the codebase tree
(auth.ts, auth.ts, auth.ts in the same folder).

Cause: applyConvexData maps d.files directly into FILES with
  d.files.map(f => ({ path: normalizeRepoPath(f.path), ... }))
The Convex `files` table has multiple rows for the same canonical path
(e.g. one row inserted by the agent, one by sync, one by the upsert
race) and there's nothing collapsing them. The seed-time FILES code
already dedupes via a Map; the hydration path didn't.

Fix (NM_DEDUPE_FILES_V1): replace the direct map with a Map-keyed
collapse, keeping the first-seen entry per canonical path.

Idempotent: skips if NM_DEDUPE_FILES_V1 marker present.
"""
import os
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "mock", "index.html")
MARKER = "NM_DEDUPE_FILES_V1"

OLD = '''  // Acme-only filter on Convex hydration — without this, files from other
  // sources (the dashboard repo itself, scratch paths, etc.) bleed into the
  // Note Graph alongside the GitHub-app-fetched ACME repos.
  const newFiles = d.files
    .map(f => ({ path: normalizeRepoPath(f.path), type: f.type || 'txt', noteCount: 0 }))
    .filter(f => f.path);
  const acmeAllowed = new Set(newFiles.map(f => f.path));'''

NEW = '''  // Acme-only filter on Convex hydration — without this, files from other
  // sources (the dashboard repo itself, scratch paths, etc.) bleed into the
  // Note Graph alongside the GitHub-app-fetched ACME repos.
  // NM_DEDUPE_FILES_V1 — Convex `files` may carry duplicate rows per path
  // (multiple upserts from different sync writers). Collapse them via a
  // Map keyed by canonical path so the tree shows one row per file, not
  // 2-3 ghost duplicates.
  const newFiles = (() => {
    const byPath = new Map();
    for (const f of (d.files || [])) {
      const path = normalizeRepoPath(f && f.path);
      if (!path) continue;
      if (!byPath.has(path)) byPath.set(path, { path, type: f.type || 'txt', noteCount: 0 });
    }
    return [...byPath.values()];
  })();
  const acmeAllowed = new Set(newFiles.map(f => f.path));'''


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    if MARKER in src:
        print("already patched (marker present); no changes")
        return 0
    if OLD not in src:
        print("ERROR: anchor not found", file=sys.stderr); return 2
    src = src.replace(OLD, NEW, 1)
    print("[1/1] deduped FILES on Convex hydration")
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
