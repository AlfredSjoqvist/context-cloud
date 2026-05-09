import type { NiaClient } from "../tools/niaClient.js";
import type { Finding } from "./types.js";
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

export async function analyzeFile(
  path: string,
  nia: NiaClient,
  callLLM: AnalyzerLLMCall,
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

  let raw: unknown;
  try {
    raw = await callLLM({
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      userPrompt: buildAnalyzerUserPrompt({ path, code, contextChunks, recentDiff }),
    });
  } catch {
    return [];
  }

  const parsed = AnalyzerOutputSchema.safeParse(raw);
  if (!parsed.success) return [];

  return parsed.data.findings.map((f) => ({ ...f, path }));
}
