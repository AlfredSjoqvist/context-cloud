"""Remote Note Manager — Convex-driven polling loop.

Sits beside nm_extract.py but reads from Convex instead of local SQLite. For
sessions that come in through the hosted MCP server (`mock/api/mcp/...`),
the agent's events land in the `agentEvents` Convex table. This poller:

  - Asks Convex for sessions whose `lastSeenAt` is newer than
    `lastExtractedAt` (i.e., have new events since we last looked).
  - For each such session, pulls the events.
  - Maps them into the same Event shape `nm_signals.all_signals` consumes.
  - Runs the existing hurdle-window expansion + heuristic note formatter.
  - Creates a note via `nm_convex.sync_note` if a hurdle clears the
    threshold.
  - Marks the session extracted up to the last event timestamp.

Run:
    set CONVEX_URL=https://colorless-porcupine-926.convex.site
    set CONVEX_QUERY_URL=https://colorless-porcupine-926.convex.cloud
    python nm_extract_remote.py

It runs forever, polling every 30 s. Ctrl-C to stop.

This is a heuristic version (no LLM call). Lower note quality than
nm_extract --all, but reliable: every triggered hurdle becomes a note,
deterministic and fast — exactly what a live demo needs.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from nm_events import Event
from nm_signals import HURDLE_THRESHOLD as _LOCAL_THRESHOLD, all_signals

# Remote sessions captured via record_event are sparser than what Claude Code
# hooks capture locally — no tool_result rows, no precise stop_reason, so
# higher-weight signals (retry_loop, action_bigram_loop) fire less often.
# Use a lower threshold so correction-phrase clusters alone can produce notes.
HURDLE_THRESHOLD = float(os.environ.get("NM_REMOTE_HURDLE_THRESHOLD", "2.0"))


CONVEX_QUERY_URL = (
    os.environ.get("CONVEX_QUERY_URL")
    or "https://colorless-porcupine-926.convex.cloud"
).rstrip("/")
CONVEX_SITE_URL = (
    os.environ.get("CONVEX_URL")
    or "https://colorless-porcupine-926.convex.site"
).rstrip("/")
SYNC_TOKEN = os.environ.get("NM_SYNC_TOKEN", "")
POLL_INTERVAL_S = float(os.environ.get("NM_POLL_INTERVAL_S", "30"))


# ---------------------------------------------------------------------------
# Convex HTTP helpers
# ---------------------------------------------------------------------------

def _query(path: str, args: dict | None = None):
    # Convex's v.optional(...) accepts missing fields but rejects null.
    clean = {k: v for k, v in (args or {}).items() if v is not None}
    body = json.dumps(
        {"path": path, "args": clean, "format": "json"}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{CONVEX_QUERY_URL}/api/query",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("status") == "success":
                return data.get("value")
            print(f"[remote-nm] query {path} not ok: {data}", file=sys.stderr)
            return None
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        print(f"[remote-nm] query {path} error: {e}", file=sys.stderr)
        return None


def _post(path: str, body: dict) -> bool:
    headers = {"Content-Type": "application/json"}
    if SYNC_TOKEN:
        headers["X-NM-TOKEN"] = SYNC_TOKEN
    req = urllib.request.Request(
        f"{CONVEX_SITE_URL}{path}",
        data=json.dumps(body, default=str).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        print(f"[remote-nm] post {path} error: {e}", file=sys.stderr)
        return False


# ---------------------------------------------------------------------------
# Convex agentEvents -> nm_events.Event
# ---------------------------------------------------------------------------

def _to_event(idx: int, row: dict) -> Event:
    """Adapt a Convex agentEvents row to the Event shape nm_signals expects."""
    kind_map = {
        "user_msg": "user_msg",
        "correction": "user_msg",
        "agent_msg": "assistant_msg",
        "tool_call": "tool_call",
        "tool_error": "tool_result",
    }
    kind = kind_map.get(row.get("kind", ""), "user_msg")
    payload = row.get("payload") or {}

    text = row.get("text") or ""
    is_error = bool(row.get("isError") or False)
    tool_name = row.get("toolName") or payload.get("tool_name") or ""
    tool_input = {}
    file_path = row.get("filePath") or payload.get("file_path") or payload.get("path")
    if file_path:
        tool_input["file_path"] = file_path

    tool_use_id = (
        payload.get("tool_use_id")
        or payload.get("toolUseId")
        or f"remote-{row.get('_id') or idx}"
    )

    stop_reason = payload.get("stop_reason") or "end_turn"

    return Event(
        idx=idx,
        te_id=idx,
        kind=kind,
        ts=row.get("ts") or "",
        text=text,
        tool_name=tool_name,
        tool_input=tool_input,
        tool_use_id=tool_use_id,
        is_error=is_error,
        stop_reason=stop_reason,
    )


# ---------------------------------------------------------------------------
# Note generation
# ---------------------------------------------------------------------------

def _heuristic_note_from_window(
    session_id: str, events: list[Event], window
) -> dict | None:
    """Produce a (note, edges) bundle from a hurdle window without an LLM."""
    files = list(dict.fromkeys(window.files))
    if not files:
        return None

    correction_text = ""
    pre_text = ""
    for ev in events[window.start_idx : window.end_idx + 1]:
        if ev.kind == "user_msg":
            txt = (ev.text or "").strip()
            if txt:
                if not pre_text:
                    pre_text = txt[:200]
                correction_text = txt[:200]

    note_id = "n_" + hashlib.sha1(
        f"{session_id}|{window.start_idx}|{','.join(files)}".encode()
    ).hexdigest()[:8]

    primary = files[0]
    short_path = primary.split("/")[-1]
    symptom = (
        f"Agent stumbled while editing {short_path} (session {session_id[:8]})."
        if not pre_text
        else f"Agent's first attempt on {short_path} was rejected: \"{pre_text[:80]}\"."
    )
    root_cause = (
        f"Hurdle expanded with signals {[s.kind for s in window.signals]} "
        f"and combined weight {window.score:.1f}. "
        f"Pre-context suggests project convention not yet captured for {short_path}."
    )
    correction = (
        correction_text
        if correction_text
        else f"Re-read {short_path} and follow the project's local convention before editing."
    )

    return {
        "note": {
            "noteId": note_id,
            "symptom": symptom,
            "rootCause": root_cause,
            "correction": correction,
            "importance": min(0.95, 0.5 + 0.1 * window.score),
            "injectCount": 0,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "createdFromSession": session_id,
        },
        "edges": [
            {
                "path": p,
                "weight": 1.0 if p == primary else 0.4,
                "type": p.split(".")[-1] if "." in p else "txt",
                "firstSeen": datetime.now(timezone.utc).isoformat(),
                "lastSeen": datetime.now(timezone.utc).isoformat(),
            }
            for p in files
        ],
    }


# ---------------------------------------------------------------------------
# One pass over candidate sessions
# ---------------------------------------------------------------------------

def _process_session(s: dict) -> int:
    """Return number of notes created for the session."""
    session_id = s.get("sessionId")
    if not session_id:
        return 0

    rows = (
        _query(
            "agentEvents:recentForSession",
            {
                "sessionId": session_id,
                "sinceTs": s.get("lastExtractedEventTs"),
                "limit": 500,
            },
        )
        or []
    )
    rows = sorted(rows, key=lambda r: r.get("ts") or "")
    if not rows:
        return 0

    events = [_to_event(i, r) for i, r in enumerate(rows)]
    signals = all_signals(events)

    # Inline window-expansion (lighter than nm_extract.expand_windows; we don't
    # have the rich Event fields here so a simple cluster is enough).
    notes_made = 0
    if signals:
        # Cluster by event-idx proximity.
        clusters: list[list] = [[signals[0]]]
        for sig in signals[1:]:
            if sig.event_idx - clusters[-1][-1].event_idx <= 12:
                clusters[-1].append(sig)
            else:
                clusters.append([sig])
        for cluster in clusters:
            score = sum(s.weight for s in cluster)
            if score < HURDLE_THRESHOLD:
                continue
            start_idx = max(0, cluster[0].event_idx - 10)
            end_idx = min(len(events) - 1, cluster[-1].event_idx + 6)

            class _Win:
                pass

            window = _Win()
            window.start_idx = start_idx
            window.end_idx = end_idx
            window.score = score
            window.signals = cluster
            window.files = []
            for ev in events[start_idx : end_idx + 1]:
                fp = ev.tool_input.get("file_path")
                if fp and fp not in window.files:
                    window.files.append(fp)

            bundle = _heuristic_note_from_window(session_id, events, window)
            if not bundle:
                continue
            ok = _post(
                "/sync/note",
                {"note": bundle["note"], "edges": bundle["edges"]},
            )
            if ok:
                notes_made += 1
                print(
                    f"[remote-nm]   note {bundle['note']['noteId']} for "
                    f"{session_id[:10]} score={score:.1f} files={window.files}"
                )

    last_ts = rows[-1].get("ts")
    _post(
        "/sync/mark-extracted",
        {
            "sessionId": session_id,
            "atTs": datetime.now(timezone.utc).isoformat(),
            "lastEventTs": last_ts,
        },
    )

    return notes_made


def run_once() -> int:
    sessions = _query("agentEvents:sessionsToExtract", {"limit": 100}) or []
    total = 0
    for s in sessions:
        total += _process_session(s)
    return total


def main() -> None:
    print(
        f"[remote-nm] polling every {POLL_INTERVAL_S:.0f}s — "
        f"queries={CONVEX_QUERY_URL} sync={CONVEX_SITE_URL}"
    )
    while True:
        try:
            n = run_once()
            if n:
                print(f"[remote-nm] pass complete — {n} new note(s)")
            else:
                print(f"[remote-nm] pass complete — no new hurdles")
        except KeyboardInterrupt:
            print("[remote-nm] stopped")
            return
        except Exception as e:
            print(f"[remote-nm] pass error: {e}", file=sys.stderr)
        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    main()
