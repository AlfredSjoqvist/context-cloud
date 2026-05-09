# NM Dashboard (Next.js → Vercel)

Live dashboard reading from the Convex deployment. Replaces `nm_dashboard.py` for the public submission URL.

## Local dev

```bash
cd dashboard
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_CONVEX_URL to the Convex .convex.cloud URL (NOT .convex.site).
npm run dev
```

The dashboard imports `../convex/_generated/api` so it shares the schema/types from the root Convex directory. Run `npx convex dev` from the project root once first to generate that.

## Deploy to Vercel

```bash
# from the project root
npx vercel --cwd dashboard
# pick the Next.js framework preset; set env var NEXT_PUBLIC_CONVEX_URL to your Convex deployment.
```

Or push to GitHub, connect the dashboard subdirectory in Vercel's project settings, and Vercel deploys on push.

## What it shows

Three live-reactive sections (Convex `useQuery` hooks, no polling):

- **Active notes** — every note in the graph that hasn't been invalidated; importance + inject count visible.
- **Live activity** — recent injections (the inject hook fires; row appears here in real time), recent GC actions (decay / merge / prune from the Tensorlake-scheduled GC), recent sessions (one row per Claude Code session NM has captured).
- **Metrics header** — counts for the rubric stat callouts (e.g. "47 injections in last 15 min").
