# Integration Agent — Worklog

Owner: Agent 3 (Integration / MCP / Agent runtime)
Scope: `agent/`, `mcp-server/`, hook scripts, install CLI, related manifests.

---

## Iteration 1 (in progress)

**Goal:** Scaffold `mcp-server/` — a Node/TypeScript stdio MCP server that exposes Hindsight's Guardian findings + Note Manager notes as read-only MCP tools to any editor (Cursor / Claude Code / Codex). Net-new directory; no conflicts with other agents' scopes.

**Plan:**
- Create `mcp-server/{package.json,tsconfig.json,src/index.ts,src/convex.ts,src/tools/*.ts,README.md,.gitignore}`.
- Server speaks JSON-RPC over stdio via `@modelcontextprotocol/sdk` (already in root deps; will install fresh in mcp-server too for isolation).
- Initial tools: `list_findings` (Guardian, by status), `list_notes` (NM, active), `get_findings_for_file`, `get_notes_for_file`.
- Reads from Convex via `convex/browser` client. Read-only — does NOT violate the disjoint-write-tables invariant.
- No new env vars: reuses `CONVEX_URL`.

**Verify:**
- `cd mcp-server && npm install && npm run build`
- Spawn `node dist/index.js`, pipe a JSON-RPC `initialize` request, expect a server `result` with `serverInfo.name === "hindsight"`.
- Pipe `tools/list`, expect ≥4 tool definitions.
- If `CONVEX_URL` set: pipe `tools/call list_findings`, expect a `content` array.

**Notes / state of the world at iteration start:**
- Repo: branch `main`, up to date with `origin/main`.
- Dirty working tree from other agents in `dashboard/`, `docs/`, `scripts/`, `package-lock.json` — left untouched; my commits scope only to in-scope files.
- `.mcp.json` currently references a Windows path (`C:\\Users\\Alfred\\...`); known issue per `CLAUDE.md`. Will not edit `.mcp.json` this iteration (touches root config — needs Nicolas approval per CLAUDE.md).
- Existing MCP server: `nm_server.py` (Python, FastMCP, NM-only). New server is complementary, not a replacement.
