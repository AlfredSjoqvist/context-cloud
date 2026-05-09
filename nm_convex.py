"""Convex sync client.

Local SQLite stays the source of truth for write-side latency. This module
mirrors product-graph rows (notes / edges / injections / hurdles / gc actions
/ sessions) to Convex via HTTP actions defined in `convex/http.ts`.

Sync is best-effort and asynchronous-friendly: every function fails open. If
the Convex deployment is unreachable or the env vars aren't set, calls return
silently — the inline hooks must never block the agent on a network call.

Env:
    CONVEX_URL       — full URL of the Convex HTTP-actions origin, e.g.
                       https://<deployment>.convex.site (NOT .convex.cloud).
    NM_SYNC_TOKEN    — optional shared secret; matched against
                       X-NM-TOKEN by `convex/http.ts`.
    NM_SYNC_TIMEOUT  — per-call HTTP timeout in seconds (default 1.5).
    NM_SYNC_DISABLE  — set to "1" to disable all calls (useful for tests/CI).

Functions return True on a 2xx response, False otherwise — never raise.
"""

from __future__ import annotations

import json
import os
from typing import Any
from urllib import error as _urlerr
from urllib import request as _urlreq

CONVEX_URL = os.environ.get("CONVEX_URL", "").rstrip("/")
SYNC_TOKEN = os.environ.get("NM_SYNC_TOKEN", "")
SYNC_TIMEOUT = float(os.environ.get("NM_SYNC_TIMEOUT", "1.5"))
DISABLED = os.environ.get("NM_SYNC_DISABLE") == "1"


def is_enabled() -> bool:
    return bool(CONVEX_URL) and not DISABLED


def _post(path: str, payload: dict[str, Any]) -> bool:
    if not is_enabled():
        return False
    url = f"{CONVEX_URL}{path}"
    body = json.dumps(payload, default=str, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if SYNC_TOKEN:
        headers["X-NM-TOKEN"] = SYNC_TOKEN
    req = _urlreq.Request(url, data=body, headers=headers, method="POST")
    try:
        with _urlreq.urlopen(req, timeout=SYNC_TIMEOUT) as resp:
            return 200 <= resp.status < 300
    except (_urlerr.URLError, _urlerr.HTTPError, TimeoutError, OSError):
        return False
    except Exception:
        return False


# ---- public API (mirrors what nm_inject / nm_extract / nm_capture write) ----

def sync_note(note: dict[str, Any], edges: list[dict[str, Any]]) -> bool:
    """Mirror a note + its file edges. Edge rows: {path, weight, type?}."""
    return _post("/sync/note", {"note": note, "edges": edges})


def sync_injection(row: dict[str, Any]) -> bool:
    """Mirror one row from the local `injections` table."""
    return _post("/sync/injection", row)


def sync_hurdle(row: dict[str, Any]) -> bool:
    return _post("/sync/hurdle", row)


def sync_gc_action(row: dict[str, Any]) -> bool:
    return _post("/sync/gc", row)


def sync_session(row: dict[str, Any]) -> bool:
    return _post("/sync/session", row)
