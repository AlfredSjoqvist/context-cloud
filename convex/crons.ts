// Convex-side scheduled jobs. Independent of the agent runtimes in
// `agent/` — that's where the Guardian / GC / Note Manager loops live
// (driven by Tensorlake or the local `npm run agent` daemon). Anything
// here is pure Convex data hygiene that doesn't need to know about
// agent state.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Prune events older than 30 days. Guardian + agent runtime write ~5
// events per cycle; at a 60s cadence that's ~7,200 events/day. Without
// pruning the events table grows unbounded and dashboard/everything's
// take(200) on recent events becomes the only thing keeping the
// payload size reasonable. The actual table still bloats Convex
// storage.
//
// Runs daily at 04:00 UTC (low-traffic window). Bounded delete batch
// per invocation so the mutation never times out — if there's a
// massive backlog the cron will catch up over multiple days.
crons.daily(
    "prune-old-events",
    { hourUTC: 4, minuteUTC: 0 },
    internal.events.pruneOlderThan,
    {
        retentionDays: 30,
        maxDelete: 5000,
    },
);

export default crons;
