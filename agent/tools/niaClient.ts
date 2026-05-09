import { readFileSync, existsSync } from "node:fs";
import { resolve, sep, join } from "node:path";

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

export interface McpClientLike {
  callTool(args: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<{ content: Array<{ type: string; text: string }> }>;
}

export interface NiaClientConfig {
  readonly skipNia: boolean;
  readonly mcpUrl: string;
  readonly apiKey: string;
  readonly filesystemRoot: string;
  readonly mcpClientFactory?: (cfg: NiaClientConfig) => Promise<McpClientLike>;
}

export function createNiaClient(cfg: NiaClientConfig): NiaClient {
  if (cfg.skipNia) {
    return new FilesystemFallbackClient(cfg.filesystemRoot);
  }
  return new MCPNiaClient(cfg);
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

class MCPNiaClient implements NiaClient {
  private clientP: Promise<McpClientLike> | null = null;
  private readonly fallback: FilesystemFallbackClient;

  constructor(private readonly cfg: NiaClientConfig) {
    this.fallback = new FilesystemFallbackClient(cfg.filesystemRoot);
  }

  private getClient(): Promise<McpClientLike> {
    if (this.clientP) return this.clientP;
    const factory = this.cfg.mcpClientFactory ?? defaultMcpFactory;
    this.clientP = factory(this.cfg);
    return this.clientP;
  }

  async searchCode(query: string, opts?: { topK?: number }): Promise<NiaSearchHit[]> {
    return this.searchTool("search_code", query, opts);
  }

  async searchContext(query: string, opts?: { topK?: number }): Promise<NiaSearchHit[]> {
    return this.searchTool("search_context", query, opts);
  }

  private async searchTool(
    tool: "search_code" | "search_context",
    query: string,
    opts?: { topK?: number },
  ): Promise<NiaSearchHit[]> {
    try {
      const client = await this.getClient();
      const res = await client.callTool({
        name: tool,
        arguments: { query, top_k: opts?.topK ?? 8 },
      });
      const text = res.content[0]?.text ?? "[]";
      const parsed = JSON.parse(text) as NiaSearchHit[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async readFile(path: string): Promise<string> {
    try {
      const client = await this.getClient();
      const res = await client.callTool({ name: "read_file", arguments: { path } });
      const text = res.content[0]?.text;
      if (typeof text === "string") return text;
      throw new Error("nia read_file returned no text");
    } catch {
      return this.fallback.readFile(path);
    }
  }

  async recentDiff(path: string, n?: number): Promise<string> {
    try {
      const client = await this.getClient();
      const res = await client.callTool({
        name: "recent_diff",
        arguments: { path, n: n ?? 5 },
      });
      return res.content[0]?.text ?? "";
    } catch {
      return "";
    }
  }

  async verifyConstraintCite(
    mdFile: string,
    line: number,
    text: string,
  ): Promise<boolean> {
    return this.fallback.verifyConstraintCite(mdFile, line, text);
  }
}

async function defaultMcpFactory(cfg: NiaClientConfig): Promise<McpClientLike> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );
  const transport = new StreamableHTTPClientTransport(new URL(cfg.mcpUrl), {
    requestInit: {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    },
  });
  const client = new Client({ name: "guardian-agent", version: "0.0.1" }, {});
  await client.connect(transport);
  return {
    async callTool(args) {
      const res = await client.callTool({ name: args.name, arguments: args.arguments });
      const content = (res.content ?? []) as Array<unknown>;
      return {
        content: content.map((c) => ({
          type: typeof c === "object" && c !== null && "type" in c ? String((c as { type: unknown }).type) : "text",
          text:
            typeof c === "object" && c !== null && "text" in c
              ? String((c as { text: unknown }).text)
              : "",
        })),
      };
    },
  };
}
