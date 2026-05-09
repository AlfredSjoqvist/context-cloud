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
  /** Force LLM only (no regex fallback even on LLM failure). */
  llmOnly?: boolean;
  /** Force regex only (skip LLM even when API key is present). */
  noLlm?: boolean;
  /** Per-call timeout in ms for the OpenAI request. */
  llmTimeoutMs?: number;
}

const SYSTEM_PROMPT = `You convert a doc chunk into single-line, line-citable constraints for a code-review agent.

Each output rule MUST:
- be ONE complete English sentence, no line breaks, ending with a period
- start with "Files importing <library> ", "Webhook handlers ", "Code that <does X> ", or a similarly self-contained subject — never "It", "This", "Applications", or "Application"
- include any concrete API names, version numbers, configuration keys, or thresholds the original chunk specifies
- use MUST / MUST NOT / SHOULD / SHOULD NOT / NEVER / ALWAYS in CAPS to make modality explicit
- omit hedges ("possibly", "might"), citations, and prose framing

Return STRICT JSON: { "rules": [ { "text": "...", "modality": "must"|"must_not"|"should"|"should_not"|"warning", "category": "security"|"correctness"|"performance"|"api_contract"|"style" } ] }

If the chunk contains no extractable rule, return { "rules": [] }.

Example input chunk (library context: stripe):
"""
You **must** verify the signature on every webhook event Stripe sends to your endpoint.
You **must not** parse the request body before passing it to constructEvent(). The
signature is computed over the exact raw bytes Stripe sent.
"""

Example output:
{ "rules": [
  { "text": "Files importing stripe MUST verify the signature on every webhook event Stripe sends to the endpoint.", "modality": "must", "category": "security" },
  { "text": "Files importing stripe MUST NOT parse the request body before passing it to stripe.webhooks.constructEvent() because the signature is computed over the exact raw bytes Stripe sent.", "modality": "must_not", "category": "security" }
] }`;

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

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; code?: string; message?: string };
  if (e.status === 429) return true;
  if (e.status !== undefined && e.status >= 500 && e.status < 600) return true;
  if (e.code === "ECONNRESET" || e.code === "ETIMEDOUT") return true;
  if (e.code === "ECONNREFUSED") return true;
  if (typeof e.message === "string" && /timeout|reset|econn/i.test(e.message))
    return true;
  return false;
}

async function callLlmOnce(
  client: OpenAI,
  chunk: DocChunk,
  options: ExtractOptions,
): Promise<ExtractedRule[]> {
  const response = await client.chat.completions.create(
    {
      model: options.openaiModel,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(chunk, options.source) },
      ],
      response_format: { type: "json_object" },
    },
    { timeout: options.llmTimeoutMs ?? 30_000 },
  );
  const content = response.choices[0]?.message?.content;
  if (!content) return [];
  const parsed = LlmResponseSchema.parse(JSON.parse(content));
  return parsed.rules.map((r) => ruleFromLlm(chunk, r));
}

async function extractWithLlm(
  chunk: DocChunk,
  options: ExtractOptions,
): Promise<ExtractedRule[]> {
  if (!options.openaiApiKey) throw new Error("no api key");
  const client = new OpenAI({ apiKey: options.openaiApiKey });
  try {
    return await callLlmOnce(client, chunk, options);
  } catch (err) {
    if (!isRetryable(err)) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    return await callLlmOnce(client, chunk, options);
  }
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

  const llmEligible =
    !!options.openaiApiKey && options.noLlm !== true;

  for (const chunk of chunks) {
    if (llmEligible) {
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
        if (options.llmOnly === true) continue;
      }
    } else if (options.llmOnly === true) {
      errors.push({
        chunkId: chunk.id,
        message: `llm-only requested but no api key (or --no-llm set)`,
      });
      continue;
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
