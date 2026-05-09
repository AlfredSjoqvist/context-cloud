import type { Finding } from "./types.js";

const PLANTED: Record<string, Finding[]> = {
  "src/routes/login.ts": [
    {
      path: "src/routes/login.ts",
      severity: "high",
      category: "intent_drift",
      codeCite: {
        line: 28,
        excerpt: "router.post('/', async (req, res) => {",
      },
      constraintCite: {
        mdFile: ".context-map/leaves/login-constraints.md",
        line: 3,
        text: "1. All authentication endpoints MUST verify the CSRF token via the `requireCsrfToken` middleware before processing the request body.",
      },
      reasoning:
        "The login POST route is mounted without the `requireCsrfToken` middleware that constraint #1 requires.",
      suggestedFixDirection:
        "Insert `requireCsrfToken` between the router and the handler: `router.post('/', requireCsrfToken, async (req, res) => { ... })`.",
    },
  ],
  "src/lib/db.ts": [
    {
      path: "src/lib/db.ts",
      severity: "high",
      category: "intent_drift",
      codeCite: {
        line: 93,
        excerpt: "expiresAt: now + SESSION_TTL_MS,",
      },
      constraintCite: {
        mdFile: ".context-map/leaves/sessions-constraints.md",
        line: 3,
        text: "1. Sessions MUST expire after 24 hours of inactivity using a sliding TTL — the expiry MUST be reset on every authenticated request that successfully passes `requireAuth`. Absolute-time expiry (computed once at session creation and never extended) is a violation. Refreshing the expiry only on login, only on `/sessions/me`, or only on a subset of authenticated requests is also a violation; the sliding refresh MUST happen on every authenticated request.",
      },
      reasoning:
        "Session `expiresAt` is computed once at creation as `now + SESSION_TTL_MS` and never extended. The constraint requires sliding TTL: every authenticated request must refresh the expiry.",
      suggestedFixDirection:
        "Add a `touch(token)` method on `sessions` that updates `expiresAt = Date.now() + SESSION_TTL_MS`, and call it from `requireAuth` middleware after a successful lookup.",
    },
  ],
};

export async function mockAnalyzeFile(path: string): Promise<Finding[]> {
  return PLANTED[path] ?? [];
}
