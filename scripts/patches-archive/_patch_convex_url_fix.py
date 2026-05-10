"""Atomic fix: my V2 JS hardcoded the OLD Convex deployment URL.

The dashboard's main module (line 9641) connects to
'https://colorless-porcupine-926.convex.cloud' but my V2 Sessions/Agents
fetcher was using 'https://acoustic-fish-389.convex.site'. Result: every
fetch from the new tab 404s, the offline state shows even though Convex
is up.

This patch:
  1. Replaces the hardcoded acoustic-fish-389 URL with the correct
     colorless-porcupine-926 origin.
  2. Falls back to deriving the .convex.site origin from the dashboard's
     own CONVEX_URL constant (loaded by the main module) so we stay in
     sync if the deployment moves again.

Idempotent: skips if NM_CONVEX_URL_FIX_V1 marker present.
"""
import os
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "mock", "index.html")
MARKER = "NM_CONVEX_URL_FIX_V1"

OLD_LINE = "  const NM_CONVEX_URL = (window.NM_CONVEX_URL || 'https://acoustic-fish-389.convex.site').replace(/\\/$/, '');"

NEW_LINE = """  // NM_CONVEX_URL_FIX_V1 — derive Convex HTTP origin from the dashboard's
  // own CONVEX_URL (.convex.cloud → .convex.site). Falls back to the known
  // deployment if window.__convex hasn't loaded yet.
  function _nmConvexHttpUrl() {
    if (typeof window.NM_CONVEX_URL === 'string' && window.NM_CONVEX_URL) return window.NM_CONVEX_URL.replace(/\\/$/, '');
    try {
      const wsUrl = (window.__convex && window.__convex.address) || window.CONVEX_URL || null;
      if (wsUrl) {
        const httpUrl = String(wsUrl).replace('.convex.cloud', '.convex.site').replace(/\\/$/, '');
        if (httpUrl) return httpUrl;
      }
    } catch (_) {}
    return 'https://colorless-porcupine-926.convex.site';
  }
  const NM_CONVEX_URL = _nmConvexHttpUrl();"""


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    if MARKER in src:
        print("already patched (marker present); no changes")
        return 0
    if OLD_LINE not in src:
        print("ERROR: V2 URL line not found — file may have moved past V2", file=sys.stderr); return 2

    src = src.replace(OLD_LINE, NEW_LINE, 1)
    print("[1/1] swapped V2 hardcoded URL for derived/colorless-porcupine-926 fallback")

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
    print(f"patched {PATH}: +{len(NEW_LINE) - len(OLD_LINE)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
