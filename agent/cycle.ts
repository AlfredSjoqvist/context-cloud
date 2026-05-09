import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { Logger } from "./lib/logger.js";
import type { EventSink } from "./lib/logger.js";
import type { NiaClient } from "./tools/niaClient.js";
import { priorityPicks } from "./plan/priority.js";
import type { FileScanState } from "./plan/priority.js";
import { createHash } from "node:crypto";

export interface CycleDeps {
  convex: ConvexHttpClient;
  nia: NiaClient;
  sinkFor: (cycleNumber: number) => EventSink;
  candidatesProvider: () => Promise<readonly string[]>;
  priorityBudget: number;
}

export interface CycleResult {
  cycleNumber: number;
  status: "done" | "failed";
  plannedFiles: Array<{ path: string; reason: string }>;
}

function hashContent(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export async function runCycle(deps: CycleDeps): Promise<CycleResult> {
  const cycleNumber = await deps.convex.query(api.cycles.nextCycleNumber, {});
  const cycleId: Id<"cycles"> = await deps.convex.mutation(
    api.cycles.openCycle,
    { cycleNumber },
  );
  const log = new Logger({ sink: deps.sinkFor(cycleNumber), cycleNumber });

  await log.info("wake");

  try {
    // PLAN
    const candidates = await deps.candidatesProvider();
    const historyRows = await deps.convex.query(api.fileScanHistory.getAll, {});
    const history: FileScanState[] = historyRows.map((row) => ({
      path: row.path,
      lastScannedCycle: row.lastScannedCycle,
      cleanScanStreak: row.cleanScanStreak,
    }));

    const plannedFiles = priorityPicks({
      cycleNumber,
      candidates,
      history,
      budget: deps.priorityBudget,
    });

    await deps.convex.mutation(api.cycles.setPlan, { cycleId, plannedFiles });
    await log.info(`plan: ${plannedFiles.length} files`, { plannedFiles });

    // SCAN — Plan 1 only reads the file + logs context size; analysis is Plan 2.
    for (const pick of plannedFiles) {
      await log.info(`scan ${pick.path}`, { reason: pick.reason });
      const body = await deps.nia.readFile(pick.path);
      await log.info(
        `read ${pick.path}: ${body.split("\n").length} lines`,
        { bytes: body.length },
      );
      await deps.convex.mutation(api.fileScanHistory.upsertScan, {
        path: pick.path,
        cycleNumber,
        fileHash: hashContent(body),
        cleanScan: true,
      });
    }

    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "done",
      summary: `${plannedFiles.length} picks scanned`,
    });
    await log.info("sleep");
    return { cycleNumber, status: "done", plannedFiles };
  } catch (err) {
    await log.warn(`cycle failed: ${(err as Error).message}`);
    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "failed",
      summary: (err as Error).message,
    });
    return { cycleNumber, status: "failed", plannedFiles: [] };
  }
}
