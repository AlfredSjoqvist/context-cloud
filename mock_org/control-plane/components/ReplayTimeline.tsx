// Mock module for control-plane: components/ReplayTimeline.tsx

export function ReplayTimelineStatus(input: Record<string, unknown>) {
  return { ok: true, keys: Object.keys(input).sort() };
}
