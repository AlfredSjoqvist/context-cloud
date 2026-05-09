# Context Cloud — PRD

**npm + GitHub for AI agent context.** Built on Nia.

---

## Problem

Agents are bottlenecked on context. Nia solved indexing — but every team still re-indexes the same React docs, Stripe API, and Postgres reference in private silos. There's no shared substrate, no fork graph, no install command. The community's collective context work doesn't compound.

## Solution

A GitHub-shaped registry where context is the unit. Publish a pack once, anyone can install it. Fork it, customize it, push back upstream. Stars become the quality signal. Three always-on background agents create, maintain, and compose pack content so the cloud stays useful as the world around it changes.

## Position vs Nia

Built on, not against. Nia is the indexing primitive — every pack is a Nia index. Context Cloud is the social and version-control layer on top. Every install is a new Nia API call. The platform makes Nia more valuable, not less.

This framing is the first sentence of the pitch, not a footnote.

## Track

Submitting to **Always-On Agents** (Nia + Tensorlake). Three autonomous agents running continuously in the background, each with durable memory across runs.

Rubric we're scoring against: Genuine Background Execution (30%), Statefulness (25%), Agentic Depth (20%), Demo & Presentation (10%), Judge's Personal Rating (10%).

The architecture also covers Company Brain criteria (Cross-Source Synthesis, Real Work, Hyperspell Integration Depth) given the Brain agent uses Hyperspell to synthesize across Slack, Gmail, GitHub, Drive, and Notion. The track-agnostic top-6 round means strength on multiple rubrics is a hedge.

---

## The atomic unit: a pack

A pack is a folder of markdown files, owned by a user or org, versioned and forkable like any GitHub repo. Forking copies the files. Editing produces commits. Stars are the quality signal. Installs make the pack's content available to your agent at runtime.

Common file types are familiar — `CLAUDE.md`, `SKILL.md`, `RULES.md`, plus whatever custom markdown the maintainer writes. A `.gc/rules.md` file accumulates over time as the GC agent learns what the maintainer cares about preserving.

Manifest format is YAML:

```yaml
name: "@nicolas/nextjs-16-pack"
version: 1.4.0
forked-from: "@vercel/nextjs-base@2.0.0"
description: "Next.js 16 App Router patterns, opinionated"
visibility: public
maintainer: "@nicolas"
freshness: 0.94
stars: 1247
installs: 8930
```

Auth is GitHub OAuth. Namespace ownership ties to verified GitHub orgs — `@vercel/*` is reserved for the verified Vercel org, not squattable.

---

## The platform

Five pages, GitHub-shaped throughout.

**Home** is the entry point. Single discovery feed showing trending, new, and recently updated packs. No type-filter taxonomy — file names inside the pack (CLAUDE.md, SKILL.md, RULES.md) tell users what kind of pack it is. The Recommendations panel sits on this page and is user-triggered.

**Pack page** is the centerpiece. Header shows `@user/pack@1.4.0` with stars, forks, freshness score, and an Install button. Tabs for README, Files (the MD files in the pack with a tree view), Pull Requests (where GC and Merge post their findings alongside human PRs), Versions, Forks, and Activity (live feed of agent and human edits). This is where the demo lives.

**Profile** is the user's packs, stars, and forks — same shape as a GitHub profile.

**Installed** is the consumer dashboard. Shows packs the user has added, the merged bundle they compose into, and the file path Merge writes to (`CLAUDE.md` or `.context/merged.md`).

**Publish** is an inline markdown editor for now. Paste or write the files, fill in the manifest fields, ship. Importing existing GitHub repos as packs is a follow-up.

---

## The agents

Three real autonomous agents maintain the cloud. All three share the same PR review surface and the same confidence-tier output pattern. All three run in Tensorlake sandboxes, store state in Convex, re-index via Nia, and read maintainer prefs from Hyperspell.

**Brain** synthesizes a company's tribal knowledge into pack content. Reads Slack, Gmail, GitHub, Drive, and Notion via Hyperspell, identifies recurring patterns (coding conventions, architecture decisions, onboarding info, brand voice), and proposes them as MD content in a private company pack. Triggers on a schedule, on Hyperspell webhooks (new Slack message in a marked channel), or on-demand. Spec: [`agents/brain-agent.md`](agents/brain-agent.md)m

**GC** ([`agents/garbage-collection-agent.md`](agents/garbage-collection-agent.md)) reads each pack's markdown line by line and prunes content that no longer earns its place — completed TODOs, references to deprecated dependencies, stale WIP notes. Cross-references other docs in the pack and the underlying git repo to judge what's still alive. High-confidence findings auto-commit; lower-confidence findings open as PRs. Learns from rejections via `.gc/rules.md` inside the pack. Triggers nightly and on-publish.

**Merge** ([`agents/merge-agent.md`](agents/merge-agent.md)) has two jobs. When a fork's parent ships a new version, Merge proposes the upstream changes into the fork as a section-level PR. When a user installs multiple packs, Merge clusters overlapping content and resolves contradictions, writing a clean merged bundle to the agent's workspace at install time. Triggers on parent version bumps and install events.

The three are complementary. Brain creates pack content from external data, GC keeps it pruned, Merge keeps multiple packs coherent at install. Brain generates, GC maintains, Merge composes.

---

## Recommendations

When a user notices their agent gave a wrong answer or low-confidence response, they click "find me help" on Context Cloud. The platform takes the failed prompt as the query, runs a Nia search over the registry, ranks matches by freshness and stars, and surfaces the top results in a Recommendations panel. The user installs from there.

User-triggered, not automatic. Reliable for the demo and avoids needing an integration hook into the agent runtime.

This is the demand-side closing the loop. Brain creates packs from your company's data, GC and Merge keep them healthy, Recommendations surfaces them when an agent needs help.

---

## Demo arc (3 minutes)

1. **0:00–0:20** — Open Context Cloud's home feed. Setup: "A registry of context packs maintained by three always-on agents. Here's how it stays alive."
2. **0:20–0:50** — Open a pack page. Activity feed shows GC's auto-commits from the last hour ("pruned 12 completed TODOs"). Open `.gc/rules.md` — show two learned rules from past maintainer rejections. Background execution + statefulness in 30 seconds.
3. **0:50–1:30** — Switch to a private company pack. Trigger Brain on a connected Slack workspace. Watch it scan a recent decision thread and propose a PR with new MD content. Show the multi-source reasoning ("synthesized from 4 Slack messages + 1 GitHub PR comment + 2 Notion docs").
4. **1:30–2:00** — Simulate an upstream version bump on `@vercel/nextjs`. Merge spawns a Tensorlake job, produces a section-level diff PR with conflict annotations. Show the 3-way merge handling.
5. **2:00–2:40** — Payoff: Codex agent fails on a Next.js 16 question (hallucinates Pages Router). User clicks "find me help" on Context Cloud, Recommendations surfaces `@vercel/nextjs-16`. One-click install. Merge composes the bundle, writes to `.context/merged.md`. Same question, correct answer with citations.
6. **2:40–3:00** — Pitch line: *"Three always-on agents. Brain creates. GC maintains. Merge composes. Built on Nia. Your context, finally compounding."*

---

## Sponsor stack

Six sponsors integrated. Detail in [`agents/sponsor-stack.md`](agents/sponsor-stack.md).

Track sponsors (heaviest weight): **Nia** (title sponsor; every pack is a Nia index, every Recommendations search hits Nia), **Tensorlake** (track co-sponsor; runs all three agents in microVM sandboxes — schedule-driven, webhook-driven, event-driven).

Core: **Convex** (registry state, reactive PR threads, activity feed), **Hyperspell** (Brain's data layer plus per-user maintainer prefs).

Surface: **Vercel** (dashboard hosting and demo agent runtime), **Codex** (the demo agent itself).

Not used: InsForge (overlaps with Convex, different layer), Devin (cut for scope), Aside, Reacher.

---

## Real risks

**LLM non-determinism breaks the demo arc.** The Codex agent has to reliably hallucinate Pages Router APIs cold and reliably produce the correct App Router answer with the pack installed. Pre-test the exact prompt 50+ times across temperatures. Lock the prompt that works in both directions.

**The override has to be visibly load-bearing.** If a judge mentally substitutes "just point Nia at nextjs.org/docs" and gets the same outcome, Context Cloud is decoration. The failure case must be one where naive indexing pulls deprecated Pages Router content that contradicts App Router, and the curated pack succeeds because of an explicit override or curated content. Show the override on screen during the install.

**Operators look like decoration without metrics.** GC and Merge each need one on-stage stat. GC: "47 dead lines pruned across 12 packs in the last hour." Merge: "3 overlaps resolved between installed packs in 200ms." Real numbers, seeded if needed.

**"Why won't Nia ship this themselves next quarter?"** Q&A gut-shot. The answer is the operators, not the registry. Tensorlake-hosted agents + Hyperspell per-user feedback loop + the `.gc/rules.md` learning pattern is a stack Nia would have to rebuild. Practice this answer until reflex.

**Namespace abuse.** Don't publish `@vercel/nextjs-16` at a Vercel-sponsored event without it being from Vercel. Use `@nicolas/...` or `@contextcloud/...` for anything we actually push. GitHub-org-verified namespace ownership is a slide bullet that pre-empts the question.

**File-injection assumes agents re-read workspace files between turns.** True for Codex, Claude Code, Cursor. Verify the demo agent picks up the new `.context/merged.md` on the prompt after install.

**Pitch consistency.** Original one-pager said three operators (GC, Merge, Discovery). We're shipping three (GC, Merge, Brain) plus a Recommendations feature. The agent count holds, the names shifted. If asked, frame Brain as the more useful third agent we landed on.

**Always-On rubric requires demonstrable background execution.** Don't just describe schedules — schedule a real GC or Brain run during the demo and let judges see it fire. A live cron tick with a visible activity-feed entry beats any slide.

**Statefulness has to be load-bearing, not bolted-on.** The rubric explicitly tests whether removing memory breaks the demo. The `.gc/rules.md` learning loop is the answer — show it in action by having a maintainer reject a PR, then run GC again and watch it skip the previously-rejected suggestion.

**Agentic depth means recovery, not just multi-step.** Score 5 wants "full agentic loop: plans, executes, reflects, recovers, improves autonomously." Make sure at least one demoed agent run includes a visible recovery — a Merge job that hits a conflict, replans, and ships a PR with annotations.
