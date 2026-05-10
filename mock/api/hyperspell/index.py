"""Hyperspell bridge — supporting-context enrichment + convention importer.

Lives at /api/hyperspell. Two modes:

  GET /api/hyperspell?query=<text>&limit=3
       Return supporting refs for a query (slack/notion/github/drive/gmail).

  POST /api/hyperspell  body={"action": "enrich",  "noteId": "...", "query": "..."}
       Look up Hyperspell refs for a note's symptom + file context, then
       attach them to the note via Convex /sync/hyperspell-refs.

  POST /api/hyperspell  body={"action": "import"}
       Convention Importer. Runs ~5 broad org-wide queries against
       Hyperspell, creates a "seeded" note for each top hit, and attaches
       the hit as primary supporting context. Designed to be invoked once
       on install — gives Hindsight day-one knowledge of org conventions
       captured in Slack/Notion/Drive/GitHub before any coding session
       happens. Notes carry a clear `createdBy=hyperspell-importer` flag so
       Guardian can rank them appropriately against live-friction notes.

Environment:
  HYPERSPELL_API_URL   default https://api.hyperspell.com
  HYPERSPELL_API_KEY   when set, real Hyperspell calls; when unset, returns
                       deterministic mock results so the demo runs without
                       provisioning a key.
  CONVEX_URL           Convex .convex.site URL for /sync/* posts.

Design rule (from PRD): NM notes are PRIMARY provenance from coding-session
friction. Hyperspell results are SUPPORTING context only — they enrich notes
but never replace symptom/cause/correction. The Convention Importer is the
one place Hyperspell seeds notes directly, and those notes are flagged so
they can be down-weighted vs. real-friction notes by GC/Guardian.
"""

import hashlib
import json
import os
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

import requests


HYPERSPELL_API_URL = os.environ.get(
    "HYPERSPELL_API_URL", "https://api.hyperspell.com"
).rstrip("/")
HYPERSPELL_API_KEY = os.environ.get("HYPERSPELL_API_KEY", "")

CONVEX_URL = os.environ.get(
    "CONVEX_URL", "https://colorless-porcupine-926.convex.cloud"
)
CONVEX_SITE_URL = os.environ.get(
    "CONVEX_SITE_URL", "https://colorless-porcupine-926.convex.site"
)
NM_SYNC_TOKEN = os.environ.get("NM_SYNC_TOKEN", "")


# ---------------------------------------------------------------------------
# Hyperspell client (real + mock fallback)
# ---------------------------------------------------------------------------

def _hyperspell_search(query: str, limit: int = 3) -> list[dict]:
    """Return list of {source, title, url, snippet, ts, author} dicts."""
    if HYPERSPELL_API_KEY:
        try:
            r = requests.post(
                f"{HYPERSPELL_API_URL}/v1/search",
                headers={
                    "Authorization": f"Bearer {HYPERSPELL_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"query": query, "limit": limit},
                timeout=8,
            )
            if r.status_code == 200:
                data = r.json()
                items = data.get("results") or data.get("items") or data.get("data") or []
                return [_normalize_hit(h) for h in items][:limit]
            print(f"[hyperspell] real search {r.status_code} {r.text[:200]}")
        except Exception as e:
            print(f"[hyperspell] real search exception: {e}")
    return _mock_search(query, limit)


def _normalize_hit(h: dict) -> dict:
    return {
        "source": h.get("source") or h.get("connector") or "slack",
        "title": h.get("title") or h.get("name") or h.get("channel") or "(untitled)",
        "url": h.get("url") or h.get("permalink") or "",
        "snippet": (h.get("snippet") or h.get("text") or h.get("body") or "")[:280],
        "ts": h.get("ts") or h.get("timestamp") or h.get("created_at"),
        "author": h.get("author") or h.get("user") or h.get("from"),
    }


def _mock_search(query: str, limit: int) -> list[dict]:
    """Deterministic mock results — same query => same hits.

    Mocks are realistic-enough to render compelling on the dashboard without
    real Hyperspell credentials. Replace by setting HYPERSPELL_API_KEY.
    """
    seed = int(hashlib.sha1(query.lower().encode()).hexdigest()[:8], 16)
    sources = ["slack", "notion", "github", "drive", "gmail"]
    channels = ["#payments-engineering", "#platform-rfc", "#runtime-orchestrator", "#engineering-standards", "#code-review"]
    keywords = query.lower().split()[:3] or ["convention"]
    out = []
    for i in range(limit):
        source = sources[(seed + i) % len(sources)]
        if source == "slack":
            chan = channels[(seed + i) % len(channels)]
            ts = f"2026-04-{(seed + i) % 28 + 1:02d}T10:23:00Z"
            out.append({
                "source": "slack",
                "title": f"{chan} — {' '.join(keywords)} discussion",
                "url": f"https://acme.slack.com/archives/CXX{(seed+i)%999:03d}/p{abs(seed+i)*100000:013d}",
                "snippet": f"Long discussion about {' '.join(keywords)}; team converged on the convention now codified in the Hindsight note. Pinned by @lead.",
                "ts": ts,
                "author": ["jenna", "kai", "alfred", "mira"][(seed + i) % 4],
            })
        elif source == "notion":
            out.append({
                "source": "notion",
                "title": f"{' '.join(keywords).title()} — Engineering Standards",
                "url": f"https://www.notion.so/acme/{' '.join(keywords).replace(' ', '-').lower()}-{abs(seed+i):08x}",
                "snippet": f"Canonical doc for {' '.join(keywords)} in the acme codebase. Last updated 2026-04-{(seed+i)%28+1:02d} after the platform RFC closed.",
                "ts": f"2026-04-{(seed + i) % 28 + 1:02d}T14:00:00Z",
                "author": "platform-team",
            })
        elif source == "github":
            n = abs(seed + i) % 9999
            out.append({
                "source": "github",
                "title": f"#{n}: standardize {' '.join(keywords)}",
                "url": f"https://github.com/acme-cloud/acme-runtime-orchestrator/issues/{n}",
                "snippet": f"Issue tracking the rollout of the {' '.join(keywords)} convention. Closed by review of the relevant PR.",
                "ts": f"2026-04-{(seed + i) % 28 + 1:02d}T09:00:00Z",
                "author": ["alfred", "jenna", "kai"][(seed + i) % 3],
            })
        elif source == "drive":
            out.append({
                "source": "drive",
                "title": f"acme — {' '.join(keywords).title()} Runbook.gdoc",
                "url": f"https://docs.google.com/document/d/{abs(seed+i):016x}/edit",
                "snippet": f"Runbook covering {' '.join(keywords)}. Owners: Platform team.",
                "ts": f"2026-03-{(seed + i) % 28 + 1:02d}T11:00:00Z",
                "author": "platform-team",
            })
        else:  # gmail
            out.append({
                "source": "gmail",
                "title": f"[acme-eng@] RFC accepted: {' '.join(keywords)}",
                "url": f"https://mail.google.com/mail/u/0/#inbox/FMfcgz{abs(seed+i):08x}",
                "snippet": f"Decision email for the {' '.join(keywords)} RFC. Approved by 4 owners.",
                "ts": f"2026-04-{(seed + i) % 28 + 1:02d}T15:00:00Z",
                "author": "alfred",
            })
    return out


# ---------------------------------------------------------------------------
# Convex helpers
# ---------------------------------------------------------------------------

def _post_convex(route: str, body: dict) -> bool:
    clean = {k: v for k, v in body.items() if v is not None}
    headers = {"Content-Type": "application/json"}
    if NM_SYNC_TOKEN:
        headers["X-NM-TOKEN"] = NM_SYNC_TOKEN
    try:
        r = requests.post(
            f"{CONVEX_SITE_URL}{route}",
            json=clean,
            headers=headers,
            timeout=8,
        )
        return r.status_code == 200
    except Exception as e:
        print(f"[hyperspell] convex POST {route} exception: {e}")
        return False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

def _action_enrich(body: dict) -> dict:
    note_id = body.get("noteId") or ""
    query = body.get("query") or ""
    if not note_id or not query:
        return {"error": "noteId and query required"}

    refs = _hyperspell_search(query, limit=3)
    if not refs:
        return {"noteId": note_id, "refs": 0}

    ok = _post_convex(
        "/sync/hyperspell-refs",
        {
            "noteId": note_id,
            "refs": refs,
            "enrichedAt": _now_iso(),
        },
    )
    return {
        "noteId": note_id,
        "refs": len(refs),
        "saved": ok,
        "preview": [
            {"source": r["source"], "title": r["title"]} for r in refs
        ],
    }


# Seed queries the Convention Importer runs against Hyperspell. Each one is
# meant to surface a class of org-wide gotchas captured in non-code surfaces.
_SEED_QUERIES = [
    "engineering conventions code style standards",
    "deprecated APIs do not use",
    "secret management env vars never hardcode",
    "auth tokens redaction logging policy",
    "rate limiting key strategy convention",
    "sandboxed jobs timeout policy tensorlake credits",
    "PR review owners codeowners team routing",
    "incident postmortem recurring failure mode",
]


def _action_import(body: dict) -> dict:
    """Run the Convention Importer.

    For each seed query, take the top Hyperspell hit, materialize it as a
    Hindsight note with createdBy='hyperspell-importer', and attach the hit
    as primary supporting context. Files inferred from the hit's title /
    snippet (best-effort).
    """
    limit_per_query = int(body.get("limit_per_query") or 1)
    created = []
    for q in _SEED_QUERIES:
        hits = _hyperspell_search(q, limit=limit_per_query)
        if not hits:
            continue
        primary = hits[0]
        title = primary["title"]
        snippet = primary.get("snippet") or ""
        note_id = "n_hs" + hashlib.sha1(q.encode()).hexdigest()[:8]
        # Heuristic file path from the snippet: pick first acme-* token.
        file_path = None
        for tok in (snippet + " " + title).split():
            t = tok.strip(".,()[]\"'")
            if t.startswith("acme-") or t.endswith(".ts") or t.endswith(".py"):
                file_path = t.rstrip(".,;:")
                break
        if not file_path:
            file_path = "acme-control-plane/lib/convex.ts"

        note_payload = {
            "note": {
                "noteId": note_id,
                "symptom": f"Convention from org docs: {title}",
                "rootCause": (
                    f"Captured by Hyperspell from {primary['source']} — "
                    f"{snippet[:160]}"
                ),
                "correction": (
                    f"Follow the convention documented in {primary['source']}. "
                    f"See: {primary['url']}"
                ),
                "importance": 0.6,
                "injectCount": 0,
                "createdAt": _now_iso(),
                "createdBy": "hyperspell-importer",
                "createdFromSession": "hyperspell-import",
            },
            "edges": [
                {
                    "path": file_path,
                    "weight": 0.8,
                    "type": file_path.split(".")[-1] if "." in file_path else "txt",
                    "firstSeen": _now_iso(),
                    "lastSeen": _now_iso(),
                }
            ],
        }
        if _post_convex("/sync/note", note_payload):
            _post_convex(
                "/sync/hyperspell-refs",
                {"noteId": note_id, "refs": hits, "enrichedAt": _now_iso()},
            )
            created.append({
                "noteId": note_id,
                "title": title,
                "source": primary["source"],
                "url": primary["url"],
            })
    return {
        "imported": len(created),
        "queries": len(_SEED_QUERIES),
        "mode": "real" if HYPERSPELL_API_KEY else "mock",
        "notes": created,
    }


# ---------------------------------------------------------------------------
# HTTP entry point
# ---------------------------------------------------------------------------

def _cors(self: BaseHTTPRequestHandler) -> None:
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        _cors(self)
        self.end_headers()

    def do_GET(self) -> None:
        # /api/hyperspell?query=...&limit=...
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        query = (params.get("query") or [""])[0]
        limit = int((params.get("limit") or ["3"])[0])

        if not query:
            payload = {
                "hindsight": "hyperspell bridge",
                "mode": "real" if HYPERSPELL_API_KEY else "mock",
                "endpoints": {
                    "search": "GET /api/hyperspell?query=<text>&limit=<n>",
                    "enrich": 'POST /api/hyperspell  body={"action":"enrich","noteId":"...","query":"..."}',
                    "import": 'POST /api/hyperspell  body={"action":"import"}',
                },
            }
        else:
            payload = {
                "query": query,
                "mode": "real" if HYPERSPELL_API_KEY else "mock",
                "results": _hyperspell_search(query, limit=limit),
            }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        _cors(self)
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {}

        action = (body.get("action") or "").lower()
        if action == "enrich":
            result = _action_enrich(body)
        elif action == "import":
            result = _action_import(body)
        else:
            result = {"error": f"unknown action: {action!r}"}

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        _cors(self)
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
