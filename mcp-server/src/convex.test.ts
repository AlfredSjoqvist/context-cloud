import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConvexUrl } from "./convex.js";

const ENV_KEYS = ["HINDSIGHT_CONVEX_URL", "CONVEX_URL"] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveConvexUrl", () => {
  it("prefers HINDSIGHT_CONVEX_URL over CONVEX_URL", () => {
    process.env.HINDSIGHT_CONVEX_URL = "https://h.convex.cloud";
    process.env.CONVEX_URL = "https://c.convex.cloud";
    expect(resolveConvexUrl()).toEqual({ url: "https://h.convex.cloud", source: "HINDSIGHT_CONVEX_URL" });
  });

  it("falls back to CONVEX_URL when HINDSIGHT_CONVEX_URL is unset", () => {
    process.env.CONVEX_URL = "https://c.convex.cloud";
    expect(resolveConvexUrl()).toEqual({ url: "https://c.convex.cloud", source: "CONVEX_URL" });
  });

  it("falls back to the demo deployment with source='default' when nothing is set", () => {
    const r = resolveConvexUrl();
    expect(r.source).toBe("default");
    expect(r.url).toMatch(/\.convex\.cloud$/);
  });
});
