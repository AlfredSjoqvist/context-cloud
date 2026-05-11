# Product

## Register

product

## Users

Hindsight is a personal portfolio piece in its current phase, with an eventual second audience of self-serve users (engineering leads or AI infra operators running NM + Guardian against their own org's coding sessions). The interface should be designed for the future state — a real product UI that a returning operator uses to investigate sessions, audit Guardian findings, and tune the GC — not a hackathon demo console for first-time judges. Showcase happens as a side effect of being a good product, not by leaning on "demo" framing.

## Product Purpose

Hindsight makes an org's AI coding agents collectively smarter:

- **NM** captures every Claude Code session via MCP hooks, distills the moments an agent got stuck into compact notes, and injects relevant notes back when a future session touches the same files.
- **Guardian** runs continuously over the codebase, detects intent drift / security vulns / bugs against a structured `.md` context map, files real GitHub issues with line-precise citations, and hands findings to Devin with sharpen-iteration up to 2x.
- **GC** prunes the note graph on a schedule (decay → merge → prune).
- **docs-ingest** turns external documentation (markdown / HTML / OpenAPI / live URL) into per-line `.md` constraints Guardian can cite.

The dashboard is the operator's surface across all of this. Success looks like: a returning user opens a tab, lands on the work item that matters right now (a session that just produced a note, a finding awaiting Devin handoff, a GC sweep that retained 47 / pruned 23), and can drill into evidence without hunting through tabs.

## Brand Personality

Trustworthy, considered, quietly powerful. The product knows things and wants to be inspected, not admired. Three words: **serious, tabular, restrained.**

## Anti-references

- **The current Hindsight dashboard.** Hackathon-built monochrome + purple/cyan, dense top-row of 10 tabs, `live · convex` pulsing pills, gradient-stripe accents, terminal-vibes log views, "Note Graph" hero. Already lived through; explicitly the no-go.
- **Generic SaaS / Bento-grid layouts.** Big gradient hero, three identical metric cards in a row, abstract "feature illustrations", "Get started for free" aesthetic. The Stripe-clone landing-page reflex. This product does not have a marketing surface inside the app.
- **Observability / Grafana-style dense panels.** Dashboards full of gauges, sparklines, multi-color charts everywhere. Wrong category register — Hindsight is about discrete events and findings, not continuous metrics.
- **Notion / Obsidian document-first aesthetics.** Soft pastels, block-based editing surface, content-creator vibe. Wrong feel for an agent-ops product.

## Design Principles

1. **Inspect, don't decorate.** Every panel earns its space by surfacing something an operator would actually look at. No chrome for chrome's sake, no decorative gradients, no "live" pills. Numbers and timestamps over labels and badges where possible.
2. **Real, not demo.** The UI treats data as belonging to a real org with real history. No "synthetic ACME" branding in the chrome, no seeded-data callouts in normal views. The data itself is the demo — the framing is just "this is your dashboard."
3. **Density is a feature.** Tabular rows beat hero cards. Scannable column layouts beat carousels. The operator's job is to scan and drill, not to be welcomed each visit. Empty states are still tables, not illustrations.
4. **Tinted neutrals + meaning color.** Monochrome chrome throughout (tinted-toward-warm grayscale, never `#000`/`#fff`). Color appears exclusively in the note-graph visualization where it carries semantic meaning. No accent colors on buttons, pills, status indicators, or active nav. Black is the only "accent."
5. **Quiet by default.** No animations on load, no pulsing accents, no real-time tickers that aren't tied to actual events. The system shows it's alive by updating rows when something happens, not by signaling. If a panel doesn't have new information, it stays still.

## Accessibility & Inclusion

- **WCAG 2.2 AA minimum.** Contrast ratios verified for the tinted-neutral palette (foreground ≥ 4.5:1 on background, large text ≥ 3:1).
- **Keyboard-first navigation.** Sidebar sections collapsible via Enter/Space, all rows accessible via Tab, expanded session details toggleable via keyboard. Visible focus rings throughout.
- **Reduced motion respected.** `prefers-reduced-motion` disables any easing on collapsible sections and tab switches.
- **Monospace for code, sans for prose.** Code paths, finding IDs, hashes, and timestamps in monospace so they're recognizable as data. Never style prose copy as code.
- **Color-blind safe.** Because color is restricted to the note-graph viz, status communication in chrome (severity, state, vendor) uses text and shape, not hue.
