import { redactSecrets } from "../lib/redaction";

export type ToolEvent = {
  orgId: string;
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
};

export function normalizeToolEvent(event: ToolEvent) {
  if (!event.orgId) throw new Error("orgId is required");
  return {
    ...event,
    input: redactSecrets(event.input),
  };
}
