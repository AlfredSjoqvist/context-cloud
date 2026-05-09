import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config.js";
import { SourceRegistry } from "../sources/registry.js";
import { ingestSourceChunks } from "../ingest/index.js";
import { extractRules } from "../extract/rule-extractor.js";
import { buildLibraryImportMap } from "../link/import-grep.js";
import { writeLeaf } from "../emit/write-leaves.js";

interface CliArgs {
  sourceId: string | undefined;
  dumpChunks: boolean;
  dumpRaw: boolean;
  dumpRules: boolean;
  emit: boolean;
  list: boolean;
  useLlm: boolean;
  noLlm: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const positional = argv.filter((a) => !a.startsWith("--"));
  return {
    sourceId: positional[0],
    dumpChunks: flags.has("--dump-chunks"),
    dumpRaw: flags.has("--dump-raw"),
    dumpRules: flags.has("--dump-rules"),
    emit: flags.has("--emit"),
    list: flags.has("--list"),
    useLlm: flags.has("--use-llm"),
    noLlm: flags.has("--no-llm"),
  };
}

function resolveDemoTarget(home: string): {
  codebaseRoot: string;
  contextMapRoot: string;
} | null {
  const sibling = path.resolve(home, "..", "..", "demo-target");
  if (existsSync(sibling) && existsSync(path.join(sibling, "package.json"))) {
    return {
      codebaseRoot: sibling,
      contextMapRoot: path.join(sibling, ".context-map"),
    };
  }
  return null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const registry = new SourceRegistry(config.registryPath);

  if (args.list || !args.sourceId) {
    const sources = await registry.list();
    if (sources.length === 0) {
      console.log(`No sources registered. Registry: ${config.registryPath}`);
      console.log(`Run \`npm run seed\` to register the demo fixtures.`);
    } else {
      console.log(`Sources (${config.registryPath}):`);
      for (const s of sources) {
        console.log(
          `  ${s.id}  [${s.kind}] ${s.uri} (scope=${s.defaultScope}${
            s.defaultLibraryName ? ` lib=${s.defaultLibraryName}` : ""
          })`,
        );
      }
    }
    if (!args.sourceId) {
      console.log(
        `\nUsage: npm run ingest -- <sourceId> [--dump-chunks] [--dump-rules] [--emit] [--use-llm | --no-llm]`,
      );
      process.exit(args.list ? 0 : 2);
    }
  }

  const source = await registry.get(args.sourceId!);
  if (!source) {
    console.error(`Unknown source: ${args.sourceId}`);
    process.exit(2);
  }

  const result = await ingestSourceChunks(source);

  if (args.dumpRaw) {
    for (const doc of result.rawDocs) {
      console.log(`\n=== RAW: ${doc.path} (title: ${doc.title}) ===`);
      console.log(doc.text);
    }
  }

  if (args.dumpChunks) {
    for (const chunk of result.chunks) {
      console.log(`\n--- CHUNK ${chunk.id} ---`);
      console.log(`headingPath: ${JSON.stringify(chunk.headingPath)}`);
      console.log(`anchorRef:   ${chunk.anchorRef}`);
      console.log(`length:      ${chunk.text.length} chars`);
      console.log(`text:`);
      console.log(chunk.text);
    }
  }

  console.log(
    `\n[ingest] source=${source.id} rawDocs=${result.rawDocs.length} chunks=${result.chunks.length} errors=${result.errors.length}`,
  );
  for (const e of result.errors) {
    console.error(`  ! ${e.stage}: ${e.message}${e.path ? ` (${e.path})` : ""}`);
  }

  if (!args.dumpRules && !args.emit) {
    process.exit(result.errors.length > 0 ? 1 : 0);
  }

  // === Linking + extraction + emission ===
  const demoTarget = resolveDemoTarget(config.home);
  const codebaseRoot = demoTarget?.codebaseRoot ?? source.codebaseRoot;
  const contextMapRoot =
    demoTarget?.contextMapRoot ?? source.outputRoot;

  if (args.emit && !demoTarget) {
    console.warn(
      `[emit] could not auto-detect ../demo-target/. Falling back to source.outputRoot=${contextMapRoot}`,
    );
  }

  const libNames = source.defaultLibraryName ? [source.defaultLibraryName] : [];
  const importMap =
    libNames.length > 0
      ? (await buildLibraryImportMap(codebaseRoot, libNames))[0] ?? null
      : null;

  const extractRes = await extractRules(result.chunks, {
    source,
    openaiApiKey: config.openai.apiKey,
    openaiModel: config.openai.model,
    defaultCategory: "correctness",
    llmOnly: args.useLlm,
    noLlm: args.noLlm,
  });

  console.log(
    `[extract] rules=${extractRes.rules.length} llm=${extractRes.llmUsed} errors=${extractRes.errors.length}`,
  );
  for (const e of extractRes.errors) {
    console.warn(`  ~ ${e.chunkId}: ${e.message}`);
  }

  if (args.dumpRules) {
    for (const r of extractRes.rules) {
      console.log(
        `  [${r.modality}/${r.category} ${r.confidence.toFixed(2)}] ${r.ruleText}`,
      );
    }
  }

  if (importMap) {
    console.log(
      `[link] library=${importMap.library} importers=${importMap.matches.length}` +
        (importMap.matches.length > 0
          ? ` paths=${importMap.matches.map((m) => m.relativePath).join(",")}`
          : ` (none — falling back to broad glob)`),
    );
  }

  if (args.emit) {
    const primaryDocPath = result.rawDocs[0]?.path;
    const leaf = await writeLeaf({
      contextMapRoot,
      source,
      rules: extractRes.rules,
      importMap,
      extractedAt: new Date().toISOString(),
      ...(primaryDocPath ? { primaryDocPath } : {}),
    });
    console.log(
      `[emit] wrote ${leaf.absolutePath} (${leaf.ruleCount} rules, applies_to=${JSON.stringify(leaf.appliesTo)})`,
    );
  }

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
