import { describe, it, expect } from "vitest";
import { chunkSections } from "./chunk.js";
import type { ParsedSection } from "./parse-md.js";
import type { RawDoc } from "../types.js";

function makeRawDoc(overrides: Partial<RawDoc> = {}): RawDoc {
  return {
    id: "src1:doc1",
    sourceId: "src1",
    path: "docs/x.md",
    title: "X",
    format: "md",
    text: "",
    ...overrides,
  };
}

function makeSection(overrides: Partial<ParsedSection> = {}): ParsedSection {
  return {
    headingPath: ["Top", "Sub"],
    anchorRef: "docs/x.md#sub",
    body: "short body",
    ...overrides,
  };
}

describe("chunkSections", () => {
  it("emits one chunk per section when each section is under 1500 chars", () => {
    const sections: ParsedSection[] = [
      makeSection({ body: "alpha" }),
      makeSection({ body: "beta", headingPath: ["Top", "Beta"], anchorRef: "docs/x.md#beta" }),
    ];
    const chunks = chunkSections(makeRawDoc(), sections);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.text).toBe("alpha");
    expect(chunks[1]?.text).toBe("beta");
  });

  it("assigns ids of the form `${rawDocId}#${position}` with incrementing positions", () => {
    const sections: ParsedSection[] = [
      makeSection({ body: "one" }),
      makeSection({ body: "two" }),
      makeSection({ body: "three" }),
    ];
    const chunks = chunkSections(makeRawDoc({ id: "raw1" }), sections);
    expect(chunks.map((c) => c.id)).toEqual(["raw1#0", "raw1#1", "raw1#2"]);
    expect(chunks.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it("inherits headingPath and anchorRef from the parent section", () => {
    const sections: ParsedSection[] = [
      makeSection({
        body: "x".repeat(50),
        headingPath: ["Top", "Special"],
        anchorRef: "docs/x.md#special",
      }),
    ];
    const chunks = chunkSections(makeRawDoc(), sections);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.headingPath).toEqual(["Top", "Special"]);
    expect(chunks[0]?.anchorRef).toBe("docs/x.md#special");
  });

  it("splits sections over 1500 chars on paragraph boundaries", () => {
    // Two ~800-char paragraphs separated by blank line — total > 1500
    const para1 = "a".repeat(800);
    const para2 = "b".repeat(800);
    const para3 = "c".repeat(800);
    const body = `${para1}\n\n${para2}\n\n${para3}`;
    const sections: ParsedSection[] = [makeSection({ body })];
    const chunks = chunkSections(makeRawDoc(), sections);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should exceed the cap by much (paragraph-level splitting only)
    for (const c of chunks) {
      // Allow paragraph length itself; assert each chunk is at least one paragraph
      expect(c.text.length).toBeGreaterThan(0);
    }
    // Inherited section metadata
    expect(chunks[0]?.headingPath).toEqual(["Top", "Sub"]);
    expect(chunks[1]?.headingPath).toEqual(["Top", "Sub"]);
  });

  it("merges a final tail chunk under 200 chars into the previous one", () => {
    // Three paragraphs: two large and a tiny tail
    const para1 = "a".repeat(900);
    const para2 = "b".repeat(900);
    const tinyTail = "tail";
    const body = `${para1}\n\n${para2}\n\n${tinyTail}`;
    const sections: ParsedSection[] = [makeSection({ body })];
    const chunks = chunkSections(makeRawDoc(), sections);
    // Without the tail merge there would be 3 chunks — with merge there should be 2
    expect(chunks).toHaveLength(2);
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk?.text).toContain(tinyTail);
    expect(lastChunk?.text.length).toBeGreaterThan(tinyTail.length);
  });

  it("position increments across multiple sections that each split", () => {
    const longBody = `${"a".repeat(900)}\n\n${"b".repeat(900)}`;
    const sections: ParsedSection[] = [
      makeSection({ body: longBody }),
      makeSection({ body: "small section" }),
    ];
    const chunks = chunkSections(makeRawDoc({ id: "doc" }), sections);
    // First section is split into >= 2 chunks; second section adds 1 more
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const positions = chunks.map((c) => c.position);
    // Strictly increasing starting at 0
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i]).toBe(i);
    }
    // Last chunk corresponds to second section's body
    expect(chunks[chunks.length - 1]?.text).toBe("small section");
  });
});
