"""Render an academic-style system-architecture spec PDF for NM.

White background, clear platform attribution on every component, numbered
figures with captions. 5 pages, landscape letter.

Output: architecture.pdf at project root.
Run:    python make_architecture_pdf.py
"""

from __future__ import annotations

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

# ----- palette -----
WHITE       = "#FFFFFF"
SURFACE_LO  = "#F8FAFC"
BORDER      = "#D1D5DB"
BORDER_DARK = "#9CA3AF"
RULE        = "#E5E7EB"
INK         = "#0F172A"
INK2        = "#334155"
INK3        = "#64748B"

# Platform-attribution tag colors (muted, distinct).
P_LOCAL      = "#475569"   # local Python / SQLite
P_CONVEX     = "#B91C1C"   # Convex
P_TENSORLAKE = "#5B21B6"   # Tensorlake
P_VERCEL     = "#0F172A"   # Vercel (Vercel brand is near-black)
P_NIA        = "#1D4ED8"   # Nia
P_OPENAI     = "#0F766E"   # OpenAI (Note Manager LLM call)
P_CLIENT     = "#0E7490"   # User's coding agent (Claude Code / Cursor / Codex)

PAGE_W, PAGE_H = 11.0, 8.5  # landscape letter
DOC_TITLE = "NM · Shared Memory for Coding Agents"
DOC_SUB   = "System Architecture Specification · v0.2 · 2026-05-09"
TOTAL_PAGES = 5


def _new_page():
    fig, ax = plt.subplots(figsize=(PAGE_W, PAGE_H))
    fig.patch.set_facecolor(WHITE)
    ax.set_facecolor(WHITE)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


def header(ax, page_num, section_title=None):
    ax.text(5, 96.7, DOC_TITLE,
            ha="left", va="center", fontsize=8, color=INK3, family="serif")
    ax.text(95, 96.7, DOC_SUB,
            ha="right", va="center", fontsize=8, color=INK3, family="serif")
    ax.plot([5, 95], [95.4, 95.4], color=RULE, linewidth=0.5)
    if section_title:
        ax.text(5, 91, section_title,
                ha="left", va="center", fontsize=14, color=INK,
                fontweight="700", family="serif")
    ax.plot([5, 95], [4.4, 4.4], color=RULE, linewidth=0.5)
    ax.text(95, 3.2, f"{page_num} / {TOTAL_PAGES}",
            ha="right", va="center", fontsize=8, color=INK3, family="serif")
    ax.text(5, 3.2, "anthropic / nozomio hackathon",
            ha="left", va="center", fontsize=8, color=INK3, family="serif")


def caption(ax, n, text, y=8.5):
    ax.text(50, y,
            f"Figure {n}.  {text}",
            ha="center", va="center",
            fontsize=8.7, color=INK2, family="serif", style="italic")


def component_box(ax, x, y, w, h, *, name, role,
                  platform_label=None, platform_color=None,
                  filename=None, name_size=10.5):
    """Box with a colored top-strip for the platform and a filename caption."""
    rect = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.25,rounding_size=0.4",
        linewidth=0.7, facecolor=WHITE, edgecolor=BORDER_DARK,
    )
    ax.add_patch(rect)

    if platform_label and platform_color:
        strip_h = 0.9
        strip = FancyBboxPatch(
            (x + 0.15, y + h - strip_h - 0.2), w - 0.3, strip_h,
            boxstyle="round,pad=0,rounding_size=0.25",
            linewidth=0, facecolor=platform_color,
        )
        ax.add_patch(strip)
        ax.text(x + w / 2, y + h - strip_h / 2 - 0.2, platform_label,
                ha="center", va="center", fontsize=6.4, color=WHITE,
                fontweight="700", family="sans-serif",
                fontvariant="small-caps")

    cx = x + w / 2
    if filename:
        ax.text(cx, y + h * 0.62, name, ha="center", va="center",
                fontsize=name_size, color=INK, fontweight="600", family="serif")
        ax.text(cx, y + h * 0.41, role, ha="center", va="center",
                fontsize=7.6, color=INK2, family="serif")
        ax.text(cx, y + h * 0.18, filename, ha="center", va="center",
                fontsize=7.0, color=INK3, family="monospace")
    else:
        ax.text(cx, y + h * 0.55, name, ha="center", va="center",
                fontsize=name_size, color=INK, fontweight="600", family="serif")
        ax.text(cx, y + h * 0.27, role, ha="center", va="center",
                fontsize=7.8, color=INK2, family="serif")


def arrow(ax, x1, y1, x2, y2, *, label=None, color=INK3, ls="-", lw=0.7):
    a = FancyArrowPatch(
        (x1, y1), (x2, y2),
        arrowstyle="-|>",
        color=color, mutation_scale=8, linewidth=lw, linestyle=ls,
    )
    ax.add_patch(a)
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 0.6, label,
                ha="center", va="center", fontsize=7, color=INK2,
                family="serif",
                bbox=dict(facecolor=WHITE, edgecolor="none", pad=1.2))


# ============================================================================
# PAGE 1 — title + abstract + component index
# ============================================================================
def page_title(pdf):
    fig, ax = _new_page()
    header(ax, 1)

    # masthead
    ax.text(50, 84, "NM",
            ha="center", va="center", fontsize=44, color=INK,
            fontweight="700", family="serif")
    ax.text(50, 78.5, "Shared Memory for Coding Agents",
            ha="center", va="center", fontsize=18, color=INK2, family="serif")
    ax.plot([35, 65], [75.5, 75.5], color=BORDER, linewidth=0.6)
    ax.text(50, 73, "System Architecture Specification",
            ha="center", va="center", fontsize=11, color=INK3,
            family="serif", style="italic")

    # Abstract
    ax.text(10, 65, "Abstract",
            ha="left", va="center", fontsize=12, color=INK,
            fontweight="700", family="serif")
    ax.plot([10, 90], [63.6, 63.6], color=RULE, linewidth=0.4)

    abstract = (
        "Coding agents in an organisation repeat the same project-specific "
        "mistake across sessions because they have no shared memory. NM is an "
        "MCP-served note graph that watches every coding session, distills the "
        "moments where the agent got stuck into compact four-field notes, and "
        "injects the relevant note into any future agent's context the moment "
        "it touches the same file. The system runs as three coordinated "
        "always-on agents — a Note Manager that produces notes from streamed "
        "transcripts, a Garbage Collector that prunes the graph, and a "
        "Guardian that filters injections — connected to a local SQLite trace, "
        "a Convex-hosted product graph, a Vercel-deployed reactive dashboard, "
        "and an optional Nia semantic index. This document specifies each "
        "component, its assigned execution platform, and the data flow "
        "between them."
    )
    ax.text(10, 60.2, abstract,
            ha="left", va="top", fontsize=9.5, color=INK,
            family="serif", wrap=True,
            transform=ax.transData)
    # word-wrap by hand: matplotlib doesn't honor `wrap` reliably in axes coords.
    # Use textwrap to break the abstract into lines that fit the column.
    import textwrap
    lines = textwrap.wrap(abstract, width=110)
    for i, line in enumerate(lines):
        ax.text(10, 60.2 - i * 2.4, line,
                ha="left", va="top", fontsize=9.5, color=INK, family="serif")

    # Track + rubric
    rubric_y = 60.2 - len(lines) * 2.4 - 4
    ax.text(10, rubric_y, "Track and rubric",
            ha="left", va="center", fontsize=12, color=INK,
            fontweight="700", family="serif")
    ax.plot([10, 90], [rubric_y - 1.4, rubric_y - 1.4], color=RULE, linewidth=0.4)
    rubric_text = (
        "Submitted to Always-On Agents (sponsors: Nia + Tensorlake) at the "
        "Nozomio hackathon (May 9, 2026). Scoring weights: Background "
        "Execution 30%, Statefulness 25%, Agentic Depth 20%, Demo & "
        "Presentation 10%, Judge's Personal Rating 10%. The architecture is "
        "designed so that disabling background execution or the persistent "
        "note graph would cause the demo to fail — the rubric explicitly "
        "tests this."
    )
    for i, line in enumerate(textwrap.wrap(rubric_text, width=110)):
        ax.text(10, rubric_y - 4.2 - i * 2.4, line,
                ha="left", va="top", fontsize=9.5, color=INK, family="serif")

    # Companion docs
    docs_y = 22
    ax.text(10, docs_y, "Companion documents",
            ha="left", va="center", fontsize=11, color=INK,
            fontweight="700", family="serif")
    ax.plot([10, 90], [docs_y - 1.4, docs_y - 1.4], color=RULE, linewidth=0.4)
    docs = [
        ("NM.md",     "Product specification, demo arc, statefulness story."),
        ("SPEC.md",   "Sponsor-platform integration spec (deploy commands, env vars, file ownership)."),
        ("SCHEMA.md", "Database schema reference for nm.db and Convex mirror."),
    ]
    for i, (fname, desc) in enumerate(docs):
        ax.text(11, docs_y - 4 - i * 2.6, fname,
                ha="left", va="center", fontsize=9, color=INK,
                family="monospace", fontweight="600")
        ax.text(20, docs_y - 4 - i * 2.6, "—",
                ha="left", va="center", fontsize=9, color=INK3, family="serif")
        ax.text(22, docs_y - 4 - i * 2.6, desc,
                ha="left", va="center", fontsize=9, color=INK2, family="serif")

    pdf.savefig(fig, facecolor=WHITE)
    plt.close(fig)


# ============================================================================
# PAGE 2 — system architecture diagram
# ============================================================================
def page_architecture(pdf):
    fig, ax = _new_page()
    header(ax, 2, section_title="1.  System architecture")

    # ---- top: client agent ----
    component_box(ax, 36, 80, 28, 7,
                  name="User's coding agent",
                  role="Claude Code · Cursor · Codex (any MCP client)",
                  platform_label="CLIENT",
                  platform_color=P_CLIENT,
                  name_size=11)

    # ---- inline hooks layer ----
    component_box(ax, 5, 64, 28, 9,
                  name="Capture hooks",
                  role="UserPromptSubmit · PostToolUse · Stop",
                  filename="nm_capture.py",
                  platform_label="LOCAL · python",
                  platform_color=P_LOCAL)
    component_box(ax, 36, 64, 28, 9,
                  name="Inject hook",
                  role="PreToolUse → additionalContext",
                  filename="nm_inject.py",
                  platform_label="LOCAL · python",
                  platform_color=P_LOCAL)
    component_box(ax, 67, 64, 28, 9,
                  name="MCP query surface",
                  role="get_relevant_notes, find_notes_semantic, …",
                  filename="nm_server.py",
                  platform_label="LOCAL · python",
                  platform_color=P_LOCAL)

    arrow(ax, 50, 80, 19, 73.5, label="JSONL transcript")
    arrow(ax, 50, 80, 50, 73.5, label="tool input")
    arrow(ax, 50, 80, 81, 73.5, label="MCP stdio")

    # ---- SQLite trace+graph ----
    component_box(ax, 18, 47, 47, 9,
                  name="Local trace + product graph",
                  role="messages · content_blocks · tool_calls · file_touches · notes · injections",
                  filename="nm.db (SQLite, WAL)",
                  platform_label="LOCAL · sqlite",
                  platform_color=P_LOCAL,
                  name_size=11)
    arrow(ax, 19, 64, 30, 56, label="raw")
    arrow(ax, 50, 64, 45, 56, label="audit")
    arrow(ax, 81, 64, 60, 56, label="reads")

    # ---- Convex (state of record + reactive) ----
    component_box(ax, 70, 47, 25, 9,
                  name="Reactive product graph",
                  role="state-of-record · WebSocket reactivity",
                  filename="convex/*.ts (HTTP actions)",
                  platform_label="CONVEX",
                  platform_color=P_CONVEX,
                  name_size=10.5)
    arrow(ax, 65, 51.5, 70, 51.5, color=P_CONVEX, label="best-effort\nsync (POST)")

    # ---- Vercel dashboard ----
    component_box(ax, 70, 30, 25, 9,
                  name="Public live dashboard",
                  role="Next.js 15 · useQuery (live)",
                  filename="dashboard/app/*",
                  platform_label="VERCEL",
                  platform_color=P_VERCEL,
                  name_size=10.5)
    arrow(ax, 82.5, 47, 82.5, 39, color=P_CONVEX, label="reactive")

    # ---- Tensorlake background agents ----
    component_box(ax, 5, 30, 25, 9,
                  name="Note Manager",
                  role="webhook · session → notes",
                  filename="tensorlake/note_manager.py",
                  platform_label="TENSORLAKE",
                  platform_color=P_TENSORLAKE,
                  name_size=10.5)
    component_box(ax, 33, 30, 25, 9,
                  name="GC Agent",
                  role="cron */15 · decay → merge → prune",
                  filename="tensorlake/gc.py",
                  platform_label="TENSORLAKE",
                  platform_color=P_TENSORLAKE,
                  name_size=10.5)
    arrow(ax, 17, 47, 17, 39, ls="--", color=P_TENSORLAKE, label="reads")
    arrow(ax, 17, 39, 30, 47, ls="--", color=P_TENSORLAKE, label="writes")
    arrow(ax, 45, 47, 45, 39, ls="--", color=P_TENSORLAKE, label="reads")
    arrow(ax, 45, 39, 50, 47, ls="--", color=P_TENSORLAKE, label="writes")
    arrow(ax, 58, 34.5, 70, 47, ls="--", color=P_TENSORLAKE)

    # ---- OpenAI (LLM extraction call) ----
    component_box(ax, 5, 14, 25, 9,
                  name="LLM extractor",
                  role="gpt-4o-mini · 4-field note schema",
                  filename="invoked by Note Manager",
                  platform_label="OPENAI",
                  platform_color=P_OPENAI,
                  name_size=10.5)
    arrow(ax, 17, 30, 17, 23, ls="--", color=P_OPENAI, label="LLM call")

    # ---- Nia ----
    component_box(ax, 36, 14, 25, 9,
                  name="Semantic note index",
                  role="search by topic when path-key match is empty",
                  filename="nm_nia.py (local cosine fallback)",
                  platform_label="NIA",
                  platform_color=P_NIA,
                  name_size=10.5)
    arrow(ax, 45, 30, 45, 23, ls="--", color=P_NIA, label="index_note")
    arrow(ax, 60, 18, 81, 64, ls="--", color=P_NIA, label="semantic_lookup")

    caption(ax, 1, "End-to-end data flow. Solid arrows are inline (in the latency-critical hook path). "
                   "Dashed arrows are best-effort and fail-open.")
    pdf.savefig(fig, facecolor=WHITE)
    plt.close(fig)


# ============================================================================
# PAGE 3 — three always-on agents
# ============================================================================
def page_agents(pdf):
    fig, ax = _new_page()
    header(ax, 3, section_title="2.  Always-on agents")

    cols = [
        {
            "name": "Note Manager",
            "trigger": "WEBHOOK",
            "trigger_sub": "fires on Stop / SubagentStop",
            "platform": ("TENSORLAKE · python", P_TENSORLAKE),
            "responsibilities": [
                "Read session's transcript from messages + content_blocks",
                "Run 7 hurdle-detection signals (nm_signals.py)",
                "Cluster signals into hurdle windows",
                "Distill each window into a 4-field note via LLM",
                "Persist note + edges + hurdle to SQLite + Convex",
                "Index the note with Nia for semantic retrieval",
            ],
            "files": "tensorlake/note_manager.py · nm_extract.py",
        },
        {
            "name": "Guardian",
            "trigger": "EVENT",
            "trigger_sub": "fires per PreToolUse",
            "platform": ("TENSORLAKE · planned", P_TENSORLAKE),
            "responsibilities": [
                "Score candidates against current session context",
                "Resolve contradictions between overlapping notes",
                "Enforce per-injection token budget",
                "Reject session-irrelevant notes even on file match",
                "Log accept/reject reasons to injections audit",
                "Learn from feedback over time",
            ],
            "files": "tensorlake/guardian.py (other teammate)",
            "note": "scope: assigned to a different teammate",
        },
        {
            "name": "Garbage Collector",
            "trigger": "CRON  */15 * * * *",
            "trigger_sub": "scheduled long-term hygiene",
            "platform": ("TENSORLAKE · python", P_TENSORLAKE),
            "responsibilities": [
                "Decay: importance halves every 7 days idle",
                "Merge: Jaccard ≥ 0.6 over files AND cosine ≥ 0.5",
                "    over correction text → keep higher importance",
                "Prune: importance < 0.10 → soft delete",
                "Audit: one row per action in gc_actions",
                "Mirror every action to Convex for live UI",
            ],
            "files": "tensorlake/gc.py · nm_gc.py",
        },
    ]
    xs = [5, 35, 65]
    for col, x in zip(cols, xs):
        # Title
        ax.text(x + 15, 86, col["name"], ha="center", va="center",
                fontsize=14, color=INK, fontweight="700", family="serif")
        # Platform pill (just below title)
        plat_label, plat_color = col["platform"]
        pill_w = max(13, len(plat_label) * 0.62 + 2)
        pill_x = x + 15 - pill_w / 2
        pill = FancyBboxPatch(
            (pill_x, 82), pill_w, 1.6,
            boxstyle="round,pad=0,rounding_size=0.5",
            linewidth=0, facecolor=plat_color,
        )
        ax.add_patch(pill)
        ax.text(x + 15, 82.8, plat_label,
                ha="center", va="center", fontsize=7, color=WHITE,
                fontweight="700", family="sans-serif")

        # Trigger
        trigger_box = FancyBboxPatch(
            (x, 75), 30, 4,
            boxstyle="round,pad=0.2,rounding_size=0.3",
            linewidth=0.6, facecolor=SURFACE_LO, edgecolor=BORDER,
        )
        ax.add_patch(trigger_box)
        ax.text(x + 15, 77.7, col["trigger"], ha="center", va="center",
                fontsize=10, color=INK, fontweight="700", family="monospace")
        ax.text(x + 15, 76, col["trigger_sub"], ha="center", va="center",
                fontsize=8, color=INK2, family="serif", style="italic")

        # Responsibilities
        ax.text(x + 15, 71, "Responsibilities",
                ha="center", va="center", fontsize=9, color=INK,
                fontweight="700", family="serif")
        for i, line in enumerate(col["responsibilities"]):
            ax.text(x + 1, 68 - i * 2.6, "•", ha="left", va="top",
                    fontsize=9, color=INK3)
            ax.text(x + 2.5, 68 - i * 2.6, line, ha="left", va="top",
                    fontsize=8.4, color=INK2, family="serif")

        # Files (footer per column)
        ax.plot([x, x + 30], [42, 42], color=RULE, linewidth=0.4)
        ax.text(x + 15, 40.5, "Source",
                ha="center", va="center", fontsize=8, color=INK3,
                family="serif", style="italic")
        ax.text(x + 15, 38.5, col["files"],
                ha="center", va="center", fontsize=7.3, color=INK2,
                family="monospace")
        if "note" in col:
            ax.text(x + 15, 36, col["note"],
                    ha="center", va="center", fontsize=7.5, color=P_TENSORLAKE,
                    family="serif", style="italic")

    # Bottom band: shared invariants
    ax.plot([5, 95], [29, 29], color=RULE, linewidth=0.6)
    ax.text(50, 27, "Shared invariants",
            ha="center", va="center", fontsize=10, color=INK,
            fontweight="700", family="serif")
    invariants = [
        "All three agents read and write through nm.db (SQLite, source-of-truth) and mirror writes to Convex (state-of-record).",
        "Local CLI equivalents exist for Note Manager (python nm_extract.py) and GC (python nm_gc.py --loop) so the demo runs without Tensorlake credentials.",
        "Removing background execution or the persistent note graph would cause the demo to fail — this satisfies the Always-On Agents rubric bar.",
    ]
    for i, line in enumerate(invariants):
        ax.text(50, 23.5 - i * 2.4, "—  " + line,
                ha="center", va="center", fontsize=8.7, color=INK2, family="serif")

    caption(ax, 2, "The three always-on agents that maintain the note graph. "
                   "Three distinct trigger types — webhook, event, schedule — by design.")
    pdf.savefig(fig, facecolor=WHITE)
    plt.close(fig)


# ============================================================================
# PAGE 4 — schema modules
# ============================================================================
def page_schema(pdf):
    fig, ax = _new_page()
    header(ax, 4, section_title="3.  Data schema")

    intro = (
        "The schema is partitioned into four modules, mirroring the OpenInference / "
        "OpenTelemetry GenAI semantic conventions: a verbatim trace, two derived "
        "projections for fast queries, the bipartite product graph, and an audit "
        "trail. The trace + projections live exclusively in local SQLite "
        "(latency-critical, append-heavy). The product graph and audit tables are "
        "mirrored to Convex for cross-machine reactivity."
    )
    import textwrap
    for i, line in enumerate(textwrap.wrap(intro, width=130)):
        ax.text(5, 87 - i * 2.4, line,
                ha="left", va="top", fontsize=9.2, color=INK2, family="serif")

    # Modules
    modules = [
        {
            "name": "TRACE",
            "sub": "verbatim chat capture",
            "platform": ("LOCAL · sqlite", P_LOCAL),
            "tables": [
                ("sessions",       "one row per Claude Code session"),
                ("messages",       "one row per transcript entry  (≈ OTel span)"),
                ("content_blocks", "text, thinking, tool_use, tool_result, image"),
                ("ingest_state",   "per-transcript line offset for incremental ingest"),
            ],
        },
        {
            "name": "INDEX (PROJECTIONS)",
            "sub": "derived from content_blocks at ingest time",
            "platform": ("LOCAL · sqlite", P_LOCAL),
            "tables": [
                ("tool_calls",   "tool_use joined to its tool_result"),
                ("file_touches", "(tool_call, canonical path) for O(idx) lookup"),
            ],
        },
        {
            "name": "NOTE GRAPH (PRODUCT)",
            "sub": "bipartite files ↔ notes",
            "platform": ("LOCAL · sqlite  +  CONVEX", P_CONVEX),
            "tables": [
                ("notes",           "id · symptom · root_cause · correction · importance"),
                ("files",           "canonical path registry (lowercase drive, fwd slashes)"),
                ("file_note_edges", "edge with per-file weight"),
            ],
        },
        {
            "name": "LIFECYCLE / AUDIT",
            "sub": "every state change recorded",
            "platform": ("LOCAL · sqlite  +  CONVEX", P_CONVEX),
            "tables": [
                ("hurdles + hurdle_signals", "detection windows + per-signal weights"),
                ("injections",               "every PreToolUse match (accepted / filtered)"),
                ("note_feedback",            "useful=true/false from agent or user"),
                ("gc_actions",               "every prune / merge / decay (cron-tick proof)"),
            ],
        },
    ]
    y0 = 78
    row_h = 14
    for i, m in enumerate(modules):
        y = y0 - i * row_h
        # Module name block
        block = FancyBboxPatch(
            (5, y - row_h + 2), 25, row_h - 2.5,
            boxstyle="round,pad=0.2,rounding_size=0.35",
            linewidth=0.7, facecolor=SURFACE_LO, edgecolor=BORDER_DARK,
        )
        ax.add_patch(block)
        ax.text(17.5, y - 1.5, m["name"],
                ha="center", va="center", fontsize=10.5, color=INK,
                fontweight="700", family="serif")
        ax.text(17.5, y - 4, m["sub"],
                ha="center", va="center", fontsize=8, color=INK2,
                family="serif", style="italic")
        # Platform pill
        plat_label, plat_color = m["platform"]
        pill_w = max(13, len(plat_label) * 0.55 + 2)
        pill_x = 17.5 - pill_w / 2
        pill_y = y - 8.5
        pill = FancyBboxPatch(
            (pill_x, pill_y), pill_w, 1.6,
            boxstyle="round,pad=0,rounding_size=0.5",
            linewidth=0, facecolor=plat_color,
        )
        ax.add_patch(pill)
        ax.text(17.5, pill_y + 0.8, plat_label,
                ha="center", va="center", fontsize=7, color=WHITE,
                fontweight="700", family="sans-serif")

        # Tables
        for j, (tbl, desc) in enumerate(m["tables"]):
            ty = y - 1 - j * 2.6
            ax.text(34, ty, tbl,
                    ha="left", va="center", fontsize=8.5, color=INK,
                    fontweight="600", family="monospace")
            ax.text(60, ty, desc,
                    ha="left", va="center", fontsize=8.4, color=INK2,
                    family="serif")

    caption(ax, 3, "Database schema, organised into four modules. The full reference (with column types and indexes) is in SCHEMA.md.")
    pdf.savefig(fig, facecolor=WHITE)
    plt.close(fig)


# ============================================================================
# PAGE 5 — platform allocation matrix
# ============================================================================
def page_allocation(pdf):
    fig, ax = _new_page()
    header(ax, 5, section_title="4.  Platform allocation")

    intro = (
        "Each component is assigned to exactly one execution platform. SQLite "
        "stays the source of truth for write-side latency; Convex is the "
        "state-of-record for cross-machine reads; Tensorlake hosts the "
        "background agents; Vercel hosts the public dashboard URL; Nia and "
        "OpenAI provide auxiliary AI capabilities. Every sponsor integration "
        "has a local fallback — the demo runs end-to-end without any deploy."
    )
    import textwrap
    for i, line in enumerate(textwrap.wrap(intro, width=130)):
        ax.text(5, 87 - i * 2.4, line,
                ha="left", va="top", fontsize=9.2, color=INK2, family="serif")

    # Table
    rows = [
        ("nm_capture.py",       "transcript capture",            "LOCAL · python",    P_LOCAL,
         "inline, latency-critical (<50ms)"),
        ("nm_inject.py",        "PreToolUse hook + injection log","LOCAL · python",    P_LOCAL,
         "inline, latency-critical"),
        ("nm_server.py",        "MCP query surface",             "LOCAL · python",    P_LOCAL,
         "stdio MCP; per coding-agent process"),
        ("nm.db",               "verbatim trace, projections, product graph", "LOCAL · sqlite", P_LOCAL,
         "WAL, single-writer, fast"),
        ("Note Manager",        "session → notes via LLM",       "TENSORLAKE",        P_TENSORLAKE,
         "webhook on Stop;  CLI fallback: nm_extract.py"),
        ("GC Agent",            "decay → merge → prune",         "TENSORLAKE",        P_TENSORLAKE,
         "cron */15 min;  CLI fallback: nm_gc.py --loop"),
        ("Guardian Agent",      "per-injection filter",          "TENSORLAKE",        P_TENSORLAKE,
         "planned; assigned to other teammate"),
        ("Note graph + audit",  "reactive state-of-record",      "CONVEX",            P_CONVEX,
         "mirrored from SQLite via HTTP actions"),
        ("Public dashboard",    "Next.js + useQuery (live)",     "VERCEL",            P_VERCEL,
         "submission URL;  reads only Convex"),
        ("Semantic note index", "search by topic / fallback",    "NIA",               P_NIA,
         "local cosine ranker if NIA_API_KEY unset"),
        ("LLM extractor",       "4-field note distillation",     "OPENAI",            P_OPENAI,
         "gpt-4o-mini default, override via env vars"),
    ]

    # Header row
    hy = 76
    ax.plot([5, 95], [hy + 1.5, hy + 1.5], color=BORDER_DARK, linewidth=0.6)
    ax.plot([5, 95], [hy - 1.5, hy - 1.5], color=BORDER_DARK, linewidth=0.6)
    ax.text(7,  hy, "Component",        ha="left", va="center",
            fontsize=8.5, color=INK, fontweight="700", family="serif")
    ax.text(28, hy, "Role",             ha="left", va="center",
            fontsize=8.5, color=INK, fontweight="700", family="serif")
    ax.text(54, hy, "Platform",         ha="left", va="center",
            fontsize=8.5, color=INK, fontweight="700", family="serif")
    ax.text(74, hy, "Notes",            ha="left", va="center",
            fontsize=8.5, color=INK, fontweight="700", family="serif")

    for i, (comp, role, plat, plat_color, notes) in enumerate(rows):
        y = hy - 4 - i * 4.2
        # zebra
        if i % 2 == 0:
            ax.add_patch(FancyBboxPatch(
                (5, y - 1.6), 90, 3.2,
                boxstyle="round,pad=0,rounding_size=0",
                linewidth=0, facecolor=SURFACE_LO,
            ))
        ax.text(7,  y, comp,  ha="left", va="center",
                fontsize=8.4, color=INK, fontweight="600", family="monospace")
        ax.text(28, y, role,  ha="left", va="center",
                fontsize=8.4, color=INK2, family="serif")
        # Platform pill
        pill_w = max(11, len(plat) * 0.6 + 2)
        pill = FancyBboxPatch(
            (54, y - 1.0), pill_w, 2.0,
            boxstyle="round,pad=0,rounding_size=0.5",
            linewidth=0, facecolor=plat_color,
        )
        ax.add_patch(pill)
        ax.text(54 + pill_w / 2, y, plat,
                ha="center", va="center", fontsize=7, color=WHITE,
                fontweight="700", family="sans-serif")
        ax.text(74, y, notes, ha="left", va="center",
                fontsize=8.0, color=INK2, family="serif", style="italic")

    # Bottom rule
    ax.plot([5, 95], [hy - 4 - len(rows) * 4.2 + 2, hy - 4 - len(rows) * 4.2 + 2],
            color=BORDER_DARK, linewidth=0.6)

    caption(ax, 4, "Component-to-platform allocation. Sponsor platforms in italics each have a local fallback path.")
    pdf.savefig(fig, facecolor=WHITE)
    plt.close(fig)


# ============================================================================
def main():
    with PdfPages("architecture.pdf") as pdf:
        page_title(pdf)
        page_architecture(pdf)
        page_agents(pdf)
        page_schema(pdf)
        page_allocation(pdf)
    print("wrote architecture.pdf  (5 pages, white background)")


if __name__ == "__main__":
    main()
