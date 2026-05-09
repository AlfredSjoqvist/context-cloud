import { describe, it, expect, vi } from "vitest";
import { judgmentPicks } from "./judgment";

const CANDIDATES = [
  "src/routes/login.ts",
  "src/routes/payments.ts",
  "src/lib/db.ts",
  "package.json",
];

describe("judgmentPicks", () => {
  it("returns picks the LLM produced when they are valid candidates", async () => {
    const callLLM = vi.fn(async () => ({
      picks: [{ path: "src/routes/payments.ts", reason: "high churn last 7 days" }],
    }));
    const out = await judgmentPicks({
      cycleNumber: 12,
      candidates: CANDIDATES,
      alreadyPicked: ["src/routes/login.ts"],
      budget: 2,
      callLLM,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.path).toBe("src/routes/payments.ts");
  });

  it("filters picks not in the candidate pool", async () => {
    const callLLM = vi.fn(async () => ({
      picks: [{ path: "src/HACKED.ts", reason: "I made this up" }],
    }));
    const out = await judgmentPicks({
      cycleNumber: 1,
      candidates: CANDIDATES,
      alreadyPicked: [],
      budget: 1,
      callLLM,
    });
    expect(out).toEqual([]);
  });

  it("filters picks already in the priority queue", async () => {
    const callLLM = vi.fn(async () => ({
      picks: [{ path: "src/routes/login.ts", reason: "duplicate" }],
    }));
    const out = await judgmentPicks({
      cycleNumber: 1,
      candidates: CANDIDATES,
      alreadyPicked: ["src/routes/login.ts"],
      budget: 1,
      callLLM,
    });
    expect(out).toEqual([]);
  });

  it("returns [] on budget=0", async () => {
    const callLLM = vi.fn(async () => ({ picks: [{ path: "src/lib/db.ts", reason: "x" }] }));
    const out = await judgmentPicks({
      cycleNumber: 1,
      candidates: CANDIDATES,
      alreadyPicked: [],
      budget: 0,
      callLLM,
    });
    expect(out).toEqual([]);
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("returns [] when the LLM throws", async () => {
    const callLLM = vi.fn(async () => {
      throw new Error("rate limit");
    });
    const out = await judgmentPicks({
      cycleNumber: 1,
      candidates: CANDIDATES,
      alreadyPicked: [],
      budget: 1,
      callLLM,
    });
    expect(out).toEqual([]);
  });
});
