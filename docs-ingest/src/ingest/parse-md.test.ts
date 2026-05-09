import { describe, it, expect } from "vitest";
import { parseMarkdown } from "./parse-md.js";

describe("parseMarkdown", () => {
  it("captures heading hierarchy h1 > h2 > h3 in headingPath", () => {
    const md = [
      "# Top",
      "intro",
      "## Middle",
      "middle body",
      "### Leaf",
      "leaf body",
    ].join("\n");

    const parsed = parseMarkdown(md, "docs/sample.md");
    const last = parsed.sections[parsed.sections.length - 1];
    expect(last?.headingPath).toEqual(["Top", "Middle", "Leaf"]);
  });

  it("pops deeper h3 from stack when h2 sibling appears", () => {
    const md = [
      "# Top",
      "## A",
      "a body",
      "### A-Leaf",
      "leaf body",
      "## B",
      "b body",
    ].join("\n");

    const parsed = parseMarkdown(md, "docs/sample.md");
    const bSection = parsed.sections.find((s) =>
      s.headingPath[s.headingPath.length - 1] === "B",
    );
    expect(bSection).toBeDefined();
    // After "## B" pops the deeper h3 "A-Leaf", path should be Top > B (not Top > A > B)
    expect(bSection?.headingPath).toEqual(["Top", "B"]);
  });

  it("uses the first h1 as the doc title", () => {
    const md = "# Hello World\n\nbody";
    const parsed = parseMarkdown(md, "docs/sample.md");
    expect(parsed.title).toBe("Hello World");
  });

  it("falls back to filename / docPath when no h1", () => {
    const md = "## Sub only\n\nbody";
    const parsed = parseMarkdown(md, "docs/sample.md");
    // No h1, so title should fall back to the first section's heading or docPath
    expect(parsed.title).toBe("Sub only");
  });

  it("falls back to docPath when no headings at all", () => {
    const md = "Just some prose, no headings here.";
    const parsed = parseMarkdown(md, "docs/orphan.md");
    expect(parsed.title).toBe("docs/orphan.md");
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]?.body).toBe("Just some prose, no headings here.");
    expect(parsed.sections[0]?.anchorRef).toBe("docs/orphan.md");
  });

  it("anchorRef is `${docPath}#${slugified-leaf-heading}`", () => {
    const md = "# Top\n\n## Special-Title!! Section\n\nbody";
    const parsed = parseMarkdown(md, "docs/foo.md");
    const leaf = parsed.sections.find((s) =>
      s.headingPath[s.headingPath.length - 1] === "Special-Title!! Section",
    );
    expect(leaf?.anchorRef).toBe("docs/foo.md#special-title-section");
  });

  it("returns a single section when doc has no headings", () => {
    const md = "Some body content here without headings at all.";
    const parsed = parseMarkdown(md, "docs/x.md");
    expect(parsed.sections).toHaveLength(1);
  });

  it("preserves code blocks verbatim inside section bodies", () => {
    const code = "```ts\nconst a = 1;\n\nconst b = 2;\n```";
    const md = `# Title\n\nIntro paragraph.\n\n${code}\n\nTrailing paragraph.`;
    const parsed = parseMarkdown(md, "docs/code.md");
    const section = parsed.sections[0];
    expect(section).toBeDefined();
    expect(section?.body).toContain("```ts");
    expect(section?.body).toContain("const a = 1;");
    expect(section?.body).toContain("const b = 2;");
    expect(section?.body).toContain("```");
  });
});
