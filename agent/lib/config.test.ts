import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const baseEnv = {
  NIA_API_KEY: "k",
  NIA_MCP_URL: "https://nia.example/mcp",
  CONVEX_URL: "https://convex.example",
  OPENAI_API_KEY: "sk-test",
  OPENAI_MODEL: "gpt-5",
  OPENAI_CRITIQUE_MODEL: "gpt-5-mini",
  GITHUB_TOKEN: "ghp_test",
  GITHUB_OWNER: "alice",
  GITHUB_REPO: "demo",
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

  it("permits empty NIA fields when SKIP_NIA=1", () => {
    const cfg = loadConfig({
      ...baseEnv,
      SKIP_NIA: "1",
      NIA_API_KEY: "",
      NIA_MCP_URL: "",
    });
    expect(cfg.skipNia).toBe(true);
  });

  it("requires NIA_API_KEY when SKIP_NIA=0", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        SKIP_NIA: "0",
        NIA_API_KEY: "",
      }),
    ).toThrow();
  });

  it("requires OPENAI_API_KEY when USE_MOCK_LLM=0", () => {
    expect(() => loadConfig({ ...baseEnv, OPENAI_API_KEY: "" })).toThrow();
  });

  it("permits empty OPENAI_API_KEY when USE_MOCK_LLM=1", () => {
    const cfg = loadConfig({ ...baseEnv, USE_MOCK_LLM: "1", OPENAI_API_KEY: "" });
    expect(cfg.useMockLlm).toBe(true);
  });

  it("requires GITHUB_TOKEN regardless of mock flags", () => {
    expect(() =>
      loadConfig({ ...baseEnv, USE_MOCK_LLM: "1", GITHUB_TOKEN: "" }),
    ).toThrow();
  });
});
