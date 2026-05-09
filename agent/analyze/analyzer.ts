import type { NiaClient } from "../tools/niaClient.js";
import type { NmClient, NmContextItem } from "../tools/nmClient.js";
import type { DocsLeafClient, DocsLeafItem } from "../tools/docsLeafClient.js";
import type { Finding, UsedContext } from "./types.js";
import {
  ANALYZER_SYSTEM_PROMPT,
  AnalyzerOutputSchema,
  buildAnalyzerUserPrompt,
  type AnalyzerOutput,
} from "./prompts.js";

export type AnalyzerLLMCall = (input: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<AnalyzerOutput>;

export interface AnalyzerExtraSources {
  /** NM (note memory) — institutional knowledge from prior agent sessions. */
  readonly nm?: NmClient;
  /** Docs-ingest leaves — constraints from heterogeneous-doc ingestion. */
  readonly docs?: DocsLeafClient;
}

export async function analyzeFile(
  path: string,
  nia: NiaClient,
  callLLM: AnalyzerLLMCall,
  extras?: AnalyzerExtraSources,
): Promise<Finding[]> {
  let code = "";
  try {
    code = await nia.readFile(path);
  } catch {
    return [];
  }

  const ctxHits = await nia.searchContext(path, { topK: 8 }).catch(() => []);
  const contextChunks = await Promise.all(
    ctxHits.slice(0, 8).map(async (h) => {
      const content = await nia.readFile(h.path).catch(() => h.excerpt);
      return { path: h.path, content };
    }),
  );

  const recentDiff = await nia.recentDiff(path).catch(() => "");

  // Extra context streams: NM notes + docs-ingest leaves. Both fail-soft.
  const nmNotes: NmContextItem[] = extras?.nm
    ? await extras.nm.notesForPath(path, { topK: 6 }).catch(() => [])
    : [];
  const docsLeaves: DocsLeafItem[] = extras?.docs
    ? await extras.docs.leavesForPath(path, { topK: 8 }).catch(() => [])
    : [];

  let raw: unknown;
  try {
    raw = await callLLM({
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      userPrompt: buildAnalyzerUserPrompt({
        path, code, contextChunks, recentDiff,
        nmNotes: nmNotes.map(n => ({
          noteId: n.noteId, symptom: n.symptom, rootCause: n.rootCause,
          correction: n.correction, importance: n.importance, weight: n.weight,
        })),
        docsLeaves: docsLeaves.map(l => ({
          leafPath: l.leafPath, lib: l.lib, topic: l.topic,
          ruleCount: l.ruleCount, sourceUrl: l.sourceUrl,
        })),
      }),
    });
  } catch {
    return [];
  }

  const parsed = AnalyzerOutputSchema.safeParse(raw);
  if (!parsed.success) return [];

  // Provenance: every finding records which NM notes + docs leaves were
  // visible to the analyzer when it produced this finding. The dashboard's
  // Sources tab uses this to draw the convergence graph.
  const usedContext: UsedContext | undefined =
    nmNotes.length === 0 && docsLeaves.length === 0
      ? undefined
      : {
          noteIds: nmNotes.map(n => n.noteId),
          docsLeafIds: docsLeaves.map(l => l.leafPath),
        };

  return parsed.data.findings.map((f) => ({ ...f, path, usedContext }));
}
