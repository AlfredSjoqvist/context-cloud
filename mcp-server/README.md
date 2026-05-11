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
| `get_status` | _(none)_ | One-shot health + summary (server version, Convex URL, latest Guardian cycle, active-note count, findings per status). |

All tools are **read-only**. They never mutate Convex.

## Resources

Same data, exposed as MCP resources for editors that prefer to browse over
calling tools. URIs are stable, content is plain text:

| URI | What |
|---|---|
| `hindsight://findings/detected` | Findings currently in `detected` state. |
| `hindsight://findings/devin_running` | Findings being acted on by Devin. |
| `hindsight://findings/pr_open` | Findings with a PR open. |
| `hindsight://findings/verifying` | Findings whose PR is being verified. |
| `hindsight://findings/resolved` | Findings closed as resolved. |
| `hindsight://findings/reopened_sharpened` | Findings reopened after a Devin sharpen pass. |
| `hindsight://findings/escalated` | Findings escalated to a human. |
| `hindsight://notes/active` | The 100 most recent active NM notes. |

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

# Codex (TOML — prints a snippet to append to ~/.codex/config.toml)
node dist/install.js --editor codex --convex-url https://your-deployment.convex.cloud
```

The install is idempotent. For Claude Code, `--with-hooks` writes the
PreToolUse/PostToolUse/UserPromptSubmit/Stop/SubagentStop entries that wire
`nm_capture.py` and `nm_inject.py` into the editor. Any pre-existing hooks
whose commands reference our scripts (including stale absolute paths) get
stripped before fresh entries are appended; unrelated hooks are preserved.

Additional flags:
- `--with-nm` — also wire the Python NM MCP server (`nm_server.py`) alongside hindsight.
- `--uninstall` — strip the hindsight entry (and `nm` if `--with-nm` also passed) plus any hindsight-managed hooks. Idempotent. Codex is hand-edit only.
- `--print` — dry-run; print the resulting JSON / TOML instead of writing.
- `--hindsight-root <p>` — override the context-cloud root used for absolute hook paths (only matters for user-scoped Claude Code; auto-detected by default).

Exit codes: `0` success, `1` missing `--editor`, `2` flag/editor mismatch, `3` couldn't auto-detect script root, `4` other (e.g. malformed target JSON).

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

## Environment

| Variable | Effect |
|---|---|
| `HINDSIGHT_CONVEX_URL` | Preferred. Points at the `*.convex.cloud` deployment to read from. |
| `CONVEX_URL` | Fallback if `HINDSIGHT_CONVEX_URL` is unset (convenience for projects with an existing Convex env). |
| `HINDSIGHT_LOG` | `off` \| `debug` \| `info` (default) \| `warn` \| `error`. Controls stderr logging — stdout is reserved for JSON-RPC. |
| `HINDSIGHT_TOOL_TIMEOUT_MS` | Per-tool-call timeout in ms. Default `15000`. A slow Convex query returns `isError` with `tool.timeout` instead of hanging the editor. |

If neither Convex env var is set, the server falls back to the project's own demo deployment and logs a loud warning on first tool call. Set `HINDSIGHT_CONVEX_URL` so you stop reading the demo's data.

## Using Hindsight from the OpenAI Agents SDK

See [`examples/openai-agents.ts`](examples/openai-agents.ts) for a runnable
recipe. The SDK has first-class `MCPServerStdio` support, so wiring is:

```ts
const hindsight = new MCPServerStdio({
  name: "hindsight",
  command: "node",
  args: [pathToDistIndexJs],
  env: { HINDSIGHT_CONVEX_URL: "https://your-deployment.convex.cloud" },
});
await hindsight.connect();
const agent = new Agent({
  name: "Investigator",
  instructions: "...",
  mcpServers: [hindsight],
});
```

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
