import { z } from "zod";

const boolFromEnv = z
  .union([z.literal("0"), z.literal("1"), z.literal("true"), z.literal("false")])
  .transform((v) => v === "1" || v === "true");

const Schema = z
  .object({
    niaApiKey: z.string().optional(),
    niaMcpUrl: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
    convexUrl: z.string().url(),
    openaiApiKey: z.string().optional(),
    openaiModel: z.string().default("gpt-5"),
    openaiCritiqueModel: z.string().default("gpt-5-mini"),
    githubToken: z.string().optional(),
    githubOwner: z.string().optional(),
    githubRepo: z.string().optional(),
    cycleIntervalSeconds: z.coerce.number().int().positive(),
    priorityBudget: z.coerce.number().int().nonnegative(),
    judgmentBudget: z.coerce.number().int().nonnegative(),
    useMockLlm: boolFromEnv,
    useMockDevin: boolFromEnv,
    skipNia: boolFromEnv,
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.skipNia) {
      if (!cfg.niaApiKey || cfg.niaApiKey.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["niaApiKey"],
          message: "NIA_API_KEY is required when SKIP_NIA=0",
        });
      }
      if (!cfg.niaMcpUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["niaMcpUrl"],
          message: "NIA_MCP_URL is required when SKIP_NIA=0",
        });
      }
    }
    if (!cfg.useMockLlm) {
      if (!cfg.openaiApiKey || cfg.openaiApiKey.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["openaiApiKey"],
          message: "OPENAI_API_KEY is required when USE_MOCK_LLM=0",
        });
      }
    }
    for (const key of ["githubToken", "githubOwner", "githubRepo"] as const) {
      const value = cfg[key];
      if (!value || value.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required`,
        });
      }
    }
  });

export type GuardianConfig = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): GuardianConfig {
  const parsed = Schema.parse({
    niaApiKey: env.NIA_API_KEY,
    niaMcpUrl: env.NIA_MCP_URL,
    convexUrl: env.CONVEX_URL,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL,
    openaiCritiqueModel: env.OPENAI_CRITIQUE_MODEL,
    githubToken: env.GITHUB_TOKEN,
    githubOwner: env.GITHUB_OWNER,
    githubRepo: env.GITHUB_REPO,
    cycleIntervalSeconds: env.GUARDIAN_CYCLE_INTERVAL_S,
    priorityBudget: env.GUARDIAN_PRIORITY_BUDGET,
    judgmentBudget: env.GUARDIAN_JUDGMENT_BUDGET,
    useMockLlm: env.USE_MOCK_LLM,
    useMockDevin: env.USE_MOCK_DEVIN,
    skipNia: env.SKIP_NIA,
  });
  return parsed;
}
