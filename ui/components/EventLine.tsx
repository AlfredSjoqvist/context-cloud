"use client";

import React from "react";

interface Props {
  readonly timestamp: number;
  readonly level: "info" | "warn" | "finding" | "action";
  readonly message: string;
}

const PREFIX: Record<Props["level"], string> = {
  info: "▸",
  action: "▸",
  finding: "⚠",
  warn: "!",
};

const COLOR: Record<Props["level"], string> = {
  info: "text-zinc-300",
  action: "text-emerald-300",
  finding: "text-amber-300",
  warn: "text-rose-300",
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19);
}

export function EventLine({ timestamp, level, message }: Props): React.JSX.Element {
  return (
    <div className={`flex gap-3 leading-tight ${COLOR[level]}`}>
      <span className="text-zinc-500">[{formatTimestamp(timestamp)}]</span>
      <span aria-hidden>{PREFIX[level]}</span>
      <span className="whitespace-pre-wrap">{message}</span>
    </div>
  );
}
