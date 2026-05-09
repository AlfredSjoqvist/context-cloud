import { describe, expect, it } from "vitest";
import { derivePathGlobs } from "./path-conventions.js";

describe("derivePathGlobs", () => {
  it("maps docs/api/payments.md → src/api/payments globs", () => {
    expect(derivePathGlobs("docs/api/payments.md")).toEqual([
      "src/api/payments/**",
      "src/api/payments*",
    ]);
  });

  it("maps docs/components/Button.md → src/components/Button globs", () => {
    expect(derivePathGlobs("docs/components/Button.md")).toEqual([
      "src/components/Button/**",
      "src/components/Button*",
    ]);
  });

  it("strips a leading ./ before docs/", () => {
    expect(derivePathGlobs("./docs/api/payments.md")).toEqual([
      "src/api/payments/**",
      "src/api/payments*",
    ]);
  });

  it("works without a docs/ prefix when path itself encodes structure", () => {
    expect(derivePathGlobs("routes/payments.md")).toEqual([
      "src/routes/payments/**",
      "src/routes/payments*",
    ]);
  });

  it("emits identifier-style globs for single-segment doc names", () => {
    expect(derivePathGlobs("Button.md")).toEqual([
      "src/Button/**",
      "src/Button*",
    ]);
  });

  it("emits no globs for topical hyphenated names with no structure", () => {
    expect(derivePathGlobs("security-best-practices.md")).toEqual([]);
  });

  it("handles .mdx extensions", () => {
    expect(derivePathGlobs("docs/api/payments.mdx")).toEqual([
      "src/api/payments/**",
      "src/api/payments*",
    ]);
  });

  it("treats doc/ and documentation/ the same as docs/", () => {
    expect(derivePathGlobs("doc/services/auth.md")).toEqual([
      "src/services/auth/**",
      "src/services/auth*",
    ]);
    expect(derivePathGlobs("documentation/services/auth.md")).toEqual([
      "src/services/auth/**",
      "src/services/auth*",
    ]);
  });

  it("returns an empty array for an empty path", () => {
    expect(derivePathGlobs("")).toEqual([]);
  });

  it("returns an empty array for a path with only a docs prefix", () => {
    expect(derivePathGlobs("docs/.md")).toEqual([]);
  });
});
