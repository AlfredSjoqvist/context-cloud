import { z } from "zod";

const boolFromEnv = z
  .union([z.literal("0"), z.literal("1"), z.literal("true"), z.literal("false")])
  .transform((v) => v === "1" || v === "true");

const Schema = z.object({
  niaApiKey: z.string().min(1),
  niaMcpUrl: z.string().url(),
  convexUrl: z.string().url(),
  cycleIntervalSeconds: z.coerce.number().int().positive(),
  priorityBudget: z.coerce.number().int().nonnegative(),
  judgmentBudget: z.coerce.number().int().nonnegative(),
  useMockLlm: boolFromEnv,
  useMockDevin: boolFromEnv,
  skipNia: boolFromEnv,
});

export type GuardianConfig = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): GuardianConfig {
  const parsed = Schema.parse({
    niaApiKey: env.NIA_API_KEY,
    niaMcpUrl: env.NIA_MCP_URL,
    convexUrl: env.CONVEX_URL,
    cycleIntervalSeconds: env.GUARDIAN_CYCLE_INTERVAL_S,
    priorityBudget: env.GUARDIAN_PRIORITY_BUDGET,
    judgmentBudget: env.GUARDIAN_JUDGMENT_BUDGET,
    useMockLlm: env.USE_MOCK_LLM,
    useMockDevin: env.USE_MOCK_DEVIN,
    skipNia: env.SKIP_NIA,
  });
  return parsed;
}
