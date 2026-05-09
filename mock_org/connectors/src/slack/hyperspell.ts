export type Enrichment = {
  source: "slack" | "drive" | "github" | "notion";
  title: string;
  url: string;
};

export function attachSupportingContext(noteId: string, refs: Enrichment[]) {
  return {
    noteId,
    primarySignal: "coding-session-friction",
    supportingRefs: refs.slice(0, 3),
  };
}
