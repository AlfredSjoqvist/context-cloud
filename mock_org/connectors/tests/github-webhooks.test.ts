import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyGitHubSignature } from "../src/github/webhooks";

describe("verifyGitHubSignature", () => {
  it("accepts a valid sha256 signature", () => {
    const body = JSON.stringify({ action: "opened" });
    const signature = "sha256=" + crypto.createHmac("sha256", "secret").update(body).digest("hex");

    expect(verifyGitHubSignature("secret", body, signature)).toBe(true);
  });

  it("rejects missing signatures", () => {
    expect(verifyGitHubSignature("secret", "{}", null)).toBe(false);
  });
});
