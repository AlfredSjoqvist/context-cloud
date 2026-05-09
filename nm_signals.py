"""Hurdle-detection signals.

Each detector is a pure function `(events: list[Event]) -> list[Signal]`. They
fire on specific events, with an associated weight. Hurdle windows are formed
when the rolling sum of weights crosses a threshold (see nm_extract.py).

Signals implemented (mapped to PRD + research additions):
  PRD #1  reverted_edit       weight 2
  PRD #2  retry_loop          weight 2
  PRD #3  correction_phrase   weight 1
  PRD #4  prompt_reask        weight 1
  PRD #6  feedback            weight 3
  NEW #1  action_bigram_loop  weight 3
  NEW #2  interrupt           weight 2

PRD #5 (edited_output) is intentionally omitted: in Claude Code the agent's
edits run directly via the Edit/Write tools — there is no "user edits the
proposed output before commit" surface to detect. The reverted_edit signal
covers the same intent.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from nm_events import Event


@dataclass
class Signal:
    kind: str
    event_idx: int                     # which event triggered detection
    weight: float
    detail: dict[str, Any] = field(default_factory=dict)


# --- weights (tunable; keep in sync with the consolidated table in chat) ---

WEIGHTS: dict[str, float] = {
    "action_bigram_loop": 3.0,
    "retry_loop":          2.0,
    "interrupt":           2.0,
    "reverted_edit":       2.0,
    "correction_phrase":   1.0,
    "prompt_reask":        1.0,
    "feedback":            3.0,
}

# Threshold for window expansion. Single weight-3 signal alone fires; combos
# of weak signals also fire.
HURDLE_THRESHOLD = 3.0


# --- helpers ---

_FILE_PATH_KEYS = ("file_path", "path", "notebook_path")


def _file_path_of(tool_input: dict[str, Any]) -> str | None:
    for k in _FILE_PATH_KEYS:
        v = tool_input.get(k)
        if isinstance(v, str) and v:
            return v
    return None


def _arg_shape_hash(tool_name: str, tool_input: dict[str, Any]) -> str:
    """Stable hash of a tool call's salient args.

    For Read/Edit/Write/Bash we lock onto file_path / command. For others, we
    fall back to a sorted-keys hash of the input. The point is: two calls that
    'do the same thing' should hash the same.
    """
    name = tool_name or ""
    if name in ("Read", "Edit", "Write", "MultiEdit", "NotebookEdit"):
        key = _file_path_of(tool_input) or ""
    elif name == "Bash":
        key = (tool_input.get("command") or "")[:200]
    elif name == "Grep":
        key = f"{tool_input.get('pattern','')}|{tool_input.get('path','')}"
    elif name == "Glob":
        key = f"{tool_input.get('pattern','')}|{tool_input.get('path','')}"
    else:
        try:
            key = json.dumps(tool_input, sort_keys=True, default=str)[:300]
        except Exception:
            key = str(tool_input)[:300]
    h = hashlib.sha1(f"{name}::{key}".encode("utf-8")).hexdigest()[:12]
    return h


# --- 1. action-bigram loop ---------------------------------------------------

def detect_action_bigram_loop(
    events: list[Event],
    *,
    window: int = 10,
    min_repeats: int = 3,
) -> list[Signal]:
    """Same hash(tool+arg-shape) repeats >= min_repeats within a sliding window."""
    out: list[Signal] = []
    history: list[tuple[int, str]] = []  # (event_idx, hash)
    fired_for_hash: set[str] = set()

    for ev in events:
        if ev.kind != "tool_call":
            continue
        h = _arg_shape_hash(ev.tool_name, ev.tool_input)
        history.append((ev.idx, h))
        # Trim history to last `window` tool_calls.
        if len(history) > window:
            history = history[-window:]
        count = sum(1 for _, hh in history if hh == h)
        if count >= min_repeats and h not in fired_for_hash:
            out.append(Signal(
                kind="action_bigram_loop",
                event_idx=ev.idx,
                weight=WEIGHTS["action_bigram_loop"],
                detail={"tool": ev.tool_name, "repeats": count, "hash": h},
            ))
            fired_for_hash.add(h)
    return out


# --- 2. tool-error retry loop -----------------------------------------------

def detect_retry_loop(events: list[Event]) -> list[Signal]:
    """Same tool name fails >= 2x in a row."""
    out: list[Signal] = []
    last_failed_tool: str | None = None
    streak = 0
    pending_call_name: dict[str, str] = {}  # tool_use_id -> tool_name

    for ev in events:
        if ev.kind == "tool_call":
            if ev.tool_use_id:
                pending_call_name[ev.tool_use_id] = ev.tool_name
        elif ev.kind == "tool_result":
            name = pending_call_name.pop(ev.tool_use_id, "")
            if ev.is_error:
                if name and name == last_failed_tool:
                    streak += 1
                else:
                    streak = 1
                    last_failed_tool = name
                if streak >= 2:
                    out.append(Signal(
                        kind="retry_loop",
                        event_idx=ev.idx,
                        weight=WEIGHTS["retry_loop"],
                        detail={"tool": name or "?", "consecutive_failures": streak},
                    ))
            else:
                streak = 0
                last_failed_tool = None
    return out


# --- 3. user interrupt mid-tool-sequence ------------------------------------

def detect_interrupt(events: list[Event]) -> list[Signal]:
    """A user_msg arrives where a tool_result was expected.

    Trigger: assistant emitted >=1 tool_call (stop_reason=tool_use) and the
    next user-side event is a free-text user_msg, not a tool_result for the
    pending call.
    """
    out: list[Signal] = []
    pending_calls: list[str] = []  # tool_use_ids awaiting a result

    for ev in events:
        if ev.kind == "tool_call":
            if ev.tool_use_id:
                pending_calls.append(ev.tool_use_id)
        elif ev.kind == "tool_result":
            if ev.tool_use_id in pending_calls:
                pending_calls.remove(ev.tool_use_id)
        elif ev.kind == "user_msg":
            if pending_calls:
                out.append(Signal(
                    kind="interrupt",
                    event_idx=ev.idx,
                    weight=WEIGHTS["interrupt"],
                    detail={"pending_tools": len(pending_calls)},
                ))
                pending_calls.clear()
    return out


# --- 4. reverted edit -------------------------------------------------------

_EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


def detect_reverted_edit(events: list[Event], *, lookahead: int = 5) -> list[Signal]:
    """Same file edited again within `lookahead` events of the prior edit.

    Proxy for "user reverted the diff" — we don't see commit-time diffs, so we
    flag rapid re-edits to the same path as suspicious. Exact-revert detection
    would require diffing tool args; not worth the complexity for v1.
    """
    out: list[Signal] = []
    last_edit_at: dict[str, int] = {}   # path -> event idx of last edit
    fired_at: set[int] = set()

    for ev in events:
        if ev.kind != "tool_call" or ev.tool_name not in _EDIT_TOOLS:
            continue
        path = _file_path_of(ev.tool_input)
        if not path:
            continue
        prev = last_edit_at.get(path)
        if prev is not None and (ev.idx - prev) <= lookahead and ev.idx not in fired_at:
            out.append(Signal(
                kind="reverted_edit",
                event_idx=ev.idx,
                weight=WEIGHTS["reverted_edit"],
                detail={"path": path, "prev_edit_idx": prev, "delta": ev.idx - prev},
            ))
            fired_at.add(ev.idx)
        last_edit_at[path] = ev.idx
    return out


# --- 5. correction phrase ---------------------------------------------------

# Word-boundary regex; case-insensitive. Matches phrases that strongly suggest
# the user is correcting the agent.
_CORRECTION_RE = re.compile(
    r"\b("
    r"no(?:pe)?|wrong|that'?s wrong|that'?s not right|that'?s incorrect|"
    r"actually|instead|stop|wait|hold on|"
    r"don'?t|never|"
    r"not (?:quite|right|correct|what|like that)"
    r")\b",
    re.IGNORECASE,
)


def detect_correction_phrase(events: list[Event]) -> list[Signal]:
    out: list[Signal] = []
    for ev in events:
        if ev.kind != "user_msg" or not ev.text:
            continue
        m = _CORRECTION_RE.search(ev.text)
        if m:
            out.append(Signal(
                kind="correction_phrase",
                event_idx=ev.idx,
                weight=WEIGHTS["correction_phrase"],
                detail={"match": m.group(0).lower()},
            ))
    return out


# --- 6. prompt re-ask -------------------------------------------------------

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
    da = sum(v * v for v in a.values()) ** 0.5
    db = sum(v * v for v in b.values()) ** 0.5
    if da == 0 or db == 0:
        return 0.0
    return num / (da * db)


def detect_prompt_reask(
    events: list[Event],
    *,
    threshold: float = 0.6,
    window: int = 5,
    min_tokens: int = 4,
) -> list[Signal]:
    """User message has high token-overlap cosine with a recent prior prompt.

    Cheap deterministic n-gram cosine. min_tokens guards against trivial
    'thanks'/'ok' dupes triggering.
    """
    out: list[Signal] = []
    history: list[tuple[int, Counter[str]]] = []  # (idx, bag)

    for ev in events:
        if ev.kind != "user_msg":
            continue
        bag = _bag(ev.text)
        if sum(bag.values()) < min_tokens:
            continue
        # Compare against last `window` prior user prompts.
        best = 0.0
        best_idx = -1
        for prior_idx, prior_bag in history[-window:]:
            sim = _cosine(bag, prior_bag)
            if sim > best:
                best = sim
                best_idx = prior_idx
        if best >= threshold and best_idx >= 0:
            out.append(Signal(
                kind="prompt_reask",
                event_idx=ev.idx,
                weight=WEIGHTS["prompt_reask"],
                detail={"similar_to_idx": best_idx, "cosine": round(best, 3)},
            ))
        history.append((ev.idx, bag))
    return out


# --- 7. explicit feedback ---------------------------------------------------

def detect_feedback(events: list[Event]) -> list[Signal]:
    """Agent (or user-via-agent) called the MCP `feedback` tool with useful=False.

    The feedback tool isn't wired yet (PRD v1 surface), but the detector ships
    so it'll fire the moment it lands.
    """
    out: list[Signal] = []
    for ev in events:
        if ev.kind != "tool_call" or ev.tool_name != "feedback":
            continue
        useful = ev.tool_input.get("useful")
        if useful is False or useful == "false":
            out.append(Signal(
                kind="feedback",
                event_idx=ev.idx,
                weight=WEIGHTS["feedback"],
                detail={"reason": ev.tool_input.get("reason", "")},
            ))
    return out


# --- aggregator --------------------------------------------------------------

def all_signals(events: list[Event]) -> list[Signal]:
    """Run every detector and return the merged signal list, ordered by event_idx."""
    out: list[Signal] = []
    out.extend(detect_action_bigram_loop(events))
    out.extend(detect_retry_loop(events))
    out.extend(detect_interrupt(events))
    out.extend(detect_reverted_edit(events))
    out.extend(detect_correction_phrase(events))
    out.extend(detect_prompt_reask(events))
    out.extend(detect_feedback(events))
    out.sort(key=lambda s: s.event_idx)
    return out
