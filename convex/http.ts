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
import { api, internal } from "./_generated/api";

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

// CORS-enabled, no-auth wrapper for read-only public dashboard endpoints.
// The deployed dashboard at hindsight-nm.vercel.app calls these from the
// browser; gating them with NM_SYNC_TOKEN would mean leaking the secret in
// client JS. These return only public-shape data (no secrets, no PII).
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
};
function jsonPublic(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json", ...CORS_HEADERS },
    });
}
const wrapPublicGet = (fn: (ctx: any, url: URL) => Promise<unknown>) =>
    httpAction(async (ctx, req) => {
        if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
        try {
            const result = await fn(ctx, new URL(req.url));
            return jsonPublic(result);
        } catch (e: any) {
            return jsonPublic({ error: String(e?.message ?? e) }, 500);
        }
    });

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
        // Single atomic mutation: writes note + every file/edge in one Convex
        // transaction so partial-failure can't leave inconsistent state.
        const id = await ctx.runMutation(internal.notes.upsertNoteWithEdges, {
            note: body.note,
            edges: body.edges ?? [],
        });
        return { id };
    }),
});

http.route({
    path: "/sync/injection",
    method: "POST",
    handler: wrap(async (ctx, body) => {
        // Single atomic mutation: record the injection and, if it was
        // accepted against a known note, bump that note's injectCount and
        // lastInjectedAt in the same Convex transaction.
        const id = await ctx.runMutation(internal.injections.recordWithBump, body);
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
        // Single atomic mutation: record the GC action and, if the action
        // is a terminal one for the note (prune/invalidate), set the
        // note's invalidatedAt in the same Convex transaction.
        const id = await ctx.runMutation(internal.gc.recordWithMaybeInvalidate, body);
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
    path: "/sync/agent-event",
    method: "POST",
    handler: wrap(async (ctx, body) => {
        // Atomic event insert + session upsert (or messageCount bump).
        // Optional fields agentVendor/cwd/projectRoot only populate the
        // session row on first-touch — repeat sends never overwrite them.
        const id = await ctx.runMutation(internal.agentEvents.appendWithSessionTouch, body);
        return { id };
    }),
});

http.route({
    path: "/sync/mark-extracted",
    method: "POST",
    handler: wrap(async (ctx, body) => {
        const id = await ctx.runMutation(internal.agentEvents.markExtracted, body);
        return { id };
    }),
});

http.route({
    path: "/sync/hyperspell-refs",
    method: "POST",
    handler: wrap(async (ctx, body) => {
        const id = await ctx.runMutation(internal.notes.attachHyperspellRefs, body);
        return { id };
    }),
});

// ---- public dashboard reads (CORS-enabled, no auth) ----

http.route({
    path: "/dashboard/sessions-with-notes",
    method: "GET",
    handler: wrapPublicGet(async (ctx, url) => {
        const limit = Number(url.searchParams.get("limit") || 50);
        return await ctx.runQuery(internal.sessions.listWithNotes, { limit });
    }),
});
http.route({
    path: "/dashboard/sessions-with-notes",
    method: "OPTIONS",
    handler: wrapPublicGet(async () => ({ ok: true })),
});

// Bundled snapshot — powers Sessions tab (notes + injections per session)
// AND Agents tab (users + agents + per-agent injection stats). One round
// trip, client-side derives both views.
http.route({
    path: "/dashboard/everything",
    method: "GET",
    handler: wrapPublicGet(async (ctx) => {
        return await ctx.runQuery(internal.dashboard.everything, {});
    }),
});
http.route({
    path: "/dashboard/everything",
    method: "OPTIONS",
    handler: wrapPublicGet(async () => ({ ok: true })),
});

// Lightweight liveness probe. Returns { ok: true, ts } regardless of
// Convex state. Use this for uptime monitors.
http.route({
    path: "/health",
    method: "GET",
    handler: httpAction(async () => ok({ ok: true, ts: new Date().toISOString() })),
});

// Detailed system-health snapshot: per-stream freshness timestamps and
// 24h counts. Public + CORS-enabled so the V2 dashboard can render a
// "live · X minutes ago" indicator without hitting /dashboard/everything.
http.route({
    path: "/dashboard/health",
    method: "GET",
    handler: wrapPublicGet(async (ctx) => {
        return await ctx.runQuery(api.dashboard.health, {});
    }),
});
http.route({
    path: "/dashboard/health",
    method: "OPTIONS",
    handler: wrapPublicGet(async () => ({ ok: true })),
});

export default http;
