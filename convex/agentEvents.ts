// Hosted-MCP agent event log + helpers for the remote Note Manager.
//
// /sync/agent-event (in http.ts) writes through `append`. The remote
// nm_extract_remote.py poller calls `recentForSession` to pull events for
// hurdle detection, then `markExtracted` on the session to mark it
// processed up to a given timestamp.

import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const append = internalMutation({
    args: {
        ts: v.string(),
        sessionId: v.string(),
        installationId: v.optional(v.string()),
        kind: v.string(),
        text: v.optional(v.string()),
        toolName: v.optional(v.string()),
        filePath: v.optional(v.string()),
        isError: v.optional(v.boolean()),
        payload: v.optional(v.any()),
    },
    handler: async (ctx, a) => ctx.db.insert("agentEvents", a),
});

export const recentForSession = query({
    args: {
        sessionId: v.string(),
        limit: v.optional(v.number()),
        sinceTs: v.optional(v.string()),
    },
    handler: async (ctx, a) => {
        let q = ctx.db
            .query("agentEvents")
            .withIndex("by_session_ts", (q) => q.eq("sessionId", a.sessionId));
        if (a.sinceTs) {
            q = ctx.db
                .query("agentEvents")
                .withIndex("by_session_ts", (q) =>
                    q.eq("sessionId", a.sessionId).gt("ts", a.sinceTs!),
                );
        }
        return await q.take(a.limit ?? 500);
    },
});

export const sessionsToExtract = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, a) => {
        // Sessions whose lastSeenAt is newer than lastExtractedAt (or no
        // lastExtractedAt at all) — these are candidates for hurdle scans.
        const sessions = await ctx.db
            .query("sessions")
            .order("desc")
            .take(a.limit ?? 50);
        return sessions.filter((s) => {
            if (!s.lastSeenAt) return false;
            if (!s.lastExtractedAt) return true;
            return s.lastSeenAt > s.lastExtractedAt;
        });
    },
});

export const markExtracted = internalMutation({
    args: {
        sessionId: v.string(),
        atTs: v.string(),
        lastEventTs: v.optional(v.string()),
    },
    handler: async (ctx, a) => {
        const s = await ctx.db
            .query("sessions")
            .withIndex("by_session", (q) => q.eq("sessionId", a.sessionId))
            .first();
        if (!s) return null;
        await ctx.db.patch(s._id, {
            lastExtractedAt: a.atTs,
            lastExtractedEventTs: a.lastEventTs ?? s.lastExtractedEventTs,
        });
        return s._id;
    },
});

export const recent = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, a) => {
        return await ctx.db
            .query("agentEvents")
            .withIndex("by_ts")
            .order("desc")
            .take(a.limit ?? 100);
    },
});
