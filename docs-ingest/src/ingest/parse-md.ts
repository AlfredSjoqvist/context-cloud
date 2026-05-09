import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Heading } from "mdast";

const processor = unified().use(remarkParse);

export interface ParsedSection {
  headingPath: string[];
  anchorRef: string;
  body: string;
}

export interface ParsedDoc {
  title: string;
  sections: ParsedSection[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function headingText(h: Heading): string {
  const collect = (node: unknown): string => {
    if (typeof node !== "object" || node === null) return "";
    const n = node as { value?: unknown; children?: unknown };
    if (typeof n.value === "string") return n.value;
    if (Array.isArray(n.children)) return n.children.map(collect).join("");
    return "";
  };
  return collect(h).trim();
}

export function parseMarkdown(rawText: string, docPath: string): ParsedDoc {
  const tree = processor.parse(rawText) as Root;

  const sections: ParsedSection[] = [];
  const stack: Array<{ depth: number; text: string }> = [];
  let bodyStart: number | null = null;
  let title = "";

  const flush = (endOffset: number): void => {
    if (bodyStart === null || stack.length === 0) return;
    const body = rawText.slice(bodyStart, endOffset).trim();
    if (!body) return;
    const leaf = stack[stack.length - 1];
    if (!leaf) return;
    sections.push({
      headingPath: stack.map((h) => h.text),
      anchorRef: `${docPath}#${slugify(leaf.text)}`,
      body,
    });
  };

  for (const node of tree.children) {
    if (node.type !== "heading") continue;
    const heading = node;
    const text = headingText(heading);
    const startOffset = heading.position?.start.offset ?? 0;
    const endOffset = heading.position?.end.offset ?? 0;

    flush(startOffset);

    if (heading.depth === 1 && !title) title = text;

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top || top.depth < heading.depth) break;
      stack.pop();
    }
    stack.push({ depth: heading.depth, text });
    bodyStart = endOffset;
  }

  flush(rawText.length);

  if (sections.length === 0 && rawText.trim().length > 0) {
    const fallbackTitle = title || docPath;
    sections.push({
      headingPath: [fallbackTitle],
      anchorRef: docPath,
      body: rawText.trim(),
    });
  }

  if (!title) {
    const first = sections[0];
    title = first?.headingPath[0] ?? docPath;
  }

  return { title, sections };
}
