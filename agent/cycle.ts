import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { Logger } from "./lib/logger.js";
import type { EventSink } from "./lib/logger.js";

export interface CycleDeps {
  convex: ConvexHttpClient;
  sinkFor: (cycleNumber: number) => EventSink;
}

export interface CycleResult {
  cycleNumber: number;
  status: "done" | "failed";
  plannedFiles: Array<{ path: string; reason: string }>;
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
    // PLAN — stubbed for Plan 1; real planning replaces this in Task 23.
    const plannedFiles: Array<{ path: string; reason: string }> = [
      { path: "STUB", reason: "no real planner wired yet" },
    ];
    await deps.convex.mutation(api.cycles.setPlan, {
      cycleId,
      plannedFiles,
    });
    await log.info(`plan: ${plannedFiles.length} files`, { plannedFiles });

    // SCAN — stubbed for Plan 1.
    for (const pick of plannedFiles) {
      await log.info(`scan ${pick.path}`, { reason: pick.reason });
    }

    await deps.convex.mutation(api.cycles.closeCycle, {
      cycleId,
      status: "done",
      summary: `stubbed cycle: ${plannedFiles.length} picks`,
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
