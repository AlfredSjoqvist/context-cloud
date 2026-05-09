import { z } from "zod";
import OpenAI from "openai";

const JudgmentOutputSchema = z.object({
  picks: z.array(z.object({ path: z.string(), reason: z.string() })),
});

export type JudgmentLLMCall = (input: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<{ picks: Array<{ path: string; reason: string }> }>;

const SYSTEM_PROMPT = `You are the planning lobe of the Guardian agent. The rule-based priority function has already chosen N files for this scan cycle. Your job is to pick 0–2 ADDITIONAL files that are worth a deep look this cycle that the priority function might miss.

Reasons to pick a file:
- It contains security-sensitive patterns (auth, payments, sessions, crypto) that have not been deep-scanned recently.
- A .md constraint mentions it explicitly and the constraint hasn't been verified in many cycles.
- High recent churn or recent commits touched it.
- A judgment call you can defend in one short sentence.

Constraints:
- Each pick MUST be in the candidate list provided.
- Each pick MUST NOT be in the already-picked list.
- Return at most \`budget\` picks. Returning fewer (including zero) is fine when nothing rises above noise.
- Each reason must be one sentence and reference a concrete signal — never "looks important".

Return JSON: { picks: [{ path, reason }, ...] }`;

export async function judgmentPicks(args: {
  readonly cycleNumber: number;
  readonly candidates: ReadonlyArray<string>;
  readonly alreadyPicked: ReadonlyArray<string>;
  readonly budget: number;
  readonly callLLM: JudgmentLLMCall;
}): Promise<Array<{ path: string; reason: string }>> {
  if (args.budget <= 0) return [];

  const candidatePool = args.candidates.filter((p) => !args.alreadyPicked.includes(p));
  if (candidatePool.length === 0) return [];

  const userPrompt = [
    `Cycle: ${args.cycleNumber}`,
    `Budget: ${args.budget}`,
    ``,
    `Candidates (you may only pick from this list):`,
    ...candidatePool.map((p) => `  - ${p}`),
    ``,
    `Already picked by priority (do not duplicate):`,
    ...args.alreadyPicked.map((p) => `  - ${p}`),
  ].join("\n");

  let raw: unknown;
  try {
    raw = await args.callLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
    });
  } catch {
    return [];
  }

  const parsed = JudgmentOutputSchema.safeParse(raw);
  if (!parsed.success) return [];

  const valid = parsed.data.picks.filter(
    (p) => candidatePool.includes(p.path) && !args.alreadyPicked.includes(p.path),
  );
  return valid.slice(0, args.budget);
}

export function makeJudgmentLLMCall(client: OpenAI, model: string): JudgmentLLMCall {
  return async ({ systemPrompt, userPrompt }) => {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "JudgmentOutput",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["picks"],
            properties: {
              picks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["path", "reason"],
                  properties: {
                    path: { type: "string", minLength: 1 },
                    reason: { type: "string", minLength: 1 },
                  },
                },
              },
            },
          },
        },
      },
    });
    const content = res.choices[0]?.message?.content ?? "{}";
    return JudgmentOutputSchema.parse(JSON.parse(content));
  };
}
