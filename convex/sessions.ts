import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const upsertSession = internalMutation({
    args: {
        sessionId: v.string(),
        agentVendor: v.optional(v.string()),
        cwd: v.optional(v.string()),
        projectRoot: v.optional(v.string()),
        startedAt: v.optional(v.string()),
        lastSeenAt: v.optional(v.string()),
        messageCount: v.optional(v.number()),
    },
    handler: async (ctx, a) => {
        const existing = await ctx.db
            .query("sessions")
            .withIndex("by_session", (q) => q.eq("sessionId", a.sessionId))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, {
                lastSeenAt: a.lastSeenAt ?? existing.lastSeenAt,
                messageCount: a.messageCount ?? existing.messageCount,
            });
            return existing._id;
        }
        return await ctx.db.insert("sessions", a);
    },
});

export const recent = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
        return await ctx.db.query("sessions").order("desc").take(limit ?? 20);
    },
});

// Sessions tab in mock/index.html (and the public dashboard) reads from this.
// Returns sessions newest-first by lastSeenAt (falling back to _creationTime
// when lastSeenAt is missing), each with the notes that were created during it
// and the file paths each note attaches to.
export const listWithNotes = internalQuery({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
        const sessions = await ctx.db.query("sessions").collect();
        sessions.sort((a, b) => {
            const ats = a.lastSeenAt ?? new Date(a._creationTime).toISOString();
            const bts = b.lastSeenAt ?? new Date(b._creationTime).toISOString();
            // string ISO timestamps sort lexically when in same TZ format
            if (ats === bts) return b._creationTime - a._creationTime;
            return ats < bts ? 1 : -1;
        });
        const trimmed = sessions.slice(0, limit ?? 50);

        const out = [];
        for (const s of trimmed) {
            const notes = await ctx.db
                .query("notes")
                .filter((q) => q.eq(q.field("createdFromSession"), s.sessionId))
                .collect();
            // Newest-first within a session.
            notes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

            const notesWithFiles = await Promise.all(
                notes.map(async (n) => {
                    const edges = await ctx.db
                        .query("noteFiles")
                        .withIndex("by_note", (q) => q.eq("noteId", n.noteId))
                        .collect();
                    edges.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
                    return {
                        noteId: n.noteId,
                        symptom: n.symptom,
                        rootCause: n.rootCause,
                        correction: n.correction ?? null,
                        importance: n.importance ?? 0,
                        injectCount: n.injectCount ?? 0,
                        lastInjectedAt: n.lastInjectedAt ?? null,
                        invalidatedAt: n.invalidatedAt ?? null,
                        createdAt: n.createdAt,
                        createdFromHurdle: n.createdFromHurdle ?? null,
                        files: edges.map((e) => ({ path: e.path, weight: e.weight })),
                    };
                }),
            );

            out.push({
                sessionId: s.sessionId,
                agentVendor: s.agentVendor ?? null,
                cwd: s.cwd ?? null,
                projectRoot: s.projectRoot ?? null,
                startedAt: s.startedAt ?? null,
                lastSeenAt: s.lastSeenAt ?? null,
                messageCount: s.messageCount ?? 0,
                lastExtractedAt: (s as any).lastExtractedAt ?? null,
                noteCount: notesWithFiles.length,
                notes: notesWithFiles,
            });
        }
        return {
            asOf: new Date().toISOString(),
            sessions: out,
            totals: {
                sessions: out.length,
                notes: out.reduce((acc, s) => acc + s.noteCount, 0),
            },
        };
    },
});
