export type ReplayMessage = {
  id: string;
  parentUuid?: string | null;
  ts: string;
};

export function orderReplay(messages: ReplayMessage[]) {
  return [...messages].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
}
