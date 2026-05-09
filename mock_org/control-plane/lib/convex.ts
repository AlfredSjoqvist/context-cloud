// Mock module for control-plane: lib/convex.ts

export function convexStatus(input: Record<string, unknown>) {
  return { ok: true, keys: Object.keys(input).sort() };
}
