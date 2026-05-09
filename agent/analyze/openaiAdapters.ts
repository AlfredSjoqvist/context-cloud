import OpenAI from "openai";
import { AnalyzerOutputSchema, CritiqueOutputSchema } from "./prompts.js";
import type { AnalyzerLLMCall } from "./analyzer.js";
import type { CritiqueLLMCall } from "./critique.js";

export interface AdapterConfig {
  readonly client: OpenAI;
  readonly model: string;
  readonly critiqueModel: string;
}

export function makeAnalyzerLLMCall(cfg: AdapterConfig): AnalyzerLLMCall {
  return async ({ systemPrompt, userPrompt }) => {
    const res = await cfg.client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "AnalyzerOutput",
          strict: true,
          schema: zodToOpenAIJsonSchema(AnalyzerOutputSchema),
        },
      },
    });
    const content = res.choices[0]?.message?.content ?? "{}";
    return AnalyzerOutputSchema.parse(JSON.parse(content));
  };
}

export function makeCritiqueLLMCall(cfg: AdapterConfig): CritiqueLLMCall {
  return async ({ systemPrompt, userPrompt }) => {
    const res = await cfg.client.chat.completions.create({
      model: cfg.critiqueModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "CritiqueOutput",
          strict: true,
          schema: zodToOpenAIJsonSchema(CritiqueOutputSchema),
        },
      },
    });
    const content = res.choices[0]?.message?.content ?? "{}";
    return CritiqueOutputSchema.parse(JSON.parse(content));
  };
}

function zodToOpenAIJsonSchema(schema: unknown): Record<string, unknown> {
  if (schema === AnalyzerOutputSchema) {
    return {
      type: "object",
      additionalProperties: false,
      required: ["findings"],
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "severity",
              "category",
              "codeCite",
              "constraintCite",
              "reasoning",
              "suggestedFixDirection",
            ],
            properties: {
              severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
              category: {
                type: "string",
                enum: ["intent_drift", "security", "bug"],
              },
              codeCite: {
                type: "object",
                additionalProperties: false,
                required: ["line", "excerpt"],
                properties: {
                  line: { type: "integer", minimum: 1 },
                  excerpt: { type: "string", minLength: 1 },
                },
              },
              constraintCite: {
                type: "object",
                additionalProperties: false,
                required: ["mdFile", "line", "text"],
                properties: {
                  mdFile: { type: "string", minLength: 1 },
                  line: { type: "integer", minimum: 1 },
                  text: { type: "string", minLength: 1 },
                },
              },
              reasoning: { type: "string", minLength: 1 },
              suggestedFixDirection: { type: "string", minLength: 1 },
            },
          },
        },
      },
    };
  }

  if (schema === CritiqueOutputSchema) {
    return {
      type: "object",
      additionalProperties: false,
      required: ["confident", "reason"],
      properties: {
        confident: { type: "boolean" },
        reason: { type: "string" },
      },
    };
  }

  throw new Error("zodToOpenAIJsonSchema: unknown schema");
}
