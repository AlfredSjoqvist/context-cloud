import type { Finding } from "../analyze/types.js";

const DEVIN_BASE = "https://api.devin.ai/v1";

export interface SpawnDevinArgs {
  readonly apiKey: string;
  readonly issueNumber: number;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly finding: Finding;
  readonly iteration: number;
  readonly previousAttemptDiff?: string;
}

export interface SpawnDevinResult {
  readonly devinRunId: string;
  readonly url: string;
  readonly promptUsed: string;
}

export async function spawnDevinRun(args: SpawnDevinArgs): Promise<SpawnDevinResult> {
  const prompt =
    args.iteration === 1
      ? buildInitialPrompt(args)
      : buildSharpenPrompt(args);

  const res = await fetch(`${DEVIN_BASE}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      idempotent: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`devin spawn failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { session_id: string; url: string };
  return { devinRunId: data.session_id, url: data.url, promptUsed: prompt };
}

export interface DevinRunStatus {
  readonly status: string;
  readonly prNumber?: number;
  readonly prUrl?: string;
}

export async function getDevinRunStatus(
  apiKey: string,
  sessionId: string,
): Promise<DevinRunStatus> {
  const res = await fetch(`${DEVIN_BASE}/session/${sessionId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    return { status: "unknown" };
  }
  const data = (await res.json()) as {
    status_enum?: string;
    pull_request?: { number?: number; url?: string } | null;
  };
  return {
    status: data.status_enum ?? "unknown",
    prNumber: data.pull_request?.number,
    prUrl: data.pull_request?.url,
  };
}

function buildInitialPrompt(args: SpawnDevinArgs): string {
  const f = args.finding;
  return [
    `You are fixing a Guardian Agent finding on the repository ${args.githubOwner}/${args.githubRepo}.`,
    ``,
    `# GitHub Issue`,
    `https://github.com/${args.githubOwner}/${args.githubRepo}/issues/${args.issueNumber}`,
    ``,
    `# Finding`,
    `Category: ${f.category}`,
    `Severity: ${f.severity}`,
    `File: ${f.path}:${f.codeCite.line}`,
    `Code:`,
    "```",
    f.codeCite.excerpt,
    "```",
    ``,
    `# Violated constraint`,
    `Source: ${f.constraintCite.mdFile}:${f.constraintCite.line}`,
    `> ${f.constraintCite.text}`,
    ``,
    `# What you must do`,
    `1. Clone the repo and check out main.`,
    `2. Make the minimum change required to satisfy the cited constraint exactly as written. Do not weaken the constraint.`,
    `3. Open a pull request that closes issue #${args.issueNumber}.`,
    `4. The PR description must explicitly cite the constraint by file:line and explain how the change satisfies it.`,
    ``,
    `# Direction (suggestion only)`,
    f.suggestedFixDirection,
    ``,
    `Reply with the PR URL when done.`,
  ].join("\n");
}

function buildSharpenPrompt(args: SpawnDevinArgs): string {
  const f = args.finding;
  return [
    `You previously attempted to fix Guardian issue #${args.issueNumber} on ${args.githubOwner}/${args.githubRepo} but the resulting code still violates the cited constraint.`,
    ``,
    `# Constraint (verbatim)`,
    `${f.constraintCite.mdFile}:${f.constraintCite.line}`,
    `> ${f.constraintCite.text}`,
    ``,
    `# Code that still violates the constraint`,
    `${f.path}:${f.codeCite.line}`,
    "```",
    f.codeCite.excerpt,
    "```",
    ``,
    `# Why your previous attempt didn't satisfy the constraint`,
    f.reasoning,
    ``,
    args.previousAttemptDiff
      ? [`# Your previous diff`, "```diff", args.previousAttemptDiff.slice(0, 4000), "```", ""].join("\n")
      : "",
    `# Iteration ${args.iteration}`,
    `Open a NEW pull request that fixes the constraint at ${f.path}:${f.codeCite.line}. Do not weaken or reinterpret the constraint. The fix must satisfy every clause of the constraint as written. Reply with the new PR URL.`,
  ].join("\n");
}

export const _internal = { buildInitialPrompt, buildSharpenPrompt };
