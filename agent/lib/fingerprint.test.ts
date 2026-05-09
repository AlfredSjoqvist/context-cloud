import { describe, it, expect } from "vitest";
import { findingFingerprint } from "./fingerprint";

describe("findingFingerprint", () => {
  it("produces a stable hash for the same inputs", () => {
    const a = findingFingerprint({
      path: "src/routes/login.ts",
      constraintMdFile: "login-constraints.md",
      constraintLine: 1,
      codeLine: 42,
    });
    const b = findingFingerprint({
      path: "src/routes/login.ts",
      constraintMdFile: "login-constraints.md",
      constraintLine: 1,
      codeLine: 42,
    });
    expect(a).toBe(b);
  });

  it("differs when any input differs", () => {
    const a = findingFingerprint({
      path: "src/routes/login.ts",
      constraintMdFile: "login-constraints.md",
      constraintLine: 1,
      codeLine: 42,
    });
    const b = findingFingerprint({
      path: "src/routes/login.ts",
      constraintMdFile: "login-constraints.md",
      constraintLine: 1,
      codeLine: 43,
    });
    expect(a).not.toBe(b);
  });

  it("is a 64-char hex string", () => {
    const fp = findingFingerprint({
      path: "x",
      constraintMdFile: "y",
      constraintLine: 1,
      codeLine: 1,
    });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});
