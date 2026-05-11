# Hindsight MCP server

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
Hindsight's Guardian findings and Note-Manager notes to any MCP-aware editor (Cursor,
Claude Code, Codex, OpenAI Agents SDK).

It is intentionally separate from `nm_server.py`:

- `nm_server.py` is a Python FastMCP server bound to local NM SQLite — it's used by the
  inline capture/injection hooks and lives on the developer's machine alongside the SQLite db.
- `mcp-server/` (this package) is a Node stdio server that reads from the **shared Convex
  deployment**, so any editor anywhere can pull the org's distilled lessons + findings.

## Tools

| Tool | Input | What it does |
|---|---|---|
| `list_findings` | `status`, `limit?` | Guardian findings by lifecycle status. |
| `get_findings_for_file` | `path` | Active findings on a file. |
| `list_notes` | `limit?` | Active Note-Manager notes. |
| `get_notes_for_file` | `path` | Notes attached to a file (same set NM injects). |

All tools are **read-only**. They never mutate Convex.

## Install & run

```bash
cd mcp-server
npm install
npm run build
HINDSIGHT_CONVEX_URL=https://your-deployment.convex.cloud node dist/index.js
```

Or run from source:

```bash
HINDSIGHT_CONVEX_URL=https://your-deployment.convex.cloud npm run dev
```

## Wire into editors

Add to `~/.cursor/mcp.json`, `~/.codex/config.toml`, or whatever your editor uses:

```json
{
  "mcpServers": {
    "hindsight": {
      "command": "node",
      "args": ["/absolute/path/to/context-cloud/mcp-server/dist/index.js"],
      "env": {
        "HINDSIGHT_CONVEX_URL": "https://your-deployment.convex.cloud"
      }
    }
  }
}
```

A cross-editor install CLI is on the integration roadmap.
