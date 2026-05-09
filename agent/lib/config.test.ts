import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const baseEnv = {
  NIA_API_KEY: "k",
  NIA_MCP_URL: "https://nia.example/mcp",
  CONVEX_URL: "https://convex.example",
  GUARDIAN_CYCLE_INTERVAL_S: "60",
  GUARDIAN_PRIORITY_BUDGET: "3",
  GUARDIAN_JUDGMENT_BUDGET: "1",
  USE_MOCK_LLM: "0",
  USE_MOCK_DEVIN: "0",
  SKIP_NIA: "0",
};

describe("loadConfig", () => {
  it("parses valid env into typed config", () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.cycleIntervalSeconds).toBe(60);
    expect(cfg.priorityBudget).toBe(3);
    expect(cfg.judgmentBudget).toBe(1);
    expect(cfg.skipNia).toBe(false);
  });

  it("throws when a required key is missing", () => {
    const env = { ...baseEnv, CONVEX_URL: undefined } as Record<string, string | undefined>;
    expect(() => loadConfig(env)).toThrow();
  });

  it("treats SKIP_NIA=1 as true", () => {
    const cfg = loadConfig({ ...baseEnv, SKIP_NIA: "1" });
    expect(cfg.skipNia).toBe(true);
  });
});
