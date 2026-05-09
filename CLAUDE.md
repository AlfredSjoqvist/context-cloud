# CLAUDE.md

Operating notes for Claude Code working in this repo. Read this first, every session.

## What this is

Hackathon project at **Nozomio (May 9, 2026)**. Submissions close **6:00pm**, in-person judging starts 6:10pm, top-6 finals at 7:30pm. Authoritative project doc is [PRD.md](PRD.md) — read it before writing code. The hackathon brief is [Nozomio Hackathon Guide.md](Nozomio%20Hackathon%20Guide.md).

Primary track: **Always-On Agents** (Nia + Tensorlake). The rubric explicitly tests whether removing background execution or statefulness breaks the demo. Cross-track strength on **Company Brain** (Hyperspell) is a hedge — the top-6 round is track-agnostic.

## What "winning" code looks like here

Optimize for **judges seeing the thing work**, not for code you'd defend in a code review.

- A scheduled job that **fires live during the demo** beats a slide describing a scheduler.
- A state file that **changes visibly** between two runs beats a paragraph about durable memory.
- An agent that **hits a real error and recovers on screen** beats one that only succeeds.
- One real number on screen ("47 dead lines pruned in the last hour") beats a UI panel of zeros.
- Seeded real-looking data is fine when it stands in for a slow path. Mark seeds clearly so we don't ship them past the demo.

If you find yourself adding a feature that won't appear in the 3-minute demo, stop and confirm.

## Demo invariants — do not break these without asking

These are the things the demo arc depends on. If a change would alter any of them, surface it before merging.

1. **Background execution is observable.** Activity feed / log tail / event stream that updates without a human prompt during the demo window.
2. **State persists across runs and is inspectable.** A maintainer/judge can open a file or table and see what the agent learned last time.
3. **Each always-on agent has at least one on-stage metric** with a real number behind it.
4. **At least one agent run shows recovery** — hits a conflict or failure, replans, and ships output.
5. **The "without our thing" failure case is reproducible.** The contrast (broken without us, correct with us) is what wins. Don't break the broken side.

The full list of risks (LLM non-determinism, namespace abuse, file-injection assumptions, etc.) is in [PRD.md](PRD.md#real-risks). Re-read it before any change to the demo path.

## Sponsor stack — what to reach for

Free credits and access for today. Prefer these over generic alternatives even when generics would be marginally simpler — each integration is rubric points.

- **Nia** (title sponsor) — indexing + semantic search MCP. Every retrievable source goes through Nia. Don't add a second vector DB.
- **Tensorlake** — runs background/scheduled/webhook-triggered agents in stateful microVM sandboxes. This is where every agent process lives. Free access today only.
- **Convex** — TypeScript backend, reactive queries, real-time UI. State of record for registry/PR/activity-feed data. Free deployments, no card.
- **Hyperspell** — ingestion + search over Slack / Gmail / GitHub / Drive / Notion. The Brain agent's data layer. Free access today only.
- **Vercel** — dashboard hosting + demo agent runtime. Submission must be a public deployed URL — **localhost is not valid**.
- **Codex / OpenAI** — the demo agent we're proving context against. $50 credits today.

If a task could be solved by a sponsor tool we're already using, use it. If it would require introducing a non-sponsor service, flag it first.

## How to work in this repo

- **Read [PRD.md](PRD.md) before any non-trivial change.** It's the source of truth for scope, demo arc, and known risks. If your change contradicts it, say so explicitly and propose updating the PRD.
- **Edit existing files** instead of creating new ones whenever possible. No scratch docs, no plan-of-the-plan files.
- **No speculative abstraction.** Three near-duplicate lines beat a premature helper. Hackathon code lives or dies in the next 8 hours.
- **No half-finished implementations.** If you stub something, make it loudly visible (throw, log, banner) so it can't silently make the demo look real when it isn't.
- **Comments only when the WHY is non-obvious.** Don't narrate code.
- **Trust internal code.** Validate at boundaries (user input, third-party APIs, agent outputs that hit storage). Skip defensive checks elsewhere.
- **Small commits with messages that say why.** Future-you in 4 hours needs to bisect fast.

## Communication

- Be terse. The user is shipping under a deadline; long preambles cost minutes.
- State results, not process. "Brain agent now triggers on Hyperspell webhook; tested with X" — not "I'll now write the handler, then..."
- When something is broken, say what's broken before what you'll do about it.
- If the user asks an exploratory question, give the recommendation + main tradeoff in 2-3 sentences. Don't implement until they agree.
- If you're about to do something hard to reverse (drop a Convex table, force-push, delete a Tensorlake sandbox), confirm first.

## Environment

- Windows / PowerShell. Use PowerShell syntax in shell commands (`$env:VAR`, not `$VAR`; `;` not `&&` for chaining in PS 5.1; `$null` not `/dev/null`). Bash tool is also available for POSIX scripts when easier.
- Working directory `c:\Users\Alfred\Desktop\nozomio`. Treat it as the project root.
- Not currently a git repo at the root. If we start tracking history, ask before `git init` — there may be reasons it's not initialized yet.

## Asking vs. shipping

Default to shipping the smallest working version. Ask the user when:

- The change touches a **demo invariant** above.
- The choice is between two paths that take >30 min each.
- A sponsor integration would be replaced or removed.
- You'd be installing a new dependency that overlaps with one we already use.

Don't ask for permission to read files, run searches, run typechecks, or fix obvious bugs in code you just wrote.

## When in doubt

The demo runs for **3 minutes**, in front of judges, on a **deployed URL**, scored against **Background Execution (30%) + Statefulness (25%) + Agentic Depth (20%) + Demo (10%) + Judge's rating (10%)**. Every decision should make at least one of those numbers go up.
