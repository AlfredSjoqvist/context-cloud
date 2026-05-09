"use client";

import React from "react";

interface Props {
  readonly latestCycle:
    | { cycleNumber: number; status: "running" | "done" | "failed" }
    | null
    | undefined;
}

export function CycleHeader({ latestCycle }: Props): React.JSX.Element {
  const label = latestCycle
    ? `cycle ${latestCycle.cycleNumber} · ${latestCycle.status}`
    : "no cycles yet";
  return (
    <header className="border-b border-zinc-800 px-6 py-3 text-zinc-400">
      <span>guardian</span>
      <span className="mx-2 opacity-50">|</span>
      <span>{label}</span>
    </header>
  );
}
