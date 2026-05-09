import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocChunk, DocSource } from "../types.js";

// Mock OpenAI before importing the module under test.
// The mock returns a class with chat.completions.create() that yields a known JSON response.
const llmCreateMock = vi.fn();
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: llmCreateMock,
        },
      };
      constructor(_opts: { apiKey: string }) {
        // no-op
      }
    },
  };
});

// Import AFTER vi.mock so the mocked OpenAI is used
const { extractRules } = await import("./rule-extractor.js");

function makeSource(overrides: Partial<DocSource> = {}): DocSource {
  return {
    id: "abc123",
    kind: "markdown_dir",
    uri: "file:///docs/lodash",
    defaultScope: "library",
    defaultLibraryName: "lodash",
    codebaseRoot: "/codebase",
    outputRoot: "/out",
    ...overrides,
  };
}

function makeChunk(overrides: Partial<DocChunk> = {}): DocChunk {
  return {
    id: "abc123:doc1#0",
    rawDocId: "abc123:doc1",
    text: "",
    headingPath: ["Top", "Sub"],
    anchorRef: "docs/x.md#sub",
    position: 0,
    ...overrides,
  };
}

beforeEach(() => {
  llmCreateMock.mockReset();
});

describe("extractRules — regex fallback (no API key)", () => {
  it("extracts 2 rules from a chunk with 2 imperative sentences", async () => {
    const chunk = makeChunk({
      text:
        "Applications must upgrade lodash to 4.17.21 or later. " +
        "Applications must not call _.template on user input.",
    });
    const result = await extractRules([chunk], {
      source: makeSource(),
      openaiApiKey: undefined,
      openaiModel: "gpt-5",
    });
    expect(result.llmUsed).toBe(false);
    expect(result.rules).toHaveLength(2);
  });

  it("each extracted rule text is a single line, no newlines, no ** bold markers", async () => {
    const chunk = makeChunk({
      text:
        "Applications **must** upgrade lodash to 4.17.21 or later.\n\n" +
        "Applications **must not** call _.template directly on user input.",
    });
    const result = await extractRules([chunk], {
      source: makeSource(),
      openaiApiKey: undefined,
      openaiModel: "gpt-5",
    });
    expect(result.rules.length).toBeGreaterThan(0);
    for (const r of result.rules) {
      expect(r.ruleText).not.toMatch(/\n/);
      expect(r.ruleText).not.toMatch(/\*\*/);
    }
  });

  it("rewrites 'Applications must X' to 'Files importing <lib> MUST X' when lib set", async () => {
    const chunk = makeChunk({
      text: "Applications must upgrade lodash to 4.17.21 or later.",
    });
    const result = await extractRules([chunk], {
      source: makeSource({ defaultLibraryName: "lodash" }),
      openaiApiKey: undefined,
      openaiModel: "gpt-5",
    });
    expect(result.rules).toHaveLength(1);
    const text = result.rules[0]?.ruleText ?? "";
    expect(text).toMatch(/^Files importing lodash /);
    expect(text).toContain("MUST");
  });

  it("MUST / MUST NOT / SHOULD appear in caps in the extracted rule text", async () => {
    const chunk = makeChunk({
      text:
        "Applications must upgrade to the latest version of lodash. " +
        "Applications must not call _.template on user-controlled input. " +
        "Applications should prefer modern Object.fromEntries instead of zipObject.",
    });
    const result = await extractRules([chunk], {
      source: makeSource(),
      openaiApiKey: undefined,
      openaiModel: "gpt-5",
    });
    const allText = result.rules.map((r) => r.ruleText).join("\n");
    expect(allText).toMatch(/\bMUST\b/);
    expect(allText).toMatch(/\bMUST NOT\b/);
    expect(allText).toMatch(/\bSHOULD\b/);
  });

  it("dedupes rules with identical text (case-insensitive)", async () => {
    const chunk = makeChunk({
      text:
        "Applications must upgrade lodash to 4.17.21 or later. " +
        "Applications must upgrade lodash to 4.17.21 or later.",
    });
    const result = await extractRules([chunk], {
      source: makeSource(),
      openaiApiKey: undefined,
      openaiModel: "gpt-5",
    });
    expect(result.rules).toHaveLength(1);
  });

  it("uses 'Code ' as subject when defaultLibraryName is unset", async () => {
    const chunk = makeChunk({
      text: "Applications must upgrade their dependency before deployment.",
    });
    const source = makeSource();
    // exactOptionalPropertyTypes: build a source object literally without the field
    const sourceNoLib: DocSource = {
      id: source.id,
      kind: source.kind,
      uri: source.uri,
      defaultScope: source.defaultScope,
      codebaseRoot: source.codebaseRoot,
      outputRoot: source.outputRoot,
    };
    const result = await extractRules([chunk], {
      source: sourceNoLib,
      openaiApiKey: undefined,
      openaiModel: "gpt-5",
    });
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]?.ruleText).toMatch(/^Code /);
  });
});

describe("extractRules — LLM path with mocked OpenAI", () => {
  it("uses the LLM when openaiApiKey is set, and does NOT fall back to regex", async () => {
    llmCreateMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              rules: [
                {
                  text: "Files importing lodash MUST upgrade to version 4.17.21 or later.",
                  modality: "must",
                  category: "security",
                },
              ],
            }),
          },
        },
      ],
    });

    const chunk = makeChunk({
      text:
        "Applications must upgrade lodash to 4.17.21 or later. " +
        "Applications must not call _.template directly.",
    });
    const result = await extractRules([chunk], {
      source: makeSource(),
      openaiApiKey: "test-key",
      openaiModel: "gpt-5",
    });

    expect(llmCreateMock).toHaveBeenCalledTimes(1);
    expect(result.llmUsed).toBe(true);
    // Only the single LLM-returned rule, not the regex-extracted ones
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]?.ruleText).toBe(
      "Files importing lodash MUST upgrade to version 4.17.21 or later.",
    );
  });

  it("falls back to regex when LLM throws", async () => {
    llmCreateMock.mockRejectedValueOnce(new Error("network down"));

    const chunk = makeChunk({
      text: "Applications must upgrade lodash to 4.17.21 or later.",
    });
    const result = await extractRules([chunk], {
      source: makeSource(),
      openaiApiKey: "test-key",
      openaiModel: "gpt-5",
    });

    expect(llmCreateMock).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/llm:/);
    // Regex fallback produces at least one rule
    expect(result.rules.length).toBeGreaterThan(0);
    expect(result.rules[0]?.ruleText).toMatch(/^Files importing lodash /);
  });

  it("does NOT call LLM when openaiApiKey is undefined", async () => {
    const chunk = makeChunk({
      text: "Applications must upgrade lodash to 4.17.21 or later.",
    });
    const result = await extractRules([chunk], {
      source: makeSource(),
      openaiApiKey: undefined,
      openaiModel: "gpt-5",
    });
    expect(llmCreateMock).not.toHaveBeenCalled();
    expect(result.llmUsed).toBe(false);
    expect(result.rules.length).toBeGreaterThan(0);
  });
});
