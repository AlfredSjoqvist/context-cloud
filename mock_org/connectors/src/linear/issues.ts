const created = new Set<string>();

export function issueExternalId(noteId: string) {
  return `nm-note:${noteId}`;
}

export function reserveIssue(noteId: string) {
  const externalId = issueExternalId(noteId);
  if (created.has(externalId)) return false;
  created.add(externalId);
  return true;
}
