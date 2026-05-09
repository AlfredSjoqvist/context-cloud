"""Shared SQLite schema + connection helper for NM.

All tables live in one file (`nm.db` at project root by default). The schema is
idempotent — `init_db()` is safe to call repeatedly.

Two schema layers:

  v1 (legacy product tables, created in this file):
    events / transcript_entries / ingest_state
          — original trace layer (transcript_entries is now superseded by the
            v2 messages/content_blocks pair but still populated for back-compat).
    notes / file_note_edges / hurdles / files / extract_state
          — owned by the extraction pipeline (nm_extract.py, nm_signals.py).

  v2 (standardized trace + audit tables, created from schema.sql):
    sessions / messages / content_blocks
          — OpenInference-style trace → span → event hierarchy. The Note Manager,
            Guardian, and any new consumer should read from these.
    tool_calls / file_touches
          — projections for fast queries ("what did this tool call do",
            "what files have been touched").
    injections / hurdle_signals / note_feedback / gc_actions
          — audit trails for the lifecycle agents.

Path canonicalization: every path that lands in v2 tables (file_touches,
injections, files-when-rewritten) goes through `canonical_path` so that
`TEST.md`, `c:\\…\\TEST.md`, and `C:/…/TEST.md` collapse to one row.
"""

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = os.environ.get("NM_DB", str(Path(__file__).parent / "nm.db"))
SCHEMA_PATH = Path(__file__).parent / "schema.sql"
PROJECT_ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or str(Path(__file__).parent)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    conn = connect()
    cur = conn.cursor()

    # --- trace layer (also created defensively here so any entrypoint works) ---
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            ts           TEXT    NOT NULL,
            session_id   TEXT    NOT NULL,
            role         TEXT    NOT NULL,
            content      TEXT    NOT NULL,
            metadata     TEXT
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, id)")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS transcript_entries (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid            TEXT UNIQUE,
            ts              TEXT NOT NULL,
            session_id      TEXT,
            type            TEXT NOT NULL,
            role            TEXT,
            content_json    TEXT NOT NULL,
            raw_json        TEXT NOT NULL,
            transcript_path TEXT,
            ingested_at     TEXT NOT NULL
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_te_session ON transcript_entries(session_id, id)")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS ingest_state (
            transcript_path TEXT PRIMARY KEY,
            last_line       INTEGER NOT NULL DEFAULT 0,
            updated_at      TEXT
        )
        """
    )

    # --- note graph (this is the new state of record) ---

    # Notes — the 4-field unit, plus lifecycle metadata.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS notes (
            id                   TEXT PRIMARY KEY,
            symptom              TEXT NOT NULL,
            root_cause           TEXT NOT NULL,
            correction           TEXT,
            importance           REAL NOT NULL DEFAULT 0.5,
            inject_count         INTEGER NOT NULL DEFAULT 0,
            created_at           TEXT NOT NULL,
            created_from_session TEXT,
            created_from_hurdle  INTEGER,
            last_injected_at     TEXT,
            t_invalid            TEXT,
            FOREIGN KEY (created_from_hurdle) REFERENCES hurdles(id)
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_notes_importance ON notes(importance DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC)")

    # Files — registry of paths we've seen attached to notes. `type` is the
    # extension shorthand the dashboard uses (ts/json/md/env/...).
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS files (
            path        TEXT PRIMARY KEY,
            type        TEXT,
            first_seen  TEXT NOT NULL,
            last_seen   TEXT NOT NULL
        )
        """
    )

    # Bipartite edges. weight in [0, 1]: 1.0 = primary file, fractional = adjacent.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS file_note_edges (
            note_id  TEXT NOT NULL,
            path     TEXT NOT NULL,
            weight   REAL NOT NULL DEFAULT 1.0,
            PRIMARY KEY (note_id, path),
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (path)    REFERENCES files(path) ON DELETE CASCADE
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fne_path ON file_note_edges(path)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fne_note ON file_note_edges(note_id)")

    # Hurdles — provenance for every note. One hurdle window per note (1:N possible
    # later if we split). Stored so the dashboard can show "this note came from
    # turns 14-21 of session abc123".
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS hurdles (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      TEXT NOT NULL,
            start_event_id  INTEGER NOT NULL,
            end_event_id    INTEGER,
            score           REAL NOT NULL,
            signals_json    TEXT NOT NULL,
            resolved        INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hurdles_session ON hurdles(session_id, start_event_id)")

    # Extraction state — track which (session_id, transcript_id watermark) we've
    # already extracted from, so reruns are incremental.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS extract_state (
            session_id        TEXT PRIMARY KEY,
            last_te_id        INTEGER NOT NULL DEFAULT 0,
            last_extracted_at TEXT
        )
        """
    )

    # --- v2 standardized trace + audit tables (additive) ---
    if SCHEMA_PATH.exists():
        try:
            cur.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        except Exception:
            # Don't let a bad schema.sql break legacy callers; v1 still works.
            pass

    conn.commit()
    conn.close()


def canonical_path(p: str | None, project_root: str | None = None) -> str | None:
    """Normalize a file path so equal logical files collapse to one key.

    Lowercase drive letter, forward slashes, project-relative when under root.
    """
    if not p or not isinstance(p, str):
        return p
    s = p.replace("\\", "/")
    if len(s) >= 2 and s[1] == ":":
        s = s[0].lower() + s[1:]

    root = (project_root or PROJECT_ROOT or "").replace("\\", "/").rstrip("/")
    if root and len(root) >= 2 and root[1] == ":":
        root = root[0].lower() + root[1:]
    if root and s.lower().startswith(root.lower() + "/"):
        s = s[len(root) + 1 :]
    return s


def upsert_file(conn: sqlite3.Connection, path: str) -> None:
    """Register a path in the files table (idempotent)."""
    ext = Path(path).suffix.lstrip(".") or "?"
    ts = now_iso()
    conn.execute(
        """
        INSERT INTO files (path, type, first_seen, last_seen)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET last_seen = excluded.last_seen
        """,
        (path, ext, ts, ts),
    )


if __name__ == "__main__":
    init_db()
    print(f"initialized schema at {DB_PATH}")
