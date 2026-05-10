"""Atomic fix for the Replay view's stuck-time bug.

Cause: V2 Agents-tab Convex hydration leaves note.created_at as an ISO string
(Convex's wire format). buildReplayEvents pushes that into events.ts. Inside
the replay rAF loop, updateReplayDisplay()/drawReplayGraph() do `ev.ts > currentTs`
(string vs number) and start throwing — the rAF schedule line never runs, the
loop dies after one frame, and the time cursor is stuck.

Fix:
  1. In buildReplayEvents, coerce every ts to a numeric ms timestamp at the
     point the event is constructed (defensive, future-proof).
  2. In the V2 _hydrateAgentsTab mapper, convert createdAt -> numeric created_at
     so other consumers (renderAgents, future code) don't trip on the same.

Idempotent: skips if NM_REPLAY_FIX_V1 marker present.
"""
import os
import re
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "mock", "index.html")
MARKER = "NM_REPLAY_FIX_V1"


# --- Fix #1: buildReplayEvents — coerce ts at every push site ---
OLD_BUILD = '''function buildReplayEvents() {
  const events = [];
  ALL_NOTES.forEach(n => {
    events.push({
      type: 'note_created',
      ts: n.created_at,
      note_id: n.id,
      actor: n.created_by,
    });
  });
  // sample injections to keep lanes readable
  INJECTIONS.forEach((inj, i) => {
    if (i % 2 !== 0) return;
    events.push({
      type: inj.accepted ? 'injection' : 'injection_rejected',
      ts: inj.ts,
      note_id: inj.note_id,
      file: inj.file,
      actor: inj.agent_id,
    });
  });
  GC_RUNS.forEach(r => {
    r.actions.forEach(a => {
      if (a.type === 'skip') return;
      events.push({
        type: 'gc_' + a.type,
        ts: r.ts,
        run_id: r.id,
        action: a,
        actor: 'gc',
      });
    });
  });
  events.sort((a, b) => a.ts - b.ts);
  return events;
}'''

NEW_BUILD = '''function buildReplayEvents() {
  // NM_REPLAY_FIX_V1 — coerce every ts to a numeric ms timestamp.
  // Convex notes/injections/gcRuns store ISO-string ts; other code paths
  // (V2 hydration) leave that string in place. Replay's rAF loop dies if
  // ev.ts is a string because string-vs-number compares throw downstream.
  const _toMs = v => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
    return 0;
  };
  const events = [];
  ALL_NOTES.forEach(n => {
    events.push({
      type: 'note_created',
      ts: _toMs(n.created_at),
      note_id: n.id,
      actor: n.created_by,
    });
  });
  // sample injections to keep lanes readable
  INJECTIONS.forEach((inj, i) => {
    if (i % 2 !== 0) return;
    events.push({
      type: inj.accepted ? 'injection' : 'injection_rejected',
      ts: _toMs(inj.ts),
      note_id: inj.note_id,
      file: inj.file,
      actor: inj.agent_id,
    });
  });
  GC_RUNS.forEach(r => {
    r.actions.forEach(a => {
      if (a.type === 'skip') return;
      events.push({
        type: 'gc_' + a.type,
        ts: _toMs(r.ts),
        run_id: r.id,
        action: a,
        actor: 'gc',
      });
    });
  });
  events.sort((a, b) => a.ts - b.ts);
  return events;
}'''


# --- Fix #2: V2 _hydrateAgentsTab — convert ALL_NOTES.created_at to numeric ms ---
OLD_HYDRATE_NOTES = '''      const mapped = data.notes.map(n => ({
        id: n.noteId, symptom: n.symptom, root_cause: n.rootCause,
        correction: n.correction, importance: n.importance,
        inject_count: n.injectCount || 0, created_by: n.createdBy,
        created_at: n.createdAt,
      }));'''

NEW_HYDRATE_NOTES = '''      const _toMsHydrate = v => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') { const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
        return 0;
      };
      const mapped = data.notes.map(n => ({
        id: n.noteId, symptom: n.symptom, root_cause: n.rootCause,
        correction: n.correction, importance: n.importance,
        inject_count: n.injectCount || 0, created_by: n.createdBy,
        created_at: _toMsHydrate(n.createdAt),
      }));'''


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    if MARKER in src:
        print("already patched (marker present); no changes")
        return 0

    if OLD_BUILD not in src:
        print("ERROR: buildReplayEvents anchor not found", file=sys.stderr); return 2
    if OLD_HYDRATE_NOTES not in src:
        print("WARNING: V2 hydration mapper not found — skipping fix #2", file=sys.stderr)

    new = src.replace(OLD_BUILD, NEW_BUILD, 1)
    print("[1/2] coerced buildReplayEvents ts values to numeric")

    if OLD_HYDRATE_NOTES in new:
        new = new.replace(OLD_HYDRATE_NOTES, NEW_HYDRATE_NOTES, 1)
        print("[2/2] coerced V2 _hydrateAgentsTab note.createdAt to numeric")
    else:
        print("[2/2] (skipped, V2 hydrate mapper not present in this file)")

    fd, tmp = tempfile.mkstemp(prefix=".idx-", suffix=".html",
                                dir=os.path.dirname(PATH))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as out:
            out.write(new)
        os.replace(tmp, PATH)
    except Exception:
        try: os.unlink(tmp)
        except Exception: pass
        raise
    print(f"patched {PATH}: +{len(new) - len(src)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
