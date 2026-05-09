import OpenAI from "openai";

let cachedRaw: OpenAI | null = null;

export interface OpenAIClientConfig {
  readonly apiKey: string;
}

export function getOpenAI(cfg: OpenAIClientConfig): OpenAI {
  if (cachedRaw) return cachedRaw;
  cachedRaw = new OpenAI({ apiKey: cfg.apiKey });
  return cachedRaw;
}

export function _resetOpenAIClientForTests(): void {
  cachedRaw = null;
}
