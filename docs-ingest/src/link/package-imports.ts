import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

const PackageJsonSchema = z
  .object({
    name: z.string().optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    peerDependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export interface CodebaseDeps {
  packageName: string | undefined;
  runtime: Record<string, string>;
  dev: Record<string, string>;
  all: Set<string>;
}

export async function readCodebaseDeps(codebaseRoot: string): Promise<CodebaseDeps> {
  const pkgPath = path.join(codebaseRoot, "package.json");
  const raw = await fs.readFile(pkgPath, "utf8");
  const parsed = PackageJsonSchema.parse(JSON.parse(raw));
  const runtime = parsed.dependencies ?? {};
  const dev = parsed.devDependencies ?? {};
  const all = new Set<string>([
    ...Object.keys(runtime),
    ...Object.keys(dev),
    ...Object.keys(parsed.peerDependencies ?? {}),
    ...Object.keys(parsed.optionalDependencies ?? {}),
  ]);
  return { packageName: parsed.name, runtime, dev, all };
}
