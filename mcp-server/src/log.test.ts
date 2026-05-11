import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { log, safe } from "./log.js";

let stderr: string;
let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderr = "";
  writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as never);
});

afterEach(() => {
  writeSpy.mockRestore();
  delete process.env.HINDSIGHT_LOG;
});

describe("log", () => {
  it("emits info by default", () => {
    log.info("hello", { k: "v" });
    expect(stderr).toContain("[hindsight-mcp ");
    expect(stderr).toContain("info]");
    expect(stderr).toContain("hello");
    expect(stderr).toContain("k=v");
  });

  it("skips debug at default level", () => {
    log.debug("noisy");
    expect(stderr).toBe("");
  });

  it("emits debug when HINDSIGHT_LOG=debug", () => {
    process.env.HINDSIGHT_LOG = "debug";
    log.debug("hello");
    expect(stderr).toContain("debug]");
  });

  it("is fully silent when HINDSIGHT_LOG=off", () => {
    process.env.HINDSIGHT_LOG = "off";
    log.error("anything");
    log.info("anything");
    expect(stderr).toBe("");
  });

  it("formats JSON values in fields", () => {
    log.info("evt", { obj: { a: 1 } });
    expect(stderr).toContain('obj={"a":1}');
  });
});

describe("safe", () => {
  it("returns the handler's result on success and logs tool.ok", async () => {
    const out = await safe("my_tool", { x: 1 }, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));
    expect(out.content[0].text).toBe("ok");
    expect(out.isError).toBeUndefined();
    expect(stderr).toContain("tool.ok");
    expect(stderr).toContain("name=my_tool");
  });

  it("captures throw into isError + content + logs tool.fail", async () => {
    const out = await safe("my_tool", {}, async () => {
      throw new Error("boom");
    });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("error calling my_tool");
    expect(out.content[0].text).toContain("boom");
    expect(stderr).toContain("tool.fail");
    expect(stderr).toContain("error=boom");
  });

  it("includes ms timing in success log", async () => {
    await safe("t", {}, async () => ({ content: [{ type: "text" as const, text: "ok" }] }));
    expect(stderr).toMatch(/ms=\d+/);
  });

  it("times out a slow handler and returns isError", async () => {
    process.env.HINDSIGHT_TOOL_TIMEOUT_MS = "50";
    const out = await safe("slow_tool", {}, async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { content: [{ type: "text" as const, text: "should not reach" }] };
    });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("tool.timeout after 50ms");
    expect(stderr).toContain("tool.fail");
    delete process.env.HINDSIGHT_TOOL_TIMEOUT_MS;
  });
});
