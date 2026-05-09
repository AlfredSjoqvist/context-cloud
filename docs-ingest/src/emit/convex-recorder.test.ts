import { describe, expect, it, vi } from "vitest";
import {
  createConvexRecorder,
  generateRunId,
} from "./convex-recorder.js";

describe("createConvexRecorder", () => {
  it("returns a noop recorder when convexUrl is undefined", async () => {
    const log = vi.fn();
    const recorder = createConvexRecorder({ convexUrl: undefined, log });
    await expect(
      recorder.record({
        runId: "r1",
        lib: "lodash",
        topic: "advisory",
        sourceUri: "ghsa://x",
        ruleCount: 0,
        appliesTo: ["src/**/*.ts"],
        leafPath: "library/lodash/advisory.md",
      }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("CONVEX_URL not set"),
    );
  });

  it("calls the mutation with the expected args when convexUrl is set", async () => {
    const mutation = vi.fn().mockResolvedValue(undefined);
    const recorder = createConvexRecorder({
      convexUrl: "https://example.convex.cloud",
      log: () => undefined,
      warn: () => undefined,
      clientFactory: () => ({ mutation }),
    });
    await recorder.record({
      runId: "r2",
      lib: "express",
      topic: "security",
      sourceUri: "file:fixtures/express.html",
      sourceUrl: "https://expressjs.com/security.html",
      ruleCount: 13,
      appliesTo: ["src/api/**/*.ts"],
      leafPath: "library/express/security.md",
      extractor: "llm",
    });
    expect(mutation).toHaveBeenCalledTimes(1);
    const call = mutation.mock.calls[0];
    if (!call) throw new Error("expected mutation call");
    const [, args] = call;
    expect(args).toEqual({
      runId: "r2",
      lib: "express",
      topic: "security",
      sourceUri: "file:fixtures/express.html",
      sourceUrl: "https://expressjs.com/security.html",
      ruleCount: 13,
      appliesTo: ["src/api/**/*.ts"],
      leafPath: "library/express/security.md",
      extractor: "llm",
    });
  });

  it("omits optional fields when source URL and extractor are absent", async () => {
    const mutation = vi.fn().mockResolvedValue(undefined);
    const recorder = createConvexRecorder({
      convexUrl: "https://example.convex.cloud",
      log: () => undefined,
      warn: () => undefined,
      clientFactory: () => ({ mutation }),
    });
    await recorder.record({
      runId: "r3",
      lib: "lodash",
      topic: "ghsa",
      sourceUri: "fixture://lodash",
      ruleCount: 7,
      appliesTo: ["src/lib/db.ts"],
      leafPath: "library/lodash/ghsa.md",
    });
    const call = mutation.mock.calls[0];
    if (!call) throw new Error("expected mutation call");
    const [, args] = call;
    expect(args).not.toHaveProperty("sourceUrl");
    expect(args).not.toHaveProperty("extractor");
  });

  it("swallows mutation errors so emit never fails", async () => {
    const mutation = vi.fn().mockRejectedValue(new Error("network down"));
    const warn = vi.fn();
    const recorder = createConvexRecorder({
      convexUrl: "https://example.convex.cloud",
      log: () => undefined,
      warn,
      clientFactory: () => ({ mutation }),
    });
    await expect(
      recorder.record({
        runId: "r4",
        lib: "lodash",
        topic: "ghsa",
        sourceUri: "fixture://lodash",
        ruleCount: 0,
        appliesTo: [],
        leafPath: "library/lodash/ghsa.md",
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/recordRun failed.*network down/),
    );
  });

  it("falls back to noop when client construction throws", async () => {
    const warn = vi.fn();
    const recorder = createConvexRecorder({
      convexUrl: "https://example.convex.cloud",
      log: () => undefined,
      warn,
      clientFactory: () => {
        throw new Error("bad url");
      },
    });
    await expect(
      recorder.record({
        runId: "r5",
        lib: "x",
        topic: "y",
        sourceUri: "z",
        ruleCount: 0,
        appliesTo: [],
        leafPath: "library/x/y.md",
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("failed to initialise client"),
    );
  });
});

describe("generateRunId", () => {
  it("produces unique-looking ids with the expected shape", () => {
    const a = generateRunId();
    const b = generateRunId();
    expect(a).toMatch(/^run_[0-9a-z]+_[0-9a-f]{8}$/);
    expect(b).toMatch(/^run_[0-9a-z]+_[0-9a-f]{8}$/);
    expect(a).not.toEqual(b);
  });
});
