"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { EventLine } from "./EventLine";
import { CycleHeader } from "./CycleHeader";

export function EventStream(): React.JSX.Element {
  const events = useQuery(api.events.listRecent, { limit: 200 });
  const latest = useQuery(api.cycles.latestCycle, {});

  return (
    <div className="min-h-screen flex flex-col">
      <CycleHeader latestCycle={latest ?? null} />
      <main className="px-6 py-4 text-base md:text-lg space-y-1">
        {events === undefined && (
          <div className="text-zinc-500">connecting…</div>
        )}
        {events !== undefined && events.length === 0 && (
          <div className="text-zinc-500">no events yet</div>
        )}
        {events?.map((ev) => (
          <EventLine
            key={ev._id}
            timestamp={ev.timestamp}
            level={ev.level}
            message={ev.message}
          />
        ))}
      </main>
    </div>
  );
}
