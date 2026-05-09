// Docs-ingest leaf client — lets the Guardian analyzer pull `.context-map/`
// constraint leaves whose `appliesTo` array matches the file under review.
//
// These leaves come from hari's docs-ingest pipeline (heterogeneous docs
// → structured .md leaves under `.context-map/library/<lib>/`). The
// Guardian's existing analyzer cites against constraint files; this client
// surfaces *which* leaves to consider, before the LLM reasons about them.

import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

export interface DocsLeafItem {
  readonly leafPath: string;
  readonly lib: string;
  readonly topic: string;
  readonly ruleCount: number;
  readonly appliesTo: ReadonlyArray<string>;
  readonly sourceUri: string;
  readonly sourceUrl?: string;
  readonly extractor?: string;
}

export interface DocsLeafClient {
  leavesForPath(path: string, opts?: { topK?: number }): Promise<DocsLeafItem[]>;
}

export function makeDocsLeafClient(convex: ConvexHttpClient): DocsLeafClient {
  return {
    async leavesForPath(path, opts) {
      const topK = opts?.topK ?? 8;
      try {
        const rows = await convex.query(api.docsIngestRuns.leavesForPath, {
          path,
          limit: topK,
        });
        return (rows ?? []).map((r: any) => ({
          leafPath: r.leafPath,
          lib: r.lib,
          topic: r.topic,
          ruleCount: r.ruleCount,
          appliesTo: r.appliesTo ?? [],
          sourceUri: r.sourceUri,
          sourceUrl: r.sourceUrl,
          extractor: r.extractor,
        }));
      } catch {
        return [];
      }
    },
  };
}
