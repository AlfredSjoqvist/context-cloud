import { z } from "zod";

export const FindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["intent_drift", "security", "bug"]),
  codeCite: z.object({
    line: z.number().int().positive(),
    excerpt: z.string().min(1),
  }),
  constraintCite: z.object({
    mdFile: z.string().min(1),
    line: z.number().int().positive(),
    text: z.string().min(1),
  }),
  reasoning: z.string().min(1),
  suggestedFixDirection: z.string().min(1),
});

export const AnalyzerOutputSchema = z.object({
  findings: z.array(FindingSchema),
});

export type AnalyzerOutput = z.infer<typeof AnalyzerOutputSchema>;

export const ANALYZER_SYSTEM_PROMPT = `You are the guardian agent: an autonomous code reviewer that compares a single source file against its documented intent and constraints.

For the given file, return zero or more findings. A finding describes a concrete divergence between the code and a constraint or example documented in the file's .md context. Three categories are accepted:
- intent_drift: code stopped matching its documented spec
- security: missing auth, missing input validation, or other security-relevant violations of stated constraints
- bug: behavior that contradicts a documented example

Every finding MUST cite:
- A specific line in the source file (codeCite.line and codeCite.excerpt — the excerpt is the verbatim contents of that line)
- A specific line in the .md context (constraintCite.mdFile, constraintCite.line, constraintCite.text — the text is verbatim from that line of the .md)

If you cannot cite both, do not report the finding. False positives are worse than missed findings. When in doubt, omit.

Severity guidance: critical (data loss, auth bypass), high (security violation, intent drift on a documented hard constraint), medium (bug or soft constraint violation), low (style or doc-only).

Return strictly the JSON shape provided as the structured output.`;

export const CRITIQUE_SYSTEM_PROMPT = `You are reviewing a finding produced by another agent. Decide whether it is a real violation of the cited constraint by the cited code.

Return { confident: true } only if you are at least 80% sure the code as written violates the constraint as written. Otherwise return { confident: false } with a one-sentence reason. Be strict — false confidence costs the team wasted Devin runs.`;

export const CritiqueOutputSchema = z.object({
  confident: z.boolean(),
  reason: z.string(),
});

export type CritiqueOutput = z.infer<typeof CritiqueOutputSchema>;

export function buildAnalyzerUserPrompt(args: {
  readonly path: string;
  readonly code: string;
  readonly contextChunks: ReadonlyArray<{ readonly path: string; readonly content: string }>;
  readonly recentDiff: string;
}): string {
  const ctx = args.contextChunks
    .map((c) => `=== ${c.path} ===\n${c.content}`)
    .join("\n\n");
  return [
    `File: ${args.path}`,
    "",
    "Source code:",
    "```",
    args.code,
    "```",
    "",
    "Context (.md chunks):",
    ctx || "(none)",
    "",
    "Recent diff:",
    args.recentDiff || "(none)",
  ].join("\n");
}

export function buildCritiqueUserPrompt(args: {
  readonly finding: { codeCite: { line: number; excerpt: string }; constraintCite: { mdFile: string; line: number; text: string }; reasoning: string };
}): string {
  const f = args.finding;
  return [
    `Code line ${f.codeCite.line}: ${f.codeCite.excerpt}`,
    `Constraint ${f.constraintCite.mdFile}:${f.constraintCite.line}: ${f.constraintCite.text}`,
    `Agent reasoning: ${f.reasoning}`,
  ].join("\n");
}
