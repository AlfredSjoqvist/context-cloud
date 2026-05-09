import { readFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export interface NiaSearchHit {
  readonly path: string;
  readonly line: number;
  readonly excerpt: string;
  readonly score?: number;
}

export interface NiaClient {
  searchCode(query: string, opts?: { topK?: number }): Promise<NiaSearchHit[]>;
  searchContext(query: string, opts?: { topK?: number }): Promise<NiaSearchHit[]>;
  readFile(path: string): Promise<string>;
  recentDiff(path: string, n?: number): Promise<string>;
  verifyConstraintCite(
    mdFile: string,
    line: number,
    text: string,
  ): Promise<boolean>;
}

export interface NiaClientConfig {
  readonly skipNia: boolean;
  readonly mcpUrl: string;
  readonly apiKey: string;
  /**
   * Filesystem root for the fallback path. Required when `skipNia` is true.
   * Typically the absolute path of the demo target repo cloned into the sandbox.
   */
  readonly filesystemRoot: string;
}

export function createNiaClient(cfg: NiaClientConfig): NiaClient {
  // Plan 1 ships filesystem fallback only. When cfg.skipNia is false, the real
  // Nia MCP transport will be wired in Plan 2 once the wire format is known.
  // Until then, fall back to the local filesystem reader.
  return new FilesystemFallbackClient(cfg.filesystemRoot);
}

class FilesystemFallbackClient implements NiaClient {
  constructor(private readonly root: string) {}

  private safeJoin(relativePath: string): string {
    const root = resolve(this.root);
    const target = resolve(root, relativePath);
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(`path escapes filesystemRoot: ${relativePath}`);
    }
    return target;
  }

  async searchCode(): Promise<NiaSearchHit[]> {
    return [];
  }

  async searchContext(): Promise<NiaSearchHit[]> {
    return [];
  }

  async readFile(path: string): Promise<string> {
    return readFileSync(this.safeJoin(path), "utf8");
  }

  async recentDiff(): Promise<string> {
    return "";
  }

  async verifyConstraintCite(
    mdFile: string,
    line: number,
    text: string,
  ): Promise<boolean> {
    const full = this.safeJoin(mdFile);
    if (!existsSync(full)) return false;
    const lines = readFileSync(full, "utf8").split("\n");
    const actual = lines[line - 1];
    if (actual === undefined) return false;
    return actual.trim() === text.trim();
  }
}
