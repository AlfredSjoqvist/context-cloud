// Mock module for connectors: src/nia/search.ts

export function searchStatus(input: Record<string, unknown>) {
  return { ok: true, keys: Object.keys(input).sort() };
}
