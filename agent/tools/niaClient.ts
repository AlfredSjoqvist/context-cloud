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
  /**
   * GitHub repo identifier (e.g., "NewCoder3294/demo-target") that the agent
   * targets. Required when `skipNia=false` because Nia tools (`nia_read`,
   * `search`) operate against indexed repositories by `owner/repo` slug.
   */
  readonly repository?: string;
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
    return this.semanticSearch(query, opts);
  }

  async searchContext(query: string, opts?: { topK?: number }): Promise<NiaSearchHit[]> {
    // The query is a source path (e.g., "src/routes/login.ts"). For the analyzer
    // to find verbatim constraint text it can cite, we need raw .md chunks from
    // the indexed repo's .context-map/leaves/ directory. Nia's `search` returns
    // a prose answer, not raw chunks — so we use `nia_explore` to enumerate the
    // .md files under .context-map/, and the analyzer reads each via nia_read.
    if (!this.cfg.repository) return [];
    try {
      const client = await this.getClient();
      const res = await client.callTool({
        name: "nia_explore",
        arguments: {
          source_type: "repository",
          repository: this.cfg.repository,
          action: "ls",
          include_paths: [".context-map/leaves"],
          file_extensions: [".md"],
        },
      });
      const text = res.content[0]?.text ?? "";
      // Parse markdown listing — entries like "- login-constraints.md" or
      // a JSON array. Be liberal in what we accept.
      const mdPaths: string[] = [];
      for (const line of text.split("\n")) {
        const m = line.match(/([\w/.-]+\.md)/);
        if (m && m[1]) {
          const name = m[1];
          const full = name.includes("/") ? name : `.context-map/leaves/${name}`;
          if (!mdPaths.includes(full)) mdPaths.push(full);
        }
      }
      if (mdPaths.length === 0) return [];
      // Filename-stem match: source "src/routes/login.ts" → prefer "login-*.md".
      const stem = (query.split("/").pop() ?? "").replace(/\.[^.]+$/, "").toLowerCase();
      const stemMatches = mdPaths.filter((p) => p.split("/").pop()!.toLowerCase().startsWith(stem + "-"));
      const chosen = stemMatches.length > 0 ? stemMatches : mdPaths;
      const topK = opts?.topK ?? 8;
      return chosen.slice(0, topK).map((p) => ({ path: p, line: 1, excerpt: "" }));
    } catch {
      return [];
    }
  }

  private async semanticSearch(
    query: string,
    opts?: { topK?: number },
  ): Promise<NiaSearchHit[]> {
    if (!this.cfg.repository) return [];
    try {
      const client = await this.getClient();
      const res = await client.callTool({
        name: "search",
        arguments: {
          query,
          repositories: [this.cfg.repository],
        },
      });
      const text = res.content[0]?.text ?? "";
      if (text.length === 0) return [];
      const limited = text.slice(0, 8000);
      return [
        {
          path: `nia://search?q=${encodeURIComponent(query).slice(0, 50)}`,
          line: 1,
          excerpt: limited,
        },
      ].slice(0, opts?.topK ?? 8);
    } catch {
      return [];
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.cfg.repository) {
      return this.fallback.readFile(path);
    }
    try {
      const client = await this.getClient();
      const res = await client.callTool({
        name: "nia_read",
        arguments: {
          source_type: "repository",
          source_identifier: `${this.cfg.repository}:${path}`,
        },
      });
      const text = res.content[0]?.text;
      if (typeof text === "string" && text.length > 0) return text;
      throw new Error("nia_read returned no text");
    } catch {
      return this.fallback.readFile(path);
    }
  }

  async recentDiff(_path: string, _n?: number): Promise<string> {
    // Nia's MCP surface does not expose a recent-diff tool. Return empty;
    // analyzer falls back to scanning without diff context.
    return "";
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
