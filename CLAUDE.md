# CLAUDE.md

Operating notes for Claude Code working in this repo. Read this first, every session.

## What this is

Context Cloud — a post-hackathon merged tree with three halves on `main`:

- **Guardian agent** (TypeScript) under `agent/`, `convex/`, `ui/`
- **NM session capture** (Python) under `nm_*.py`, `tensorlake/{note_manager,gc}.py`, `dashboard/`
- **docs-ingest pipeline** (TypeScript) under `docs-ingest/`

Plus the **mock_org/** synthetic ACME organization that drives the Hindsight demo. All halves share one Convex deployment (`colorless-porcupine-926`) with disjoint write tables. Either side can run alone.

Product spec: [PRD.md](PRD.md). Repo orientation + quickstart: [README.md](README.md). Pre-merge per-half PRDs, the original Guardian handoff, and the NM sponsor-integration snapshot are preserved under [docs/history/](docs/history/) — useful context, not ground truth.

## Where to look first

| Need | File |
|---|---|
| Repo overview + quickstart | [README.md](README.md) |
| Unified product spec | [PRD.md](PRD.md) |
| Guardian design (canonical) | [docs/superpowers/specs/2026-05-09-guardian-agent-design.md](docs/superpowers/specs/2026-05-09-guardian-agent-design.md) |
| NM SQLite schema | [SCHEMA.md](SCHEMA.md) |
| NM hurdle detection algorithm | [docs/HURDLE_DETECTION_SPEC.md](docs/HURDLE_DETECTION_SPEC.md) |
| Tensorlake deploy | [tensorlake/README.md](tensorlake/README.md) |
| docs-ingest reference | [docs-ingest/README.md](docs-ingest/README.md) |
| Hackathon brief | [docs/Nozomio Hackathon Guide.md](docs/Nozomio%20Hackathon%20Guide.md) |
| Convex AI usage rules | follow [AGENTS.md](AGENTS.md) before writing Convex code |

## How to work in this repo

- **Edit existing files** instead of creating new ones whenever possible. No scratch docs.
- **No speculative abstraction.** Three near-duplicate lines beat a premature helper.
- **No half-finished implementations.** If you stub something, make it loudly visible (throw, log, banner) so it can't silently make the system look real when it isn't.
- **Comments only when the WHY is non-obvious.** Don't narrate code.
- **Trust internal code.** Validate at boundaries (user input, third-party APIs, agent outputs that hit storage). Skip defensive checks elsewhere.
- **Small commits with messages that say why.** Conventional prefixes (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`).
- **Always `git fetch` and check `origin/<branch>` before committing.** Both halves push to `main`; divergence is constant. Pull (or rebase) before you push.
- **Don't push without explicit approval.** Don't run `git merge` / `git rebase` against shared branches without explicit approval.
- **Don't deploy.** No `tensorlake deploy`, `vercel deploy`, `convex deploy` without explicit approval — these have cost and side effects.

## Cross-half boundaries

Two languages, two dashboards, one shared Convex deployment. To avoid stepping on the other half:

- **Convex schema is union.** Adding a table on either side is fine. Renaming or dropping a table that the other side reads requires coordination.
- **Disjoint write tables.**
  - Guardian writes: `cycles`, `findings`, `devinRuns`, `events`, `docsIngestRuns`, `fileScanHistory`.
  - NM writes: `sessions`, `notes`, `files`, `noteFiles`, `hurdles`, `injections`, `gcActions`.
  - UI/seed: `agentEvents`, `dashboard`, `libraries`, `seed`, `users`.
- **Guardian env keys** start with `GUARDIAN_*` / `OPENAI_*` / `GITHUB_*` / `DEVIN_*` / `NIA_*` / `USE_MOCK_*` / `SKIP_NIA` / `DEMO_REPO_LOCAL_PATH`.
- **NM env keys** start with `NM_*` and reuse `OPENAI_API_KEY` / `NIA_API_KEY` / `CONVEX_URL`.
- **Reactive UI vs HTTP actions.** Dashboards read from `*.convex.cloud`; Python sync writes to `*.convex.site`. Same deployment, two endpoints.

## Architectural invariants

If you're about to change one of these, surface it first.

1. **NM hurdle detection is signal-scored, not LLM-judged.** Don't add "ask the LLM if the user is stuck" — see [docs/HURDLE_DETECTION_SPEC.md](docs/HURDLE_DETECTION_SPEC.md). Add a new signal in `nm_signals.py` and tune the weighted threshold.
2. **SQLite is the source of truth for NM capture-layer writes.** Convex is a best-effort mirror. The inline hooks (`nm_inject.py`, `nm_capture.py`) must never block on a network call.
3. **Guardian citations are line-precise and verified.** `agent/analyze/citation.ts` checks both the code line and the `.md` constraint text against the actual files before HANDOFF. Don't relax this.
4. **Guardian's findings table is the dedup gate.** Fingerprint = `sha256([path, mdFile, mdLine, codeLine])`. Don't file an issue from anywhere else.
5. **Path canonicalization** runs through `nm_db.canonical_path` on every path landing in v2 NM tables. If you touch path handling, update [SCHEMA.md](SCHEMA.md) and verify `TEST.md` still collapses correctly.

## Test seams

Use these to run the system without burning sponsor credits:

| Flag | Effect |
|---|---|
| `USE_MOCK_LLM=1` | Guardian uses `mockAnalyzeFile` (planted findings; files real GH issues). |
| `SKIP_NIA=1` | Bypass Nia MCP; read from local filesystem; `searchContext` returns `[]`. |
| `USE_MOCK_DEVIN=1` | Stub Devin handoff. |
| `NM_SYNC_DISABLE=1` | Disable NM's Convex sync. |
| `NM_NIA_DISABLE=1` | Force NM into local cosine fallback. |

## Asking vs. shipping

Default to shipping the smallest working version. Ask before:

- Pushing, force-pushing, merging, rebasing, or otherwise changing branch state.
- Deploying anything (Tensorlake / Vercel / Convex).
- Renaming or dropping a Convex table that the other half might read.
- Installing a new dependency that overlaps with one we already use.
- Touching `.mcp.json`, `.env.example`, `.gitignore`, root `package.json`, `requirements.txt`, `schema.sql`, `vercel.json`.

Don't ask for permission to read files, run searches, run typechecks / tests, or fix obvious bugs in code you just wrote.

## Communication

- Be terse. State results, not process.
- When something is broken, say what's broken before what you'll do about it.
- For exploratory questions, give the recommendation + main tradeoff in 2–3 sentences. Don't implement until the user agrees.
- If you're about to do something hard to reverse (drop a Convex table, force-push, delete a Tensorlake sandbox), confirm first.

## Environment notes

- Repo works on macOS / Linux. Some pre-merge config carries Windows artifacts:
  - `.mcp.json` references `C:\Users\Alfred\Desktop\nozomio\nm_server.py` — adjust locally before running NM hooks.
- Node 20+ at the root and in `ui/`, `dashboard/`, `docs-ingest/`. Python 3.10+ for the NM scripts.
- Convex deployment is `colorless-porcupine-926`. Don't link to a different deployment without coordinating — the other half will lose its data.
