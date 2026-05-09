import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ParsedDoc, ParsedSection } from "./parse-md.js";

const HEADING_TAGS = new Set(["h1", "h2", "h3"]);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function depthOf(tag: string): number {
  if (tag === "h1") return 1;
  if (tag === "h2") return 2;
  return 3;
}

interface BlockOutput {
  out: string[];
}

function renderInline($: cheerio.CheerioAPI, el: AnyNode): string {
  // Render inline-ish element to text, preserving inline <code>.
  if (el.type === "text") {
    return (el as { data: string }).data;
  }
  if (el.type !== "tag") return "";
  const elem = el as Element;
  const name = elem.tagName.toLowerCase();

  if (name === "code") {
    return "`" + $(elem).text() + "`";
  }
  if (name === "br") return "\n";

  // Default: descend into children.
  const children = elem.children ?? [];
  return children.map((c) => renderInline($, c as AnyNode)).join("");
}

function collapseWhitespace(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").trim();
}

function renderBlock(
  $: cheerio.CheerioAPI,
  el: AnyNode,
  acc: BlockOutput,
): void {
  if (el.type === "text") {
    const txt = (el as { data: string }).data;
    if (txt.trim().length > 0) acc.out.push(collapseWhitespace(txt));
    return;
  }
  if (el.type !== "tag") return;
  const elem = el as Element;
  const name = elem.tagName.toLowerCase();

  if (HEADING_TAGS.has(name)) {
    // Should not be reached; sectioning splits on headings before rendering.
    return;
  }

  if (name === "pre") {
    // Preserve as fenced code block.
    const codeChild = $(elem).find("code").first();
    const inner =
      codeChild.length > 0 ? codeChild.text() : $(elem).text();
    const langAttr = codeChild.attr("class") ?? "";
    const langMatch = /language-([\w+-]+)/.exec(langAttr);
    const lang = langMatch?.[1] ?? "";
    acc.out.push("```" + lang + "\n" + inner.replace(/\n+$/, "") + "\n```");
    return;
  }

  if (name === "p") {
    const text = collapseWhitespace(renderInline($, elem));
    if (text.length > 0) acc.out.push(text);
    return;
  }

  if (name === "ul" || name === "ol") {
    const items: string[] = [];
    const children = elem.children ?? [];
    let idx = 1;
    for (const child of children) {
      if (child.type !== "tag") continue;
      const childEl = child as Element;
      if (childEl.tagName.toLowerCase() !== "li") continue;
      const text = collapseWhitespace(renderInline($, childEl));
      if (text.length === 0) continue;
      const marker = name === "ol" ? `${idx}.` : "-";
      items.push(`${marker} ${text}`);
      idx += 1;
    }
    if (items.length > 0) acc.out.push(items.join("\n"));
    return;
  }

  if (name === "blockquote") {
    const inner: BlockOutput = { out: [] };
    for (const child of elem.children ?? []) {
      renderBlock($, child as AnyNode, inner);
    }
    const quoted = inner.out
      .join("\n\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    if (quoted.trim().length > 0) acc.out.push(quoted);
    return;
  }

  // Generic container: descend.
  for (const child of elem.children ?? []) {
    renderBlock($, child as AnyNode, acc);
  }
}

interface SectionFrame {
  depth: number;
  text: string;
}

function topLevelChildren($: cheerio.CheerioAPI): AnyNode[] {
  const body = $("body").first();
  const root = body.length > 0 ? body[0] : $.root()[0];
  if (!root || (root as Element).children === undefined) return [];
  return ((root as Element).children ?? []) as AnyNode[];
}

function asElement(node: AnyNode): Element | null {
  if (node.type === "tag" || node.type === "script" || node.type === "style") {
    return node as Element;
  }
  return null;
}

function headingDepth(node: AnyNode): number | null {
  const el = asElement(node);
  if (!el) return null;
  const name = el.tagName.toLowerCase();
  if (!HEADING_TAGS.has(name)) return null;
  return depthOf(name);
}

export function parseHtml(rawText: string, docPath: string): ParsedDoc {
  const $ = cheerio.load(rawText);

  const headTitle = $("head > title").first().text().trim();
  const firstH1 = $("body h1").first().text().trim();
  let title = firstH1 || headTitle || docPath;

  const nodes = topLevelChildren($);
  const sections: ParsedSection[] = [];
  const stack: SectionFrame[] = [];
  let pending: AnyNode[] = [];

  const flush = (): void => {
    if (stack.length === 0) {
      pending = [];
      return;
    }
    const acc: BlockOutput = { out: [] };
    for (const node of pending) {
      renderBlock($, node, acc);
    }
    const body = acc.out.join("\n\n").trim();
    pending = [];
    if (!body) return;
    const leaf = stack[stack.length - 1];
    if (!leaf) return;
    sections.push({
      headingPath: stack.map((h) => h.text),
      anchorRef: `${docPath}#${slugify(leaf.text)}`,
      body,
    });
  };

  // We need a recursive descent: cheerio body may wrap content in extra
  // containers (e.g. <article>, <main>). Walk body in DFS, treating headings
  // as section delimiters at any depth.
  const walk = (children: AnyNode[]): void => {
    for (const node of children) {
      const depth = headingDepth(node);
      if (depth !== null) {
        flush();
        const text = $(node as Element).text().trim();
        if (!firstH1 && !title && depth === 1) title = text;
        while (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (!top || top.depth < depth) break;
          stack.pop();
        }
        stack.push({ depth, text });
        continue;
      }
      const elem = asElement(node);
      if (elem) {
        const name = elem.tagName.toLowerCase();
        // Containers we should descend into rather than render as a unit, so
        // headings nested inside them split sections correctly.
        const isContainer =
          name === "article" ||
          name === "main" ||
          name === "section" ||
          name === "div" ||
          name === "header" ||
          name === "footer" ||
          name === "nav" ||
          name === "aside";
        if (isContainer) {
          // If container has any heading descendant, descend; otherwise render
          // as a generic block.
          const hasHeading = $(elem).find("h1, h2, h3").length > 0;
          if (hasHeading) {
            walk((elem.children ?? []) as AnyNode[]);
            continue;
          }
        }
      }
      if (stack.length === 0) {
        // Pre-heading content (e.g. intro paragraphs before any heading) is
        // skipped to keep the contract: every section needs a heading path.
        continue;
      }
      pending.push(node);
    }
  };

  walk(nodes);
  flush();

  if (sections.length === 0) {
    const fallbackTitle = title || docPath;
    const acc: BlockOutput = { out: [] };
    for (const node of nodes) {
      renderBlock($, node, acc);
    }
    const body = acc.out.join("\n\n").trim();
    if (body.length > 0) {
      sections.push({
        headingPath: [fallbackTitle],
        anchorRef: docPath,
        body,
      });
    }
  }

  if (!title) {
    const first = sections[0];
    title = first?.headingPath[0] ?? docPath;
  }

  return { title, sections };
}
