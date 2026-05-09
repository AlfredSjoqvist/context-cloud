import type { Finding } from "./types.js";

const PLANTED: Record<string, Finding[]> = {
  "src/routes/login.ts": [
    {
      path: "src/routes/login.ts",
      severity: "high",
      category: "intent_drift",
      codeCite: {
        line: 1,
        excerpt: 'router.post("/login", handler)',
      },
      constraintCite: {
        mdFile: ".context-map/leaves/login-constraints.md",
        line: 1,
        text: "All authentication endpoints MUST verify CSRF token via the `requireCsrfToken` middleware.",
      },
      reasoning:
        "The login route is mounted without the `requireCsrfToken` middleware that the constraint requires.",
      suggestedFixDirection:
        "Insert `requireCsrfToken` between the router and the handler in the route definition.",
    },
  ],
  "src/routes/sessions.ts": [
    {
      path: "src/routes/sessions.ts",
      severity: "high",
      category: "intent_drift",
      codeCite: {
        line: 1,
        excerpt: "expiresAt = createdAt + ONE_DAY_MS",
      },
      constraintCite: {
        mdFile: ".context-map/leaves/sessions-constraints.md",
        line: 1,
        text: "Sessions MUST expire after 24 hours of INACTIVITY (sliding TTL).",
      },
      reasoning:
        "Session expiry is set to a fixed offset from createdAt rather than refreshed on every authenticated request.",
      suggestedFixDirection:
        "Replace absolute-time expiry with a sliding TTL that updates on each authenticated request.",
    },
  ],
};

export async function mockAnalyzeFile(path: string): Promise<Finding[]> {
  return PLANTED[path] ?? [];
}
