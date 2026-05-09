import type { DocChunk, DocSource, RawDoc } from "../types.js";
import { fetchSource } from "./fetch.js";
import { parseMarkdown } from "./parse-md.js";
import { parseOpenApi } from "./parse-openapi.js";
import { chunkSections } from "./chunk.js";

export interface IngestChunksResult {
  rawDocs: RawDoc[];
  chunks: DocChunk[];
  errors: Array<{ stage: string; message: string; path?: string }>;
}

export async function ingestSourceChunks(
  source: DocSource,
): Promise<IngestChunksResult> {
  const { raw, errors } = await fetchSource(source);
  const rawDocs: RawDoc[] = [];
  const chunks: DocChunk[] = [];

  for (const rawDoc of raw) {
    try {
      if (rawDoc.format === "md") {
        const parsed = parseMarkdown(rawDoc.text, rawDoc.path);
        const updated: RawDoc = { ...rawDoc, title: parsed.title };
        rawDocs.push(updated);
        chunks.push(...chunkSections(updated, parsed.sections));
      } else if (rawDoc.format === "openapi") {
        const parsed = await parseOpenApi(rawDoc.text, rawDoc.path);
        const updated: RawDoc = { ...rawDoc, title: parsed.title };
        rawDocs.push(updated);
        chunks.push(...chunkSections(updated, parsed.sections));
      } else {
        errors.push({
          stage: "parse",
          message: `Format '${rawDoc.format}' not supported in v1.`,
          path: rawDoc.path,
        });
      }
    } catch (err) {
      errors.push({
        stage: "parse",
        message: err instanceof Error ? err.message : String(err),
        path: rawDoc.path,
      });
    }
  }

  return { rawDocs, chunks, errors };
}
