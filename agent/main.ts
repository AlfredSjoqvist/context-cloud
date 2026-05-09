import "dotenv/config";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./lib/config.js";
import { getConvex, makeConvexEventSink } from "./tools/convexClient.js";
import { createNiaClient } from "./tools/niaClient.js";
import { runCycle } from "./cycle.js";

const DEMO_REPO_ENV = "DEMO_REPO_LOCAL_PATH";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listSrcFiles(root: string): string[] {
  const out: string[] = [];
  function walk(rel: string): void {
    const entries = readdirSync(join(root, rel));
    for (const name of entries) {
      if (name === "node_modules" || name === ".git") continue;
      const r = rel ? `${rel}/${name}` : name;
      const full = join(root, r);
      if (statSync(full).isDirectory()) {
        walk(r);
      } else if (r.startsWith("src/") && (r.endsWith(".ts") || r.endsWith(".js"))) {
        out.push(r);
      }
    }
  }
  walk("");
  return out;
}

async function main(): Promise<void> {
  const onceFlag = process.argv.includes("--once");
  const config = loadConfig(process.env);

  const demoRoot = process.env[DEMO_REPO_ENV];
  if (!demoRoot) throw new Error(`${DEMO_REPO_ENV} is required`);
  if (!existsSync(demoRoot)) throw new Error(`${DEMO_REPO_ENV} does not exist: ${demoRoot}`);

  const convex = getConvex(config);
  const sinkFor = (_cycleNumber: number) => makeConvexEventSink(config);
  const nia = createNiaClient({
    skipNia: config.skipNia,
    mcpUrl: config.niaMcpUrl,
    apiKey: config.niaApiKey,
    filesystemRoot: demoRoot,
  });

  const candidatesProvider = async () => listSrcFiles(demoRoot);

  let stopped = false;
  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[main] received ${signal}, finishing current cycle then exiting`);
    stopped = true;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // eslint-disable-next-line no-console
  console.log(
    `[main] guardian online · demo=${demoRoot} · interval=${config.cycleIntervalSeconds}s`,
  );

  while (!stopped) {
    const result = await runCycle({
      convex,
      nia,
      sinkFor,
      candidatesProvider,
      priorityBudget: config.priorityBudget,
    });
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
