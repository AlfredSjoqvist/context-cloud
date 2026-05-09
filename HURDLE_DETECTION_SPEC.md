# NM Hurdle Detection Architecture

This document explains how NM detects "hurdles" in saved coding-agent traces.
A hurdle is a bounded moment where the agent got stuck, took a wrong path, or
had to be corrected before reaching a useful resolution. Hurdles are the input
to note extraction: each durable note should be traceable back to one hurdle
window.

The implementation source of truth is:

- `nm_events.py` - trace normalization
- `nm_signals.py` - deterministic hurdle signals
- `nm_extract.py` - signal clustering, window expansion, LLM note extraction,
  and persistence
- `nm_db.py` / `SCHEMA.md` - SQLite product and audit tables

## High-Level Flow

```text
SQLite trace tables
  sessions / messages / content_blocks
  fallback: transcript_entries
        |
        v
nm_events.events_for_session()
  normalized Event[]
        |
        v
nm_signals.all_signals()
  deterministic Signal[]
        |
        v
nm_extract.expand_windows()
  HurdleWindow[]
        |
        v
LLM extraction over failure-to-resolution window
        |
        v
notes + files + file_note_edges + hurdles + hurdle_signals
```

Detection is intentionally deterministic. The LLM is not asked whether the
agent was stuck. The LLM only receives already-detected hurdle windows and
distills them into notes.

## Input Trace Model

The preferred trace source is the v2 schema populated by `nm_capture.py`:

- `sessions` - one row per agent session
- `messages` - one row per transcript entry / span
- `content_blocks` - ordered blocks inside each message

`nm_events.events_for_session(conn, session_id)` reads v2 first. If no v2 rows
exist for the session, it falls back to `transcript_entries` for backwards
compatibility.

Each trace is normalized into a flat sequence of `Event` objects:

```python
Event(
    idx: int,               # 0-based event position in the session
    te_id: int,             # provenance id: messages.id or transcript_entries.id
    ts: str,
    kind: str,              # user_msg | assistant_msg | thinking | tool_call | tool_result
    text: str = "",
    tool_name: str = "",
    tool_input: dict = {},
    tool_use_id: str = "",
    is_error: bool = False,
    stop_reason: str = "",
)
```

A single `messages` row can produce multiple events. For example, an assistant
message containing text and two tool-use blocks becomes:

```text
assistant_msg, tool_call, tool_call
```

This flattened stream is what all signal detectors consume.

## Signal Model

Signals are small deterministic observations that indicate the agent may have
hit a hurdle. A signal does not directly create a note. Signals are clustered
and scored first.

```python
Signal(
    kind: str,
    event_idx: int,
    weight: float,
    detail: dict,
)
```

Current weights live in `nm_signals.WEIGHTS`:

| Signal | Weight | Meaning |
|---|---:|---|
| `action_bigram_loop` | 3.0 | Same tool/action shape repeats at least 3 times in a 10-tool-call window. |
| `retry_loop` | 2.0 | Same tool has at least 2 consecutive error results. |
| `interrupt` | 2.0 | User sends a free-text message while tool calls are still pending. |
| `reverted_edit` | 2.0 | Same file is edited again within 5 events of the prior edit. |
| `correction_phrase` | 1.0 | User text matches a correction phrase such as "no", "wrong", "actually", "instead", "stop", or "never". |
| `prompt_reask` | 1.0 | User repeats a semantically similar prompt using token-cosine >= 0.6 against recent prompts. |
| `feedback` | 3.0 | Future MCP feedback tool reports `useful=false`. |

The hurdle threshold is:

```python
HURDLE_THRESHOLD = 3.0
```

This means a strong signal like `action_bigram_loop` or `feedback` can create a
hurdle candidate alone, while weaker signals need to cluster.

## Signal Detectors

### 1. Action-Bigram Loop

Implemented by `detect_action_bigram_loop`.

Despite the historical name, this is currently a repeated action-shape detector.
For each `tool_call`, NM computes a stable SHA-1 hash of the salient operation:

- `Read`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`: file path
- `Bash`: first 200 chars of `command`
- `Grep`: `pattern|path`
- `Glob`: `pattern|path`
- other tools: sorted JSON representation of input

If the same hash appears at least 3 times within the last 10 tool calls, NM
emits:

```text
action_bigram_loop, weight 3.0
```

This catches loops where the agent keeps reading the same files, rerunning the
same command, or making the same failing attempt.

### 2. Retry Loop

Implemented by `detect_retry_loop`.

The detector joins `tool_call` and `tool_result` through `tool_use_id`. If the
same tool produces at least 2 consecutive error results, NM emits:

```text
retry_loop, weight 2.0
```

Any successful result resets the streak.

### 3. User Interrupt

Implemented by `detect_interrupt`.

The detector tracks pending tool calls. If a `user_msg` arrives while one or
more tool calls are still awaiting results, the user likely interrupted the
agent mid-trajectory. NM emits:

```text
interrupt, weight 2.0
```

This is stronger than phrase matching because it catches corrections like
"check the diff first" even when they do not contain words like "wrong".

### 4. Reverted Edit

Implemented by `detect_reverted_edit`.

NM treats a rapid second edit to the same path as a proxy for a reverted or
corrected agent edit. If any edit-like tool touches the same file within 5
events of the previous edit, NM emits:

```text
reverted_edit, weight 2.0
```

Edit-like tools are:

```python
Edit, Write, MultiEdit, NotebookEdit
```

The current implementation does not diff before/after content. It is a cheap
v1 proxy designed to work with the available Claude Code trace surface.

### 5. Correction Phrase

Implemented by `detect_correction_phrase`.

NM scans `user_msg` text with a case-insensitive regex for correction language:

```text
no, nope, wrong, that's wrong, that's not right, that's incorrect,
actually, instead, stop, wait, hold on, don't, never,
not quite, not right, not correct, not what, not like that
```

When matched, NM emits:

```text
correction_phrase, weight 1.0
```

This signal is intentionally low weight because correction words can occur in
normal instructions.

### 6. Prompt Re-Ask

Implemented by `detect_prompt_reask`.

NM tokenizes user messages into a bag of alphanumeric tokens with length at
least 3. For each user prompt with at least 4 tokens, it compares against the
last 5 user prompts using cosine similarity. If similarity is at least 0.6, NM
emits:

```text
prompt_reask, weight 1.0
```

This catches cases where the user repeats the same request because the agent did
not satisfy it.

### 7. Explicit Feedback

Implemented by `detect_feedback`.

This detector is ready for the planned MCP feedback tool. If a tool call named
`feedback` has `useful=false`, NM emits:

```text
feedback, weight 3.0
```

The feedback tool is not required for current extraction; the detector simply
starts working once that tool lands.

## Signal Clustering and Hurdle Windows

Raw signals are converted into `HurdleWindow` objects by
`nm_extract.expand_windows`.

Current window knobs in `nm_extract.py`:

```python
SIGNAL_CLUSTER_GAP = 12
RESOLUTION_LOOKAHEAD = 16
PRECONTEXT_EVENTS = 10
```

The clustering algorithm:

1. Sort signals by `event_idx`.
2. Open a cluster at the first signal.
3. Add the next signal to the current cluster if it is within
   `SIGNAL_CLUSTER_GAP` events of the previous signal.
4. Close the cluster when the gap is larger.
5. Sum signal weights in the cluster.
6. Emit a hurdle only if total score is at least `HURDLE_THRESHOLD`.

For an emitted cluster:

```python
start_idx = max(0, first_signal.event_idx - PRECONTEXT_EVENTS)
```

Precontext is important because the file or project convention that explains
the hurdle is often read before the failing command or correction.

## Resolution Detection

The window end is chosen by `_find_resolution(events, cluster_end)`.

Starting after the last signal in a cluster, NM scans up to
`RESOLUTION_LOOKAHEAD` events for the first successful tail:

- a `tool_call` followed by a non-error `tool_result`, or
- an `assistant_msg` whose `stop_reason` is `end_turn`

If a resolution is found:

```python
end_idx = resolved_idx
resolved = true
```

If no resolution is found:

```python
end_idx = last_signal.event_idx + RESOLUTION_LOOKAHEAD // 2
resolved = false
```

This gives the extractor the failure-to-success delta whenever possible. The
LLM is asked to derive the durable correction from what changed between the
wrong path and the recovered path, not from the failure alone.

## File Candidates

Once the window bounds are known, `_files_in_range` scans `tool_call` events
inside the window and extracts file paths from:

```python
file_path, path, notebook_path
```

Each path is canonicalized with `nm_db.canonical_path`. These candidate files
serve two purposes:

1. They are passed to the LLM as the only allowed values for note `files`.
2. They become weighted `file_note_edges` when the note is persisted.

The LLM is not allowed to invent paths outside this candidate list. If it
returns no files, NM falls back to the touched files from the window.

## LLM Boundary

The LLM is called only after a hurdle window has been deterministically
detected. It does not score or discover hurdles.

The extraction prompt receives:

- detected signals and weights
- hurdle score
- candidate files
- resolution event index, if any
- formatted event window

It returns either:

```json
{
  "skip": false,
  "symptom": "...",
  "root_cause": "...",
  "correction": "...",
  "files": ["..."]
}
```

or:

```json
{
  "skip": true,
  "reason": "..."
}
```

The prompt emphasizes project-specific reasons and asks the model to preserve
the user's exact "why" when present. For example, "Tensorlake retries on 5xx" is
preferred over generic advice like "5xx means server error".

## Persistence

When not in dry-run mode, each extracted note persists:

- one row in `hurdles`
- one row per contributing signal in `hurdle_signals`
- one row in `notes`
- zero or more rows in `files`
- weighted rows in `file_note_edges`

`hurdles` stores provenance:

```text
session_id
start_event_id
end_event_id
score
signals_json
resolved
created_at
```

`hurdle_signals` makes the JSON signal blob queryable for dashboards and
analytics.

`notes.created_from_session` and `notes.created_from_hurdle` link the durable
note back to the trace window that produced it.

The Note Manager does not deduplicate, merge, or invalidate notes. It always
adds candidates. GC is responsible for decay, merge, prune, and contradiction
handling later.

## Operational Commands

Dry-run one session without LLM:

```powershell
python nm_extract.py --session <session_id> --dry-run --no-llm
```

Extract one session with the configured model:

```powershell
python nm_extract.py --session <session_id>
```

Extract every known session:

```powershell
python nm_extract.py --all
```

If Convex sync should be enabled, Python must point at the HTTP actions URL:

```powershell
$env:CONVEX_URL = "https://colorless-porcupine-926.convex.site"
python nm_extract.py --session <session_id>
```

## Current Limitations

- `reverted_edit` is a rapid-same-file-edit proxy, not an exact diff revert.
- `edited_output` from the original PRD is not implemented because Claude Code
  does not expose a separate "agent proposed output, user edited before commit"
  surface.
- Symbol-level file keying is not implemented yet; v1 uses canonical file paths.
- The LLM can skip a detected window, but it is not trusted to detect hurdles.
- Open windows without a resolution are extracted with weaker evidence because
  the failure-to-success delta is incomplete.

## Invariants

- Hurdle detection must stay deterministic and cheap.
- LLM calls must happen only after thresholded signal clustering.
- Candidate files must come from actual tool calls in the window.
- Note insertion must remain append-only; no write-time dedupe or merge.
- Trace provenance must be preserved so every note can be audited back to the
  original session and event range.
