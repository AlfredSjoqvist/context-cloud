import path from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  DOCS_INGEST_HOME: z.string().optional(),
  DOCS_INGEST_CONTEXT_MAP: z.string().optional(),
  DOCS_INGEST_CODEBASE_ROOT: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5"),
  CONVEX_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
});

export type Env = z.infer<typeof EnvSchema>;

export interface Config {
  home: string;
  registryPath: string;
  contextMapRoot: string;
  codebaseRoot: string;
  openai: {
    apiKey: string | undefined;
    model: string;
  };
  convexUrl: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  const home =
    parsed.DOCS_INGEST_HOME ?? path.resolve(process.cwd());
  const contextMapRoot =
    parsed.DOCS_INGEST_CONTEXT_MAP ?? path.join(home, ".context-map");
  const codebaseRoot =
    parsed.DOCS_INGEST_CODEBASE_ROOT ?? home;
  return {
    home,
    registryPath: path.join(home, "sources.json"),
    contextMapRoot,
    codebaseRoot,
    openai: {
      apiKey: parsed.OPENAI_API_KEY,
      model: parsed.OPENAI_MODEL,
    },
    convexUrl: parsed.CONVEX_URL,
  };
}
