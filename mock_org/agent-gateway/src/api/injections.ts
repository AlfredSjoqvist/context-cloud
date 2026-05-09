// Mock module for agent-gateway: src/api/injections.ts

export function injectionsStatus(input: Record<string, unknown>) {
  return { ok: true, keys: Object.keys(input).sort() };
}
