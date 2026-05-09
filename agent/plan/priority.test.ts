import { describe, it, expect } from "vitest";
import { priorityPicks } from "./priority";

const FILES = [
  "src/routes/login.ts",
  "src/routes/payments.ts",
  "src/routes/sessions.ts",
  "package.json",
];

describe("priorityPicks", () => {
  it("includes all files that have never been scanned, up to budget", () => {
    const picks = priorityPicks({
      cycleNumber: 1,
      candidates: FILES,
      history: [],
      budget: 3,
    });
    expect(picks).toHaveLength(3);
    expect(picks.every((p) => p.reason.includes("never scanned"))).toBe(true);
  });

  it("picks files with stale lastScannedCycle first", () => {
    const picks = priorityPicks({
      cycleNumber: 10,
      candidates: FILES,
      history: [
        { path: "src/routes/login.ts", lastScannedCycle: 9, cleanScanStreak: 0 },
        { path: "src/routes/payments.ts", lastScannedCycle: 1, cleanScanStreak: 0 },
        { path: "src/routes/sessions.ts", lastScannedCycle: 5, cleanScanStreak: 0 },
        { path: "package.json", lastScannedCycle: 3, cleanScanStreak: 0 },
      ],
      budget: 1,
    });
    expect(picks).toHaveLength(1);
    expect(picks[0]!.path).toBe("src/routes/payments.ts");
  });

  it("returns an empty array when budget is 0", () => {
    const picks = priorityPicks({
      cycleNumber: 1,
      candidates: FILES,
      history: [],
      budget: 0,
    });
    expect(picks).toEqual([]);
  });

  it("never returns more picks than budget", () => {
    const picks = priorityPicks({
      cycleNumber: 1,
      candidates: FILES,
      history: [],
      budget: 2,
    });
    expect(picks).toHaveLength(2);
  });
});
