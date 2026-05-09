// NM (Note Memory) client — lets the Guardian analyzer pull NM notes attached
// to a file before reasoning about it. Notes carry institutional knowledge
// extracted from prior coding-agent sessions ("don't hardcode that URL",
// "JWT verification needs the expiry check", etc).
//
// Falls back to an empty list on any error (network, missing query, no
// matches) — Guardian must not crash because NM is offline.

import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

export interface NmContextItem {
  readonly noteId: string;
  readonly symptom: string;
  readonly rootCause: string;
  readonly correction?: string;
  readonly importance: number;
  readonly weight: number; // edge weight for this file (note↔file)
}

export interface NmClient {
  notesForPath(path: string, opts?: { topK?: number }): Promise<NmContextItem[]>;
}

export function makeNmClient(convex: ConvexHttpClient): NmClient {
  return {
    async notesForPath(path, opts) {
      const topK = opts?.topK ?? 6;
      try {
        const edges = await convex.query(api.notes.listEdgesForPath, { path });
        if (!edges || edges.length === 0) return [];
        const noteIds = edges.map((e: { noteId: string }) => e.noteId);
        // Fetch active notes once and join client-side. We avoid an O(N)
        // round-trip by listing active notes (small set) and filtering.
        const allActive = await convex.query(api.notes.listActive, { limit: 200 });
        const byId = new Map(allActive.map((n: any) => [n.noteId, n]));
        const items: NmContextItem[] = [];
        for (const e of edges) {
          const n = byId.get(e.noteId);
          if (!n) continue; // invalidated / not surfaced
          items.push({
            noteId: e.noteId,
            symptom: n.symptom,
            rootCause: n.rootCause,
            correction: n.correction ?? undefined,
            importance: n.importance ?? 0,
            weight: e.weight ?? 0,
          });
        }
        // Sort by importance × weight, take top-K.
        items.sort((a, b) => (b.importance * b.weight) - (a.importance * a.weight));
        return items.slice(0, topK);
      } catch {
        return [];
      }
    },
  };
}
