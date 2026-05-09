import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import type { GuardianConfig } from "../lib/config.js";
import type { EventSink } from "../lib/logger.js";

let cached: ConvexHttpClient | null = null;

export function getConvex(config: GuardianConfig): ConvexHttpClient {
  if (cached) return cached;
  cached = new ConvexHttpClient(config.convexUrl);
  return cached;
}

export function makeConvexEventSink(config: GuardianConfig): EventSink {
  const client = getConvex(config);
  return async (payload) => {
    await client.mutation(api.events.append, {
      level: payload.level,
      message: payload.message,
      cycleNumber: payload.cycleNumber,
      metadata: payload.metadata,
    });
  };
}

export function _resetConvexClientForTests(): void {
  cached = null;
}
