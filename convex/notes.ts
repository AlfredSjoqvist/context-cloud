import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertNote = mutation({
    args: {
        noteId: v.string(),
        symptom: v.string(),
        rootCause: v.string(),
        correction: v.optional(v.string()),
        importance: v.number(),
        injectCount: v.optional(v.number()),
        lastInjectedAt: v.optional(v.string()),
        invalidatedAt: v.optional(v.string()),
        createdAt: v.string(),
        createdFromSession: v.optional(v.string()),
        createdFromHurdle: v.optional(v.number()),
    },
    handler: async (ctx, a) => {
        const existing = await ctx.db
            .query("notes")
            .withIndex("by_note_id", (q) => q.eq("noteId", a.noteId))
            .first();
        const fields = {
            ...a,
            injectCount: a.injectCount ?? 0,
        };
        if (existing) {
            await ctx.db.patch(existing._id, fields);
            return existing._id;
        }
        return await ctx.db.insert("notes", fields);
    },
});

export const upsertEdge = mutation({
    args: {
        noteId: v.string(),
        path: v.string(),
        weight: v.number(),
    },
    handler: async (ctx, a) => {
        const existing = await ctx.db
            .query("noteFiles")
            .withIndex("by_note", (q) => q.eq("noteId", a.noteId))
            .filter((q) => q.eq(q.field("path"), a.path))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, { weight: a.weight });
            return existing._id;
        }
        return await ctx.db.insert("noteFiles", a);
    },
});

export const upsertFile = mutation({
    args: {
        path: v.string(),
        type: v.optional(v.string()),
        firstSeen: v.string(),
        lastSeen: v.string(),
    },
    handler: async (ctx, a) => {
        const existing = await ctx.db
            .query("files")
            .withIndex("by_path", (q) => q.eq("path", a.path))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, { lastSeen: a.lastSeen });
            return existing._id;
        }
        return await ctx.db.insert("files", a);
    },
});

export const invalidateNote = mutation({
    args: { noteId: v.string(), at: v.string() },
    handler: async (ctx, a) => {
        const n = await ctx.db
            .query("notes")
            .withIndex("by_note_id", (q) => q.eq("noteId", a.noteId))
            .first();
        if (!n) return null;
        await ctx.db.patch(n._id, { invalidatedAt: a.at });
        return n._id;
    },
});

export const bumpInjectCount = mutation({
    args: { noteId: v.string(), at: v.string() },
    handler: async (ctx, a) => {
        const n = await ctx.db
            .query("notes")
            .withIndex("by_note_id", (q) => q.eq("noteId", a.noteId))
            .first();
        if (!n) return null;
        await ctx.db.patch(n._id, {
            injectCount: (n.injectCount ?? 0) + 1,
            lastInjectedAt: a.at,
        });
        return n._id;
    },
});

// ---- queries (the dashboard reads these reactively) ----

export const listActive = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }) => {
        const rows = await ctx.db
            .query("notes")
            .filter((q) => q.eq(q.field("invalidatedAt"), undefined))
            .order("desc")
            .take(limit ?? 100);
        return rows;
    },
});

export const listEdgesForNote = query({
    args: { noteId: v.string() },
    handler: async (ctx, { noteId }) => {
        return await ctx.db
            .query("noteFiles")
            .withIndex("by_note", (q) => q.eq("noteId", noteId))
            .collect();
    },
});

export const listEdgesForPath = query({
    args: { path: v.string() },
    handler: async (ctx, { path }) => {
        return await ctx.db
            .query("noteFiles")
            .withIndex("by_path", (q) => q.eq("path", path))
            .collect();
    },
});

export const listFiles = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("files").collect();
    },
});

export const graphSnapshot = query({
    args: {},
    handler: async (ctx) => {
        const [notes, files, edges] = await Promise.all([
            ctx.db.query("notes").collect(),
            ctx.db.query("files").collect(),
            ctx.db.query("noteFiles").collect(),
        ]);
        return { notes, files, edges };
    },
});
