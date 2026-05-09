"""Note Manager extraction pipeline.

Reads a session's transcript, normalizes to events, runs signal detectors,
expands hurdle windows, calls an LLM to distill each window into a 4-field
note, and persists notes + file_note_edges + hurdles into nm.db.

Usage:
    python nm_extract.py --session <session_id>          # extract one session
    python nm_extract.py --all                           # extract every session
    python nm_extract.py --session <id> --dry-run        # print, don't persist
    python nm_extract.py --session <id> --no-llm         # use heuristic stub for the
                                                         # extraction step (no API key needed)

Env:
    OPENAI_API_KEY      — required unless --no-llm or --dry-run.
    NM_EXTRACT_MODEL    — default 'gpt-4o-mini'.
    NM_EXTRACT_BASE_URL — optional override for OpenAI-compatible endpoints.

INTEGRATIONS NOTICE
  - Convex mirror: every persisted note + edges + hurdle is also pushed to
    Convex via nm_convex (best-effort, fail-open). Drives the live dashboard.
  - Tensorlake: this module is wrapped by tensorlake/note_manager.py to run
    as a webhook-triggered background agent. Local CLI still works unchanged.
  - See SPEC.md > Integrations.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import uuid
from dataclasses import dataclass, field
from typing import Any

from nm_db import canonical_path, connect, init_db, now_iso, upsert_file
from nm_events import Event, events_for_session
from nm_signals import HURDLE_THRESHOLD, Signal, all_signals

EXTRACT_MODEL = os.environ.get("NM_EXTRACT_MODEL", "gpt-4o-mini")
EXTRACT_BASE_URL = os.environ.get("NM_EXTRACT_BASE_URL") or None

# Window-expansion knobs.
SIGNAL_CLUSTER_GAP = 6        # events of "quiet" before a window closes
RESOLUTION_LOOKAHEAD = 12     # events to scan after cluster end for a "successful" tail
PRECONTEXT_EVENTS = 4         # events before first signal we include for context


# --- window expansion -------------------------------------------------------

@dataclass
class HurdleWindow:
    start_idx: int
    end_idx: int                       # last event included (inclusive)
    score: float
    signals: list[Signal] = field(default_factory=list)
    resolved_idx: int | None = None    # event idx where successful tail begins
    files: list[str] = field(default_factory=list)  # files touched inside window


def _files_in_range(events: list[Event], start: int, end: int) -> list[str]:
    """Return canonicalized file paths touched inside the window.

    Canonicalization aligns paths with v2 file_touches / injections rows so
    cross-table joins and the get_relevant_notes lookup hit the same key.
    """
    seen: dict[str, None] = {}
    for ev in events[start:end + 1]:
        if ev.kind != "tool_call":
            continue
        for k in ("file_path", "path", "notebook_path"):
            v = ev.tool_input.get(k)
            if isinstance(v, str) and v:
                cp = canonical_path(v) or v
                seen[cp] = None
    return list(seen.keys())


def _find_resolution(events: list[Event], cluster_end: int) -> int | None:
    """Find the first 'successful tail' event after cluster_end.

    Heuristic: a tool_call followed by a non-error tool_result, OR an
    assistant_msg with stop_reason='end_turn' that is NOT immediately followed
    by a user correction.
    """
    n = len(events)
    pending: dict[str, int] = {}  # tool_use_id -> idx
    for i in range(cluster_end + 1, min(n, cluster_end + 1 + RESOLUTION_LOOKAHEAD)):
        ev = events[i]
        if ev.kind == "tool_call":
            pending[ev.tool_use_id] = ev.idx
        elif ev.kind == "tool_result":
            if not ev.is_error and ev.tool_use_id in pending:
                return pending[ev.tool_use_id]
        elif ev.kind == "assistant_msg" and ev.stop_reason == "end_turn":
            return ev.idx
    return None


def expand_windows(events: list[Event], signals: list[Signal]) -> list[HurdleWindow]:
    """Cluster signals into hurdle windows when accumulated weight crosses threshold.

    Algorithm:
      - Walk signals in order. Open a "cluster" at the first signal.
      - Keep accumulating weight while the next signal is within
        SIGNAL_CLUSTER_GAP events. Otherwise close the cluster.
      - When a cluster closes, emit a HurdleWindow if total weight >= threshold.
      - Each window's start_idx = max(0, first_signal.event_idx - PRECONTEXT_EVENTS).
        end_idx = resolution event if found, else last_signal.event_idx + lookahead/2.
    """
    if not signals:
        return []

    windows: list[HurdleWindow] = []
    cluster: list[Signal] = []

    def _close(cluster: list[Signal]) -> None:
        if not cluster:
            return
        total = sum(s.weight for s in cluster)
        if total < HURDLE_THRESHOLD:
            return
        first = cluster[0]
        last = cluster[-1]
        start = max(0, first.event_idx - PRECONTEXT_EVENTS)
        resolved = _find_resolution(events, last.event_idx)
        end = resolved if resolved is not None else min(len(events) - 1, last.event_idx + RESOLUTION_LOOKAHEAD // 2)
        win = HurdleWindow(
            start_idx=start,
            end_idx=end,
            score=total,
            signals=list(cluster),
            resolved_idx=resolved,
        )
        win.files = _files_in_range(events, start, end)
        windows.append(win)

    for sig in signals:
        if not cluster:
            cluster.append(sig)
            continue
        if sig.event_idx - cluster[-1].event_idx <= SIGNAL_CLUSTER_GAP:
            cluster.append(sig)
        else:
            _close(cluster)
            cluster = [sig]
    _close(cluster)
    return windows


# --- LLM extraction ---------------------------------------------------------

EXTRACT_SYSTEM = """You are NM's Note Manager. You distill a *moment where a coding agent got stuck* into a single durable note that future agents will see when they touch the same files.

You will receive an event window from one chat session, plus the detected hurdle signals. Inside the window, the agent went down a wrong path and (usually) recovered. Your job is to compare the failed approach to the working one and write a 4-field note.

Rules:
- The note must be specific to *this codebase / project*. Generic best-practice advice is worthless.
- "symptom" = one sentence describing what the agent did wrong. Concrete, file-anchored.
- "root_cause" = the project-specific reason it was wrong. The hidden constraint or convention.
- "correction" = what to do instead, derived from what worked at the END of the window. Imperative.
- "files" = up to 5 file paths most central to the hurdle (a subset of the candidate paths).
- Do NOT hallucinate file paths. Only use ones that appear in the candidates list.
- If the window contains no clear hurdle (judged best-effort), return {"skip": true, "reason": "..."}.

Output ONLY a JSON object — no prose, no markdown fences.

Schema:
{
  "skip": false,
  "symptom": "...",
  "root_cause": "...",
  "correction": "...",
  "files": ["path/one", "path/two"]
}
"""


def _format_event_for_llm(ev: Event) -> str:
    if ev.kind == "user_msg":
        return f"[{ev.idx}] USER: {ev.text[:1500]}"
    if ev.kind == "assistant_msg":
        return f"[{ev.idx}] ASSISTANT: {ev.text[:1500]}"
    if ev.kind == "thinking":
        return f"[{ev.idx}] (thinking) {ev.text[:600]}"
    if ev.kind == "tool_call":
        try:
            args = json.dumps(ev.tool_input, default=str)[:800]
        except Exception:
            args = str(ev.tool_input)[:800]
        return f"[{ev.idx}] TOOL_CALL {ev.tool_name}({args})"
    if ev.kind == "tool_result":
        marker = "ERROR" if ev.is_error else "OK"
        return f"[{ev.idx}] TOOL_RESULT[{marker}]: {ev.text[:1000]}"
    return f"[{ev.idx}] {ev.kind}"


def _build_user_prompt(events: list[Event], window: HurdleWindow) -> str:
    sub = events[window.start_idx:window.end_idx + 1]
    formatted = "\n".join(_format_event_for_llm(e) for e in sub)
    sigs = ", ".join(f"{s.kind}@{s.event_idx}(w={s.weight})" for s in window.signals)
    files = ", ".join(window.files) or "(none)"
    resolution = (
        f"Resolution event index: {window.resolved_idx} (the agent recovered)."
        if window.resolved_idx is not None
        else "No clear resolution within lookahead — the window may still be open."
    )
    return (
        f"Detected signals: {sigs}\n"
        f"Hurdle score: {window.score}\n"
        f"Candidate files (use only these in `files`): {files}\n"
        f"{resolution}\n\n"
        f"Event window (oldest → newest):\n"
        f"{formatted}\n"
    )


def _heuristic_extract(events: list[Event], window: HurdleWindow) -> dict[str, Any] | None:
    """No-LLM fallback for --no-llm and dry-run. Loud and obvious so it's not
    mistaken for real extraction in a demo."""
    sub = events[window.start_idx:window.end_idx + 1]
    failing_tool = next(
        (e.tool_name for e in sub if e.kind == "tool_result" and e.is_error),
        "",
    ) or next((e.tool_name for e in sub if e.kind == "tool_call"), "?")
    user_corrections = [e.text[:200] for e in sub if e.kind == "user_msg"][:2]
    sig_names = sorted({s.kind for s in window.signals})
    return {
        "skip": False,
        "symptom": f"[STUB] hurdle around {failing_tool} (signals: {', '.join(sig_names)})",
        "root_cause": "[STUB extraction — no LLM call made. Run without --no-llm to get real notes.]",
        "correction": "[STUB] " + (user_corrections[0] if user_corrections else "see window events"),
        "files": window.files[:5],
    }


def _llm_extract(events: list[Event], window: HurdleWindow) -> dict[str, Any] | None:
    try:
        from openai import OpenAI  # type: ignore
    except ImportError:
        sys.stderr.write(
            "openai SDK not installed. `pip install openai` or use --no-llm.\n"
        )
        return None

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        sys.stderr.write("OPENAI_API_KEY not set. Use --no-llm for stub extraction.\n")
        return None

    client = OpenAI(api_key=api_key, base_url=EXTRACT_BASE_URL)
    user_prompt = _build_user_prompt(events, window)

    resp = client.chat.completions.create(
        model=EXTRACT_MODEL,
        max_tokens=800,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": EXTRACT_SYSTEM},
            {"role": "user",   "content": user_prompt},
        ],
    )

    text = (resp.choices[0].message.content or "").strip()
    # response_format=json_object should already give us clean JSON, but tolerate
    # accidental code fences in case the model leaks them through.
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("\n", 1)[0] if text.endswith("```") else text

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"LLM returned non-JSON: {e}\nRaw: {text[:500]}\n")
        return None
    return parsed


# --- persistence ------------------------------------------------------------

def _new_note_id() -> str:
    return "n_" + uuid.uuid4().hex[:6]


def _seed_importance(score: float, resolved: bool) -> float:
    """Seed importance from signal strength. Cap at 1.0; bump if resolved."""
    base = min(1.0, 0.4 + (score / 12.0))   # score=3 → 0.65, score=8 → 1.0
    if resolved:
        base = min(1.0, base + 0.05)
    return round(base, 3)


def _convex_sync_safe(fn, *args) -> None:
    """Best-effort sync — never raises, never blocks long. See SPEC.md > Convex."""
    try:
        import nm_convex
        if nm_convex.is_enabled():
            fn(*args)
    except Exception:
        pass


def _persist_hurdle(conn: sqlite3.Connection, session_id: str, win: HurdleWindow,
                    events: list[Event]) -> int:
    """Persist v1 `hurdles` row + v2 `hurdle_signals` rows.

    `hurdles.start_event_id` / `end_event_id` carry messages.id when the events
    came from the v2 path, transcript_entries.id when from the v1 fallback —
    same column, source disambiguated by which trace table populated the row.
    """
    start_te = events[win.start_idx].te_id if win.start_idx < len(events) else 0
    end_te = events[win.end_idx].te_id if win.end_idx < len(events) else None
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO hurdles (session_id, start_event_id, end_event_id, score, "
        "signals_json, resolved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            session_id,
            start_te,
            end_te,
            win.score,
            json.dumps([
                {"kind": s.kind, "event_idx": s.event_idx, "weight": s.weight, "detail": s.detail}
                for s in win.signals
            ]),
            1 if win.resolved_idx is not None else 0,
            now_iso(),
        ),
    )
    hurdle_id = cur.lastrowid

    # v2 audit: one row per individual signal in the cluster.
    rows = []
    for s in win.signals:
        msg_id = events[s.event_idx].te_id if 0 <= s.event_idx < len(events) else None
        rows.append((
            hurdle_id,
            msg_id,
            s.kind,
            float(s.weight),
            json.dumps(s.detail) if s.detail else None,
        ))
    if rows:
        cur.executemany(
            "INSERT INTO hurdle_signals (hurdle_id, message_id, signal, weight, details) "
            "VALUES (?, ?, ?, ?, ?)",
            rows,
        )

    # Convex mirror.
    import nm_convex
    _convex_sync_safe(
        nm_convex.sync_hurdle,
        {
            "hurdleId": hurdle_id,
            "sessionId": session_id,
            "score": float(win.score),
            "signalsJson": json.dumps([
                {"kind": s.kind, "event_idx": s.event_idx, "weight": s.weight, "detail": s.detail}
                for s in win.signals
            ]),
            "resolved": win.resolved_idx is not None,
            "resolvedNoteId": None,
            "createdAt": now_iso(),
        },
    )

    return hurdle_id


def _persist_note(conn: sqlite3.Connection, session_id: str, hurdle_id: int,
                  win: HurdleWindow, extracted: dict[str, Any]) -> str | None:
    if extracted.get("skip"):
        return None

    note_id = _new_note_id()
    importance = _seed_importance(win.score, win.resolved_idx is not None)

    files = extracted.get("files") or []
    if not isinstance(files, list):
        files = []
    # Keep only paths that actually appeared in the window — guard against
    # hallucinated paths from the LLM.
    candidates = set(win.files)
    files = [f for f in files if isinstance(f, str) and f in candidates][:5]
    if not files and win.files:
        files = win.files[:3]   # fallback to all candidates if LLM gave none

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO notes (id, symptom, root_cause, correction, importance, "
        "inject_count, created_at, created_from_session, created_from_hurdle, "
        "last_injected_at, t_invalid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            note_id,
            extracted.get("symptom", "")[:600],
            extracted.get("root_cause", "")[:1200],
            extracted.get("correction", "")[:1200],
            importance,
            0,
            now_iso(),
            session_id,
            hurdle_id,
            None,
            None,
        ),
    )

    # Primary file = the one most-touched inside the window; secondaries get
    # a smaller weight. We don't have a good per-file weight signal yet, so
    # use 1.0 / 0.6 / 0.4 / ... Stepwise.
    weights_table = [1.0, 0.7, 0.5, 0.4, 0.3]
    edges_for_sync: list[dict[str, Any]] = []
    for i, path in enumerate(files):
        upsert_file(conn, path)
        w = weights_table[i] if i < len(weights_table) else 0.3
        cur.execute(
            "INSERT OR REPLACE INTO file_note_edges (note_id, path, weight) VALUES (?, ?, ?)",
            (note_id, path, w),
        )
        edges_for_sync.append({"path": path, "weight": w})

    # Convex mirror — note + its edges in one round-trip via /sync/note.
    import nm_convex
    _convex_sync_safe(
        nm_convex.sync_note,
        {
            "noteId": note_id,
            "symptom": extracted.get("symptom", "")[:600],
            "rootCause": extracted.get("root_cause", "")[:1200],
            "correction": extracted.get("correction", "")[:1200],
            "importance": float(importance),
            "injectCount": 0,
            "lastInjectedAt": None,
            "invalidatedAt": None,
            "createdAt": now_iso(),
            "createdFromSession": session_id,
            "createdFromHurdle": hurdle_id,
        },
        edges_for_sync,
    )

    # Nia indexing — semantic retrieval surface for `find_notes_semantic`
    # in nm_server. Best-effort, fails open when NIA_API_KEY is unset.
    try:
        import nm_nia
        text = " ".join(filter(None, [
            extracted.get("symptom", ""),
            extracted.get("root_cause", ""),
            extracted.get("correction", ""),
        ]))
        nm_nia.index_note(note_id, text, files)
    except Exception:
        pass

    return note_id


# --- orchestrator -----------------------------------------------------------

def extract_session(session_id: str, *, dry_run: bool = False, use_llm: bool = True) -> dict[str, Any]:
    init_db()
    conn = connect()
    events = events_for_session(conn, session_id)
    if not events:
        return {"session_id": session_id, "events": 0, "notes": [], "skipped": [], "error": "no events"}

    signals = all_signals(events)
    windows = expand_windows(events, signals)

    notes: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for win in windows:
        extracted = _llm_extract(events, win) if use_llm else _heuristic_extract(events, win)
        if extracted is None:
            skipped.append({"start_idx": win.start_idx, "score": win.score, "reason": "extraction failed"})
            continue
        if extracted.get("skip"):
            skipped.append({"start_idx": win.start_idx, "score": win.score, "reason": extracted.get("reason", "llm-skip")})
            continue

        if dry_run:
            notes.append({
                "preview": True,
                "score": win.score,
                "files": win.files,
                **extracted,
            })
            continue

        hurdle_id = _persist_hurdle(conn, session_id, win, events)
        note_id = _persist_note(conn, session_id, hurdle_id, win, extracted)
        if note_id:
            notes.append({"id": note_id, "score": win.score, **extracted})

    if not dry_run:
        conn.commit()
    conn.close()

    return {
        "session_id": session_id,
        "events": len(events),
        "signals": len(signals),
        "windows": len(windows),
        "notes": notes,
        "skipped": skipped,
    }


def list_sessions() -> list[str]:
    init_db()
    conn = connect()
    cur = conn.cursor()
    cur.execute(
        "SELECT DISTINCT session_id FROM transcript_entries "
        "WHERE session_id IS NOT NULL ORDER BY id DESC"
    )
    rows = [r[0] for r in cur.fetchall() if r[0]]
    conn.close()
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", help="Session id to extract")
    ap.add_argument("--all", action="store_true", help="Extract every session")
    ap.add_argument("--dry-run", action="store_true", help="Print, don't persist")
    ap.add_argument("--no-llm", action="store_true", help="Use heuristic stub instead of an LLM call")
    args = ap.parse_args()

    if not args.session and not args.all:
        ap.error("pass --session <id> or --all")

    sessions = [args.session] if args.session else list_sessions()
    if not sessions:
        print("no sessions found in transcript_entries")
        return

    use_llm = not args.no_llm
    for sid in sessions:
        result = extract_session(sid, dry_run=args.dry_run, use_llm=use_llm)
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
