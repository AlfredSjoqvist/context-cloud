"""Nia integration — semantic note retrieval.

Two responsibilities:

  1. `index_note(note_id, text, files)` — register a note's content with Nia
     (or with the local fallback index) so it can be looked up by query later.

  2. `semantic_lookup(query, limit)` — return notes matching `query` semantically
     when path-key match in nm_inject / nm_server.get_relevant_notes returns
     zero. This is the "user asks about X but no file matches; do any notes
     match X?" fallback.

If `NIA_API_KEY` (and `NIA_API_URL`, `NIA_INDEX_ID`) are set, both functions
hit the Nia REST API. Otherwise we transparently fall back to a small local
cosine-similarity ranker over `notes.symptom + notes.correction` so the demo
works even before Nia is wired in.

Env:
    NIA_API_KEY       — Nia auth token. Unset → fallback mode.
    NIA_API_URL       — default 'https://api.nia.ai/v1'.
    NIA_INDEX_ID      — id of the index NM writes its notes to.
    NM_NIA_DISABLE    — set to '1' to force-disable Nia even when keys exist.
"""

from __future__ import annotations

import json
import math
import os
import re
from collections import Counter
from typing import Any
from urllib import error as _urlerr
from urllib import request as _urlreq

from nm_db import connect, init_db

NIA_API_KEY = os.environ.get("NIA_API_KEY", "")
NIA_API_URL = os.environ.get("NIA_API_URL", "https://api.nia.ai/v1").rstrip("/")
NIA_INDEX_ID = os.environ.get("NIA_INDEX_ID", "nm-notes")
NIA_TIMEOUT = float(os.environ.get("NIA_TIMEOUT", "2.0"))
DISABLED = os.environ.get("NM_NIA_DISABLE") == "1"


def is_remote_enabled() -> bool:
    return bool(NIA_API_KEY) and not DISABLED


# ---- HTTP helpers ----------------------------------------------------------

def _post(path: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    if not is_remote_enabled():
        return None
    url = f"{NIA_API_URL}{path}"
    req = _urlreq.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {NIA_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with _urlreq.urlopen(req, timeout=NIA_TIMEOUT) as resp:
            body = resp.read()
            return json.loads(body.decode("utf-8"))
    except (_urlerr.URLError, _urlerr.HTTPError, TimeoutError, OSError, ValueError):
        return None
    except Exception:
        return None


# ---- public API ------------------------------------------------------------

def index_note(note_id: str, text: str, files: list[str] | None = None) -> bool:
    """Register a note's content. Returns True if the remote write succeeded.

    Even when remote is disabled, the local fallback works automatically off
    nm.db at lookup time, so this is best-effort and fails open.
    """
    if not is_remote_enabled():
        return False
    payload = {
        "index_id": NIA_INDEX_ID,
        "doc_id": note_id,
        "text": text,
        "metadata": {"files": files or [], "kind": "nm.note"},
    }
    res = _post("/index/document", payload)
    return bool(res)


def semantic_lookup(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Search notes by query. Returns the same shape as get_relevant_notes."""
    if not query or not query.strip():
        return []
    if is_remote_enabled():
        res = _post("/search", {"index_id": NIA_INDEX_ID, "query": query, "limit": limit})
        if isinstance(res, dict):
            hits = res.get("hits") or res.get("results") or []
            if isinstance(hits, list):
                return [_hit_to_note(h) for h in hits if isinstance(h, dict)]
    return _local_fallback(query, limit)


def _hit_to_note(hit: dict[str, Any]) -> dict[str, Any]:
    """Coerce a Nia search hit into the {id, symptom, root_cause, ...} shape."""
    meta = hit.get("metadata") or {}
    return {
        "id": hit.get("doc_id") or hit.get("id"),
        "file": (meta.get("files") or [None])[0],
        "edge_weight": float(hit.get("score") or 1.0),
        "symptom": hit.get("symptom") or meta.get("symptom") or hit.get("text", "")[:200],
        "root_cause": hit.get("root_cause") or meta.get("root_cause") or "",
        "correction": hit.get("correction") or meta.get("correction") or "",
        "importance": float(meta.get("importance", 0.5)),
        "inject_count": int(meta.get("inject_count", 0)),
        "created_at": meta.get("created_at"),
        "last_injected_at": meta.get("last_injected_at"),
        "via": "nia",
    }


# ---- local fallback (cheap cosine over notes table) -----------------------

_TOKEN_RE = re.compile(r"[A-Za-z0-9_]{3,}")


def _bag(text: str) -> Counter[str]:
    return Counter(t.lower() for t in _TOKEN_RE.findall(text or ""))


def _cosine(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    common = set(a) & set(b)
    if not common:
        return 0.0
    num = sum(a[t] * b[t] for t in common)
    da = math.sqrt(sum(v * v for v in a.values()))
    db = math.sqrt(sum(v * v for v in b.values()))
    if da == 0 or db == 0:
        return 0.0
    return num / (da * db)


def _local_fallback(query: str, limit: int) -> list[dict[str, Any]]:
    qbag = _bag(query)
    if not qbag:
        return []
    init_db()
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT n.id, n.symptom, n.root_cause, n.correction, n.importance,
                   n.inject_count, n.created_at, n.last_injected_at,
                   GROUP_CONCAT(e.path)
            FROM notes n
            LEFT JOIN file_note_edges e ON e.note_id = n.id
            WHERE n.t_invalid IS NULL
            GROUP BY n.id
            """
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    scored: list[tuple[float, dict[str, Any]]] = []
    for r in rows:
        text = " ".join(filter(None, [r[1], r[2], r[3]]))
        bag = _bag(text)
        sim = _cosine(qbag, bag)
        if sim < 0.15:
            continue
        files = (r[8] or "").split(",") if r[8] else []
        scored.append((sim * (r[4] or 0.5), {
            "id": r[0],
            "file": files[0] if files else None,
            "edge_weight": round(sim, 3),
            "symptom": r[1],
            "root_cause": r[2],
            "correction": r[3],
            "importance": r[4],
            "inject_count": r[5],
            "created_at": r[6],
            "last_injected_at": r[7],
            "via": "local-fallback",
        }))
    scored.sort(key=lambda t: t[0], reverse=True)
    return [n for _, n in scored[:limit]]
