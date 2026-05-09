import type { DocChunk, RawDoc } from "../types.js";
import type { ParsedSection } from "./parse-md.js";

const MAX_CHUNK_CHARS = 1500;
const MIN_TAIL_CHARS = 200;

export function chunkSections(
  rawDoc: RawDoc,
  sections: ParsedSection[],
): DocChunk[] {
  const chunks: DocChunk[] = [];
  let position = 0;

  for (const section of sections) {
    const parts =
      section.body.length > MAX_CHUNK_CHARS
        ? splitLongBody(section.body)
        : [section.body];

    for (const text of parts) {
      chunks.push({
        id: `${rawDoc.id}#${position}`,
        rawDocId: rawDoc.id,
        text,
        headingPath: section.headingPath,
        anchorRef: section.anchorRef,
        position,
      });
      position += 1;
    }
  }

  return chunks;
}

function splitLongBody(body: string): string[] {
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const out: string[] = [];
  let buf: string[] = [];
  let bufLen = 0;

  for (const para of paragraphs) {
    const projected = bufLen + para.length + (buf.length > 0 ? 2 : 0);
    if (projected > MAX_CHUNK_CHARS && buf.length > 0) {
      out.push(buf.join("\n\n"));
      buf = [];
      bufLen = 0;
    }
    buf.push(para);
    bufLen += para.length + 2;
  }
  if (buf.length > 0) out.push(buf.join("\n\n"));

  if (out.length > 1) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last && prev && last.length < MIN_TAIL_CHARS) {
      out.splice(out.length - 2, 2, `${prev}\n\n${last}`);
    }
  }

  return out;
}
