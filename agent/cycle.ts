import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { Logger } from "./lib/logger.js";
import type { EventSink } from "./lib/logger.js";
import type { NiaClient } from "./tools/niaClient.js";
import { priorityPicks } from "./plan/priority.js";
import type { FileScanState } from "./plan/priority.js";
import { judgmentPicks } from "./plan/judgment.js";
import type { JudgmentLLMCall } from "./plan/judgment.js";
import { findingFingerprint } from "./lib/fingerprint.js";
import { auditPackageJson } from "./analyze/npmAudit.js";
import { verifyCitation } from "./analyze/citation.js";
import { critiqueFinding } from "./analyze/critique.js";
import type { CritiqueLLMCall } from "./analyze/critique.js";
import { createIssueForFinding } from "./handoff/github.js";
import type { GithubAuth } from "./handoff/githubAuth.js";
import { spawnDevinRun } from "./handoff/devin.js";
import { reconcileOpenFindings } from "./handoff/reconcile.js";
import type { Finding } from "./analyze/types.js";
import { createHash } from "node:crypto";

export type AnalyzeFile = (path: string, nia: NiaClient) => Promise<Finding[]>;

export interface CycleDeps {
  convex: ConvexHttpClient;
  nia: NiaClient;
  sinkFor: (cycleNumber: number) => EventSink;
  candidatesProvider: () => Promise<readonly string[]>;
  priorityBudget: number;
  analyzeFile: AnalyzeFile;
  githubAuth: GithubAuth;
  githubOwner: string;
  githubRepo: string;
  demoRepoRoot: string;
  critiqueLLM?: CritiqueLLMCall;
  judgmentLLM?: JudgmentLLMCall;
  judgmentBudget: number;
  devinApiKey?: string;
}

export interface CycleResult {
  cycleNumber: number;
  status: "done" | "failed";
  plannedFiles: Array<{ path: string; reason: string }>;
  findingsFiled: number;
}

function hashContent(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export async function runCycle(deps: CycleDeps): Promise<CycleResult> {
  const cycleNumber = await deps.convex.query(api.cycles.nextCycleNumber, {});
  const cycleId: Id<"cycles"> = await deps.convex.mutation(api.cycles.openCycle, {
    cycleNumber,
  });
  const log = new Logger({ sink: deps.sinkFor(cycleNumber), cycleNumber });
  await log.info("wake");

  let findingsFiled = 0;

  try {
    const candidates = await deps.candidatesProvider();
    const historyRows = await deps.convex.query(api.fileScanHistory.getAll, {});
    const history: FileScanState[] = historyRows.map((row) => ({
      path: row.path,
      lastScannedCycle: row.lastScannedCycle,
      cleanScanStreak: row.cleanScanStreak,
    }));
    const priorityPlanned = priorityPicks({
      cycleNumber,
      candidates,
      history,
      budget: deps.priorityBudget,
    });

    let judgmentPlanned: Array<{ path: string; reason: string }> = [];
    if (deps.judgmentLLM && deps.judgmentBudget > 0) {
      try {
        const judgmentResult = await judgmentPicks({
          cycleNumber,
          candidates,
          alreadyPicked: priorityPlanned.map((p) => p.path),
          budget: deps.judgmentBudget,
          callLLM: deps.judgmentLLM,
        });
        judgmentPlanned = judgmentResult.map((p) => ({
          path: p.path,
          reason: `judgment: ${p.reason}`,
        }));
      } catch (err) {
        await log.warn(`judgment picks failed: ${(err as Error).message}`);
      }
    }

    const plannedFiles = [...priorityPlanned, ...judgmentPlanned];
    await deps.convex.mutation(api.cycles.setPlan, { cycleId, plannedFiles });
    await log.info(
      `plan: ${plannedFiles.length} files (${priorityPlanned.length} priority + ${judgmentPlanned.length} judgment)`,
      { plannedFiles },
    );

    for (const pick of plannedFiles) {
      await log.info(`scan ${pick.path}`, { reason: pick.reason });

      let body = "";
      try {
        body = await deps.nia.readFile(pick.path);
      } catch (err) {
        await log.warn(`read failed for ${pick.path}: ${(err as Error).message}`);
      }

      let rawFindings: Finding[] = [];
      if (pick.path === "package.json") {
        rawFindings = await auditPackageJson({ cwd: deps.demoRepoRoot });
      } else {
        rawFindings = await deps.analyzeFile(pick.path, deps.nia);
      }
      await log.info(`analyze ${pick.path}: ${rawFindings.length} raw findings`);

      let cleanScan = true;
      for (const f of rawFindings) {
        if (f.category !== "security") {
          const cite = await verifyCitation({ finding: f, nia: deps.nia });
          if (!cite.ok) {
            await log.warn(`drop finding (citation): ${cite.reason}`);
            continue;
          }
        }

        if (deps.critiqueLLM) {
          const critique = await critiqueFinding({ finding: f, callLLM: deps.critiqueLLM });
          if (!critique.keep) {
            const reason = critique.keep ? "" : critique.reason;
            await log.warn(`drop finding (critique): ${reason}`);
            continue;
          }
        }

        const fingerprint = findingFingerprint({
          path: f.path,
          constraintMdFile: f.constraintCite.mdFile,
          constraintLine: f.constraintCite.line,
          codeLine: f.codeCite.line,
        });
        const result = await deps.convex.mutation(api.findings.createIfAbsent, {
          fingerprint,
          cycleDetected: cycleNumber,
          severity: f.severity,
          category: f.category,
          path: f.path,
          codeCite: f.codeCite,
          constraintCite: f.constraintCite,
          reasoning: f.reasoning,
          suggestedFixDirection: f.suggestedFixDirection,
          usedContext: f.usedContext
            ? { noteIds: [...f.usedContext.noteIds], docsLeafIds: [...f.usedContext.docsLeafIds] }
            : undefined,
        });
        if (!result.created) {
          await log.info(`finding deduped: ${fingerprint.slice(0, 12)}`);
          continue;
        }
        cleanScan = false;
        const { issueNumber } = await createIssueForFinding({
          auth: deps.githubAuth,
          owner: deps.githubOwner,
          repo: deps.githubRepo,
          finding: f,
          cycleNumber,
        });
        await deps.convex.mutation(api.findings.setStatus, {
          findingId: result.id,
          status: "detected",
          githubIssueNumber: issueNumber,
        });
        findingsFiled++;

        // Devin handoff — spawn run + transition to devin_running
        if (deps.devinApiKey) {
          try {
            const spawn = await spawnDevinRun({
              apiKey: deps.devinApiKey,
              issueNumber,
              githubOwner: deps.githubOwner,
              githubRepo: deps.githubRepo,
              finding: f,
              iteration: 1,
            });
            await deps.convex.mutation(api.devinRuns.recordRun, {
              findingId: result.id,
              devinRunId: spawn.devinRunId,
              promptUsed: spawn.promptUsed,
              iteration: 1,
            });
            await deps.convex.mutation(api.findings.setStatus, {
              findingId: result.id,
              status: "devin_running",
              githubIssueNumber: issueNumber,
            });
            await log.action(
              `devin spawned ${spawn.devinRunId} for issue #${issueNumber}`,
              { devinUrl: spawn.url },
            );
          } catch (err) {
            await log.warn(
              `devin spawn failed for issue #${issueNumber}: ${(err as Error).message}`,
            );
          }
        }

        await log.finding(`filed issue #${issueNumber}: ${f.category} @ ${f.path}`, {
          fingerprint: fingerprint.slice(0, 12),
        });
      }

      await deps.convex.mutation(api.fileScanHistory.upsertScan, {
        path: pick.path,
        cycleNumber,
        fileHash: hashContent(body),
        cleanScan,
      });
    }

    // RECONCILE — walk findings in Devin/PR/verifying states and advance them.
    if (deps.devinApiKey) {
      await reconcileOpenFindings({
        convex: deps.convex,
        nia: deps.nia,
        log,
        githubAuth: deps.githubAuth,
        githubOwner: deps.githubOwner,
        githubRepo: deps.githubRepo,
        devinApiKey: deps.devinApiKey,
      });
    }

    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "done",
      summary: `${plannedFiles.length} picks · ${findingsFiled} findings filed`,
    });
    await log.info("sleep");
    return { cycleNumber, status: "done", plannedFiles, findingsFiled };
  } catch (err) {
    await log.warn(`cycle failed: ${(err as Error).message}`);
    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "failed",
      summary: (err as Error).message,
    });
    return { cycleNumber, status: "failed", plannedFiles: [], findingsFiled };
  }
}
