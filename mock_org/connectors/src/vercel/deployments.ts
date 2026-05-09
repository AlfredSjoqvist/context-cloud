// Mock module for connectors: src/vercel/deployments.ts

export function deploymentsStatus(input: Record<string, unknown>) {
  return { ok: true, keys: Object.keys(input).sort() };
}
