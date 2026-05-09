import { describe, it, expect, vi } from "vitest";
import { Logger } from "./logger";

describe("Logger", () => {
  it("invokes the convex sink with the structured payload", async () => {
    const calls: unknown[] = [];
    const sink = vi.fn(async (payload: unknown) => {
      calls.push(payload);
    });
    const logger = new Logger({ sink, cycleNumber: 7 });

    await logger.info("scanning login.ts");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      level: "info",
      message: "scanning login.ts",
      cycleNumber: 7,
    });
  });

  it("threads metadata through to the sink", async () => {
    const sink = vi.fn(async () => {});
    const logger = new Logger({ sink, cycleNumber: 1 });
    await logger.action("filed issue", { issueNumber: 34 });
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "action",
        metadata: { issueNumber: 34 },
      }),
    );
  });

  it("never throws when the sink fails", async () => {
    const sink = vi.fn(async () => {
      throw new Error("convex down");
    });
    const logger = new Logger({ sink, cycleNumber: 1 });
    await expect(logger.warn("flake")).resolves.toBeUndefined();
  });
});
