// Mock module for agent-gateway: src/api/auth.ts

export function authStatus(input: Record<string, unknown>) {
  return { ok: true, keys: Object.keys(input).sort() };
}
