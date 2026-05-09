"use client";

import React from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";

interface DocsIngestRunRow {
  readonly _id: string;
  readonly _creationTime: number;
  readonly runId: string;
  readonly lib: string;
  readonly topic: string;
  readonly sourceUri: string;
  readonly sourceUrl?: string;
  readonly ruleCount: number;
  readonly appliesTo: readonly string[];
  readonly leafPath: string;
  readonly extractor?: "llm" | "regex" | string;
}

const listRecentRef = makeFunctionReference<
  "query",
  { limit?: number },
  DocsIngestRunRow[]
>("docsIngestRuns:listRecent");

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19);
}

function extractorBadgeColor(extractor: string | undefined): string {
  if (extractor === "llm") return "bg-violet-500/20 text-violet-200";
  if (extractor === "regex") return "bg-sky-500/20 text-sky-200";
  return "bg-zinc-700/40 text-zinc-300";
}

function AppliesToChips({ items }: { items: readonly string[] }): React.JSX.Element {
  const visible = items.slice(0, 3);
  const remaining = items.length - visible.length;
  return (
    <span className="flex flex-wrap gap-1">
      {visible.map((entry) => (
        <span
          key={entry}
          className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-xs text-zinc-300"
        >
          {entry}
        </span>
      ))}
      {remaining > 0 && (
        <span className="rounded bg-zinc-800/40 px-1.5 py-0.5 text-xs text-zinc-400">
          +{remaining} more
        </span>
      )}
    </span>
  );
}

export function DocsIngestStream(): React.JSX.Element {
  const runs = useQuery(listRecentRef, { limit: 200 });

  return (
    <section className="border-t border-zinc-800 px-6 py-4 text-base md:text-lg space-y-1">
      <h2 className="mb-2 text-sm uppercase tracking-wider text-zinc-500">
        Docs ingestion stream
      </h2>
      {runs === undefined && (
        <div className="text-zinc-500">connecting…</div>
      )}
      {runs !== undefined && runs.length === 0 && (
        <div className="text-zinc-500">
          Waiting for the next docs-ingest run…
        </div>
      )}
      {runs?.map((run) => (
        <div
          key={run._id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 leading-tight text-zinc-300"
        >
          <span className="text-zinc-500">
            [{formatTimestamp(run._creationTime)}]
          </span>
          <span className="text-emerald-300">{run.lib}</span>
          <span className="text-zinc-500">/</span>
          <span className="text-emerald-200">{run.topic}</span>
          <span className="text-zinc-400">
            {run.ruleCount} rules • src={run.sourceUri}
          </span>
          {run.sourceUrl && (
            <a
              href={run.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sky-400 underline decoration-dotted hover:text-sky-300"
            >
              link
            </a>
          )}
          <AppliesToChips items={run.appliesTo} />
          {run.extractor && (
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${extractorBadgeColor(
                run.extractor,
              )}`}
            >
              {run.extractor}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
