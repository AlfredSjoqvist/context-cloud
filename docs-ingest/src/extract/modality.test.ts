import { describe, it, expect } from "vitest";
import { detectModality } from "./modality.js";

describe("detectModality", () => {
  it("identifies plain MUST", () => {
    const hit = detectModality("Applications MUST upgrade lodash to 4.17.21.");
    expect(hit?.modality).toBe("must");
  });

  it("identifies MUST NOT (and not falsely as plain MUST)", () => {
    const hit = detectModality(
      "Applications MUST NOT pass user-controlled key paths.",
    );
    expect(hit?.modality).toBe("must_not");
  });

  it("identifies lowercase 'must not' as must_not", () => {
    const hit = detectModality("Applications must not call _.template directly.");
    expect(hit?.modality).toBe("must_not");
  });

  it("identifies 'never' as must_not", () => {
    const hit = detectModality("Webhooks should never be processed without verification.");
    expect(hit?.modality).toBe("must_not");
  });

  it("identifies 'always' as must", () => {
    // Pattern is case-sensitive on the literal "always" / "ALWAYS"
    const hit = detectModality("You should always validate the signature header.");
    expect(hit?.modality).toBe("must");
  });

  it("identifies 'should' as should", () => {
    const hit = detectModality("Applications should prefer modern alternatives.");
    expect(hit?.modality).toBe("should");
  });

  it("identifies 'should not' as should_not", () => {
    const hit = detectModality("Applications should not rely on deprecated APIs.");
    expect(hit?.modality).toBe("should_not");
  });

  it("identifies 'warning' as warning", () => {
    const hit = detectModality("Warning: this function is deprecated.");
    expect(hit?.modality).toBe("warning");
  });

  it("flags bolded **must** as bolded", () => {
    const hit = detectModality("Applications **must** upgrade lodash.");
    expect(hit?.modality).toBe("must");
    expect(hit?.bolded).toBe(true);
  });

  it("non-bolded must has bolded=false", () => {
    const hit = detectModality("Applications must upgrade lodash.");
    expect(hit?.bolded).toBe(false);
  });

  it("returns null for a sentence with no marker", () => {
    expect(detectModality("This is a regular descriptive sentence.")).toBeNull();
  });
});
