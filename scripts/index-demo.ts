import "dotenv/config";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DEMO_REPO_ENV = "DEMO_REPO_LOCAL_PATH";

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`[index-demo] ${msg}`);
  process.exit(1);
}

function listFiles(root: string, rel = ""): string[] {
  const entries = readdirSync(join(root, rel));
  const out: string[] = [];
  for (const name of entries) {
    if (name === "node_modules" || name === ".git") continue;
    const r = rel ? `${rel}/${name}` : name;
    const full = join(root, r);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(root, r));
    } else {
      out.push(r);
    }
  }
  return out;
}

const demoPath = process.env[DEMO_REPO_ENV];
if (!demoPath) fail(`set ${DEMO_REPO_ENV} to the absolute path of the demo target repo`);
if (!existsSync(demoPath!)) fail(`demo path does not exist: ${demoPath}`);
if (!existsSync(join(demoPath!, ".context-map"))) {
  fail(`demo repo missing .context-map/ directory: ${demoPath}`);
}

const allFiles = listFiles(demoPath!);
const codeFiles = allFiles.filter(
  (f) => f.startsWith("src/") && (f.endsWith(".ts") || f.endsWith(".js")),
);
const ctxFiles = allFiles.filter((f) => f.startsWith(".context-map/") && f.endsWith(".md"));

// eslint-disable-next-line no-console
console.log(`[index-demo] demo path: ${demoPath}`);
// eslint-disable-next-line no-console
console.log(`[index-demo] code files: ${codeFiles.length}`);
// eslint-disable-next-line no-console
console.log(`[index-demo] context files: ${ctxFiles.length}`);

if (codeFiles.length === 0) fail("no code files found under src/");
if (ctxFiles.length === 0) fail("no .md files found under .context-map/");

// eslint-disable-next-line no-console
console.log("[index-demo] OK — both sources present.");
// eslint-disable-next-line no-console
console.log(
  "[index-demo] Next: index this directory into Nia per their docs " +
    "(MCP server URL = NIA_MCP_URL).",
);
