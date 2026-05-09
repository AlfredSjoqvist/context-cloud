import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../src/config.js";
import { SourceRegistry } from "../src/sources/registry.js";

const ANSI = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

function header(label: string): void {
  console.log("");
  console.log(ANSI.bold(ANSI.cyan(`━━━ ${label} ━━━`)));
}

function step(n: number, label: string): void {
  console.log("");
  console.log(ANSI.bold(`[${n}] ${label}`));
}

async function run(cmd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function main(): Promise<void> {
  header("docs-ingest end-to-end demo");
  console.log(
    ANSI.dim(
      "Ingest external docs → extract MUST/MUST NOT rules → link to demo-target source → emit citable .md leaf for the Guardian Agent.",
    ),
  );

  const config = loadConfig();
  let registry = new SourceRegistry(config.registryPath);

  // Auto-seed if registry is empty.
  step(1, "Source registry");
  let sources = await registry.list();
  if (sources.length === 0) {
    console.log(ANSI.yellow("(no sources registered — running seed)"));
    await run("npx", ["tsx", "scripts/seed-sources.ts"]);
    // Fresh registry instance to bypass the in-memory cache populated by the empty load above.
    registry = new SourceRegistry(config.registryPath);
    sources = await registry.list();
  }
  for (const s of sources) {
    console.log(
      `  ${ANSI.green(s.id)}  [${s.kind}]  ${s.uri}  ${ANSI.dim(
        `(scope=${s.defaultScope}${s.defaultLibraryName ? ` lib=${s.defaultLibraryName}` : ""})`,
      )}`,
    );
  }

  // Pick the lodash source as the demo target.
  const lodash = sources.find((s) => s.defaultLibraryName === "lodash");
  if (!lodash) {
    console.error(
      ANSI.red(
        "No lodash source found. Run `npm run seed` and try again.",
      ),
    );
    process.exit(1);
  }

  step(2, `Ingest + extract + emit (source=${lodash.id})`);
  await run("npx", ["tsx", "src/cli/ingest.ts", lodash.id, "--emit"]);

  // Resolve where the leaf landed.
  const sibling = path.resolve(config.home, "..", "..", "demo-target");
  const leafPath = path.join(
    sibling,
    ".context-map",
    "library",
    "lodash",
    "security-advisories.md",
  );

  step(3, "Emitted leaf in demo-target/.context-map/");
  if (!existsSync(leafPath)) {
    console.error(
      ANSI.red(`Expected leaf at ${leafPath} but it does not exist.`),
    );
    console.error(
      ANSI.dim(
        "Did the ingest run fail? Check the output above. If demo-target is not a sibling of context-cloud/, set DOCS_INGEST_CONTEXT_MAP and re-run.",
      ),
    );
    process.exit(1);
  }
  console.log(ANSI.green(`✓ ${leafPath}`));
  console.log("");
  const leaf = readFileSync(leafPath, "utf8");
  for (const line of leaf.split("\n")) {
    console.log(ANSI.dim("  │ ") + line);
  }

  // Bonus: run the path-convention demo source so the audience sees a
  // second, structurally different linker firing.
  const webappRoutes = sources.find(
    (s) => s.defaultScope === "module" && s.kind === "markdown_dir",
  );
  if (webappRoutes) {
    step(
      4,
      `Path-convention linker (source=${webappRoutes.id}, lib-import-free)`,
    );
    console.log(
      ANSI.dim(
        "Three docs at routes/payments.md, routes/login.md, routes/sessions.md → applies_to grounded purely in codebase layout.",
      ),
    );
    await run("npx", ["tsx", "src/cli/ingest.ts", webappRoutes.id, "--emit"]);

    const webappLeafPath = path.join(
      sibling,
      ".context-map",
      "source",
      webappRoutes.id,
      "login.md",
    );
    if (existsSync(webappLeafPath)) {
      console.log("");
      console.log(ANSI.green(`✓ ${webappLeafPath}`));
      console.log("");
      const text = readFileSync(webappLeafPath, "utf8");
      // Show only the frontmatter so the applies_to list is visible
      // without dumping all 12 rules.
      const fmEnd = text.indexOf("\n---", 4);
      const fm = fmEnd > 0 ? text.slice(0, fmEnd + 4) : text.slice(0, 800);
      for (const line of fm.split("\n")) {
        console.log(ANSI.dim("  │ ") + line);
      }
    }
  }

  header("Demo complete");
  console.log(
    `Guardian's ${ANSI.cyan("niaClient.verifyConstraintCite")}() will accept any of the numbered lines above as a verbatim citation, scoped to ${ANSI.cyan("src/lib/db.ts")} via the ${ANSI.cyan("applies_to")} frontmatter. The path-convention source above proves the same flow works without any library import — applies_to is grounded in codebase layout via doc paths alone.`,
  );
  console.log("");
}

main().catch((err) => {
  console.error(ANSI.red(`demo failed: ${err.message}`));
  process.exit(1);
});
