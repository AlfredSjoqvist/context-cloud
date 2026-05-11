// Bundled query the mock dashboard subscribes to. One round-trip pulls
// everything the 6 views need, then the client filters/derives locally.
//
// Compared to the per-view queries used by dashboard/app/page.tsx, this is
// over-fetching on purpose — the mock has rich client-side state machines
// (matrix similarity, replay event timeline, animation transitions) that
// expect the full snapshot up-front.

import { internalQuery } from "./_generated/server";

export const everything = internalQuery({
    args: {},
    handler: async (ctx) => {
        const [
            users, agents, files, notes, noteFiles, prunedEdges,
            injections, gcRuns, gcActions,
            cycles, findings, devinRuns, guardianEvents, docsIngestRuns,
            sessions, agentEvents,
        ] = await Promise.all([
            ctx.db.query("users").collect(),
            ctx.db.query("agents").collect(),
            ctx.db.query("files").collect(),
            ctx.db.query("notes").collect(),
            ctx.db.query("noteFiles").collect(),
            ctx.db.query("prunedEdges").collect(),
            ctx.db.query("injections").order("desc").take(500),
            ctx.db.query("gcRuns").order("desc").take(50),
            ctx.db.query("gcActions").order("desc").take(200),
            // Guardian + docs-ingest halves
            ctx.db.query("cycles").order("desc").take(50),
            ctx.db.query("findings").collect(),
            ctx.db.query("devinRuns").order("desc").take(100),
            ctx.db.query("events").order("desc").take(200),
            ctx.db.query("docsIngestRuns").collect(),
            // Live trace from hosted MCP
            ctx.db.query("sessions").order("desc").take(50),
            ctx.db.query("agentEvents").withIndex("by_ts").order("desc").take(100),
        ]);
        const libraries = await ctx.db.query("libraries").collect();
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
