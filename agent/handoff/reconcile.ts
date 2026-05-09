import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import type { Doc, Id } from "../../convex/_generated/dataModel.js";
import { Logger } from "../lib/logger.js";
import type { NiaClient } from "../tools/niaClient.js";
import { getDevinRunStatus, spawnDevinRun } from "./devin.js";
import { getPRStatus, commentOnPR } from "./github.js";
import type { GithubAuth } from "./githubAuth.js";
import { verifyCitation } from "../analyze/citation.js";
import type { Finding } from "../analyze/types.js";

export interface ReconcileDeps {
  readonly convex: ConvexHttpClient;
  readonly nia: NiaClient;
  readonly log: Logger;
  readonly githubAuth: GithubAuth;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly devinApiKey: string;
}

const SHARPEN_CAP = 2;

export async function reconcileOpenFindings(deps: ReconcileDeps): Promise<void> {
  // Walk every finding in a non-terminal state and try to advance it.
  for (const status of [
    "devin_running",
    "pr_open",
    "verifying",
    "reopened_sharpened",
  ] as const) {
    const findings = (await deps.convex.query(api.findings.byStatus, {
      status,
    })) as Array<Doc<"findings">>;
    for (const f of findings) {
      try {
        switch (f.status) {
          case "devin_running":
          case "reopened_sharpened":
            await advanceFromDevinRunning(deps, f);
            break;
          case "pr_open":
            await advanceFromPrOpen(deps, f);
            break;
          case "verifying":
            await advanceFromVerifying(deps, f);
            break;
          default:
            break;
        }
      } catch (err) {
        await deps.log.warn(
          `reconcile: finding ${f._id} failed: ${(err as Error).message}`,
        );
      }
    }
  }
}

async function advanceFromDevinRunning(
  deps: ReconcileDeps,
  f: Doc<"findings">,
): Promise<void> {
  const runs = (await deps.convex.query(api.devinRuns.byFinding, {
    findingId: f._id,
  })) as Array<Doc<"devinRuns">>;
  if (runs.length === 0) return;
  // Pick the latest run by iteration number.
  const run = [...runs].sort((a, b) => b.iteration - a.iteration)[0]!;

  const status = await getDevinRunStatus(deps.devinApiKey, run.devinRunId);
  if (status.prNumber && status.prUrl) {
    await deps.convex.mutation(api.devinRuns.linkPR, {
      runId: run._id,
      prNumber: status.prNumber,
      prUrl: status.prUrl,
    });
    await deps.convex.mutation(api.findings.setStatus, {
      findingId: f._id,
      status: "pr_open",
    });
    // Drop a guardian comment with cite-context.
    const body = [
      `Guardian: this PR was opened in response to issue #${f.githubIssueNumber}.`,
      ``,
      `**Cited constraint** (${f.constraintCite.mdFile}:${f.constraintCite.line}):`,
      `> ${f.constraintCite.text}`,
      ``,
      `Once merged, the next guardian cycle will re-scan ${f.path} and either resolve the finding or sharpen the prompt and re-spawn Devin (max ${SHARPEN_CAP} iterations).`,
    ].join("\n");
    try {
      await commentOnPR({
        auth: deps.githubAuth,
        owner: deps.githubOwner,
        repo: deps.githubRepo,
        prNumber: status.prNumber,
        body,
      });
    } catch (err) {
      await deps.log.warn(
        `comment on PR #${status.prNumber} failed: ${(err as Error).message}`,
      );
    }
    await deps.log.action(
      `pr_open #${status.prNumber} for finding ${f._id} (devin ${run.devinRunId})`,
    );
  }
}

async function advanceFromPrOpen(
  deps: ReconcileDeps,
  f: Doc<"findings">,
): Promise<void> {
  const runs = (await deps.convex.query(api.devinRuns.byFinding, {
    findingId: f._id,
  })) as Array<Doc<"devinRuns">>;
  const run = [...runs].sort((a, b) => b.iteration - a.iteration)[0];
  if (!run || !run.prNumber) return;

  const prState = await getPRStatus({
    auth: deps.githubAuth,
    owner: deps.githubOwner,
    repo: deps.githubRepo,
    prNumber: run.prNumber,
  });
  if (prState === "merged") {
    await deps.convex.mutation(api.devinRuns.markOutcome, {
      runId: run._id,
      outcome: "merged",
      prMergedAt: Date.now(),
    });
    await deps.convex.mutation(api.findings.setStatus, {
      findingId: f._id,
      status: "verifying",
    });
    await deps.log.action(
      `pr_merged #${run.prNumber} → verifying finding ${f._id}`,
    );
  } else if (prState === "closed") {
    await deps.convex.mutation(api.devinRuns.markOutcome, {
      runId: run._id,
      outcome: "closed_unmerged",
    });
    await deps.convex.mutation(api.findings.setStatus, {
      findingId: f._id,
      status: "escalated",
    });
    await deps.log.warn(`pr_closed_unmerged #${run.prNumber} → escalated`);
  }
}

async function advanceFromVerifying(
  deps: ReconcileDeps,
  f: Doc<"findings">,
): Promise<void> {
  // Re-run citation check against current code. If the constraint is no longer
  // violated (citation excerpt diverges from the cited line), mark resolved.
  // If it still matches, the violation persists — sharpen and respawn.
  const findingForCite: Finding = {
    path: f.path,
    severity: f.severity as Finding["severity"],
    category: f.category as Finding["category"],
    codeCite: f.codeCite,
    constraintCite: f.constraintCite,
    reasoning: f.reasoning,
    suggestedFixDirection: f.suggestedFixDirection,
  };
  const cite = await verifyCitation({ finding: findingForCite, nia: deps.nia });
  if (!cite.ok) {
    // The cited line no longer matches the recorded excerpt — Devin's PR
    // changed it. Treat as resolved.
    await deps.convex.mutation(api.findings.setStatus, {
      findingId: f._id,
      status: "resolved",
    });
    await deps.log.action(`resolved finding ${f._id} (${f.path}:${f.codeCite.line})`);
    return;
  }

  // Constraint citation still matches → not actually fixed.
  if (f.sharpenIterations >= SHARPEN_CAP - 1) {
    await deps.convex.mutation(api.findings.setStatus, {
      findingId: f._id,
      status: "escalated",
    });
    await deps.log.warn(
      `escalated finding ${f._id} after ${f.sharpenIterations + 1} attempts`,
    );
    return;
  }

  // Sharpen: spawn a new Devin run.
  await deps.convex.mutation(api.findings.incrementSharpen, { findingId: f._id });
  const previousRuns = (await deps.convex.query(api.devinRuns.byFinding, {
    findingId: f._id,
  })) as Array<Doc<"devinRuns">>;
  const previousRun = [...previousRuns].sort((a, b) => b.iteration - a.iteration)[0];
  const nextIteration = (previousRun?.iteration ?? 0) + 1;
  const previousDiff = await fetchPRDiffSafe(deps, previousRun?.prNumber);

  const spawn = await spawnDevinRun({
    apiKey: deps.devinApiKey,
    issueNumber: f.githubIssueNumber!,
    githubOwner: deps.githubOwner,
    githubRepo: deps.githubRepo,
    finding: {
      path: f.path,
      severity: f.severity as never,
      category: f.category as never,
      codeCite: f.codeCite,
      constraintCite: f.constraintCite,
      reasoning: f.reasoning,
      suggestedFixDirection: f.suggestedFixDirection,
    },
    iteration: nextIteration,
    previousAttemptDiff: previousDiff,
  });
  await deps.convex.mutation(api.devinRuns.recordRun, {
    findingId: f._id,
    devinRunId: spawn.devinRunId,
    promptUsed: spawn.promptUsed,
    iteration: nextIteration,
  });
  await deps.convex.mutation(api.findings.setStatus, {
    findingId: f._id,
    status: "reopened_sharpened",
  });
  await deps.log.action(
    `sharpened finding ${f._id} → devin iteration ${nextIteration}`,
  );
}

async function fetchPRDiffSafe(
  deps: ReconcileDeps,
  prNumber: number | undefined,
): Promise<string> {
  if (!prNumber) return "";
  try {
    const octokit = await deps.githubAuth.forRepo(deps.githubOwner, deps.githubRepo);
    const res = await octokit.rest.pulls.get({
      owner: deps.githubOwner,
      repo: deps.githubRepo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    return typeof res.data === "string" ? res.data : "";
  } catch {
    return "";
  }
}
