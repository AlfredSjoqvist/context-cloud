import OpenAI from "openai";
import { z } from "zod";
import { createHash } from "node:crypto";
import type {
  DocChunk,
  DocSource,
  ExtractedRule,
  Modality,
  RuleCategory,
} from "../types.js";
import { detectModality } from "./modality.js";

const ModalityEnum = z.enum([
  "must",
  "must_not",
  "should",
  "should_not",
  "warning",
]);
const CategoryEnum = z.enum([
  "security",
  "correctness",
  "performance",
  "api_contract",
  "style",
]);

const LlmRuleSchema = z.object({
  text: z.string().min(20),
  modality: ModalityEnum,
  category: CategoryEnum,
});

const LlmResponseSchema = z.object({
  rules: z.array(LlmRuleSchema),
});

export interface ExtractOptions {
  source: DocSource;
  openaiApiKey: string | undefined;
  openaiModel: string;
  defaultCategory?: RuleCategory;
}

const SYSTEM_PROMPT = `You are an extractor that converts a doc chunk into single-line, line-citable constraints for a code-review agent.

Each output rule must:
- be ONE complete English sentence, no line breaks, ending with a period
- start with "Files importing <library> ", or "Code that <does X> ", or a similarly self-contained subject — never a pronoun like "It" or "This"
- contain enough context to be understandable WITHOUT the surrounding doc
- use MUST / MUST NOT / SHOULD / SHOULD NOT / NEVER / ALWAYS in CAPS to make modality explicit
- mention any concrete API names, version numbers, or thresholds the original chunk specifies
- omit hedges, citations, and prose framing

Return STRICT JSON: { "rules": [ { "text": "...", "modality": "must"|"must_not"|"should"|"should_not"|"warning", "category": "security"|"correctness"|"performance"|"api_contract"|"style" } ] }

If the chunk contains no extractable rule, return { "rules": [] }.`;

function buildUserPrompt(
  chunk: DocChunk,
  source: DocSource,
): string {
  const libCtx = source.defaultLibraryName
    ? `Library context: ${source.defaultLibraryName}. Use "Files importing ${source.defaultLibraryName} " as the rule subject when applicable.\n`
    : "";
  const headingCtx =
    chunk.headingPath.length > 0
      ? `Section: ${chunk.headingPath.join(" / ")}\n`
      : "";
  return `${libCtx}${headingCtx}\nChunk:\n"""${chunk.text}"""`;
}

function ruleId(chunkId: string, text: string): string {
  return createHash("sha256")
    .update(`${chunkId}::${text}`)
    .digest("hex")
    .slice(0, 16);
}

function ruleFromLlm(
  chunk: DocChunk,
  raw: { text: string; modality: Modality; category: RuleCategory },
): ExtractedRule {
  const cleaned = raw.text.replace(/\s+/g, " ").trim();
  return {
    id: ruleId(chunk.id, cleaned),
    chunkId: chunk.id,
    ruleText: cleaned,
    modality: raw.modality,
    category: raw.category,
    confidence: 0.85,
    citation: {
      sourceId: chunk.rawDocId.split(":")[0] ?? "unknown",
      chunkId: chunk.id,
      anchorRef: chunk.anchorRef,
      originalText: chunk.text,
    },
  };
}

async function extractWithLlm(
  chunk: DocChunk,
  options: ExtractOptions,
): Promise<ExtractedRule[]> {
  if (!options.openaiApiKey) throw new Error("no api key");
  const client = new OpenAI({ apiKey: options.openaiApiKey });
  const response = await client.chat.completions.create({
    model: options.openaiModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(chunk, options.source) },
    ],
    response_format: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) return [];
  const parsed = LlmResponseSchema.parse(JSON.parse(content));
  return parsed.rules.map((r) => ruleFromLlm(chunk, r));
}

function splitSentences(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z*\-`"])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryFromContext(
  source: DocSource,
  chunkText: string,
  fallback: RuleCategory,
): RuleCategory {
  const lib = source.defaultLibraryName?.toLowerCase() ?? "";
  const haystack = `${lib} ${chunkText}`.toLowerCase();
  if (
    /security|cve-\d|ghsa-|crypt|auth|webhook|injection|xss|csrf|prototype pollution|advisor/.test(
      haystack,
    )
  ) {
    return "security";
  }
  return fallback;
}

function uppercaseModalityMarkers(text: string): string {
  return text
    .replace(/\bmust\s+not\b/gi, "MUST NOT")
    .replace(/\bshould\s+not\b/gi, "SHOULD NOT")
    .replace(/\bmust\b/g, "MUST")
    .replace(/\bMust\b/g, "MUST")
    .replace(/\bshould\b/g, "SHOULD")
    .replace(/\bShould\b/g, "SHOULD")
    .replace(/\bnever\b/gi, "NEVER")
    .replace(/\balways\b/gi, "ALWAYS");
}

function rewriteForSelfContainment(
  sentence: string,
  source: DocSource,
): string {
  const lib = source.defaultLibraryName;
  const subjectCap = lib ? `Files importing ${lib} ` : "Code ";
  const subjectLower = subjectCap
    .charAt(0)
    .toLowerCase() + subjectCap.slice(1);
  const stripped = stripFormatting(sentence);
  const startsWithPronoun = /^(it|this|that|they)\b/i.test(stripped);
  if (startsWithPronoun) {
    return uppercaseModalityMarkers(`${subjectCap}— ${stripped}`);
  }
  const rewritten = stripped
    .replace(/^Long-term,\s+applications\s+/i, `Long-term, ${subjectLower}`)
    .replace(/^Applications\s+that\s+/i, `${subjectCap}that `)
    .replace(/^Applications\s+/i, subjectCap)
    .replace(/^Application\s+/i, subjectCap)
    .replace(/^The\s+webhook\s+handler\s+/i, "Webhook handlers ")
    .trim();
  return uppercaseModalityMarkers(rewritten);
}

function extractWithRegex(
  chunk: DocChunk,
  options: ExtractOptions,
): ExtractedRule[] {
  const sentences = splitSentences(chunk.text);
  const fallbackCategory = options.defaultCategory ?? "correctness";
  const out: ExtractedRule[] = [];
  for (const raw of sentences) {
    const hit = detectModality(raw);
    if (!hit) continue;
    const cleaned = rewriteForSelfContainment(
      raw.replace(/\s+/g, " ").trim(),
      options.source,
    );
    if (cleaned.length < 30) continue;
    out.push({
      id: ruleId(chunk.id, cleaned),
      chunkId: chunk.id,
      ruleText: cleaned,
      modality: hit.modality,
      category: categoryFromContext(options.source, chunk.text, fallbackCategory),
      confidence: hit.bolded ? 0.7 : 0.5,
      citation: {
        sourceId: chunk.rawDocId.split(":")[0] ?? "unknown",
        chunkId: chunk.id,
        anchorRef: chunk.anchorRef,
        originalText: chunk.text,
      },
    });
  }
  return out;
}

export interface ExtractResult {
  rules: ExtractedRule[];
  llmUsed: boolean;
  errors: Array<{ chunkId: string; message: string }>;
}

export async function extractRules(
  chunks: DocChunk[],
  options: ExtractOptions,
): Promise<ExtractResult> {
  const out: ExtractedRule[] = [];
  const errors: ExtractResult["errors"] = [];
  let llmUsed = false;

  for (const chunk of chunks) {
    if (options.openaiApiKey) {
      try {
        const rules = await extractWithLlm(chunk, options);
        out.push(...rules);
        llmUsed = true;
        continue;
      } catch (err) {
        errors.push({
          chunkId: chunk.id,
          message: `llm: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
    out.push(...extractWithRegex(chunk, options));
  }

  const seen = new Set<string>();
  const deduped = out.filter((r) => {
    const key = r.ruleText.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { rules: deduped, llmUsed, errors };
}
