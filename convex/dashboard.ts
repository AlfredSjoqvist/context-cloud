// Bundled query the mock dashboard subscribes to. One round-trip pulls
// everything the 6 views need, then the client filters/derives locally.
//
// Compared to the per-view queries used by dashboard/app/page.tsx, this is
// over-fetching on purpose — the mock has rich client-side state machines
// (matrix similarity, replay event timeline, animation transitions) that
// expect the full snapshot up-front.

import { query } from "./_generated/server";

export const everything = query({
    args: {},
    handler: async (ctx) => {
        const [
            users, agents, files, notes, noteFiles, prunedEdges,
            injections, gcRuns, gcActions,
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
        ]);
        return {
            users, agents, files, notes, noteFiles, prunedEdges,
            injections, gcRuns, gcActions,
        };
    },
});
