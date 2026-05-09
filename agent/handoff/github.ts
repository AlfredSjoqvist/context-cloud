import type { GithubAuth } from "./githubAuth.js";
import type { Finding } from "../analyze/types.js";

export interface CreateIssueArgs {
  readonly auth: GithubAuth;
  readonly owner: string;
  readonly repo: string;
  readonly finding: Finding;
  readonly cycleNumber: number;
}

export async function createIssueForFinding(
  args: CreateIssueArgs,
): Promise<{ issueNumber: number }> {
  const octokit = await args.auth.forRepo(args.owner, args.repo);
  const f = args.finding;

  const title = `[${f.category}] ${f.path}:${f.codeCite.line} — ${truncate(f.reasoning, 80)}`;
  const body = renderIssueBody(f, args.cycleNumber);
  const labels = ["guardian", f.category, `severity:${f.severity}`];

  const res = await octokit.rest.issues.create({
    owner: args.owner,
    repo: args.repo,
    title,
    body,
    labels,
  });

  return { issueNumber: res.data.number };
}

export interface CommentOnPRArgs {
  readonly auth: GithubAuth;
  readonly owner: string;
  readonly repo: string;
  readonly prNumber: number;
  readonly body: string;
}

export async function commentOnPR(args: CommentOnPRArgs): Promise<void> {
  const octokit = await args.auth.forRepo(args.owner, args.repo);
  await octokit.rest.issues.createComment({
    owner: args.owner,
    repo: args.repo,
    issue_number: args.prNumber,
    body: args.body,
  });
}

export interface GetPRStatusArgs {
  readonly auth: GithubAuth;
  readonly owner: string;
  readonly repo: string;
  readonly prNumber: number;
}

export async function getPRStatus(
  args: GetPRStatusArgs,
): Promise<"open" | "merged" | "closed"> {
  const octokit = await args.auth.forRepo(args.owner, args.repo);
  const res = await octokit.rest.pulls.get({
    owner: args.owner,
    repo: args.repo,
    pull_number: args.prNumber,
  });
  if (res.data.merged) return "merged";
  if (res.data.state === "closed") return "closed";
  return "open";
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function renderIssueBody(f: Finding, cycleNumber: number): string {
  return [
    `## Guardian Finding — ${f.category}`,
    `**Severity:** ${f.severity}`,
    `**File:** ${f.path}:${f.codeCite.line}`,
    `**Code:**`,
    "```",
    f.codeCite.excerpt,
    "```",
    `**Violated constraint:** ${f.constraintCite.mdFile}:${f.constraintCite.line}`,
    `> ${f.constraintCite.text}`,
    `**Reasoning:** ${f.reasoning}`,
    `**Suggested direction:** ${f.suggestedFixDirection}`,
    "",
    "---",
    `_filed by guardian cycle ${cycleNumber}_`,
  ].join("\n");
}
