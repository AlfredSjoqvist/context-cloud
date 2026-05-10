"""Atomic fix for two runtime ReferenceErrors in mock/index.html.

These are bugs introduced by recent dashboard-agent commits, not by the
Sessions/Agents V2 work — but they break the page on Vercel right now and
the user is bleeding.

  1. ACME_SET typo (line ~5026): the Set is declared as `__ACME_SET` but
     the console.log references `ACME_SET`. ReferenceError aborts the
     filterToReposOnly IIFE, leaving the file tree empty.

  2. gcThresholds TDZ (line ~5139): `computeRetained` runs at module-load
     time (line ~5155, before `let gcThresholds = {...}` at line ~6757).
     The current defensive `typeof gcThresholds !== 'undefined'` check
     itself throws because `typeof` of a `let` in TDZ is a ReferenceError
     (only `var` is safe). Fix is a try/catch.

Idempotent: skips if NM_RUNTIME_FIX_V1 marker present.
"""
import os
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "mock", "index.html")
MARKER = "NM_RUNTIME_FIX_V1"

# --- Fix #1: ACME_SET typo ---
OLD_ACME = "  console.log('[NM] tree filtered to', ACME_SET.size, 'acme-* repos · files=' + FILES.length, 'notes=' + NOTES.length);"
NEW_ACME = "  console.log('[NM] tree filtered to', __ACME_SET.size, 'acme-* repos · files=' + FILES.length, 'notes=' + NOTES.length);  /* NM_RUNTIME_FIX_V1 */"

# --- Fix #2: gcThresholds TDZ-safe access ---
OLD_GC = """  const decay = (typeof gcThresholds !== 'undefined' && gcThresholds.idle != null)
    ? gcThresholds.idle : 1.0;"""
NEW_GC = """  // NM_RUNTIME_FIX_V1: `gcThresholds` is `let`-declared later in the file.
  // `typeof` of a let in TDZ still throws (only `var` is safe), so the
  // original defensive check itself crashed. Use try/catch instead.
  let decay = 1.0;
  try { if (gcThresholds && gcThresholds.idle != null) decay = gcThresholds.idle; } catch (_) { decay = 1.0; }"""


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    if MARKER in src:
        print("already patched (marker present); no changes")
        return 0

    fixes = 0
    if OLD_ACME in src:
        src = src.replace(OLD_ACME, NEW_ACME, 1)
        print("[1/2] fixed ACME_SET typo (now __ACME_SET)")
        fixes += 1
    else:
        print("[1/2] WARNING: ACME_SET line not found", file=sys.stderr)

    if OLD_GC in src:
        src = src.replace(OLD_GC, NEW_GC, 1)
        print("[2/2] fixed gcThresholds TDZ check (now try/catch)")
        fixes += 1
    else:
        print("[2/2] WARNING: gcThresholds defensive check not found", file=sys.stderr)

    if fixes == 0:
        print("nothing to patch", file=sys.stderr)
        return 1

    fd, tmp = tempfile.mkstemp(prefix=".idx-", suffix=".html",
                                dir=os.path.dirname(PATH))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as out:
            out.write(src)
        os.replace(tmp, PATH)
    except Exception:
        try: os.unlink(tmp)
        except Exception: pass
        raise
    print(f"patched {PATH}: {fixes}/2 fixes applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
