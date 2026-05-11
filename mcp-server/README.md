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

## Wire into editors — install CLI

After `npm run build`:

```bash
# Cursor (MCP only — Cursor has no PreToolUse/PostToolUse hook surface)
node dist/install.js --editor cursor --convex-url https://your-deployment.convex.cloud

# Claude Code (user-scope), MCP + hooks
node dist/install.js --editor claude-code --with-hooks \
  --convex-url https://your-deployment.convex.cloud

# Claude Code (project-scope), MCP + hooks, dry-run first
node dist/install.js --editor claude-code-project --with-hooks --print
node dist/install.js --editor claude-code-project --with-hooks
```

The install is idempotent. For Claude Code, `--with-hooks` writes the
PreToolUse/PostToolUse/UserPromptSubmit/Stop/SubagentStop entries that wire
`nm_capture.py` and `nm_inject.py` into the editor. Any pre-existing hooks
whose commands reference our scripts (including stale absolute paths) get
stripped before fresh entries are appended; unrelated hooks are preserved.

## Verify the install

After installing, sanity-check the Convex side without booting the MCP server:

```bash
HINDSIGHT_CONVEX_URL=https://your-deployment.convex.cloud node dist/verify.js
```

Output:

```
hindsight-mcp-verify
  convex: https://your-deployment.convex.cloud
  timeout: 10000ms

  ✓ findings:byStatus              243ms  (rows=1)
  ✓ notes:listActive               169ms  (rows=1)

all 2 check(s) passed.
```

Exits non-zero if a Convex query reference has drifted (i.e. the backend
renamed a function) — usable from CI.

## Manual config

If you'd rather not use the CLI, paste this into `~/.cursor/mcp.json` or the
`mcpServers` key of `~/.claude.json`:

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
