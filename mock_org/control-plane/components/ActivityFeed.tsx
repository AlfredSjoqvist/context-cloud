"use client";

import { formatRelativeTime } from "../lib/format";

export type Activity = {
  id: string;
  kind: "note.created" | "note.injected" | "gc.pruned" | "guardian.rejected";
  actor: string;
  createdAt: string;
  seeded?: boolean;
};

export function ActivityFeed({ items }: { items: Activity[] }) {
  return (
    <section aria-label="Activity feed">
      {items.map((item) => (
        <article key={item.id} data-kind={item.kind}>
          <strong>{item.kind}</strong>
          <span>{item.actor}</span>
          <time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time>
          {item.seeded ? <span data-seeded="true">seeded</span> : null}
        </article>
      ))}
    </section>
  );
}
