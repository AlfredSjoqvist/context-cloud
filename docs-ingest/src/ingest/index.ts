import type { DocChunk, DocSource, RawDoc } from "../types.js";
import { fetchSource } from "./fetch.js";
import { parseMarkdown } from "./parse-md.js";
import { parseHtml } from "./parse-html.js";
import { parseOpenApi } from "./parse-openapi.js";
import { chunkSections } from "./chunk.js";

export interface IngestChunksResult {
  rawDocs: RawDoc[];
  chunks: DocChunk[];
  errors: Array<{ stage: string; message: string; path?: string }>;
}

export interface IngestChunksOptions {
  /**
   * If provided, skip the fetch step and treat these as the already-fetched
   * raw docs. Used for the `--from-url` flow, where the body has been
   * downloaded in-memory ahead of pipeline entry.
   */
  prefetchedRawDocs?: RawDoc[];
}

export async function ingestSourceChunks(
  source: DocSource,
  options: IngestChunksOptions = {},
): Promise<IngestChunksResult> {
  const { raw, errors } = options.prefetchedRawDocs
    ? { raw: options.prefetchedRawDocs, errors: [] as IngestChunksResult["errors"] }
    : await fetchSource(source);
  const rawDocs: RawDoc[] = [];
  const chunks: DocChunk[] = [];

  for (const rawDoc of raw) {
    try {
      if (rawDoc.format === "md") {
        const parsed = parseMarkdown(rawDoc.text, rawDoc.path);
        const updated: RawDoc = { ...rawDoc, title: parsed.title };
        rawDocs.push(updated);
        chunks.push(...chunkSections(updated, parsed.sections));
      } else if (rawDoc.format === "html") {
        const parsed = parseHtml(rawDoc.text, rawDoc.path);
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
          message: `Format '${rawDoc.format}' not supported.`,
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
