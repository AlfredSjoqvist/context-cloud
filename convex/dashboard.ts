// Bundled query the mock dashboard subscribes to. One round-trip pulls
// everything the 6 views need, then the client filters/derives locally.
//
// Compared to the per-view queries used by dashboard/app/page.tsx, this is
// over-fetching on purpose — the mock has rich client-side state machines
// (matrix similarity, replay event timeline, animation transitions) that
// expect the full snapshot up-front.

import { internalQuery, query } from "./_generated/server";

export const everything = internalQuery({
    args: {},
    handler: async (ctx) => {
        const [
            users, agents, files, notes, noteFiles, prunedEdges,
            injections, gcRuns, gcActions,
            cycles, findings, devinRuns, guardianEvents, docsIngestRuns,
            sessions, agentEvents, libraries,
        ] = await Promise.all([
            ctx.db.query("users").collect(),
            ctx.db.query("agents").collect(),
            // files / noteFiles are bounded by the codebase size in
            // practice (one row per indexed file path), but cap defensively
            // to avoid runaway payloads if the agent ever scans a giant
            // monorepo into a single Convex deployment.
            ctx.db.query("files").take(2000),
            // notes accumulate forever (GC stamps invalidatedAt rather than
            // deleting). Cap to the latest 2000 so payload stays bounded;
            // V2 dashboard only renders the active slice anyway.
            ctx.db.query("notes").order("desc").take(2000),
            ctx.db.query("noteFiles").take(5000),
            // Capped at 500 — prunedEdges grows monotonically once GC is
            // firing and the Replay timeline only needs the recent slice.
            ctx.db.query("prunedEdges").withIndex("by_pruned_at").order("desc").take(500),
            ctx.db.query("injections").order("desc").take(500),
            ctx.db.query("gcRuns").order("desc").take(50),
            ctx.db.query("gcActions").order("desc").take(200),
            // Guardian + docs-ingest halves
            ctx.db.query("cycles").order("desc").take(50),
            // findings accumulate as Guardian sweeps cycles. Cap at 2000 —
            // older closed/verified findings can be queried via findings:detail.
            ctx.db.query("findings").order("desc").take(2000),
            ctx.db.query("devinRuns").order("desc").take(100),
            ctx.db.query("events").order("desc").take(200),
            // one row per docs leaf; bounded by codebase size but cap to
            // keep the payload from blowing up if a huge corpus is ingested.
            ctx.db.query("docsIngestRuns").order("desc").take(1000),
            // Live trace from hosted MCP
            ctx.db.query("sessions").order("desc").take(50),
            ctx.db.query("agentEvents").withIndex("by_ts").order("desc").take(100),
            ctx.db.query("libraries").collect(),
        ]);
        // Project lastIngestedAt onto docsIngestRuns rows from _creationTime.
        // The schema doesn't store a separate ingestion timestamp on this
        // table (one row per emitted leaf, immutable), and mock/v2.js sorts
        // and counts these rows by `lastIngestedAt`. Aliasing here avoids a
        // schema migration + backfill.
        const docsIngestRunsWithTs = docsIngestRuns.map((r) => ({
            ...r,
            lastIngestedAt: r._creationTime,
        }));
        return {
            users, agents, files, notes, noteFiles, prunedEdges,
            injections, gcRuns, gcActions,
            cycles, findings, devinRuns, guardianEvents,
            // V2 canonical name (matches schema table name). Each row carries
            // lastIngestedAt projected from _creationTime so the V2 dashboard
            // can sort and age-tag without further computation.
            docsIngestRuns: docsIngestRunsWithTs,
            // V1 alias — kept for backward compat with mock/index.html. Will be
            // removed once V1 is decommissioned. See WORKLOG-backend.md.
            docsLeaves: docsIngestRunsWithTs,
            libraries,
            sessions, agentEvents,
        };
    },
});

// Lightweight system-health snapshot. Returns the freshness of each major
// data stream so a status badge can render without pulling the full
// /dashboard/everything payload. Used by both the V2 dashboard's "live"
// indicator and by external monitoring.
//
// Public so it can be called over HTTP without auth; surfaces zero PII
// and zero internal IDs — just counts and ISO/epoch timestamps.
export const health = query({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();

        // Latest row per stream. Use indexes / order to avoid full scans
        // where we have the option.
        const [
            latestCycle, latestGcAction, latestNote, latestFinding,
            latestInjection, latestSession, latestAgentEvent, latestEvent,
            cycles, findings, gcActions, injections,
        ] = await Promise.all([
            ctx.db.query("cycles").withIndex("by_cycle_number").order("desc").first(),
            ctx.db.query("gcActions").withIndex("by_ts").order("desc").first(),
            ctx.db.query("notes").order("desc").first(),
            ctx.db.query("findings").order("desc").first(),
            ctx.db.query("injections").withIndex("by_ts").order("desc").first(),
            ctx.db.query("sessions").order("desc").first(),
            ctx.db.query("agentEvents").withIndex("by_ts").order("desc").first(),
            ctx.db.query("events").withIndex("by_timestamp").order("desc").first(),
            // counts for the 24h windows the V2 Overview wants
            ctx.db.query("cycles").collect(),
            ctx.db.query("findings").collect(),
            ctx.db.query("gcActions").withIndex("by_ts").order("desc").take(500),
            ctx.db.query("injections").withIndex("by_ts").order("desc").take(500),
        ]);

        const dayAgo = now - 86_400_000;
        const cyclesLast24h = cycles.filter(
            (c) => (c.startedAt ?? 0) > dayAgo,
        ).length;
        const findingsOpen = findings.filter((f) =>
            ["detected", "devin_running", "pr_open", "verifying"].includes(f.status),
        ).length;
        const gcLast24h = gcActions.filter((g) => {
            const t = Date.parse(g.ts);
            return Number.isFinite(t) && t > dayAgo;
        }).length;
        const injectionsLast24h = injections.filter((i) => {
            const t = Date.parse(i.ts);
            return Number.isFinite(t) && t > dayAgo;
        });
        const injectionsAcceptedLast24h = injectionsLast24h.filter(
            (i) => i.accepted,
        ).length;

        return {
            asOf: now,
            // Per-stream freshness (epoch ms). null = no rows in that stream.
            // Frontend can compute "X minutes ago" from these.
            freshness: {
                lastCycleAt: latestCycle?.startedAt ?? null,
                lastCycleNumber: latestCycle?.cycleNumber ?? null,
                lastGcActionAt: latestGcAction
                    ? Date.parse(latestGcAction.ts) || latestGcAction._creationTime
                    : null,
                lastNoteAt: latestNote
                    ? Date.parse(latestNote.createdAt) || latestNote._creationTime
                    : null,
                lastFindingAt: latestFinding?._creationTime ?? null,
                lastInjectionAt: latestInjection
                    ? Date.parse(latestInjection.ts) || latestInjection._creationTime
                    : null,
                lastSessionAt: latestSession
                    ? (latestSession.lastSeenAt
                        ? Date.parse(latestSession.lastSeenAt)
                        : latestSession._creationTime)
                    : null,
                lastAgentEventAt: latestAgentEvent
                    ? Date.parse(latestAgentEvent.ts) || latestAgentEvent._creationTime
                    : null,
                lastEventAt: latestEvent?.timestamp ?? null,
            },
            counts: {
                cyclesLast24h,
                findingsOpen,
                gcLast24h,
                injectionsLast24h: injectionsLast24h.length,
                injectionsAcceptedLast24h,
            },
        };
    },
});
