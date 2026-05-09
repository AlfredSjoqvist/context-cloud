// Mock module for agent-gateway: src/db/schema.ts

export function schemaStatus(input: Record<string, unknown>) {
  return { ok: true, keys: Object.keys(input).sort() };
}
