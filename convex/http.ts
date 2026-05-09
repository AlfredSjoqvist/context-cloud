// HTTP actions for server-to-server sync from Python (`nm_convex.py`).
//
// Convex's first-class clients are JS/TS. To let Python (the inline hooks +
// nm_extract pipeline) push writes, we expose a small set of HTTP endpoints
// that wrap the typed mutations. Each endpoint accepts a JSON body matching
// the mutation args.
//
// Auth: header X-NM-TOKEN must equal the env var NM_SYNC_TOKEN. Set this
// before deploying. For local dev, leave both unset to disable the check.

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function authed(req: Request): boolean {
    const expected = process.env.NM_SYNC_TOKEN;
    if (!expected) return true; // dev / no-auth mode
    return req.headers.get("X-NM-TOKEN") === expected;
}

async function bodyJson(req: Request): Promise<any> {
    try { return await req.json(); } catch { return {}; }
}

function ok(payload: unknown = { ok: true }): Response {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

function bad(status: number, msg: string): Response {
    return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const wrap = (fn: (ctx: any, body: any) => Promise<unknown>) =>
    httpAction(async (ctx, req) => {
        if (!authed(req)) return bad(401, "unauthorized");
        const body = await bodyJson(req);
        try {
            const result = await fn(ctx, body);
            return ok({ ok: true, result });
        } catch (e: any) {
            return bad(500, String(e?.message ?? e));
        }
    });

// ---- routes ----

http.route({
    path: "/sync/note",
    method: "POST",
    handler: wrap(async (ctx, body) => {
        const id = await ctx.runMutation(internal.notes.upsertNote, body.note);
        const edges = body.edges ?? [];
        for (const e of edges) {
            await ctx.runMutation(internal.notes.upsertFile, {
                path: e.path, type: e.type, firstSeen: e.firstSeen ?? body.note.createdAt,
                lastSeen: e.lastSeen ?? body.note.createdAt,
            });
            await ctx.runMutation(internal.notes.upsertEdge, {
                noteId: body.note.noteId, path: e.path, weight: e.weight ?? 1.0,
            });
        }
        return { id };
    }),
});

http.route({
    path: "/sync/injection",
    method: "POST",
    handler: wrap(async (ctx, body) => {
        const id = await ctx.runMutation(internal.injections.recordInjection, body);
        if (body.noteId && body.accepted) {
            await ctx.runMutation(internal.notes.bumpInjectCount, {
                noteId: body.noteId, at: body.ts,
            });
        }
        return { id };
    }),
});

http.route({
    path: "/sync/hurdle",
    method: "POST",
    handler: wrap(async (ctx, body) => {
        const id = await ctx.runMutation(internal.hurdles.recordHurdle, body);
        return { id };
    }),
});

http.route({
    path: "/sync/gc",
    method: "POST",
    handler: wrap(async (ctx, body) => {
        const id = await ctx.runMutation(internal.gc.recordAction, body);
        if (body.action === "prune" && body.noteId) {
            await ctx.runMutation(internal.notes.invalidateNote, {
                noteId: body.noteId, at: body.ts,
            });
        }
        return { id };
    }),
});

http.route({
    path: "/sync/session",
    method: "POST",
    handler: wrap(async (ctx, body) => {
        const id = await ctx.runMutation(internal.sessions.upsertSession, body);
        return { id };
    }),
});

http.route({
    path: "/health",
    method: "GET",
    handler: httpAction(async () => ok({ ok: true, ts: new Date().toISOString() })),
});

export default http;
