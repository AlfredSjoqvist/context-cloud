# DEMO.md — Hindsight 3-minute pitch runbook

Reproducible demo for the Hindsight project (Context Cloud). Two paths:

- **Path A — Live**: ~5 min setup, real Guardian findings against `mock_org/`,
  live UI at `localhost:3000`. Use this when you have a network and OPENAI/NIA
  keys (or mock-mode flags).
- **Path B — Offline fallback**: Vercel-hosted static HTML at the deploy URL.
  Use when network is dead or you need to talk over a screenshot. The
  `mock/` directory is the entire fallback (`vercel.json` → `outputDirectory:
  mock`).

If you only have time to read one path, **read Path A**. Path B is for when
the demo gods turn against you.

---

## What the audience needs to see (3 minutes)

| Sec  | Beat                                                            | Where to point         |
|-----:|-----------------------------------------------------------------|------------------------|
| 0:00 | "Two failure modes for AI coding agents: hallucinating constraints, and getting stuck and not knowing." | Hindsight Activity tab |
| 0:30 | Trigger a Guardian cycle. Cycle progresses through PLAN → SCAN → ANALYZE → CRITIQUE → HANDOFF.          | Hindsight Guardian tab |
| 1:00 | A finding appears with a *real* citation: code line + the exact `.context-map/library/<lib>/<topic>.md` line that was violated. | Finding detail panel |
| 1:30 | Open the cited `.md` line in your editor. Show that the rule is real and load-bearing — not a stub.    | VS Code, file:line |
| 2:00 | Switch to NM. Touch a file in `mock_org/agent-gateway/`. Show the inject feed firing with a relevant note from a previous session. | Hindsight Sessions tab |
| 2:30 | Show the GC tab. Notes decay → merge → prune over time. The system forgets gracefully.                  | Hindsight Sources tab |
| 3:00 | "One Convex deployment, two halves, one demo."                                                          | Architecture slide     |

---

## Path A — Live demo (preferred)

### Prereqs (one-time)

- Node 20+, Python 3.10+, `npm`
- Repo cloned, `npm install` at repo root and in `ui/`
- Convex deployment provisioned (`npx convex dev` once).
- Either:
  - Real keys in `.env`: `OPENAI_API_KEY`, `NIA_API_KEY`, `GITHUB_TOKEN` +
    `GITHUB_OWNER` + `GITHUB_REPO` (Guardian files real GH issues), or
  - Mock-mode flags in env: `USE_MOCK_LLM=1 USE_MOCK_DEVIN=1 SKIP_NIA=1`
- `DEMO_REPO_LOCAL_PATH=$(pwd)/mock_org/agent-gateway` so Guardian scans the
  in-repo demo target instead of an external clone.
- The seed constraint library copied into the demo target (Guardian reads
  `<DEMO_REPO_LOCAL_PATH>/.context-map/library/`, not the repo root).
  Run `bash seed-context-map.sh` to mirror to every sub-org under
  `mock_org/`. See [SETUP.md step 4](SETUP.md#4-wire-the-seed-constraint-library-into-the-demo-target).
- **For the T+2:00 NM beat**: Claude Code wired to the NM MCP per
  [README.md](README.md#nm-session-capture-python-half). If you don't have
  this set up, that beat falls back to the legacy NM dashboard (commands
  in T+2:00 below) and you reframe the narrative slightly — it's the
  same point either way.

### Pre-flight (1 min before you go live)

```bash
bash evals/run_all.sh
```

Expected: `evals: passed=N failed=0`. If anything fails, the demo will
fail in a more confusing way later. Fix it now or switch to Path B.

### T-0:30 — terminal A — start Convex + Hindsight UI

```bash
cd <repo>
npx convex dev                             # leaves running; ~10s to boot
# new terminal tab
cd <repo>/ui
npm run dev                                # → http://localhost:3000
```

Open `http://localhost:3000` in the browser the audience will see. Land on
the **Activity** tab. Leave it visible.

### T+0:00 — terminal B — fire one Guardian cycle

```bash
cd <repo>
DEMO_REPO_LOCAL_PATH="$(pwd)/mock_org/agent-gateway" \
USE_MOCK_LLM=1 USE_MOCK_DEVIN=1 SKIP_NIA=1 \
npm run agent:once
```

Expected output (last ~20 lines):

```
[guardian] cycle <id> PLAN  → 3 priority files
[guardian] cycle <id> SCAN  → mock_org/agent-gateway/src/lib/redaction.ts
[guardian] cycle <id> ANALYZE → 2 findings (citations verified)
[guardian] cycle <id> CRITIQUE → 2 of 2 finding(s) accepted
[guardian] cycle <id> HANDOFF → mock devin run created
[guardian] cycle <id> RECONCILE → no resolved findings yet
[guardian] cycle <id> done in 8.4s
```

In the UI, the **Guardian** tab now shows the new cycle. Click it. Click a
finding. Show:
- the `codeCite.path:line` (file in `mock_org/agent-gateway/`)
- the `constraintCite.mdFile:line` (a leaf under `.context-map/library/`)
- the `text` field — byte-equal to the line at `mdFile:line`

### T+1:30 — open the cited constraint

Open the `mdFile:line` from the finding in your editor. Read the rule out
loud. The audience needs to hear that it's a *real* engineering invariant,
not a stub.

Suggested talking line: *"Guardian's findings are line-precise and
verified. Anyone in the room can clone this repo, jump to the cited line,
and reproduce the finding. The Guardian agent files real GitHub issues
that point to real lines in real `.md` files."*

### T+2:00 — NM half — inject on file touch

In your IDE (with Claude Code wired to the NM MCP per
[README.md](README.md#nm-session-capture-python-half)), open a file under
`mock_org/agent-gateway/src/`. Within ~2 seconds the **Sessions** tab in
Hindsight will surface the most relevant note from a prior session.

If your laptop isn't wired to the NM hooks, run the seed instead:

```bash
python3 nm_extract.py --session demo-seed-1
python3 nm_dashboard.py                    # → http://localhost:8000
```

…and switch the audience over to the legacy NM dashboard. The narrative
is the same: "the agent that just touched this file gets the note from
the agent that struggled with this file last week."

### T+2:30 — show GC

In Hindsight, **Sources** tab. Show a small list of recent `gcActions`:
`decay` → `merge` → `prune`. Talking line: *"Memory you never forget
becomes memory you can't trust. NM ages out stale notes on a sliding
scale, and merges duplicates instead of letting them accumulate."*

### T+3:00 — close

Close on the architecture slide / `README.md` block diagram. *"One
Convex deployment, two halves, one demo. Either side runs alone."*

---

## Path B — Offline fallback

If anything in Path A fails on stage: open the deployed Vercel URL.
`mock/index.html` is a self-contained static page that renders the demo
narrative without any backend. It exists for exactly this moment.

```
# Find the URL with:
git grep -h "vercel.app" README.md | head -1
```

(Project-team: keep the deployed URL fresh in `README.md`.)

The static fallback covers the same beats as Path A. You won't have a
live cycle, but you will have screenshots of the cycle at every stage,
the architecture diagram, and a click-through of the UI tabs.

---

## Things that go wrong

| Symptom                                              | Fix                                                                 |
|------------------------------------------------------|---------------------------------------------------------------------|
| `npm run agent:once` exits with `CONVEX_URL not set` | Run `npx convex dev` first; copy the URL from its output to `.env`. |
| UI shows "no events" forever                         | UI is on `*.convex.cloud`; Python sync writes to `*.convex.site`. Check both. |
| Guardian fires zero findings                         | Mock-mode is off and the LLM has no opinion. Set `USE_MOCK_LLM=1`. |
| `npm run agent:once` opens GitHub issues you didn't want | Set `USE_MOCK_DEVIN=1` to stub the handoff and skip GH issue creation. |
| Citation on a finding fails byte-equality            | Run `bash evals/run_all.sh` — the citation-precision eval points at the offending leaf. |

---

## Verifying this runbook

This document is not a draft. To verify it stays correct:

```bash
bash evals/run_all.sh
```

…must exit 0. Currently checks NM hurdle scoring + `.context-map/library/`
citation precision. Add coverage for new demo beats here as the demo
evolves.
