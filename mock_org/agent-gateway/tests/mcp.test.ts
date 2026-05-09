import { describe, expect, it } from "vitest";
import { normalizeToolEvent } from "../src/api/mcp";

describe("normalizeToolEvent", () => {
  it("redacts secrets before persistence", () => {
    const event = normalizeToolEvent({
      orgId: "org_123",
      sessionId: "sess_123",
      toolName: "Read",
      input: { authorization: "Bearer secret", file_path: "src/api/mcp.ts" },
    });

    expect(event.input.authorization).toBe("[REDACTED]");
    expect(event.input.file_path).toBe("src/api/mcp.ts");
  });
});
