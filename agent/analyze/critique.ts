import type { Finding } from "./types.js";
import type { CritiqueOutput } from "./prompts.js";

export type CritiqueLLMCall = (input: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<CritiqueOutput>;

export interface CritiqueArgs {
  readonly finding: Finding;
  readonly callLLM: CritiqueLLMCall;
}

export type CritiqueResult = { keep: true } | { keep: false; reason: string };

import { CRITIQUE_SYSTEM_PROMPT, buildCritiqueUserPrompt } from "./prompts.js";

export async function critiqueFinding(args: CritiqueArgs): Promise<CritiqueResult> {
  try {
    const out = await args.callLLM({
      systemPrompt: CRITIQUE_SYSTEM_PROMPT,
      userPrompt: buildCritiqueUserPrompt({ finding: args.finding }),
    });
    if (out.confident) return { keep: true };
    return { keep: false, reason: out.reason || "low confidence" };
  } catch (err) {
    return { keep: false, reason: `critique failed: ${(err as Error).message}` };
  }
}
