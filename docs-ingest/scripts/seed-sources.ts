import path from "node:path";
import { loadConfig } from "../src/config.js";
import { SourceRegistry } from "../src/sources/registry.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const registry = new SourceRegistry(config.registryPath);

  const stripeFixtures = path.join(config.home, "fixtures", "stripe");
  const lodashFixtures = path.join(config.home, "fixtures", "lodash");
  const expressFixture = path.join(
    config.home,
    "fixtures",
    "express",
    "security-best-practices.html",
  );
  const paymentsOpenApi = path.join(
    config.home,
    "fixtures",
    "openapi",
    "payments.yaml",
  );

  const stripe = await registry.upsert({
    kind: "markdown_dir",
    uri: stripeFixtures,
    defaultScope: "library",
    defaultLibraryName: "stripe",
    codebaseRoot: config.codebaseRoot,
    outputRoot: config.contextMapRoot,
  });

  const lodash = await registry.upsert({
    kind: "markdown_dir",
    uri: lodashFixtures,
    defaultScope: "library",
    defaultLibraryName: "lodash",
    codebaseRoot: config.codebaseRoot,
    outputRoot: config.contextMapRoot,
  });

  const express = await registry.upsert({
    kind: "html_url",
    uri: `file://${expressFixture}`,
    defaultScope: "library",
    defaultLibraryName: "express",
    codebaseRoot: config.codebaseRoot,
    outputRoot: config.contextMapRoot,
  });

  const payments = await registry.upsert({
    kind: "openapi_spec",
    uri: paymentsOpenApi,
    defaultScope: "library",
    defaultLibraryName: "express",
    codebaseRoot: config.codebaseRoot,
    outputRoot: config.contextMapRoot,
  });

  console.log(`Registered:`);
  console.log(`  ${stripe.id}  [${stripe.kind}]  ${stripe.uri}  (lib=stripe — chunker proof only)`);
  console.log(`  ${lodash.id}  [${lodash.kind}]  ${lodash.uri}  (lib=lodash — DEMO target)`);
  console.log(`  ${express.id}  [${express.kind}]  ${express.uri}  (lib=express — HTML demo)`);
  console.log(`  ${payments.id}  [${payments.kind}]  ${payments.uri}  (lib=express — Payments OpenAPI fixture)`);
  console.log(`Registry: ${config.registryPath}`);
  console.log(`\nNext: npm run ingest -- ${lodash.id} --dump-chunks`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
