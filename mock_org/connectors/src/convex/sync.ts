// Mock module for connectors: src/convex/sync.ts

export function syncStatus(input: Record<string, unknown>) {
  return { ok: true, keys: Object.keys(input).sort() };
}
