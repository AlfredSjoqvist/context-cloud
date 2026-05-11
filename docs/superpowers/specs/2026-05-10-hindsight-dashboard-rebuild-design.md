# Hindsight Dashboard Rebuild — Design Brief

**Date:** 2026-05-10
**Status:** Approved
**Owner:** Nicolas
**Scope:** Replace `mock/index.html` at `hindsight-nm.vercel.app` with a Raycast/Cron-inspired strict-monochrome single-file rebuild.

Companion docs: [PRODUCT.md](../../../PRODUCT.md), [DESIGN.md](../../../DESIGN.md).

---

## 1. Feature Summary

Replace the deployed `mock/index.html` at `hindsight-nm.vercel.app` with a single-file rebuild in the Raycast/Cron-inspired monochrome system defined in DESIGN.md. Same Convex data sources, same Vercel deploy path, new shell + new landing view + restructured navigation. The goal is to feel like a real operator product (a returning user inspecting their org's agent fleet), not a hackathon demo console.

## 2. Primary User Action

**Land on the Overview, scan today's signal, drill into one item.** The first click after page load goes from the Overview into a specific Session, Finding, or GC sweep. Everything in the chrome supports that path; everything that doesn't (the `live · convex` pill, the dense top-row counts, the `Note Graph` brand subtitle) goes away.

## 3. Design Direction

- **Color strategy:** Restrained. Single accent = near-black. Color only inside the note-graph viz.
- **Theme:** Light. Dark on the graph viz only (local override).
- **Anchor references:** Raycast (sidebar + panel elevation), Cron (typography + crafted detail), Linear (table-row + inline expand patterns).
- **Anti-references:** Current Hindsight chrome, generic SaaS / Bento-grid, observability/Grafana panels.

No probes generated. Direction is locked from the localhost comparison + DESIGN.md; harness lacks native image generation.

## 4. Scope

- **Fidelity:** Production-ready (replaces live deployed surface).
- **Breadth:** Whole app — shell + 11 section views (new Overview + 10 ported sections).
- **Interactivity:** Real. Wired to existing Convex hydration. Existing JS data layer reused; rendering layer rewritten.
- **Time intent:** Polish until it ships, in slices — shell + Overview first, then port each section so the live deploy is never broken.

## 5. Layout Strategy

```
┌── 14px outer padding ────────────────────────────────────┐
│  ┌── 232px sidebar ──┐  ┌── main column ────────────┐    │
│  │ brand + workspace │  │  page-header panel        │    │
│  │ ─ Memory          │  │  ┌─────────────────────┐  │    │
│  │   Sessions    45  │  │  │ title · subtitle    │  │    │
│  │   Notes      100  │  │  │ stat strip · actions│  │    │
│  │   Graph      160  │  │  └─────────────────────┘  │    │
│  │   Matrix          │  │                           │    │
│  │   Replay          │  │  content panel            │    │
│  │   Agents          │  │  ┌─────────────────────┐  │    │
│  │ ─ Drift           │  │  │ table / split /     │  │    │
│  │   Guardian     6  │  │  │ canvas              │  │    │
│  │   Resolutions  3  │  │  │                     │  │    │
│  │   GC              │  │  └─────────────────────┘  │    │
│  │ ─ Sources         │  │                           │    │
│  │   Libraries    9  │  │  (optional secondary      │    │
│  │   Hyperspell  17  │  │   panel below)            │    │
│  │   Activity        │  │                           │    │
│  └───────────────────┘  └───────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

Both sidebar and main panels are rounded `--radius-lg` with `--shadow-sm` floating on `--bg`. Sidebar sections collapse via header click; state persists in localStorage. Active item gets `--bg-subtle + --shadow-xs` (subtle lift), never a colored stripe.

## 6. Key States

| State | What the operator sees |
|---|---|
| Default (loaded) | Overview with 4 panels: Today's notes, Findings needing attention, GC schedule, Ingestion runs. Sidebar shows real counts. |
| First-time (no data) | Overview shows a single tabular row: *"Connect your first agent — point Claude Code's MCP at `nm_server.py`"* + copy-paste snippet inline. Still a table row, no illustration. |
| Loading | Sidebar counts show `—`. Panel rows: monochrome skeleton bars at row heights. No spinners. Snaps to real content. |
| Offline / Convex unreachable | Header subtitle: `offline · last refreshed N min ago`. Last-known data stays on screen. Refresh button still works. |
| Section with zero rows | *"No <thing> here yet."* in `--fg-soft`, single placeholder row with `—`. No illustration. |
| Row expanded | Click row → expands in-place into `--bg-subtle` band with definition-list metadata + nested panels. No modals. |

## 7. Interaction Model

- **Sidebar:** click section header to collapse/expand (state persists). Click item to navigate. Active item = subtle elevation.
- **Cmd-K:** 21st.dev-style command palette. Sections + sessions + findings + libraries, mono results, fuzzy filter.
- **Table rows:** click anywhere on row to toggle expanded detail. `Enter`/`Space` when focused. Chevron rotates on expand.
- **Primary buttons:** `--accent` bg, `transform: scale(0.98)` on press. No hover state.
- **No animation on navigation.** Section switches are instant.
- **Refresh:** explicit button only. No polling beyond existing Convex WebSocket subscription.

## 8. Content Requirements

### Overview page (new — most content design lift)

Page subtitle: *"<workspace> · <X> sessions captured · <Y> open findings · <Z> ingestion runs today"*

Four panels, each a rounded shadow container:

1. **Today's notes** — table: time / session-vendor / file / symptom snippet. Up to 10 rows. Empty: *"No new notes today. Last note came in <relative time>."*
2. **Findings needing attention** — table: severity / file / status / cycle / age. Filtered to `detected` + `verifying`. Empty: *"No open findings. Last cycle ran <relative time>."*
3. **GC schedule** — small panel: *"Next sweep in <countdown>. Last run retained <N>, pruned <M>."* + `Run sweep now` button.
4. **Ingestion runs** — table: lib / topic / leaves / age. Last 5. Empty: *"No ingestion runs yet."*

### Sidebar

Labels uppercased per DESIGN.md: `MEMORY` / `DRIFT` / `SOURCES`.

**Counts:** meaningful only. Show on Sessions / Notes / Graph / Guardian / Resolutions / Libraries / Hyperspell. Omit on Matrix / Replay / Agents / GC / Activity.

### Section subtitles (one-liners, outcome-framed)

- Sessions: *"Every coding session NM has captured, newest first."*
- Guardian: *"Drift, security, and bug findings filed against the target codebase."*
- GC: *"Decay, merge, prune. Last sweep <relative time>; next sweep in <countdown>."*
- Libraries: *"External documentation the docs-ingest pipeline has cached as constraints."*
- Replay: *"Scrub through the captured timeline to see how the graph evolved."*

### Empty state rule

Every empty state is still a table row. No illustrations, no centered icons, no "Get started" CTAs.

### Workspace switcher

Visually present (top of sidebar — `acme-eng` with dropdown caret) but functionally decorative for v1. Documented as a future hook for multi-org.

### Brand glyph

Custom design — a 28px rounded-square mark in `--accent`, with a small white inset element. Iterated during build, not predetermined. Goal: distinctive but quiet, monochrome, scales to 16px favicon.

## 9. Recommended References

- **shadcn/ui** for primitives (Button, Table, Sidebar, Sheet, Command, Tabs, Badge, Dialog).
- **21st.dev** for Command palette, timeline scrubber (Replay), force-directed graph wrapper (Graph / Matrix).
- **DESIGN.md** — token names appear in CSS variables verbatim.
- Existing `mock/index.html` data layer (`applyConvexData`, `_fetch`, `_deriveSessions`) — reuse, don't rewrite.

## 10. Resolved Decisions

1. **Sidebar counts:** meaningful only — Replay / GC / Activity / Matrix / Agents show no count.
2. **Workspace switcher:** single-org visual, dropdown decorative; document as future hook.
3. **Brand glyph:** designed during build. 28px rounded-square in `--accent` + white inset element, distinctive but quiet.
4. **Replay redesign:** surfaced as its own design subtask during port.

## Build slice plan

To keep the live deploy unbroken while rebuilding, ship in slices:

1. **Slice 1 — Shell + Overview.** New `index.html` shell, sidebar, header panel, Overview view with the 4 content panels. Wire to existing Convex data layer. Sidebar items for the 10 existing sections are present but route to a "Coming up next" placeholder.
2. **Slice 2 — Memory section.** Port Sessions, Notes, Graph, Matrix, Replay, Agents.
3. **Slice 3 — Drift section.** Port Guardian, Resolutions, GC.
4. **Slice 4 — Sources section.** Port Libraries, Hyperspell, Activity.
5. **Slice 5 — Polish + Cmd-K + handoff.** Command palette, motion respects `prefers-reduced-motion`, final pass against DESIGN.md tokens.

Each slice gets its own commit + push. The deploy is always functional.
