import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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
  if (cfg.skipNia) {
    return new FilesystemFallbackClient(cfg.filesystemRoot);
  }
  // Real Nia MCP transport lands in Plan 2 once we know the wire format
  // their server exposes. Plan 1 ships the fallback so the cycle runs end-to-end.
  return new FilesystemFallbackClient(cfg.filesystemRoot);
}

class FilesystemFallbackClient implements NiaClient {
  constructor(private readonly root: string) {}

  async searchCode(): Promise<NiaSearchHit[]> {
    return [];
  }

  async searchContext(): Promise<NiaSearchHit[]> {
    return [];
  }

  async readFile(path: string): Promise<string> {
    return readFileSync(join(this.root, path), "utf8");
  }

  async recentDiff(): Promise<string> {
    return "";
  }

  async verifyConstraintCite(
    mdFile: string,
    line: number,
    text: string,
  ): Promise<boolean> {
    const full = join(this.root, mdFile);
    if (!existsSync(full)) return false;
    const lines = readFileSync(full, "utf8").split("\n");
    const actual = lines[line - 1];
    if (actual === undefined) return false;
    return actual.trim() === text.trim();
  }
}
