# SETUP.md — clean clone to `npm run agent:once` in <5 minutes

This is the single linear path. README's quickstart splits Guardian + NM
sections; this file is one sequence and stops at the first thing that
actually demonstrates value: a Guardian cycle producing a finding.

For the actual demo flow, read [DEMO.md](DEMO.md) after you finish here.

---

## 0. Prereqs (verify, don't install)

```bash
node --version              # → v20.x or later
python3 --version           # → 3.10 or later
npm --version               # → 10.x or later
git --version
```

Anything missing: install via your package manager and re-verify before
moving on. Mismatched node ≠ "probably fine"; the Convex CLI requires Node 20+.

---

## 1. Clone + install

```bash
git clone https://github.com/AlfredSjoqvist/context-cloud.git
cd context-cloud
npm install                 # ~1 min, repo root
( cd ui && npm install )    # ~30s, Hindsight UI
```

If `npm install` complains about peer deps, retry once with `--legacy-peer-deps`
on the directory that failed; we don't pin Node-major peers.

---

## 2. Convex deployment (one-time)

```bash
npx convex dev              # interactive: log in, pick "create new project"
                            # leave running in this terminal
```

Convex prints two URLs. Copy them into `.env` at repo root:

```
CONVEX_DEPLOYMENT=<the dev: prefix one>
CONVEX_URL=<the https://*.convex.cloud one>
```

`.env.example` lists every env key Guardian + NM understand. Only the
two above are required for the offline demo. Real demo (live LLMs,
real GitHub issues) needs OPENAI/NIA/GITHUB keys; see
[DEMO.md](DEMO.md#prereqs-one-time).

Leave `npx convex dev` running for the rest of setup.

---

## 3. Verify the eval suite

If this passes, your local checkout is structurally healthy:

```bash
bash evals/run_all.sh
```

Expected: `evals: passed=2 failed=0` (17 tests across two files).

If it fails on `test_citation_precision`, a `.context-map/library/` leaf
got into a state Guardian can't cite. Open the failing leaf and fix the
line the eval names; do not silence the test.

---

## 4. First Guardian cycle

```bash
DEMO_REPO_LOCAL_PATH="$(pwd)/mock_org/agent-gateway" \
USE_MOCK_LLM=1 USE_MOCK_DEVIN=1 SKIP_NIA=1 \
npm run agent:once
```

What you should see in the last ~20 lines:

```
[guardian] cycle <id> PLAN  → N priority files
[guardian] cycle <id> SCAN  → mock_org/agent-gateway/src/lib/redaction.ts
[guardian] cycle <id> ANALYZE → M findings (citations verified)
[guardian] cycle <id> CRITIQUE → M of M finding(s) accepted
[guardian] cycle <id> HANDOFF → mock devin run created
[guardian] cycle <id> RECONCILE → no resolved findings yet
[guardian] cycle <id> done in <s>s
```

Findings reference real lines in `.context-map/library/auth/credentials-required.md`
and `.context-map/library/secrets/redaction-completeness.md` (and now
`.context-map/library/rate-limit/persistent-decay.md`).

If you see zero findings, you forgot `USE_MOCK_LLM=1`.
If you see `cannot find demo target`, you forgot `DEMO_REPO_LOCAL_PATH`.
If you see `convex: connection refused`, terminal-1 stopped running
`npx convex dev`.

---

## 5. Optional — Hindsight UI

```bash
cd ui && npm run dev        # → http://localhost:3000
```

Open the URL, click **Activity** to see the cycle from step 4 reflected
live (Convex push). For the demo flow, follow [DEMO.md](DEMO.md).

---

## 6. Optional — NM (Python half)

NM only matters if you want the "inject on file touch" beat from
[DEMO.md](DEMO.md#t200--nm-half--inject-on-file-touch). It requires
wiring Claude Code's MCP config to point at `nm_server.py`; see
[README.md → NM session capture](README.md#nm-session-capture-python-half).
Skip this on first setup; the Guardian half is sufficient to evaluate
the project end-to-end.

---

## What to do if step 4 still fails

1. `bash evals/run_all.sh` — does the eval suite still pass? If no, your
   working tree is dirty in a way that breaks Guardian's contract; fix
   the named leaf before chasing a Guardian error.
2. `git status` — uncommitted changes outside `convex/`, `agent/`, etc.
   can break the build; stash and retry.
3. `git log --oneline -5` — confirm you're on a recent `origin/main`.
4. Open an issue at <https://github.com/AlfredSjoqvist/context-cloud/issues>
   with the full output of step 4 and the `node --version` / `python3
   --version` from step 0.

After step 4 succeeds, move to [DEMO.md](DEMO.md) for the pitch flow.
