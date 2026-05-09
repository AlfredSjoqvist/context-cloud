import "dotenv/config";
import { loadConfig } from "./lib/config.js";
import { getConvex, makeConvexEventSink } from "./tools/convexClient.js";
import { runCycle } from "./cycle.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const onceFlag = process.argv.includes("--once");
  const config = loadConfig(process.env);
  const convex = getConvex(config);
  const sinkFor = (cycleNumber: number) => makeConvexEventSink(config);

  let stopped = false;
  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[main] received ${signal}, finishing current cycle then exiting`);
    stopped = true;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // eslint-disable-next-line no-console
  console.log(`[main] guardian online · cycle interval ${config.cycleIntervalSeconds}s`);

  while (!stopped) {
    const result = await runCycle({ convex, sinkFor });
    // eslint-disable-next-line no-console
    console.log(
      `[main] cycle ${result.cycleNumber} ${result.status} · ${result.plannedFiles.length} picks`,
    );
    if (onceFlag) break;
    if (stopped) break;
    await sleep(config.cycleIntervalSeconds * 1000);
  }

  // eslint-disable-next-line no-console
  console.log("[main] guardian shutting down cleanly");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[main] fatal:", err);
  process.exit(1);
});
