import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Writers below are called server-side only from convex/http.ts (after
// NM_SYNC_TOKEN auth) and from agent/. They must NOT be exposed publicly.
export const upsertNote = internalMutation({
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
        createdBy: v.optional(v.string()),
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

export const upsertEdge = internalMutation({
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

export const upsertFile = internalMutation({
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

export const invalidateNote = internalMutation({
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

export const bumpInjectCount = internalMutation({
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

// Hyperspell supporting context. Best-effort enrichment — never blocks
// note creation, never overrides the symptom/cause/correction.
export const attachHyperspellRefs = internalMutation({
    args: {
        noteId: v.string(),
        refs: v.array(v.object({
            source: v.string(),
            title: v.string(),
            url: v.string(),
            snippet: v.optional(v.string()),
            ts: v.optional(v.string()),
            author: v.optional(v.string()),
        })),
        enrichedAt: v.string(),
    },
    handler: async (ctx, a) => {
        const n = await ctx.db
            .query("notes")
            .withIndex("by_note_id", (q) => q.eq("noteId", a.noteId))
            .first();
        if (!n) return null;
        await ctx.db.patch(n._id, {
            hyperspellRefs: a.refs.slice(0, 5),
            hyperspellEnrichedAt: a.enrichedAt,
        });
        return n._id;
    },
});

// Combined upsert: writes a note plus its edges (file + noteFiles rows) in
// a single mutation transaction. /sync/note used to call three separate
// internal mutations in a loop — each was its own transaction, so a crash
// between calls could leave a note without its edges or vice versa. This
// keeps the public POST endpoint idempotent AND atomic.
export const upsertNoteWithEdges = internalMutation({
    args: {
        note: v.object({
            noteId: v.string(),
            symptom: v.string(),
            rootCause: v.string(),
            correction: v.optional(v.string()),
            importance: v.number(),
            injectCount: v.optional(v.number()),
            lastInjectedAt: v.optional(v.string()),
            invalidatedAt: v.optional(v.string()),
            createdAt: v.string(),
            createdBy: v.optional(v.string()),
            createdFromSession: v.optional(v.string()),
            createdFromHurdle: v.optional(v.number()),
        }),
        edges: v.optional(v.array(v.object({
            path: v.string(),
            type: v.optional(v.string()),
            weight: v.optional(v.number()),
            firstSeen: v.optional(v.string()),
            lastSeen: v.optional(v.string()),
        }))),
    },
    handler: async (ctx, a) => {
        // ---- note ----
        const existingNote = await ctx.db
            .query("notes")
            .withIndex("by_note_id", (q) => q.eq("noteId", a.note.noteId))
            .first();
        const noteFields = { ...a.note, injectCount: a.note.injectCount ?? 0 };
        let noteRowId;
        if (existingNote) {
            await ctx.db.patch(existingNote._id, noteFields);
            noteRowId = existingNote._id;
        } else {
            noteRowId = await ctx.db.insert("notes", noteFields);
        }

        // ---- edges (files + noteFiles) ----
        for (const e of a.edges ?? []) {
            // file
            const existingFile = await ctx.db
                .query("files")
                .withIndex("by_path", (q) => q.eq("path", e.path))
                .first();
            const firstSeen = e.firstSeen ?? a.note.createdAt;
            const lastSeen = e.lastSeen ?? a.note.createdAt;
            if (existingFile) {
                await ctx.db.patch(existingFile._id, { lastSeen });
            } else {
                await ctx.db.insert("files", {
                    path: e.path, type: e.type, firstSeen, lastSeen,
                });
            }

            // noteFiles edge
            const existingEdge = await ctx.db
                .query("noteFiles")
                .withIndex("by_note", (q) => q.eq("noteId", a.note.noteId))
                .filter((q) => q.eq(q.field("path"), e.path))
                .first();
            const weight = e.weight ?? 1.0;
            if (existingEdge) {
                await ctx.db.patch(existingEdge._id, { weight });
            } else {
                await ctx.db.insert("noteFiles", {
                    noteId: a.note.noteId, path: e.path, weight,
                });
            }
        }

        return noteRowId;
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

// Single-note drill-down: note row + its file edges + recent injections
// that referenced it. Lets the Notes detail panel render in one
// round-trip instead of three.
export const detail = query({
    args: {
        noteId: v.string(),
        injectionsLimit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const note = await ctx.db
            .query("notes")
            .withIndex("by_note_id", (q) => q.eq("noteId", args.noteId))
            .first();
        if (!note) return null;
        const [edges, injections] = await Promise.all([
            ctx.db
                .query("noteFiles")
                .withIndex("by_note", (q) => q.eq("noteId", args.noteId))
                .collect(),
            ctx.db
                .query("injections")
                .withIndex("by_note", (q) => q.eq("noteId", args.noteId))
                .order("desc")
                .take(args.injectionsLimit ?? 50),
        ]);
        edges.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
        return { note, edges, injections };
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
