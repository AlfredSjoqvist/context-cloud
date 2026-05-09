"""NM dashboard HTTP server.

Serves the mock UI from `mock/` and exposes a JSON endpoint that the page
loads on boot to replace its seeded data with real notes from nm.db.

Endpoints:
    GET  /                  → mock/index.html
    GET  /api/graph         → {files: [...], notes: [...]} in the same shape
                              the mock uses for its FILES + NOTES constants.
    GET  /api/sessions      → recently captured sessions for the activity feed.
    GET  /<file>            → static file from mock/

Run:
    python nm_dashboard.py            # serves on http://127.0.0.1:8765
    python nm_dashboard.py --port 80  # custom port

Deliberately stdlib-only so we don't add a Flask/FastAPI dependency for a
single-file dashboard.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from nm_db import DB_PATH, connect, init_db

ROOT = Path(__file__).parent
MOCK_DIR = ROOT / "mock"
SEED_DIR = MOCK_DIR / "seed"


# --- helpers ---------------------------------------------------------------

def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def _fmt_age(created_iso: str | None) -> str:
    """Returns h/d/w only — matches the mock's age regex `^(\\d+)([hdw])$`."""
    dt = _parse_iso(created_iso)
    if not dt:
        return "1h"
    delta = datetime.now(timezone.utc) - dt
    minutes = max(0, int(delta.total_seconds() / 60))
    hours = max(1, minutes // 60)
    if hours < 24:
        return f"{hours}h"
    days = hours // 24
    if days < 14:
        return f"{days}d"
    return f"{days // 7}w"


def _is_recent(created_iso: str | None, threshold_hours: int = 24) -> bool:
    dt = _parse_iso(created_iso)
    if not dt:
        return False
    return (datetime.now(timezone.utc) - dt).total_seconds() < threshold_hours * 3600


# --- data fetchers ---------------------------------------------------------

def fetch_graph() -> dict:
    """Return {files, notes} in the shape the mock UI expects.

    notes carry their edges inline as `[{path, weight}, ...]`.
    """
    conn = connect()
    try:
        cur = conn.cursor()

        # Files registry — the union of paths NM has seen attached to notes.
        org = None
        org_path = SEED_DIR / "org.json"
        if org_path.exists():
            try:
                org = json.loads(org_path.read_text(encoding="utf-8"))
            except Exception:
                org = None

        if org:
            files = []
        else:
            cur.execute("SELECT path, type FROM files ORDER BY path")
            files = [{"path": r[0], "type": r[1] or "?"} for r in cur.fetchall()]

        # Active notes with their edges.
        cur.execute(
            """
            SELECT id, symptom, root_cause, correction, importance,
                   inject_count, created_at, last_injected_at
            FROM notes
            WHERE t_invalid IS NULL
            ORDER BY importance DESC, created_at DESC
            """,
        )
        rows = cur.fetchall()

        notes: list[dict] = []
        for r in rows:
            nid = r[0]
            cur.execute(
                "SELECT path, weight FROM file_note_edges WHERE note_id = ? ORDER BY weight DESC",
                (nid,),
            )
            edges = [{"path": rr[0], "weight": float(rr[1])} for rr in cur.fetchall()]

            # If a note's edges reference a path not yet in `files`, surface it.
            known = {f["path"] for f in files}
            for e in edges:
                if e["path"] not in known:
                    files.append({"path": e["path"], "type": (Path(e["path"]).suffix.lstrip(".") or "?")})
                    known.add(e["path"])

            notes.append({
                "id": nid,
                "symptom": r[1],
                "root_cause": r[2],
                "correction": r[3],
                "importance": float(r[4]) if r[4] is not None else 0.5,
                "inject_count": int(r[5] or 0),
                "age": _fmt_age(r[6]),
                "recent": _is_recent(r[6]),
                "created_at": r[6],
                "last_injected_at": r[7],
                "edges": edges,
            })

        org = None
        org_path = SEED_DIR / "org.json"
        if org_path.exists():
            try:
                org = json.loads(org_path.read_text(encoding="utf-8"))
            except Exception:
                org = None

        return {
            "files": files,
            "notes": notes,
            "org": org,
            "source": "nm.db",
            "db_path": str(DB_PATH),
        }
    finally:
        conn.close()


def fetch_sessions(limit: int = 10) -> list[dict]:
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT session_id, COUNT(*) as n, MIN(ts) as started, MAX(ts) as last
            FROM transcript_entries
            WHERE session_id IS NOT NULL
            GROUP BY session_id
            ORDER BY last DESC
            LIMIT ?
            """,
            (limit,),
        )
        out = []
        for r in cur.fetchall():
            out.append({
                "session_id": r[0],
                "events": int(r[1]),
                "started_at": r[2],
                "last_event_at": r[3],
            })
        return out
    finally:
        conn.close()


def fetch_hurdles(limit: int = 50) -> list[dict]:
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, session_id, score, signals_json, resolved, created_at
            FROM hurdles
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        out = []
        for r in cur.fetchall():
            try:
                signals = json.loads(r[3])
            except Exception:
                signals = []
            out.append({
                "id": int(r[0]),
                "session_id": r[1],
                "score": float(r[2]),
                "signals": signals,
                "resolved": bool(r[4]),
                "created_at": r[5],
            })
        return out
    finally:
        conn.close()


# --- HTTP layer ------------------------------------------------------------

_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "NM/0.1"

    def log_message(self, fmt: str, *args) -> None:
        # Suppress default per-request logs; keep stderr clean for the demo.
        pass

    def _json(self, status: int, data) -> None:
        body = json.dumps(data, default=str, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: Path) -> None:
        try:
            resolved = path.resolve()
            resolved.relative_to(MOCK_DIR.resolve())
        except Exception:
            self.send_error(403, "forbidden")
            return
        if not resolved.exists() or not resolved.is_file():
            self.send_error(404, "not found")
            return
        body = resolved.read_bytes()
        ctype = _MIME.get(resolved.suffix.lower(), "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        try:
            if path in ("/", "/index.html"):
                self._file(MOCK_DIR / "index.html")
                return
            if path == "/api/graph":
                self._json(200, fetch_graph())
                return
            if path == "/api/sessions":
                self._json(200, fetch_sessions())
                return
            if path == "/api/hurdles":
                self._json(200, fetch_hurdles())
                return
            if path == "/api/health":
                self._json(200, {"ok": True, "db": str(DB_PATH)})
                return
            # Static fallback
            rel = path.lstrip("/")
            self._file(MOCK_DIR / rel)
        except Exception as e:
            self._json(500, {"error": str(e)})


def serve(port: int = 8765, host: str = "127.0.0.1") -> None:
    init_db()
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"NM dashboard on http://{host}:{port}  (db={DB_PATH})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    serve(port=args.port, host=args.host)


if __name__ == "__main__":
    main()
