# Integration Agent — Worklog

Owner: Agent 3 (Integration / MCP / Agent runtime)
Scope: `agent/`, `mcp-server/`, hook scripts, install CLI, related manifests.

---

## Iteration 1 — SHIPPED (commit `c00de8f`, pushed to origin/main)

**What shipped:** Net-new `mcp-server/` package. Node stdio MCP server (`@hindsight/mcp-server`), reads-only against Convex, exposes 4 tools: `list_findings`, `get_findings_for_file`, `list_notes`, `get_notes_for_file`.

**Verification:** Spawned `node dist/index.js` with piped JSON-RPC. `initialize` returned `serverInfo={name:"hindsight",version:"0.1.0"}` at protocolVersion `2024-11-05`. `tools/list` returned all 4 tools with descriptions.

**Left in head / surfacing for next iteration:**
- Convex query references (`findings:byStatus`, `notes:listActive`, `notes:listEdgesForPath`) are typed by string literal — if backend agent renames a function, the MCP tools will error at call time, not at boot. A boot-time smoke ping that exercises one query would fail fast. Worth doing.
- No tests in `mcp-server/` yet — vitest is a devDep but unused. Should add at least a unit test for the text-formatting functions (which don't need Convex) so CI/typecheck has coverage.
- No install CLI yet. Next-highest-value piece is `bin/install-hindsight-mcp` that writes the JSON block into `~/.cursor/mcp.json` / `~/.codex/config.toml` / Claude Code's `mcp.json`.
- `.mcp.json` at repo root is still pointing at a Windows path for `nm_server.py`. Out of scope to fix without Nicolas approval (root config), but should be flagged.

**Surprising:**
- `git fetch && git rebase origin/main` from the canonical loop is brittle in this multi-agent setup because other agents leave dirty trees in `dashboard/`, `convex/dashboard.ts`, etc. Worked around by skipping rebase when `git status` shows clean alignment with `origin/main` (which it did — no commits between my fetch and push). For future iterations I'll use `git pull --rebase --autostash` once origin actually moves.

---

## Iteration 2 — SHIPPED (commit `47b1e7f`, pushed)

**What shipped:** `hindsight-mcp-install` CLI bin + vitest setup for `mcp-server/`. CLI merges a `hindsight` entry into `~/.cursor/mcp.json`, `~/.claude.json`, or `./.mcp.json`. Preserves unrelated entries, idempotent. `--print` dry-runs. Four passing unit tests for the merge logic.

**Verification:**
- `npx tsc -p tsconfig.json` clean.
- `node dist/install.js --help` prints usage.
- `node dist/install.js --print --editor cursor --convex-url https://test.convex.cloud` preserved my real `livekit-docs` and `nia` entries while adding `hindsight` with the correct `node` command and env.
- `npx vitest run`: 4/4 tests pass (empty config, preserve unrelated, overwrite idempotent, non-object mcpServers).

**Caught a near-miss:** at staging time another agent (likely backend) had `git add`-ed `convex/dashboard.ts` and `WORKLOG-backend.md` in the shared working tree. If I had run `git commit` with the default index I would have included their WIP in my commit. Saved by checking `git status -s` and explicitly `git restore --staged` on out-of-scope paths before staging mine by name. **Going forward: never trust the implicit index in this repo. Always `git restore --staged` everything first, then `git add` my files by explicit path.**

**Left in head:**
- Boot-time smoke ping for Convex queries (fail-fast on schema drift).
- Hook scripts: PostToolUse/PreToolUse for Cursor + Claude Code + Codex are not in repo yet. Highest-value next.
- TOML support in install CLI for Codex (`~/.codex/config.toml`). Currently it only handles JSON-config editors.
- `--editor all` mode that writes to every supported editor in one shot.
- README example for the install CLI in `mcp-server/README.md`.

**Surprising:** the root `vitest.config.ts` has `include: agent/**/*.test.ts, scripts/**/*.test.ts`. Running `npx vitest run` from `mcp-server/` still picked up the root config (vitest walks upward). Solved with a local `mcp-server/vitest.config.ts` that scopes to `src/**/*.test.ts`.

---

## Iteration 3 — planned

**Goal:** Hook scripts (PreToolUse / PostToolUse) for Claude Code + Cursor that fire NM capture and Guardian-finding injection at the right moments. Start with Claude Code since the repo already has `nm_capture.py` + `nm_inject.py` as the proven baseline — wrap them in tiny shell entrypoints so Claude Code's `settings.json` hooks point at something stable across machines. Then wire the new MCP server's tools into the injection flow.

Plan to surface a clean cross-platform path (no hardcoded `C:\Users\Alfred\...` like the current `.mcp.json`).


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
