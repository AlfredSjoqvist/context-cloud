import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DocSourceSchema, type DocSource, type SourceKind } from "../types.js";

const RegistryFileSchema = z.object({
  version: z.literal(1),
  sources: z.array(DocSourceSchema),
});

export type RegistryFile = z.infer<typeof RegistryFileSchema>;

export function makeSourceId(kind: SourceKind, uri: string): string {
  return createHash("sha256")
    .update(`${kind}::${uri}`)
    .digest("hex")
    .slice(0, 16);
}

export class SourceRegistry {
  private cache: Map<string, DocSource> = new Map();
  private loaded = false;

  constructor(private readonly registryPath: string) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.registryPath, "utf8");
      const parsed = RegistryFileSchema.parse(JSON.parse(raw));
      this.cache = new Map(parsed.sources.map((s) => [s.id, s]));
    } catch (err: unknown) {
      const isNotFound =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "ENOENT";
      if (!isNotFound) throw err;
      this.cache = new Map();
    }
    this.loaded = true;
  }

  async list(): Promise<DocSource[]> {
    await this.load();
    return Array.from(this.cache.values());
  }

  async get(id: string): Promise<DocSource | undefined> {
    await this.load();
    return this.cache.get(id);
  }

  async upsert(source: Omit<DocSource, "id"> & { id?: string }): Promise<DocSource> {
    await this.load();
    const id = source.id ?? makeSourceId(source.kind, source.uri);
    const next: DocSource = DocSourceSchema.parse({ ...source, id });
    this.cache.set(id, next);
    await this.persist();
    return next;
  }

  async markIngested(id: string, isoTimestamp: string): Promise<void> {
    await this.load();
    const existing = this.cache.get(id);
    if (!existing) throw new Error(`Unknown source id: ${id}`);
    this.cache.set(id, { ...existing, ingestedAt: isoTimestamp });
    await this.persist();
  }

  async remove(id: string): Promise<boolean> {
    await this.load();
    const existed = this.cache.delete(id);
    if (existed) await this.persist();
    return existed;
  }

  private async persist(): Promise<void> {
    const file: RegistryFile = {
      version: 1,
      sources: Array.from(this.cache.values()),
    };
    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fs.writeFile(
      this.registryPath,
      `${JSON.stringify(file, null, 2)}\n`,
      "utf8",
    );
  }
}
