# NM Database Schema

**Reference doc for [`schema.sql`](schema.sql) and the table-creation code in [`nm_db.py`](nm_db.py).**

> Whenever the schema changes (new table, new column, renamed field, new index), update this file in the same commit. The schema is small enough that drift is the main risk.

---

## TL;DR

NM stores everything in one local SQLite file (`nm.db`) at the project root. The schema has two layers:

- **v1** (created in [`nm_db.py`](nm_db.py)) — original tables. Still populated. Existing code in [`nm_extract.py`](nm_extract.py), [`nm_signals.py`](nm_signals.py) reads from these.
- **v2** (created from [`schema.sql`](schema.sql)) — standardized, modular tables matching the industry agent-trace shape (OpenInference / OTel GenAI / Langfuse / Phoenix). Additive: doesn't replace v1, sits alongside.

New code should read from v2. v1 stays for back-compat until extract/signals migrate.

---

## v2 — the canonical layer

The trace hierarchy mirrors how every modern observability tool models LLM/agent traces:

```
session   →   message   →   content_block        (verbatim, audit-grade)
              ↓
              tool_call (use+result joined)      (projection)
              ↓
              file_touch (canonical path)        (projection)

audit:  injections  ·  hurdle_signals  ·  note_feedback  ·  gc_actions
```

### Module 1 — TRACE (raw verbatim capture)

Populated by [`nm_capture.py`](nm_capture.py) tailing Claude Code's `*.jsonl` transcript files via `UserPromptSubmit` / `PostToolUse` / `Stop` / `SubagentStop` hooks.

#### `sessions`
One row per Claude Code session. ≈ OTel "trace".

| column | type | notes |
|---|---|---|
| `session_id` | TEXT PK | Claude Code's session uuid |
| `agent_vendor` | TEXT | `claude-code` \| `cursor` \| `codex` \| … |
| `cwd` | TEXT | working directory at session start |
| `project_root` | TEXT | normalized; from `CLAUDE_PROJECT_DIR` |
| `transcript_path` | TEXT | pointer to the source JSONL |
| `started_at`, `last_seen_at` | TEXT | ISO timestamps |
| `meta_json` | TEXT | arbitrary extension |

#### `messages`
One row per transcript entry. ≈ OTel "span".

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `uuid` | TEXT UNIQUE | the transcript-entry uuid (idempotency) |
| `session_id` | TEXT | references `sessions(session_id)` |
| `parent_uuid` | TEXT | mirrors `parentUuid` in transcript; walks the conversation tree |
| `ts` | TEXT | ISO timestamp |
| `type` | TEXT | `user` \| `assistant` \| `summary` \| `system` \| `meta` |
| `role` | TEXT | `user` \| `assistant` (NULL for meta) |
| `is_meta` | INTEGER | `1` for ai-title / attachment / queue-op / file-history-snapshot rows |
| `raw_json` | TEXT | the full raw transcript line (audit/replay) |
| `ingested_at` | TEXT | when the hook wrote this row |

Filter `is_meta = 0` for "actual conversation".

#### `content_blocks`
One row per content block within a message. ≈ OTel "event".

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK | |
| `message_id` | INTEGER FK → messages | cascade delete |
| `block_index` | INTEGER | order within the message |
| `type` | TEXT | `text` \| `thinking` \| `tool_use` \| `tool_result` \| `image` |
| `text` | TEXT | populated for `text` and `thinking` |
| `tool_use_id` | TEXT | populated for `tool_use` AND `tool_result` (joins them) |
| `tool_name`, `input_json` | TEXT | populated for `tool_use` |
| `output_text`, `output_json`, `is_error` | TEXT/INTEGER | populated for `tool_result` |
| `raw_json` | TEXT | the block's raw JSON |

#### `ingest_state`
Per-transcript line offset for incremental ingest. Wipe rows here to force re-ingest.

### Module 2 — PROJECTIONS (fast queries)

Derived from `content_blocks` at ingest time. Both filled by [`nm_capture.py`](nm_capture.py).

#### `tool_calls`
One row per `tool_use_id`. The `tool_use` block sets `use_message_id` + `input_json` + `started_at`; the matching `tool_result` block fills `result_message_id` + `output_text` + `is_error` + `finished_at`.

`UNIQUE(tool_use_id)` makes the upsert pattern safe regardless of arrival order.

#### `file_touches`
One row per `(tool_call, file_path)` pair. Path is canonicalized. Lets you answer "what's been done to file X across all sessions?" in O(index lookup) without scanning content_blocks.

Tools whose inputs are extracted into file_touches (see [`nm_capture.py`](nm_capture.py) `_PATH_FIELDS` and `_extract_paths`):
- `Read`, `Edit`, `Write`, `MultiEdit` — `file_path` (+ `edits[].file_path` for MultiEdit)
- `NotebookEdit` — `notebook_path`
- `Glob`, `Grep`, `LS`, others — `path`

When adding new path-bearing tools, extend `_PATH_FIELDS` in `nm_capture.py`.

### Module 3 — LIFECYCLE / AUDIT

Audit + governance tables. v2-only; existing v1 product tables (notes, files, file_note_edges, hurdles, extract_state) are **untouched** and remain authoritative for the product graph.

#### `injections`
Audit log written by [`nm_inject.py`](nm_inject.py) on every PreToolUse hook fire.

| column | notes |
|---|---|
| `ts` | ISO |
| `session_id` | which session was the agent in |
| `path` | canonical file path that triggered the lookup |
| `tool_name` | `Read` \| `Edit` \| `Write` \| `MultiEdit` |
| `note_id` | references `notes(id)` |
| `accepted` | `1` injected, `0` filtered by Guardian |
| `reason` | filter reason if rejected |

This table powers the on-stage "47 injections in the last 15 min" demo metric.

#### `hurdle_signals`
One row per individual signal that contributed to a hurdle's score. Pairs with v1 `hurdles`. Replaces the JSON blob in `hurdles.signals_json` for queryable signal counts.

#### `note_feedback`
Records every `useful: true|false` event from the agent or the user. Drives Guardian's per-session learning + GC's `.gc/rules.md`-style rejection memory.

#### `gc_actions`
Audit log for every GC decision. `action ∈ {prune, merge, decay, restore}`.

### Module 4 — META

#### `nm_meta`
Single key/value table. Currently only `schema_version`. Bump on breaking changes; add migrations to `nm_db.init_db()`.

---

## v1 — legacy product layer (kept as-is)

Created in [`nm_db.py`](nm_db.py)'s `init_db()`. New code should not extend these.

| Table | Purpose | Status |
|---|---|---|
| `events` | Original model-driven `record_event` log | Dead. Drop after we confirm nothing reads it. |
| `transcript_entries` | Pre-v2 trace capture | Still populated for back-compat with `nm_extract.py` / `nm_signals.py`. Will go once those migrate to `messages` + `content_blocks`. |
| `notes` | The product's note graph (left side) | **Authoritative.** v2 didn't redefine this. |
| `files` | File registry (path canonical, type, first/last seen) | **Authoritative.** |
| `file_note_edges` | Bipartite edges (note ↔ file with weight) | **Authoritative.** |
| `hurdles` | Detected hurdle windows | **Authoritative.** v2 added `hurdle_signals` alongside. |
| `extract_state` | Per-session extraction watermark | **Authoritative.** |

The note schema (`notes` + `file_note_edges` + `files`) is v1 by name only — nothing about it needs to change for v2. The only redundant relics to delete are `events` and (eventually) `transcript_entries`.

---

## Path canonicalization

All paths landing in v2 tables (`file_touches.path`, `injections.path`, etc.) go through `nm_db.canonical_path`:

1. Backslashes → forward slashes
2. Lowercase drive letter (`C:\` → `c:/`)
3. If under `CLAUDE_PROJECT_DIR`, strip the prefix → project-relative

Result: `TEST.md`, `c:\Users\…\nozomio\TEST.md`, `C:/Users/…/nozomio/TEST.md` all collapse to `TEST.md`.

The v1 `files` and `file_note_edges` tables still hold whatever paths were inserted at the time. The `get_relevant_notes` MCP tool runs case-insensitive + suffix-tolerant matching to bridge canonical / non-canonical paths during the v1 → v2 transition.

---

## Common queries

```sql
-- All Read tool calls in a session, in order
SELECT tc.input_json, tc.is_error, tc.started_at
FROM tool_calls tc
WHERE tc.session_id = ? AND tc.tool_name = 'Read'
ORDER BY tc.started_at;

-- Everything that touched TEST.md across all sessions
SELECT ft.session_id, ft.tool_name, ft.ts, tc.is_error
FROM file_touches ft
JOIN tool_calls tc ON tc.id = ft.tool_call_id
WHERE ft.path = 'TEST.md'
ORDER BY ft.ts DESC;

-- Tool errors in the last hour
SELECT tool_name, COUNT(*)
FROM tool_calls
WHERE is_error = 1 AND started_at >= datetime('now', '-1 hour')
GROUP BY tool_name;

-- The full reasoning trace for a session (text + thinking only)
SELECT m.ts, m.role, cb.type, cb.text
FROM messages m
JOIN content_blocks cb ON cb.message_id = m.id
WHERE m.session_id = ? AND m.is_meta = 0
  AND cb.type IN ('text', 'thinking')
ORDER BY m.id, cb.block_index;

-- Recent injections for the on-stage metric
SELECT COUNT(*) FROM injections
WHERE ts >= datetime('now', '-15 minutes');

-- Notes ranked by recent injection rate
SELECT n.id, n.symptom, n.importance,
       COUNT(i.id) AS recent_injections
FROM notes n
LEFT JOIN injections i ON i.note_id = n.id
                       AND i.ts >= datetime('now','-1 day')
WHERE n.t_invalid IS NULL
GROUP BY n.id
ORDER BY recent_injections DESC, n.importance DESC;
```

---

## Evolving the schema — checklist

When you add a column, table, or index:

1. **Edit [`schema.sql`](schema.sql)** for v2 changes; or [`nm_db.py`](nm_db.py)'s `init_db()` for v1.
2. **Bump `schema_version`** in `nm_meta` if the change is breaking (drops a column, renames, changes a PK). Add an `ALTER`/`DROP`/`CREATE` migration to `nm_db.init_db()` gated on the previous version.
3. **Update consumers** that read the changed table (`nm_capture.py`, `nm_inject.py`, `nm_server.py`, `nm_extract.py`, `nm_signals.py`).
4. **Update this file** in the same commit. Drift here is the main risk — keep the table list, column list, and "common queries" current.
5. If touching path handling, update the **Path canonicalization** section and verify `nm_db.canonical_path` covers the case.
6. If adding a tool whose input includes a file path, add the field to `nm_capture._PATH_FIELDS` so `file_touches` covers it.

---

## File ownership

| File | Writes | Reads |
|---|---|---|
| [`nm_capture.py`](nm_capture.py) | `transcript_entries`, `sessions`, `messages`, `content_blocks`, `tool_calls`, `file_touches`, `ingest_state` | — |
| [`nm_inject.py`](nm_inject.py) | `injections` | `notes`, `file_note_edges` (via `nm_server.get_relevant_notes`) |
| [`nm_server.py`](nm_server.py) | `notes` (inject_count++) | all v2 tables, all v1 tables |
| [`nm_extract.py`](nm_extract.py) | `notes`, `file_note_edges`, `files`, `hurdles`, `extract_state` | `transcript_entries` (will migrate to `messages` + `content_blocks`) |
| [`nm_signals.py`](nm_signals.py) | `hurdles`, `hurdle_signals` (planned) | `transcript_entries` |
| `Guardian agent (planned)` | `injections.accepted`/`reason`, `note_feedback` | `notes`, `injections`, `messages` |
| `GC agent (planned)` | `notes.invalidated_at`, `gc_actions` | `notes`, `injections`, `note_feedback` |
