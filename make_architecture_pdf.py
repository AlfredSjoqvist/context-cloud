"""Render a 5-page system-architecture PDF for NM.

Output: architecture.pdf at project root.
Run:    python make_architecture_pdf.py
"""

from __future__ import annotations

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

# ----- palette (matches dashboard/app/globals.css) -----
BG       = "#0A0B0F"
SURFACE  = "#13151C"
SURFACE2 = "#181B24"
BORDER   = "#2A2F3D"
TEXT     = "#E8EAF0"
TEXT2    = "#9099AE"
TEXT3    = "#5C6478"
FILE     = "#7C9EFF"
NOTE     = "#FFB86B"
GREEN    = "#6EE7B7"
PURPLE   = "#C49BFF"
RED      = "#FF7A8A"

PAGE_W, PAGE_H = 11.0, 8.5  # landscape


def _new_page():
    fig, ax = plt.subplots(figsize=(PAGE_W, PAGE_H))
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


def box(ax, x, y, w, h, *, label, sub=None, fill=SURFACE, edge=BORDER,
        text_color=TEXT, sub_color=TEXT2, label_size=11, sub_size=8.5,
        accent=None):
    rect = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.4,rounding_size=0.7",
        linewidth=1.0, facecolor=fill, edgecolor=edge,
    )
    ax.add_patch(rect)
    if accent:
        ax.add_patch(FancyBboxPatch(
            (x, y + h - 0.5), 0.6, 0.5,
            boxstyle="round,pad=0,rounding_size=0.2",
            linewidth=0, facecolor=accent,
        ))
    cx = x + w / 2
    if sub:
        ax.text(cx, y + h * 0.66, label, ha="center", va="center",
                fontsize=label_size, color=text_color, fontweight="600")
        ax.text(cx, y + h * 0.32, sub, ha="center", va="center",
                fontsize=sub_size, color=sub_color)
    else:
        ax.text(cx, y + h / 2, label, ha="center", va="center",
                fontsize=label_size, color=text_color, fontweight="600")


def arrow(ax, x1, y1, x2, y2, *, color=TEXT3, label=None, label_color=TEXT2,
          style="->", lw=1.0, ls="-"):
    a = FancyArrowPatch(
        (x1, y1), (x2, y2),
        arrowstyle=style, color=color,
        mutation_scale=12, linewidth=lw, linestyle=ls,
    )
    ax.add_patch(a)
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 0.8, label,
                ha="center", va="center", fontsize=8, color=label_color,
                bbox=dict(facecolor=BG, edgecolor="none", pad=2))


def title(ax, text, sub=None, y=94):
    ax.text(50, y, text, ha="center", va="center",
            fontsize=20, color=TEXT, fontweight="700")
    if sub:
        ax.text(50, y - 4, sub, ha="center", va="center",
                fontsize=10.5, color=TEXT2)


def footer(ax, text):
    ax.text(50, 2, text, ha="center", va="center",
            fontsize=7.5, color=TEXT3, style="italic")


# ============================================================================
# PAGE 1 — cover
# ============================================================================
def page_cover(pdf):
    fig, ax = _new_page()
    ax.text(50, 70, "NM · Context Cloud", ha="center", va="center",
            fontsize=36, color=TEXT, fontweight="700")
    ax.text(50, 63, "Shared memory for coding agents", ha="center", va="center",
            fontsize=16, color=NOTE)
    ax.text(50, 55, "An MCP-served note graph that learns from every coding session in your org and",
            ha="center", va="center", fontsize=11, color=TEXT2)
    ax.text(50, 51.5, "injects the relevant lesson into the next agent that touches the same file.",
            ha="center", va="center", fontsize=11, color=TEXT2)

    # Three pillars
    pillars = [
        ("Capture",
         "Hooks tail Claude Code's\nJSONL transcript →\nverbatim trace in SQLite.",
         FILE),
        ("Distill",
         "Hurdle detectors + LLM extract\nproject-specific notes.\nGC keeps the graph clean.",
         NOTE),
        ("Inject",
         "PreToolUse hook fetches\nfile-keyed notes and adds them\nto the next agent's context.",
         GREEN),
    ]
    px = [12, 40, 68]
    for (head, body, accent), x in zip(pillars, px):
        box(ax, x, 24, 20, 16, label=head, sub=None,
            fill=SURFACE, edge=BORDER, accent=accent, label_size=12)
        ax.text(x + 10, 30, body, ha="center", va="center",
                fontsize=9, color=TEXT2, linespacing=1.5)

    ax.text(50, 13, "Always-On Agents track · Nia · Tensorlake · Convex · Vercel",
            ha="center", va="center", fontsize=10, color=TEXT3,
            family="monospace")
    footer(ax, "page 1 of 5")
    pdf.savefig(fig, facecolor=BG)
    plt.close(fig)


# ============================================================================
# PAGE 2 — end-to-end data flow
# ============================================================================
def page_dataflow(pdf):
    fig, ax = _new_page()
    title(ax, "End-to-end data flow", "from a Claude Code keystroke to the live dashboard")

    # Top: coding agent
    box(ax, 35, 78, 30, 7, label="Coding agent",
        sub="Claude Code · Cursor · Codex (any MCP client)",
        fill=SURFACE2, accent=FILE)

    # Hooks layer
    box(ax, 8, 60, 25, 9, label="nm_capture.py",
        sub="hooks: UserPromptSubmit\nPostToolUse · Stop", fill=SURFACE, accent=FILE)
    box(ax, 38, 60, 25, 9, label="nm_inject.py",
        sub="hook: PreToolUse\n(Read · Edit · Write · MultiEdit)", fill=SURFACE, accent=FILE)
    box(ax, 68, 60, 25, 9, label="nm_server.py (MCP)",
        sub="get_relevant_notes\nfind_notes_semantic · …", fill=SURFACE, accent=FILE)

    arrow(ax, 50, 78, 20.5, 69.5, label="JSONL")
    arrow(ax, 50, 78, 50.5, 69.5)
    arrow(ax, 50, 78, 80.5, 69.5, label="MCP stdio")

    # SQLite
    box(ax, 22, 42, 56, 9, label="nm.db (SQLite)",
        sub="trace tables · projections · note graph · audit  →  see SCHEMA.md",
        fill=SURFACE2, accent=GREEN)
    arrow(ax, 20, 60, 30, 51, label="raw transcript")
    arrow(ax, 50, 60, 50, 51, label="injections audit")
    arrow(ax, 80, 60, 70, 51, label="reads")

    # Side branches
    box(ax, 2, 26, 18, 9, label="Tensorlake",
        sub="nm_extract (webhook)\nnm_gc (cron */15)",
        fill=SURFACE, accent=PURPLE, label_size=10.5)
    arrow(ax, 22, 46, 20, 35, ls="--", label="batch read")
    arrow(ax, 20, 35, 22, 45, ls="--", color=PURPLE)

    # Convex (right of SQLite)
    box(ax, 82, 42, 14, 9, label="Convex",
        sub="state-of-record\n+ reactive",
        fill=SURFACE, accent=NOTE, label_size=10.5)
    arrow(ax, 78, 46, 82, 46, color=NOTE, label="best-effort\nsync")

    # Vercel dashboard
    box(ax, 82, 22, 14, 9, label="Vercel",
        sub="Next.js dashboard\nuseQuery (live)",
        fill=SURFACE, accent=NOTE, label_size=10.5)
    arrow(ax, 89, 42, 89, 31, color=NOTE, label="reactive")

    # Nia
    box(ax, 22, 12, 18, 8, label="Nia",
        sub="semantic note index\n(local cosine fallback)",
        fill=SURFACE, accent=GREEN, label_size=10.5)
    arrow(ax, 35, 42, 31, 20, ls="--", color=GREEN, label="index_note")
    arrow(ax, 31, 20, 80, 60, ls="--", color=GREEN, label="semantic_lookup")

    # Legend
    ax.text(50, 6.5, "solid = inline (latency-critical) · dashed = best-effort (network, fail-open)",
            ha="center", va="center", fontsize=8.5, color=TEXT3, style="italic")
    footer(ax, "page 2 of 5  ·  see SPEC.md > Convex / Tensorlake / Vercel / Nia")
    pdf.savefig(fig, facecolor=BG)
    plt.close(fig)


# ============================================================================
# PAGE 3 — three always-on agents
# ============================================================================
def page_agents(pdf):
    fig, ax = _new_page()
    title(ax, "Three always-on agents", "three trigger types — deliberate hit on the Background Execution rubric")

    cols = [
        {
            "name": "Note Manager",
            "trigger": "WEBHOOK",
            "sub": "fires on Stop / SubagentStop",
            "what": [
                "Reads session's transcript",
                "Runs 7 hurdle-detection signals",
                "Expands signal clusters → windows",
                "LLM distills each window into a",
                "  4-field note (gpt-4o-mini)",
                "Persists notes + edges + hurdles",
            ],
            "where": "tensorlake/note_manager.py\n(local CLI: nm_extract.py)",
            "color": FILE,
        },
        {
            "name": "Guardian",
            "trigger": "EVENT (per-injection)",
            "sub": "fires on every PreToolUse",
            "what": [
                "Scores candidate notes for the",
                "  current session's recent context",
                "Resolves contradictions",
                "Enforces per-injection token budget",
                "Logs accept / reject reasons to",
                "  the injections audit table",
            ],
            "where": "tensorlake/guardian.py\n(owned by another teammate)",
            "color": PURPLE,
            "label": "(planned · slot reserved)",
        },
        {
            "name": "GC",
            "trigger": "CRON  */15 * * * *",
            "sub": "scheduled long-term hygiene",
            "what": [
                "Decay: importance halves every",
                "  7 days of idleness",
                "Merge: Jaccard 0.6 / cosine 0.5",
                "  on overlapping files",
                "Prune: importance < 0.10",
                "  → invalidate (soft delete)",
            ],
            "where": "tensorlake/gc.py\n(local CLI: nm_gc.py)",
            "color": NOTE,
        },
    ]
    xs = [4, 36, 68]
    for col, x in zip(cols, xs):
        box(ax, x, 75, 28, 12, label=col["name"], sub=col["sub"],
            fill=SURFACE2, accent=col["color"], label_size=14)
        # trigger pill
        ax.text(x + 14, 71, col["trigger"], ha="center", va="center",
                fontsize=9, color=col["color"], fontweight="600",
                family="monospace",
                bbox=dict(facecolor=SURFACE, edgecolor=col["color"],
                          boxstyle="round,pad=0.3", linewidth=0.8))
        # what
        ax.text(x + 14, 64, "What it does",
                ha="center", va="center", fontsize=9.5, color=TEXT,
                fontweight="600")
        for i, line in enumerate(col["what"]):
            ax.text(x + 14, 60.5 - i * 2.6, line,
                    ha="center", va="center", fontsize=8.5, color=TEXT2)
        # where
        box(ax, x, 28, 28, 9, label="Where it runs",
            sub=col["where"],
            fill=SURFACE, edge=BORDER, label_size=9.5)
        if "label" in col:
            ax.text(x + 14, 23, col["label"], ha="center", va="center",
                    fontsize=8, color=col["color"], style="italic")

    # Bottom note
    ax.text(50, 12.5, "All three share state through the same SQLite tables and Convex mirror.",
            ha="center", va="center", fontsize=10, color=TEXT2)
    ax.text(50, 9, "Removing background execution or memory genuinely breaks the demo — the rubric bar.",
            ha="center", va="center", fontsize=9.5, color=TEXT3, style="italic")

    footer(ax, "page 3 of 5  ·  see NM.md > Components and SPEC.md > Tensorlake")
    pdf.savefig(fig, facecolor=BG)
    plt.close(fig)


# ============================================================================
# PAGE 4 — schema modules
# ============================================================================
def page_schema(pdf):
    fig, ax = _new_page()
    title(ax, "Database schema — four modules",
          "OpenInference / OTel-shaped trace · projections · product graph · audit")

    modules = [
        {
            "name": "TRACE",
            "sub": "verbatim chat capture",
            "tables": [
                "sessions       — one row per Claude Code session",
                "messages       — one row per transcript entry (≈ span)",
                "content_blocks — text · thinking · tool_use · tool_result · image",
                "ingest_state   — per-transcript line offset (incremental)",
            ],
            "color": FILE,
            "y": 70,
        },
        {
            "name": "INDEX (projections)",
            "sub": "fast queries derived from content_blocks",
            "tables": [
                "tool_calls   — tool_use joined to its tool_result",
                "file_touches — (tool_call, canonical path) for O(idx) lookup",
            ],
            "color": GREEN,
            "y": 50,
        },
        {
            "name": "NOTE (product graph)",
            "sub": "bipartite files ↔ notes — what other agents read",
            "tables": [
                "notes           — id · symptom · root_cause · correction · importance",
                "files           — canonical path registry (lowercase drive, fwd slashes)",
                "file_note_edges — bipartite edge with per-file weight",
            ],
            "color": NOTE,
            "y": 30,
        },
        {
            "name": "LIFECYCLE (audit)",
            "sub": "every state change recorded — drives on-stage metrics",
            "tables": [
                "hurdles + hurdle_signals — detection windows + per-signal weights",
                "injections               — every PreToolUse match (accepted / filtered)",
                "note_feedback            — useful=true / false from agent or user",
                "gc_actions               — every prune / merge / decay (cron tick proof)",
            ],
            "color": PURPLE,
            "y": 10,
        },
    ]
    for m in modules:
        box(ax, 5, m["y"], 22, 14, label=m["name"], sub=m["sub"],
            fill=SURFACE2, accent=m["color"], label_size=12)
        # Table list
        for i, line in enumerate(m["tables"]):
            ax.text(30, m["y"] + 12 - i * 2.8, line,
                    ha="left", va="center", fontsize=8.7, color=TEXT2,
                    family="monospace")

    footer(ax, "page 4 of 5  ·  full reference in SCHEMA.md  ·  one source of truth at schema.sql")
    pdf.savefig(fig, facecolor=BG)
    plt.close(fig)


# ============================================================================
# PAGE 5 — sponsor stack
# ============================================================================
def page_sponsors(pdf):
    fig, ax = _new_page()
    title(ax, "Sponsor stack mapping",
          "what each platform owns — and what local fallback keeps the demo alive")

    rows = [
        {
            "name": "Nia",
            "role": "semantic note index",
            "owns": "every persisted note is registered with Nia\nfind_notes_semantic MCP tool searches at lookup time",
            "fallback": "local cosine ranker over notes table (no API key needed)",
            "rubric": "Always-On track sponsor",
            "color": GREEN,
        },
        {
            "name": "Tensorlake",
            "role": "background sandboxed agent runtime",
            "owns": "Note Manager (webhook) + GC (cron */15)\nthree trigger types = three different rubric proofs",
            "fallback": "python nm_extract.py · python nm_gc.py --loop",
            "rubric": "Always-On track co-sponsor",
            "color": PURPLE,
        },
        {
            "name": "Convex",
            "role": "state-of-record + live reactive backend",
            "owns": "product graph (notes / edges / files / injections / GC actions)\nWebSocket reactivity drives the live dashboard",
            "fallback": "SQLite stays authoritative; sync is best-effort",
            "rubric": "Statefulness 25% · live demo proof",
            "color": NOTE,
        },
        {
            "name": "Vercel",
            "role": "deployed dashboard URL (submission requirement)",
            "owns": "Next.js 15 + ConvexProvider; useQuery hooks for live data\ndashboard/ subdir, deploy via npx vercel",
            "fallback": "nm_dashboard.py on localhost:8765 (not valid for submission)",
            "rubric": "Demo & Presentation 10% · public URL required",
            "color": FILE,
        },
    ]
    y = 75
    for r in rows:
        # Header row
        box(ax, 4, y, 22, 14, label=r["name"], sub=r["role"],
            fill=SURFACE2, accent=r["color"], label_size=14, sub_size=9)
        ax.text(30, y + 11, "Owns:",   ha="left", va="top",
                fontsize=9, color=TEXT, fontweight="600")
        ax.text(36, y + 11, r["owns"], ha="left", va="top",
                fontsize=8.7, color=TEXT2)
        ax.text(30, y + 5, "Fallback:", ha="left", va="top",
                fontsize=9, color=TEXT, fontweight="600")
        ax.text(38, y + 5, r["fallback"], ha="left", va="top",
                fontsize=8.7, color=TEXT3, style="italic")
        ax.text(72, y + 11, r["rubric"], ha="left", va="top",
                fontsize=8.5, color=r["color"], fontweight="600",
                family="monospace")
        y -= 18

    footer(ax, "page 5 of 5  ·  see SPEC.md for env vars + deploy commands")
    pdf.savefig(fig, facecolor=BG)
    plt.close(fig)


# ============================================================================
def main():
    with PdfPages("architecture.pdf") as pdf:
        page_cover(pdf)
        page_dataflow(pdf)
        page_agents(pdf)
        page_schema(pdf)
        page_sponsors(pdf)
    print("wrote architecture.pdf")


if __name__ == "__main__":
    main()
