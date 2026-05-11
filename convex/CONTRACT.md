# Convex Backend — Public Contract

Anything **not listed here is internal** and may change at any time.
Anything listed here is stable for the integration / frontend agents to
call. If a signature does change, the WORKLOG-backend.md gets a
`CONTRACT CHANGE` block at the top so consumers see it on next sync.

Backend agent owns this file. Last updated: 2026-05-11.

---

## HTTP endpoints

Base URLs:
- Dev: `https://acoustic-fish-389.convex.site`
- Prod: `https://colorless-porcupine-926.convex.site`

### Public (CORS-enabled, no auth)

| Method | Path | Returns |
|---|---|---|
| `GET` | `/dashboard/everything` | Bundled snapshot. See "Dashboard payload shape" below. |
| `GET` | `/dashboard/sessions-with-notes?limit=N` | `{ asOf, sessions: SessionWithNotes[], totals: { sessions, notes } }` |
| `GET` | `/dashboard/health` | `{ asOf, freshness: {...}, counts: {...} }` |
| `GET` | `/health` | `{ ok: true, ts }` |

### Server-to-server writes (auth: `X-NM-TOKEN: $NM_SYNC_TOKEN` when set)

| Method | Path | Body shape |
|---|---|---|
| `POST` | `/sync/note` | `{ note: NoteFields, edges?: EdgeFields[] }` — atomic |
| `POST` | `/sync/injection` | injection fields. Auto-bumps note.injectCount when `accepted: true` and `noteId` set. Atomic. |
| `POST` | `/sync/hurdle` | hurdle fields. Upsert on `hurdleId`. |
| `POST` | `/sync/gc` | gc fields: `{ ts, action, noteId?, details?, runId?, targetNote?, targetFile?, sourceNote?, reason?, edgeWeight? }`. Atomically invalidates note when `action ∈ {prune, invalidate}` and `noteId` set. Un-invalidates note when `action='restore'` and `noteId` set. Additionally writes a `prunedEdges` row when `action='prune'` AND both `noteId` and `targetFile` set. |
| `POST` | `/sync/session` | session fields. Upsert on `sessionId`. |
| `POST` | `/sync/agent-event` | event fields. Atomically auto-creates / touches session row. |
| `POST` | `/sync/mark-extracted` | `{ sessionId, atTs, lastEventTs? }`. Patches session.lastExtractedAt. |
| `POST` | `/sync/hyperspell-refs` | `{ noteId, refs, enrichedAt }`. Patches note hyperspell fields. |

All `/sync/*` return `{ "ok": true, "result": ... }` on success or `{ "error": "..." }` with non-2xx on failure.

---

## Public Convex functions (callable via `api.*` from JS clients)

### `api.cycles`

| Function | Type | Notes |
|---|---|---|
| `openCycle(cycleNumber)` | mutation | inserts a cycle row, status=running |
| `openNextCycle()` | mutation | **race-safe** atomic replacement for `nextCycleNumber()` + `openCycle()`. Returns `{ cycleId, cycleNumber }` |
| `setPlan(cycleId, plannedFiles)` | mutation | patches the plan list |
| `setPhase(cycleId, phase)` | mutation | phase ∈ WAKE/PLAN/SCAN/ANALYZE/CRITIQUE/HANDOFF/RECONCILE/SLEEP |
| `closeCycle(cycleId, status, summary?)` | mutation | status ∈ done/failed |
| `latestCycle()` | query | newest cycle by cycleNumber |
| `nextCycleNumber()` | query | next sequence (**racy** — prefer `openNextCycle`) |

### `api.findings`

| Function | Type | Notes |
|---|---|---|
| `createIfAbsent(...)` | mutation | idempotent on `fingerprint`. Returns `{ id, created }` |
| `setStatus(findingId, status, githubIssueNumber?)` | mutation | status ∈ detected/devin_running/pr_open/verifying/resolved/reopened_sharpened/escalated |
| `incrementSharpen(findingId)` | mutation | bumps `sharpenIterations` by 1 (NOT idempotent — prefer `setSharpenIterations`) |
| `setSharpenIterations(findingId, iterations)` | mutation | **idempotent-by-value** — preferred for retry-safe writes |
| `byStatus(status)` | query | indexed lookup |
| `detail(findingId, eventsLimit?)` | query | returns `{ finding, runs, events }` in one round-trip |

### `api.devinRuns`

| Function | Type | Notes |
|---|---|---|
| `recordRun(findingId, devinRunId, promptUsed, iteration)` | mutation | **idempotent on `devinRunId`** |
| `linkPR(runId, prNumber, prUrl)` | mutation | |
| `markOutcome(runId, outcome, prMergedAt?)` | mutation | |
| `byFinding(findingId)` | query | indexed |
| `recent(limit?)` | query | most recently spawned runs across all findings |

### `api.fileScanHistory`

| Function | Type | Notes |
|---|---|---|
| `upsertScan(path, cycleNumber, fileHash, cleanScan)` | mutation | idempotent on `path` |
| `getAll()` | query | |
| `byPath(path)` | query | |

### `api.events`

| Function | Type | Notes |
|---|---|---|
| `append(cycleNumber?, level, message, metadata?)` | mutation | level ∈ info/warn/finding/action |
| `listRecent(limit?)` | query | newest-first, ascending order returned |
| `forCycle(cycleNumber, limit?)` | query | indexed |

### `api.notes`

| Function | Type | Notes |
|---|---|---|
| `listActive(limit?)` | query | excludes invalidated notes |
| `detail(noteId, injectionsLimit?)` | query | returns `{ note, edges, injections }` in one round-trip |
| `listEdgesForNote(noteId)` | query | |
| `listEdgesForPath(path)` | query | |
| `listFiles()` | query | |
| `graphSnapshot()` | query | notes + files + edges |

### `api.docsIngestRuns`

| Function | Type | Notes |
|---|---|---|
| `recordRun(runId, lib, topic, sourceUri, ruleCount, appliesTo, leafPath, ...)` | mutation | **idempotent on `leafPath`** |
| `listRecent(limit?)` | query | |
| `leavesForPath(path, limit?)` | query | filters `appliesTo` array |
| `listAllLeaves(limit?)` | query | |

### `api.users` / `api.agents` (in users.ts)

`upsertUser`, `listUsers`, `upsertAgent`, `listAgents` — all idempotent.

### `api.libraries`

`upsertLibrary`, `list`, `refresh` (demo seam — flagged in source).

### `api.gc`

| Function | Type | Notes |
|---|---|---|
| `recordRun(runId, ts, durationMs?, activeAfter?, invalidatedAfter?, edgesAfter?)` | mutation | **idempotent on runId** — run-level GC summary |
| `recent(limit?)` | query | recent gcActions |
| `recentStats(sinceMinutes?)` | query | rolled-up counts by action over a window |
| `byRun(runId, limit?)` | query | gcActions for one GC run |
| `runDetail(runId)` | query | `{ run, actions }` in one round-trip |

### `api.injections` / `api.hurdles` / `api.sessions` / `api.agentEvents`

Only the read paths are public (`recent`, `recentStats`, `recentForSession`, `sessionsToExtract`). All write paths are `internalMutation` and reachable only through the HTTP routes above.

---

## Dashboard payload shape (`/dashboard/everything`)

Returns an object with exactly these keys:

```ts
{
  users:           User[]
  agents:          Agent[]
  files:           FileRow[]             // last 2000
  notes:           Note[]                // last 2000 (newest by _creationTime)
  noteFiles:       NoteFile[]            // last 5000
  prunedEdges:     PrunedEdge[]          // last 500
  injections:      Injection[]           // last 500
  gcRuns:          GcRun[]               // last 50
  gcActions:       GcAction[]            // last 200
  cycles:          Cycle[]               // last 50
  findings:        Finding[]             // last 2000 (newest by _creationTime)
  devinRuns:       DevinRun[]            // last 100
  guardianEvents:  Event[]               // last 200 (alias of events table)
  docsIngestRuns:  DocsLeaf[]            // last 1000; each row has lastIngestedAt projected from _creationTime
  docsLeaves:      DocsLeaf[]            // V1 alias of docsIngestRuns — deprecated, will be removed
  libraries:       Library[]
  sessions:        Session[]             // last 50
  agentEvents:     AgentEvent[]          // last 100, ordered by ts desc
}
```

### `/dashboard/health` shape

```ts
{
  asOf:      number,  // epoch ms
  freshness: {
    lastCycleAt: number | null
    lastCycleNumber: number | null
    lastGcActionAt: number | null
    lastNoteAt: number | null
    lastFindingAt: number | null
    lastInjectionAt: number | null
    lastSessionAt: number | null
    lastAgentEventAt: number | null
    lastEventAt: number | null
  },
  counts: {
    cyclesLast24h: number
    findingsOpen: number              // status ∈ detected/devin_running/pr_open/verifying
    gcLast24h: number
    injectionsLast24h: number
    injectionsAcceptedLast24h: number
  }
}
```

---

## Atomicity guarantees

These compound HTTP endpoints are now **single-transaction**:

- `POST /sync/note` → `notes.upsertNoteWithEdges` (note + files + edges)
- `POST /sync/injection` → `injections.recordWithBump` (injection + note injectCount)
- `POST /sync/gc` → `gc.recordWithMaybeInvalidate` (gcAction + note invalidatedAt)
- `POST /sync/agent-event` → `agentEvents.appendWithSessionTouch` (event + session upsert/bump)

A crash mid-handler will not leave inconsistent state on these paths.

---

## Scheduled jobs (`convex/crons.ts`)

Pure data hygiene. Independent of the agent runtimes in `agent/`.

| Job | Cadence | Effect |
|---|---|---|
| `prune-old-events` | daily 04:00 UTC | deletes `events` rows older than 30d (max 5000/run) |
| `prune-old-agent-events` | daily 04:30 UTC | deletes `agentEvents` rows older than 14d (max 5000/run) |
| `prune-old-injections` | daily 05:00 UTC | deletes `injections` rows older than 30d (max 5000/run) |

The cutoff is computed inside each prune mutation at fire time — not
captured from cron args at deploy time — so the window slides
correctly day-to-day.

---

## Indexes that consumers can rely on

- `cycles.by_cycle_number`
- `findings.by_fingerprint`, `findings.by_status`, `findings.by_cycle_detected`
- `devinRuns.by_finding`, `devinRuns.by_devin_run_id`
- `notes.by_note_id`, `notes.by_active_importance`, `notes.by_created_from_session`
- `noteFiles.by_note`, `noteFiles.by_path`, `noteFiles.by_note_path` (compound — use this for `(noteId, path)` point lookups)
- `injections.by_ts`, `injections.by_note`, `injections.by_path_ts`, `injections.by_agent`
- `gcActions.by_ts`
- `agentEvents.by_session_ts`, `agentEvents.by_ts`
- `events.by_timestamp`, `events.by_cycle_timestamp`
- `docsIngestRuns.by_run_id`, `docsIngestRuns.by_leaf_path`
- `sessions.by_session`
- `users.by_user_id`, `agents.by_agent_id`
- `libraries.by_name`
- `hurdles.by_hurdle_id`, `hurdles.by_session`, `hurdles.by_created`
- `fileScanHistory.by_path`
