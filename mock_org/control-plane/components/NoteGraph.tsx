"use client";

export type GraphEdge = { noteId: string; path: string; weight: number };
export type FolderAnchor = { path: string; collapsed: boolean };

export function effectiveAnchor(path: string, folders: FolderAnchor[]) {
  const collapsed = folders
    .filter((folder) => folder.collapsed && path.startsWith(`${folder.path}/`))
    .sort((a, b) => a.path.length - b.path.length)[0];
  return collapsed?.path ?? path;
}

export function mergeCollapsedEdges(edges: GraphEdge[], folders: FolderAnchor[]) {
  const groups = new Map<string, GraphEdge>();
  for (const edge of edges) {
    const anchor = effectiveAnchor(edge.path, folders);
    const key = `${edge.noteId}:${anchor}`;
    const existing = groups.get(key);
    groups.set(key, existing ? { ...existing, weight: existing.weight + edge.weight } : { ...edge, path: anchor });
  }
  return [...groups.values()];
}
