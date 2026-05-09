-- ============================================================================
-- NM canonical schema (v2) — additive layer on top of v1.
--
-- *** Reference doc: SCHEMA.md — keep it in sync when this file changes. ***
--
-- Standardized around the industry agent reasoning-trace shape (OpenInference /
-- OpenTelemetry GenAI / Langfuse / Phoenix):
--
--   trace (session)  →  span (message)  →  event (content_block)
--                                       ↳ projection: tool_call (use+result)
--                                       ↳ projection: file_touch
--
-- This file is purely additive over the v1 tables created in nm_db.py:
--   * Adds new TRACE tables that supersede `transcript_entries` for queries.
--   * Adds new AUDIT tables for injections / feedback / GC.
--   * Does NOT touch v1 product tables (notes, files, file_note_edges,
--     hurdles, extract_state) — they stay as-is so nm_extract / nm_signals
--     keep working unchanged.
--
-- All file paths in `files`, `file_touches`, and `injections` should be
-- canonicalized via nm_db.canonical_path: forward slashes, lowercase drive
-- letter, project-relative when under CLAUDE_PROJECT_DIR.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- TRACE LAYER (replaces transcript_entries with a 3-table hierarchy)
-- ----------------------------------------------------------------------------

-- One row per Claude Code session.  ≈ OTel "trace".
CREATE TABLE IF NOT EXISTS sessions (
    session_id      TEXT PRIMARY KEY,
    agent_vendor    TEXT,                     -- 'claude-code' | 'cursor' | 'codex' | …
    cwd             TEXT,
    project_root    TEXT,
    transcript_path TEXT,
    started_at      TEXT,
    last_seen_at    TEXT,
    meta_json       TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at DESC);

-- One row per transcript entry. ≈ OTel "span".
-- A message can have many content_blocks. parent_uuid mirrors Claude Code's
-- transcript chain and lets you walk the conversation tree.
CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid         TEXT UNIQUE,
    session_id   TEXT,                       -- references sessions(session_id)
    parent_uuid  TEXT,
    ts           TEXT NOT NULL,
    type         TEXT NOT NULL,              -- user | assistant | summary | system | meta
    role         TEXT,                       -- user | assistant
    is_meta      INTEGER NOT NULL DEFAULT 0, -- 1 for ai-title / queue-op / attachment / etc.
    raw_json     TEXT NOT NULL,
    ingested_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session   ON messages(session_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_ts        ON messages(ts);
CREATE INDEX IF NOT EXISTS idx_messages_parent    ON messages(parent_uuid);
CREATE INDEX IF NOT EXISTS idx_messages_role_meta ON messages(session_id, is_meta, role);

-- One row per content block within a message. ≈ OTel "event" within a span.
-- Block taxonomy follows Anthropic's content-block types.
CREATE TABLE IF NOT EXISTS content_blocks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    block_index  INTEGER NOT NULL,
    type         TEXT NOT NULL,              -- text | thinking | tool_use | tool_result | image
    text         TEXT,                       -- for text / thinking
    tool_use_id  TEXT,                       -- for tool_use AND tool_result (joins them)
    tool_name    TEXT,                       -- for tool_use
    input_json   TEXT,                       -- for tool_use
    output_text  TEXT,                       -- for tool_result (scalar / fallback)
    output_json  TEXT,                       -- for tool_result (structured)
    is_error     INTEGER,                    -- for tool_result
    raw_json     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocks_message  ON content_blocks(message_id, block_index);
CREATE INDEX IF NOT EXISTS idx_blocks_tool_use ON content_blocks(tool_use_id);
CREATE INDEX IF NOT EXISTS idx_blocks_type     ON content_blocks(type);


-- ----------------------------------------------------------------------------
-- TRACE PROJECTIONS (the "give me X fast" tables)
-- ----------------------------------------------------------------------------

-- One row per (tool_use, tool_result) pair, joined for fast queries.
-- Filled lazily as both halves arrive in the transcript.
CREATE TABLE IF NOT EXISTS tool_calls (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_use_id       TEXT UNIQUE,
    session_id        TEXT,
    tool_name         TEXT NOT NULL,
    use_message_id    INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    result_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    input_json        TEXT,
    output_text       TEXT,
    is_error          INTEGER,
    duration_ms       INTEGER,
    started_at        TEXT,
    finished_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id, started_at);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name    ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_calls_error   ON tool_calls(is_error, started_at);

-- One row per (tool_call, file_path). Lets you answer
-- "what's been done to file X?" in O(index lookup).
CREATE TABLE IF NOT EXISTS file_touches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_call_id  INTEGER NOT NULL REFERENCES tool_calls(id) ON DELETE CASCADE,
    session_id    TEXT,
    tool_name     TEXT NOT NULL,
    path          TEXT NOT NULL,             -- canonicalized
    ts            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_touches_path    ON file_touches(path, ts DESC);
CREATE INDEX IF NOT EXISTS idx_file_touches_session ON file_touches(session_id, ts);


-- ----------------------------------------------------------------------------
-- LIFECYCLE / AUDIT additions (no conflict with v1 product tables)
-- ----------------------------------------------------------------------------

-- Audit log of every injection event: what note went where, was it accepted.
-- The PreToolUse inject hook writes one row here per match; Guardian writes one
-- per accept/reject decision. Drives the on-stage "47 injections in last 15min"
-- metric.
CREATE TABLE IF NOT EXISTS injections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    session_id  TEXT,
    path        TEXT,                        -- canonicalized
    tool_name   TEXT,
    note_id     TEXT,                        -- references notes(id)
    accepted    INTEGER NOT NULL DEFAULT 1,
    reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_injections_ts   ON injections(ts DESC);
CREATE INDEX IF NOT EXISTS idx_injections_note ON injections(note_id);
CREATE INDEX IF NOT EXISTS idx_injections_path ON injections(path, ts DESC);

-- One row per signal that contributed to a hurdle's score. Pairs with the
-- existing v1 hurdles table; provides the audit trail signals_json couldn't.
CREATE TABLE IF NOT EXISTS hurdle_signals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    hurdle_id   INTEGER NOT NULL REFERENCES hurdles(id) ON DELETE CASCADE,
    message_id  INTEGER,                     -- references messages(id) (or v1 transcript_entries)
    signal      TEXT NOT NULL,               -- 'reverted_diff' | 'tool_error_loop' | 'correction_phrase' | …
    weight      REAL NOT NULL,
    details     TEXT
);
CREATE INDEX IF NOT EXISTS idx_signals_hurdle ON hurdle_signals(hurdle_id);

-- Feedback events on injected notes (drives Guardian/GC learning).
CREATE TABLE IF NOT EXISTS note_feedback (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT NOT NULL,
    note_id      TEXT NOT NULL,              -- references notes(id)
    session_id   TEXT,
    injection_id INTEGER REFERENCES injections(id) ON DELETE SET NULL,
    useful       INTEGER NOT NULL,
    reason       TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_note ON note_feedback(note_id);

-- GC action audit log.
CREATE TABLE IF NOT EXISTS gc_actions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    action    TEXT NOT NULL,                 -- 'prune' | 'merge' | 'decay' | 'restore'
    note_id   TEXT,                          -- references notes(id)
    details   TEXT
);
CREATE INDEX IF NOT EXISTS idx_gc_ts ON gc_actions(ts DESC);


-- ----------------------------------------------------------------------------
-- META
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS nm_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
INSERT OR REPLACE INTO nm_meta (key, value) VALUES ('schema_version', '2');
