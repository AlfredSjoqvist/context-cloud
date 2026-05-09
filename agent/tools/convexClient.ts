import { ConvexHttpClient } from "convex/browser";
import type { GuardianConfig } from "../lib/config.js";

let cached: ConvexHttpClient | null = null;

export function getConvex(config: GuardianConfig): ConvexHttpClient {
  if (cached) return cached;
  cached = new ConvexHttpClient(config.convexUrl);
  return cached;
}

// Test seam.
export function _resetConvexClientForTests(): void {
  cached = null;
}
