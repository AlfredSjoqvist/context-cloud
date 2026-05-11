# Design

Visual system for Hindsight. **Raycast / Cron-inspired** in spirit (crafted, softly elevated rounded panels, pixel-perfect detail), with the discipline of strict monochrome — color appears only inside the note-graph visualization, never in the surrounding chrome.

Built on shadcn/ui + 21st.dev primitives. Tokens below are the source of truth; component CSS reads from them.

---

## Theme

**Light only.** Scene sentence: *operator at a 15-inch laptop, mid-day, inspecting why an agent got stuck on a file from last Tuesday's session.* That forces light — investigative work in normal office light, no SRE-at-2am bias.

Dark mode is a follow-up, not a v1. The note-graph viz is the one place darkness might be earned (the graph reads better on a dark canvas) — handled as a local theme override on the viz panel itself, not a system-wide toggle.

---

## Color

OKLCH throughout. Neutrals tinted toward a warm gray (hue ≈ 60°, very low chroma). The Raycast/Cron family runs warmer than Stripe's cool neutrals — bg sits closer to bone than to ash.

### Tokens (CSS custom properties)

```css
:root {
  /* Surface — app sits on bg, panels float above it */
  --bg:            oklch(0.972 0.004 70);   /* app background (warm bone) */
  --bg-elevated:   oklch(0.995 0.002 70);   /* panel / table surface */
  --bg-subtle:     oklch(0.96 0.005 70);    /* hover, expanded row */
  --bg-muted:      oklch(0.978 0.003 70);   /* sidebar background — sits between bg and elevated */

  /* Foreground — dark to light */
  --fg:            oklch(0.18 0.008 70);    /* primary text */
  --fg-strong:     oklch(0.10 0.005 70);    /* headings, active states, primary buttons */
  --fg-soft:       oklch(0.42 0.007 70);    /* secondary text */
  --fg-faint:      oklch(0.60 0.005 70);    /* tertiary / labels */
  --fg-muted:      oklch(0.76 0.004 70);    /* placeholder, dividers-as-text */

  /* Borders — softer than Stripe; closer to the surface they sit on */
  --border:        oklch(0.93 0.004 70);    /* hairlines on bg */
  --border-strong: oklch(0.88 0.005 70);    /* button outlines, decisive dividers */

  /* Single "accent": near-black for primary actions / active nav */
  --accent:        oklch(0.10 0.005 70);
  --accent-fg:     oklch(0.99 0 0);

  /* Subtle elevation shadows — Raycast/Cron's signature */
  --shadow-xs:     0 1px 1px rgba(20, 20, 16, 0.025),
                   0 0 0 1px var(--border);
  --shadow-sm:     0 1px 2px rgba(20, 20, 16, 0.04),
                   0 1px 1px rgba(20, 20, 16, 0.02),
                   0 0 0 1px var(--border);
  --shadow-md:     0 4px 16px rgba(20, 20, 16, 0.045),
                   0 1px 2px rgba(20, 20, 16, 0.03),
                   0 0 0 1px var(--border);
  --shadow-pop:    0 8px 32px rgba(20, 20, 16, 0.08),
                   0 2px 8px rgba(20, 20, 16, 0.04),
                   0 0 0 1px var(--border-strong);
}
```

Every shadow includes the `0 0 0 1px border` ring so panels read crisply against the bg without depending on a separate border declaration.

### Strategy: Restrained

One accent (near-black). Sub-10% of any view's surface area. No semantic color tokens (no `--success`, `--warning`, `--danger`) — status uses text + glyph + weight, not hue. Severity is communicated with words ("critical", "high") and table column position, not red/yellow/green.

### The exception: note-graph visualization

Color appears only inside the graph canvas (and the matrix view of the same graph). Confined to:

- Node coloring by repo / category — discrete categorical palette, generated from OKLCH at fixed lightness 0.65, chroma 0.18, hue distributed.
- Edge weight rendered as opacity, not hue.
- Heat scale (retained-score distribution, GC preview) — single-hue ramp from `--fg-muted` to `oklch(0.30 0.18 25)`.

Nothing else gets color. Not status pills, not active nav, not pull-request states, not severity badges.

---

## Typography

Two families. Display weight on headings — Raycast/Cron lean into slightly tighter tracking on title type.

```css
:root {
  --font-sans:    'Inter Tight', 'Inter', system-ui, -apple-system, sans-serif;
  --font-display: 'Inter Tight', 'Inter', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}
```

**Inter Tight** for headings (tighter optical sizing — the Cron / Raycast feel). **Inter** for body, labels, button text. **JetBrains Mono** for code paths, finding IDs, fingerprints, timestamps, hash prefixes, numeric metric values. The mono / sans split is itself a signal — anything in mono is *data*, anything in sans is *narration*.

### Scale (ratio 1.25)

```css
--text-2xs:  10.5px / 1.4;   /* table column labels, micro-tags */
--text-xs:   12px   / 1.5;   /* dense metadata, captions, footnotes */
--text-sm:   13.5px / 1.55;  /* body default */
--text-md:   14px   / 1.55;  /* section bodies */
--text-lg:   16px   / 1.4;   /* section headings */
--text-xl:   20px   / 1.25;  /* page titles — uses --font-display */
--text-2xl:  24px   / 1.2;   /* big metric numbers — uses --font-display */
```

### Weight

`--weight-regular: 400`, `--weight-medium: 500`, `--weight-semibold: 600`. No 700 / bold — hierarchy comes from size + medium/semibold contrast, not bold. Headings: semibold display. Active nav, primary buttons: medium. Body: regular.

Body line length capped at 70ch. Numeric columns use `font-variant-numeric: tabular-nums` so digits align. Display headings use `letter-spacing: -0.02em`.

---

## Spacing

4-px base. Use these tokens; don't reach for arbitrary px in components.

```css
--space-0:  0;
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
```

Vary deliberately. Sidebar item: `6px 10px`. Table row: `12px 18px`. Page header: `16px 22px`. Panel internal padding: `16–20px`. The shell wraps panels in `14px` outside-padding so the rounded shells don't touch each other.

---

## Elevation

Raycast/Cron's signature is *small, intentional* shadows on otherwise flat surfaces. Used:

- **Sidebar:** `--shadow-sm`. The sidebar is a floating panel inside the app, not flush against the edge.
- **Panels (cards, table containers, the stat strip):** `--shadow-sm`.
- **Active sidebar item:** `--shadow-sm` lifts it slightly inside the sidebar.
- **Dropdowns, popovers, menus, command palette:** `--shadow-pop`.

What does **not** get shadow: rows inside a table, body text, individual stats, file chips, vendor pills. Inner content is flat — the panel is what's lifted.

```css
--shadow-none:  none;
/* see tokens above for --shadow-xs / sm / md / pop */
```

---

## Radius

Bumped up from the Stripe family — rounded panels are part of the Raycast/Cron look.

```css
--radius-xs:   4px;     /* tight chips (vendor pills, score pills) */
--radius-sm:   6px;     /* file path chips, small buttons */
--radius-md:   8px;     /* default buttons, inputs, small panels */
--radius-lg:   12px;    /* panels (sidebar, main panels, cards) */
--radius-xl:   14px;    /* the outer app shell wrappers, sheets */
--radius-pill: 9999px;  /* sparingly — vendor pill, severity tag */
```

The 12px panel radius is the "Raycast/Cron" tell. Don't go bigger — 16+ tips into consumer-app territory.

---

## Layout grid

App shell: fixed-width sidebar + fluid main, both wrapped in 14px outer padding so the rounded shells float on `--bg`.

- **Sidebar:** 232px wide (excl. outer padding). Background `--bg-elevated`. Wrapped in `--radius-lg` + `--shadow-sm`. Sections collapsible. Org/workspace switcher pinned top.
- **Main:** fluid. The header panel and the content panel are separate rounded containers (each `--shadow-sm + --radius-lg`) stacked vertically with `--space-3` gap between them.
- **Page header panel:** 60–80px tall, contains title + stat strip OR title + actions.
- **Content panel:** fills the rest of the viewport. Internally hosts a table, a list, or split-pane content.

This is the most visible departure from Stripe — Hindsight uses *floating panels on a tinted background* rather than full-bleed surfaces separated by borders.

### Breakpoints

```css
--bp-sm:  640px;
--bp-md:  768px;   /* hides sidebar, replaces with sheet trigger */
--bp-lg:  1024px;  /* default layout */
--bp-xl:  1280px;
--bp-2xl: 1536px;
```

Below `md`, sidebar collapses to a `≡` trigger that opens a sheet. Tables fall back to card view (one row → one rounded stacked card).

---

## Components (shadcn/ui + 21st.dev base)

Build on shadcn defaults, then re-style with the tokens above. Touch points where Hindsight diverges from stock shadcn:

| Component | What changes |
|---|---|
| `Button` | Default = ghost (no fill, `--fg-soft`). `variant="default"` = `--accent` background, `--accent-fg` text, `--shadow-sm`, 6px / 12px padding. `variant="outline"` = transparent bg, `--border-strong` ring, `--shadow-xs`. Active state: `transform: scale(0.98)` for 80ms. No `destructive` variant — destruction confirms via dialog. |
| `Panel` (custom wrapper) | `--bg-elevated`, `--radius-lg`, `--shadow-sm`. Internal padding `--space-4 --space-5`. The primary container for tables, lists, and pretty much every content surface. |
| `Table` | Wrapped in a `Panel`. Header row `--text-2xs` uppercased `--fg-faint`, no background. Body rows: `--text-sm`, 12 / 18 padding, `--bg-subtle` on `:hover`. Hairlines `--border` between rows; no outer table border (the panel ring serves). |
| `Card` | The same as `Panel`. Don't add a distinct "Card" component — there's exactly one container shape. |
| `Badge` | Monochrome only. `variant="outline"` is the default — `--border-strong` ring, `--fg` text, `--radius-xs`. `variant="solid"` = `--accent` background, `--accent-fg` text, same ring. Used for "has notes" pills, severity tags. |
| `Tabs` (in-page) | Underline-only at the bottom: 1.5px `--accent` line under active, `--fg-soft` for inactive labels. No segmented-control pill style on chrome. |
| `Sidebar` (custom) | Sections collapsible. Section headers `--text-2xs` uppercased `--fg-faint`. Active item: `--bg-subtle` bg, `--fg-strong` text, `--weight-medium`, `--shadow-xs` (lifts slightly), `--radius-md`. *No left-border accent* — Raycast handles active via subtle elevation, not stripe. |
| `Sheet` | Default radix slide-from-right. Used for narrow-viewport sidebar replacement and for any drill-into-detail surface deeper than expand-in-place. |
| `Command` | Cmd-K global. Lists workspaces / tabs / sessions / findings / libraries. Monospace results. `--shadow-pop`, `--radius-xl`. |
| `Dropdown / Popover` | `--shadow-pop`, `--radius-lg`. Always `--bg-elevated` background. |

21st.dev for: the global Command palette, the note-graph viz wrapper (force-directed canvas), the timeline-scrubber on Replay. Stock shadcn for everything else.

---

## Motion

```css
--ease-out:    cubic-bezier(0.22, 1, 0.36, 1);    /* ease-out-quart */
--ease-soft:   cubic-bezier(0.16, 1, 0.3, 1);     /* ease-out-expo */
--dur-fast:    120ms;
--dur-normal:  200ms;
--dur-slow:    320ms;
```

What gets animated:

- Sidebar section collapse: `grid-template-rows` 0fr↔1fr at `--dur-normal --ease-out`.
- Button press: `transform: scale(0.98)` at `--dur-fast`. Subtle, the only "tactile" cue.
- Table row hover: 80ms instant tint (not really animated).
- Sheet enter/exit: standard radix defaults at `--ease-soft`.
- Note-graph node hover: 120ms opacity on connected edges.

What does **not** animate:

- Page navigation (instant, no fade).
- Tab switches inside a page (instant).
- Number ticks (counters update without rolling).
- "Live" indicators — there are no live indicators.

`prefers-reduced-motion`: kill all of the above. Snap transitions, no scale on press.

---

## Iconography

Lucide. 14–16px in chrome, 18–20px in primary actions. Always `currentColor`. Stroke width 1.6px (Lucide default is 2 — override globally; 1.5 reads too thin against Raycast's slightly elevated surfaces). No filled-icon variants in chrome.

---

## Patterns

A few opinionated patterns to apply consistently:

- **Section title strip.** Page-level title at `--text-xl --weight-semibold --font-display`, single-line subtitle at `--text-sm --fg-soft`. No trailing breadcrumbs in v1 (the sidebar is the breadcrumb).
- **Stat strip.** Inside the page-header panel. Single horizontal row of 3–5 stats. Number at `--text-2xl --weight-semibold --font-display`. Label at `--text-2xs` uppercase `--fg-faint`. Hairline divider below.
- **Table row → expanded detail.** Click a row → it expands in-place into a `--bg-subtle` band with structured metadata (definition-list) + one or more notes / findings, each inside its own nested panel. Never a modal.
- **File chip.** `--font-mono --text-xs`, `--bg-subtle` background, `--border` ring, `--radius-sm`. Used wherever a file path appears.
- **Vendor pill.** `--font-sans --text-2xs --weight-medium`, `--bg-elevated`, `--border-strong` ring, `--radius-pill`. The only pill shape in the system.
- **Importance / score.** Monospace, prefixed with the field name, e.g. `imp 0.70`, `score 0.93`. Sometimes wrapped in a `--bg-subtle --radius-xs --border` chip if it's the primary signal on a card. Never visualized as a colored bar in chrome.
- **Brand glyph.** A 26px rounded-square in `--accent` with a small white inset element (rotated square / diamond). The same glyph appears in the sidebar brand slot, the favicon, and the OG card.

---

## Anti-patterns (banned)

Beyond the absolute bans in impeccable's shared laws:

- Side-stripe accents on rows / nav items (e.g., "active item has a colored left border"). Active states use `--bg-subtle` + `--shadow-xs` + weight, never a colored stripe.
- "Real-time" pulsing dots, animated gradient backgrounds on "live" panels.
- Any pill, badge, or chip in a non-monochrome color outside the note-graph viz.
- Three identical metric cards in a row with a gradient. Use the stat strip inside the page-header panel instead.
- Modals for editing GC thresholds. Inline sliders in a sidebar panel.
- Big shadow (more than `--shadow-md` outside of popovers / sheets). The "huge drop shadow under a card" SaaS reflex is banned.
- The word "Dashboard" anywhere in the chrome — sections name themselves (Sessions, Notes, Guardian, etc.).
