"""Seed mock reasoning traces into nm.db (v2 schema).

Builds 5 sessions, each demonstrating a different hurdle pattern:
  A. hardcoded API URL â†’ reverted_edit + correction_phrase
  B. jwt.decode without verifying â†’ interrupt + correction_phrase
  C. webhook returns 500 â†’ retry_loop + correction_phrase
  D. agent re-reads same files â†’ action_bigram_loop + correction_phrase
  E. spawnSandbox without memory_mb â†’ tool-error + correction_phrase

Run:
    python mock_traces.py            # idempotent: wipes prior mock_* sessions, reseeds
    python mock_traces.py --keep     # additive (don't wipe existing mock data)

The trace shape mirrors what nm_capture.py writes when ingesting Claude Code
JSONL hooks. Direct table inserts are simpler than mimicking JSONL exactly.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from nm_db import canonical_path, connect, init_db, now_iso

CODEBASE_ROOT = "C:/Users/Alfred/Desktop/nozomio/codebase"
ROOT = Path(__file__).parent
MOCK_ORG_ROOT = ROOT / "mock_org"


# ---------------------------------------------------------------------------
# Session builder
# ---------------------------------------------------------------------------

class TraceBuilder:
    """Tiny DSL for building normalized traces with vendor-shaped raw JSON."""

    def __init__(self, session_id: str, started_at: datetime,
                 vendor: str = "claude-code", cwd: str = CODEBASE_ROOT):
        self.session_id = session_id
        self.cwd = cwd
        self.vendor = vendor
        self.started_at = started_at
        self._t = started_at
        self._parent_uuid: str | None = None
        self._open_tool_calls: list[str] = []  # tool_use_ids awaiting result
        self.messages: list[dict[str, Any]] = []
        self.content_blocks: list[dict[str, Any]] = []
        self.tool_calls: list[dict[str, Any]] = []
        self.file_touches: list[dict[str, Any]] = []
        self._msg_id_counter = 0
        self._block_id_counter = 0

    def _ts(self, secs: float = 30.0) -> str:
        self._t += timedelta(seconds=secs)
        return self._t.isoformat()

    def _new_uuid(self) -> str:
        return str(uuid.uuid4())

    def _next_msg_id(self) -> int:
        self._msg_id_counter += 1
        return self._msg_id_counter

    def _raw_message(self, msg_uuid: str, ts: str, mtype: str, role: str | None,
                     content: list[dict[str, Any]], stop_reason: str | None) -> dict[str, Any]:
        if self.vendor == "codex":
            return {
                "id": msg_uuid,
                "conversation_id": self.session_id,
                "created_at": ts,
                "source": "codex-cli",
                "cwd": self.cwd,
                "model": "gpt-5-codex",
                "item": {
                    "type": "message" if mtype in ("user", "assistant") else mtype,
                    "role": role,
                    "content": content,
                    **({"status": "requires_action" if stop_reason == "tool_use" else "completed"} if role == "assistant" else {}),
                },
                "previous_item_id": self._parent_uuid,
            }
        return {
            "uuid": msg_uuid,
            "parentUuid": self._parent_uuid,
            "sessionId": self.session_id,
            "timestamp": ts,
            "type": mtype,
            "message": {
                "role": role,
                "content": content,
                **({"stop_reason": stop_reason} if stop_reason else {}),
            },
        }

    def _add_message(self, mtype: str, role: str | None, content: list[dict[str, Any]],
                     stop_reason: str | None = None) -> int:
        ts = self._ts()
        msg_uuid = self._new_uuid()
        msg_id = self._next_msg_id()
        raw = self._raw_message(msg_uuid, ts, mtype, role, content, stop_reason)
        self.messages.append({
            "_local_id": msg_id,
            "uuid": msg_uuid,
            "session_id": self.session_id,
            "parent_uuid": self._parent_uuid,
            "ts": ts,
            "type": mtype,
            "role": role,
            "is_meta": 0,
            "raw_json": json.dumps(raw),
            "ingested_at": now_iso(),
        })
        for i, block in enumerate(content):
            self._block_id_counter += 1
            self.content_blocks.append({
                "_local_id": self._block_id_counter,
                "_msg_local_id": msg_id,
                "block_index": i,
                **block,
                "raw_json": json.dumps(block),
            })
        self._parent_uuid = msg_uuid
        return msg_id

    def user(self, text: str) -> None:
        self._add_message("user", "user",
                          [{"type": "text", "text": text}])

    def assistant_text(self, text: str) -> None:
        self._add_message("assistant", "assistant",
                          [{"type": "text", "text": text}],
                          stop_reason="end_turn")

    def assistant_thinking_then_text(self, thinking: str, text: str) -> None:
        self._add_message("assistant", "assistant",
                          [{"type": "thinking", "text": thinking},
                           {"type": "text", "text": text}],
                          stop_reason="end_turn")

    def tool_call(self, name: str, input_: dict[str, Any],
                  thinking: str | None = None) -> str:
        tool_use_id = "toolu_" + uuid.uuid4().hex[:16]
        blocks: list[dict[str, Any]] = []
        if thinking:
            blocks.append({"type": "thinking", "text": thinking})
        blocks.append({
            "type": "tool_use",
            "tool_use_id": tool_use_id,
            "tool_name": name,
            "input_json": json.dumps(input_),
        })
        msg_id = self._add_message("assistant", "assistant", blocks, stop_reason="tool_use")
        self._open_tool_calls.append(tool_use_id)
        # Track tool_call for the projection table.
        self.tool_calls.append({
            "tool_use_id": tool_use_id,
            "session_id": self.session_id,
            "tool_name": name,
            "use_message_id_local": msg_id,
            "input_json": json.dumps(input_),
            "started_at": self._t.isoformat(),
        })
        # File touches.
        for k in ("file_path", "path", "notebook_path"):
            v = input_.get(k)
            if isinstance(v, str) and v:
                self.file_touches.append({
                    "tool_use_id": tool_use_id,
                    "session_id": self.session_id,
                    "tool_name": name,
                    "path": canonical_path(v) or v,
                    "ts": self._t.isoformat(),
                })
                break
        return tool_use_id

    def tool_result(self, tool_use_id: str, output: str, is_error: bool = False) -> None:
        msg_id = self._add_message("user", "user", [{
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "output_text": output,
            "is_error": 1 if is_error else 0,
        }])
        if tool_use_id in self._open_tool_calls:
            self._open_tool_calls.remove(tool_use_id)
        # Update the matching tool_calls row.
        for tc in self.tool_calls:
            if tc["tool_use_id"] == tool_use_id and "result_message_id_local" not in tc:
                tc["result_message_id_local"] = msg_id
                tc["output_text"] = output
                tc["is_error"] = 1 if is_error else 0
                tc["finished_at"] = self._t.isoformat()
                break


# ---------------------------------------------------------------------------
# DB writers
# ---------------------------------------------------------------------------

MOCK_SESSION_PREFIX = "mock-"
DEMO_NOTE_PREFIX = "demo_"


def _wipe_mock(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute(
        "SELECT session_id FROM sessions WHERE session_id LIKE ?",
        (f"{MOCK_SESSION_PREFIX}%",),
    )
    sids = [r[0] for r in cur.fetchall()]
    if not sids:
        return
    placeholders = ",".join("?" for _ in sids)
    # Delete in dependency order. content_blocks cascades from messages.
    cur.execute(f"DELETE FROM file_touches WHERE session_id IN ({placeholders})", sids)
    cur.execute(f"DELETE FROM tool_calls WHERE session_id IN ({placeholders})", sids)
    cur.execute(f"DELETE FROM messages WHERE session_id IN ({placeholders})", sids)
    cur.execute(f"DELETE FROM sessions WHERE session_id IN ({placeholders})", sids)
    cur.execute(f"DELETE FROM events WHERE session_id IN ({placeholders})", sids)
    # Clean up extracted notes from prior mock runs.
    # Order matters with foreign_keys=ON:
    #   file_note_edges â†’ notes â†’ hurdle_signals â†’ hurdles
    # (notes carries an FK to hurdles, so notes must drop before hurdles).
    cur.execute(
        f"""
        DELETE FROM file_note_edges WHERE note_id IN (
            SELECT id FROM notes WHERE created_from_session IN ({placeholders})
        )
        """,
        sids,
    )
    cur.execute(f"DELETE FROM notes WHERE created_from_session IN ({placeholders})", sids)
    cur.execute(
        f"""
        DELETE FROM hurdle_signals WHERE hurdle_id IN (
            SELECT id FROM hurdles WHERE session_id IN ({placeholders})
        )
        """,
        sids,
    )
    cur.execute(f"DELETE FROM hurdles WHERE session_id IN ({placeholders})", sids)
    conn.commit()


# ---------------------------------------------------------------------------
# Multi-repo mock org seed used for the hackathon dashboard/demo
# ---------------------------------------------------------------------------

MOCK_ORG = {
    "id": "northstar-ai",
    "name": "Northstar AI",
    "github_org": "github.com/northstar-ai",
    "description": "Agent infrastructure startup building shared memory, sandboxed background agents, and context dashboards.",
}

USERS = [
    ("u_ava", "Ava Chen", "ava@northstar-ai.dev", "Platform lead"),
    ("u_mateo", "Mateo Silva", "mateo@northstar-ai.dev", "Runtime engineer"),
    ("u_priya", "Priya Raman", "priya@northstar-ai.dev", "Product engineer"),
    ("u_noah", "Noah Kim", "noah@northstar-ai.dev", "Integrations engineer"),
    ("u_eli", "Eli Brooks", "eli@northstar-ai.dev", "Infra engineer"),
    ("u_sam", "Sam Ivers", "sam@northstar-ai.dev", "Founding designer"),
    ("u_lina", "Lina Ortiz", "lina@northstar-ai.dev", "Solutions engineer"),
    ("u_mina", "Mina Patel", "mina@northstar-ai.dev", "Security engineer"),
    ("u_owen", "Owen Hart", "owen@northstar-ai.dev", "Developer advocate"),
    ("u_zoe", "Zoe Quinn", "zoe@northstar-ai.dev", "SRE"),
]

AGENT_VENDORS = [
    "claude-code",
    "codex",
    "cursor",
    "windsurf",
    "aider",
]

REPOS = [
    {
        "id": "runtime",
        "name": "runtime-orchestrator",
        "team": "team-runtime",
        "language": "python",
        "files": [
            "src/runtime/sandbox.py",
            "src/runtime/scheduler.py",
            "src/runtime/state_store.py",
            "src/runtime/recovery.py",
            "src/runtime/job_runner.py",
            "src/runtime/metrics.py",
            "tests/test_scheduler.py",
            "tests/test_recovery.py",
            "pyproject.toml",
            "README.md",
            "catalog-info.yaml",
        ],
    },
    {
        "id": "dashboard",
        "name": "control-plane",
        "team": "team-product",
        "language": "typescript",
        "files": [
            "app/page.tsx",
            "app/packs/[slug]/page.tsx",
            "components/ActivityFeed.tsx",
            "components/NoteGraph.tsx",
            "components/InjectionPanel.tsx",
            "components/ReplayTimeline.tsx",
            "lib/convex.ts",
            "lib/format.ts",
            "package.json",
            "README.md",
            "catalog-info.yaml",
        ],
    },
    {
        "id": "context",
        "name": "memory-graph",
        "team": "team-memory",
        "language": "python",
        "files": [
            "src/context/extract.py",
            "src/context/guardian.py",
            "src/context/gc.py",
            "src/context/briefs.py",
            "src/context/graph.py",
            "src/context/nia_index.py",
            "tests/test_briefs.py",
            "tests/test_guardian.py",
            "README.md",
            "catalog-info.yaml",
        ],
    },
    {
        "id": "integrations",
        "name": "connectors",
        "team": "team-integrations",
        "language": "typescript",
        "files": [
            "src/github/webhooks.ts",
            "src/slack/hyperspell.ts",
            "src/linear/issues.ts",
            "src/vercel/deployments.ts",
            "src/convex/sync.ts",
            "src/nia/search.ts",
            "tests/github-webhooks.test.ts",
            "package.json",
            "README.md",
            "catalog-info.yaml",
        ],
    },
    {
        "id": "agent-api",
        "name": "agent-gateway",
        "team": "team-api",
        "language": "typescript",
        "files": [
            "src/api/mcp.ts",
            "src/api/sessions.ts",
            "src/api/injections.ts",
            "src/api/auth.ts",
            "src/api/rateLimit.ts",
            "src/db/schema.ts",
            "src/lib/redaction.ts",
            "tests/mcp.test.ts",
            "package.json",
            "README.md",
            "catalog-info.yaml",
        ],
    },
]
REPO_NAMES = {repo["name"] for repo in REPOS}
OLD_REPO_PREFIXES = (
    "nozomio-runtime/",
    "nozomio-dashboard/",
    "nozomio-context/",
    "nozomio-integrations/",
    "nozomio-agent-api/",
)
BACKGROUND_TRACE_COUNT = 260


def _repo_path(repo: str, path: str) -> str:
    return f"{repo}/{path}"


NOTE_SPECS = [
    {
        "id": "demo_org_env_base",
        "scope": "org",
        "session": "demo-s01-env-base",
        "user": "u_ava",
        "vendor": "claude-code",
        "repo": "agent-gateway",
        "symptom": "Agent hardcoded an internal API host.",
        "root_cause": "Northstar services route through INTERNAL_API_BASE so staging, preview, and production stay isolated.",
        "correction": "Read service hosts from INTERNAL_API_BASE and fail fast when it is missing.",
        "provenance": "Created 2026-05-09 from signals: reverted diff + correction phrase + failed lint.",
        "files": [
            ("agent-gateway/src/api/mcp.ts", 1.0),
            ("control-plane/lib/convex.ts", 0.65),
            ("connectors/src/convex/sync.ts", 0.55),
        ],
        "importance": 0.96,
        "injects": 42,
    },
    {
        "id": "demo_org_redact_tokens",
        "scope": "org",
        "session": "demo-s02-redaction",
        "user": "u_mina",
        "vendor": "codex",
        "repo": "agent-gateway",
        "symptom": "Agent logged bearer tokens in an MCP request trace.",
        "root_cause": "Session traces are retained for replay, so secrets must be redacted before persistence.",
        "correction": "Pass all request headers and tool inputs through redactSecrets before writing traces or activity rows.",
        "provenance": "Created 2026-05-09 from signals: security correction + reverted diff + review rejection.",
        "files": [
            ("agent-gateway/src/lib/redaction.ts", 1.0),
            ("agent-gateway/src/api/mcp.ts", 0.75),
            ("memory-graph/src/context/extract.py", 0.45),
        ],
        "importance": 0.94,
        "injects": 37,
    },
    {
        "id": "demo_runtime_microvm_state",
        "scope": "repo",
        "session": "demo-s03-runtime-state",
        "user": "u_mateo",
        "vendor": "cursor",
        "repo": "runtime-orchestrator",
        "symptom": "Agent stored job recovery state only in process memory.",
        "root_cause": "Tensorlake microVMs can restart between steps; recovery state must survive sandbox restarts.",
        "correction": "Persist job checkpoints through StateStore before acknowledging each step.",
        "provenance": "Created 2026-05-09 from signals: tool error loop + failed test + correction phrase.",
        "files": [
            ("runtime-orchestrator/src/runtime/state_store.py", 1.0),
            ("runtime-orchestrator/src/runtime/recovery.py", 0.9),
            ("runtime-orchestrator/tests/test_recovery.py", 0.7),
        ],
        "importance": 0.91,
        "injects": 29,
    },
    {
        "id": "demo_runtime_cron_idempotency",
        "scope": "repo",
        "session": "demo-s04-cron-idempotent",
        "user": "u_zoe",
        "vendor": "claude-code",
        "repo": "runtime-orchestrator",
        "symptom": "Agent made scheduled GC jobs non-idempotent.",
        "root_cause": "Tensorlake cron can retry after transient exits; duplicate GC runs must not double-prune notes.",
        "correction": "Use the run id as an idempotency key before applying any GC action.",
        "provenance": "Created 2026-05-09 from signals: repeated failed test + production incident link.",
        "files": [
            ("runtime-orchestrator/src/runtime/scheduler.py", 1.0),
            ("memory-graph/src/context/gc.py", 0.65),
            ("runtime-orchestrator/tests/test_scheduler.py", 0.7),
        ],
        "importance": 0.89,
        "injects": 31,
    },
    {
        "id": "demo_context_no_patch_briefs",
        "scope": "repo",
        "session": "demo-s05-briefs",
        "user": "u_priya",
        "vendor": "codex",
        "repo": "memory-graph",
        "symptom": "Agent embedded suggested patches inside autonomous PR briefs.",
        "root_cause": "Fixing agents copied stale patches from the brief instead of verifying HEAD.",
        "correction": "Briefs may state the requirement and cited paths, but must not include code snippets or patch text.",
        "provenance": "Created 2026-05-09 from signals: reverted diff + failed review + correction phrase.",
        "files": [
            ("memory-graph/src/context/briefs.py", 1.0),
            ("memory-graph/tests/test_briefs.py", 0.8),
        ],
        "importance": 0.93,
        "injects": 34,
    },
    {
        "id": "demo_context_guardian_budget",
        "scope": "repo",
        "session": "demo-s06-budget",
        "user": "u_lina",
        "vendor": "windsurf",
        "repo": "memory-graph",
        "symptom": "Guardian injected every file-matched note into a short session.",
        "root_cause": "File match alone overfills context and causes agents to re-triage instead of acting.",
        "correction": "Apply the per-call token budget after relevance scoring and keep only the highest-scoring notes.",
        "provenance": "Created 2026-05-09 from signals: user interruption + low usefulness feedback.",
        "files": [
            ("memory-graph/src/context/guardian.py", 1.0),
            ("memory-graph/tests/test_guardian.py", 0.75),
            ("agent-gateway/src/api/injections.ts", 0.45),
        ],
        "importance": 0.86,
        "injects": 26,
    },
    {
        "id": "demo_dashboard_activity_window",
        "scope": "repo",
        "session": "demo-s07-activity-window",
        "user": "u_sam",
        "vendor": "cursor",
        "repo": "control-plane",
        "symptom": "Dashboard counted all-time injections as live activity.",
        "root_cause": "Judge-facing metrics must use a recent window or the background execution proof is misleading.",
        "correction": "Compute activity metrics over the last fifteen minutes and label seeded rows clearly.",
        "provenance": "Created 2026-05-09 from signals: user correction + dashboard mismatch.",
        "files": [
            ("control-plane/components/ActivityFeed.tsx", 1.0),
            ("control-plane/components/InjectionPanel.tsx", 0.7),
            ("control-plane/lib/format.ts", 0.3),
        ],
        "importance": 0.88,
        "injects": 22,
    },
    {
        "id": "demo_dashboard_graph_edges",
        "scope": "file",
        "session": "demo-s08-graph-edges",
        "user": "u_sam",
        "vendor": "claude-code",
        "repo": "control-plane",
        "symptom": "Collapsed folder edges anchored at the graph origin.",
        "root_cause": "Hidden file rows have no usable bounding box, so edge rendering must target the collapsed folder row.",
        "correction": "When a file is hidden by a collapsed ancestor, merge those edges onto the visible folder anchor.",
        "provenance": "Created 2026-05-09 from signals: visual bug report + accepted fix.",
        "files": [
            ("control-plane/components/NoteGraph.tsx", 1.0),
            ("control-plane/components/ReplayTimeline.tsx", 0.35),
        ],
        "importance": 0.81,
        "injects": 18,
    },
    {
        "id": "demo_integrations_verify_github_signature",
        "scope": "repo",
        "session": "demo-s09-github-sig",
        "user": "u_noah",
        "vendor": "codex",
        "repo": "connectors",
        "symptom": "GitHub webhook handler trusted unsigned payloads.",
        "root_cause": "Webhook events can create PR briefs, so unsigned payloads can trigger arbitrary agent work.",
        "correction": "Verify the GitHub HMAC signature before parsing or enqueueing webhook bodies.",
        "provenance": "Created 2026-05-09 from signals: security correction + failed test.",
        "files": [
            ("connectors/src/github/webhooks.ts", 1.0),
            ("connectors/tests/github-webhooks.test.ts", 0.85),
        ],
        "importance": 0.92,
        "injects": 28,
    },
    {
        "id": "demo_integrations_hyperspell_source",
        "scope": "repo",
        "session": "demo-s10-hyperspell",
        "user": "u_noah",
        "vendor": "aider",
        "repo": "connectors",
        "symptom": "Hyperspell enrichment was treated as the source of truth.",
        "root_cause": "NM notes must originate from observed coding friction; company-brain connectors only enrich the note.",
        "correction": "Keep live-session signals as the primary provenance and attach Hyperspell references as supporting context.",
        "provenance": "Created 2026-05-09 from signals: design correction + review comment.",
        "files": [
            ("connectors/src/slack/hyperspell.ts", 1.0),
            ("memory-graph/src/context/extract.py", 0.55),
        ],
        "importance": 0.84,
        "injects": 21,
    },
    {
        "id": "demo_api_session_replay_order",
        "scope": "repo",
        "session": "demo-s11-replay-order",
        "user": "u_eli",
        "vendor": "cursor",
        "repo": "agent-gateway",
        "symptom": "Session replay sorted messages by ingest time.",
        "root_cause": "Hook writes can arrive out of order; replay must sort by transcript timestamp and parent chain.",
        "correction": "Order replay events by timestamp and use parent_uuid as a deterministic tie-breaker.",
        "provenance": "Created 2026-05-09 from signals: replay mismatch + corrected output.",
        "files": [
            ("agent-gateway/src/api/sessions.ts", 1.0),
            ("agent-gateway/tests/mcp.test.ts", 0.55),
        ],
        "importance": 0.78,
        "injects": 17,
    },
    {
        "id": "demo_api_injection_dedupe",
        "scope": "repo",
        "session": "demo-s12-dedupe",
        "user": "u_priya",
        "vendor": "claude-code",
        "repo": "agent-gateway",
        "symptom": "The same note was injected repeatedly in one session.",
        "root_cause": "Repeated injections make agents focus on memory mechanics instead of the current code task.",
        "correction": "Suppress notes already injected in the current session unless the touched path changes materially.",
        "provenance": "Created 2026-05-09 from signals: low usefulness feedback + repeated injection log.",
        "files": [
            ("agent-gateway/src/api/injections.ts", 1.0),
            ("memory-graph/src/context/guardian.py", 0.65),
        ],
        "importance": 0.77,
        "injects": 16,
    },
]

EXTRA_NOTE_TEMPLATES = [
    ("demo_runtime_timeout_bounds", "repo", "runtime-orchestrator", "Agent removed the sandbox timeout guard.", "Long-running background jobs must terminate so Tensorlake credits are predictable.", "Keep timeout_s bounded and surface timeout failures as recoverable job states.", ["src/runtime/job_runner.py", "src/runtime/recovery.py"], 0.76, 14),
    ("demo_runtime_metric_labels", "file", "runtime-orchestrator", "Metrics used raw user emails as labels.", "High-cardinality labels break dashboard aggregation and leak identities.", "Hash user identifiers before metric emission and keep labels bounded.", ["src/runtime/metrics.py"], 0.73, 12),
    ("demo_context_gc_rejection_rule", "repo", "memory-graph", "GC re-pruned a note after maintainer rejection.", "Maintainer feedback must persist as a learned GC rule.", "Record rejected prune patterns and check them before future GC actions.", ["src/context/gc.py", "src/context/graph.py"], 0.82, 19),
    ("demo_context_nia_namespace", "org", "memory-graph", "Nia search used a shared test index.", "Org data must stay inside the org-scoped Nia namespace.", "Build Nia index ids from org_id and source_id, never from global defaults.", ["src/context/nia_index.py", "../connectors/src/nia/search.ts"], 0.87, 23),
    ("demo_dashboard_timezone", "file", "control-plane", "Activity timestamps rendered in UTC.", "Demo users expect America/Los_Angeles for the hackathon dashboard.", "Render relative times client-side and keep absolute timestamps in the tooltip.", ["lib/format.ts", "components/ActivityFeed.tsx"], 0.69, 11),
    ("demo_dashboard_replay_seed_label", "repo", "control-plane", "Seeded replay events looked like live production activity.", "Judges need to distinguish seeded proof data from live background ticks.", "Mark seeded events explicitly while keeping the live activity feed unmarked.", ["components/ReplayTimeline.tsx", "components/ActivityFeed.tsx"], 0.75, 13),
    ("demo_integrations_linear_issue_once", "repo", "connectors", "Linear issue creation duplicated on webhook retry.", "Webhook retries are normal and issue creation must be idempotent.", "Use the NM note id as the external id before creating a Linear issue.", ["src/linear/issues.ts"], 0.72, 10),
    ("demo_integrations_vercel_preview", "repo", "connectors", "Vercel deploy status was read before the preview URL existed.", "Vercel emits multiple deployment events before the final ready state.", "Wait for the ready event before attaching preview links to PR briefs.", ["src/vercel/deployments.ts"], 0.68, 9),
    ("demo_api_rate_limit_scope", "repo", "agent-gateway", "Rate limits were keyed only by IP address.", "Coding agents in the same office share egress IPs and can throttle each other.", "Key rate limits by org_id and agent_id with IP as a secondary signal.", ["src/api/rateLimit.ts"], 0.8, 15),
    ("demo_api_auth_org_boundary", "org", "agent-gateway", "Auth accepted source ids outside the caller org.", "A source belongs to exactly one org; cross-org reads break the privacy model.", "Validate org ownership before returning notes, sessions, or injection history.", ["src/api/auth.ts", "src/db/schema.ts"], 0.9, 24),
    ("demo_readme_catalog_owner", "org", "runtime-orchestrator", "Agent guessed code ownership from file names.", "Ownership lives in catalog-info.yaml and CODEOWNERS, not naming conventions.", "Read catalog metadata before assigning review owners or team labels.", ["catalog-info.yaml", "../control-plane/catalog-info.yaml"], 0.66, 8),
    ("demo_testing_no_snapshot_update", "org", "control-plane", "Agent updated snapshots to hide a regression.", "Snapshot changes require a visible behavior explanation in this org.", "Do not update snapshots unless the task explicitly asks for a UI text or layout change.", ["components/ActivityFeed.tsx", "../agent-gateway/tests/mcp.test.ts"], 0.71, 13),
]


def _all_note_specs() -> list[dict[str, Any]]:
    specs = list(NOTE_SPECS)
    for i, (nid, scope, repo, symptom, root, corr, rel_files, importance, injects) in enumerate(EXTRA_NOTE_TEMPLATES):
        user = USERS[(i + 3) % len(USERS)][0]
        vendor = AGENT_VENDORS[(i + 2) % len(AGENT_VENDORS)]
        files = []
        for j, f in enumerate(rel_files):
            if f.startswith("../"):
                files.append((f[3:], 0.55 if j else 1.0))
            else:
                files.append((f"{repo}/{f}", 1.0 if j == 0 else 0.65))
        specs.append({
            "id": nid,
            "scope": scope,
            "session": f"demo-s{13+i:02d}-{nid.removeprefix('demo_')}",
            "user": user,
            "vendor": vendor,
            "repo": repo,
            "symptom": symptom,
            "root_cause": root,
            "correction": corr,
            "provenance": f"Created 2026-05-09 from signals: correction phrase + file touch + {'failed test' if i % 2 else 'review feedback'}.",
            "files": files,
            "importance": importance,
            "injects": injects,
        })
    return specs


DETAILED_MOCK_FILES = {
    "runtime-orchestrator/pyproject.toml": '''[project]
name = "runtime-orchestrator"
version = "0.3.0"
requires-python = ">=3.12"
dependencies = ["pydantic>=2", "httpx>=0.27"]

[project.optional-dependencies]
test = ["pytest>=8"]

[tool.pytest.ini_options]
addopts = "-q"
pythonpath = ["src"]
''',
    "runtime-orchestrator/tests/test_recovery.py": '''from pathlib import Path

from runtime.state_store import Checkpoint, StateStore


def test_checkpoint_survives_new_store_instance(tmp_path: Path):
    store = StateStore(tmp_path)
    store.write_checkpoint(Checkpoint(run_id="run_123", step="gc", payload={"cursor": 7}))

    recovered = StateStore(tmp_path).read_checkpoint("run_123")

    assert recovered is not None
    assert recovered.payload["cursor"] == 7
''',
    "runtime-orchestrator/tests/test_scheduler.py": '''from runtime.scheduler import Scheduler


def test_reserve_is_idempotent_per_run_id():
    scheduler = Scheduler()
    run = scheduler.next_gc_run("org_123")

    assert scheduler.reserve(run) is True
    assert scheduler.reserve(run) is False
''',
    "runtime-orchestrator/src/runtime/state_store.py": '''"""Durable checkpoint storage for sandboxed background jobs."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Checkpoint:
    run_id: str
    step: str
    payload: dict[str, Any]


class StateStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def write_checkpoint(self, checkpoint: Checkpoint) -> None:
        target = self.root / f"{checkpoint.run_id}.json"
        target.write_text(json.dumps(checkpoint.__dict__, sort_keys=True), encoding="utf-8")

    def read_checkpoint(self, run_id: str) -> Checkpoint | None:
        target = self.root / f"{run_id}.json"
        if not target.exists():
            return None
        data = json.loads(target.read_text(encoding="utf-8"))
        return Checkpoint(**data)
''',
    "runtime-orchestrator/src/runtime/scheduler.py": '''"""Cron and webhook scheduling for background agent runs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class ScheduledRun:
    run_id: str
    trigger: str
    scheduled_at: datetime


class Scheduler:
    def __init__(self) -> None:
        self._seen_run_ids: set[str] = set()

    def reserve(self, run: ScheduledRun) -> bool:
        if run.run_id in self._seen_run_ids:
            return False
        self._seen_run_ids.add(run.run_id)
        return True

    def next_gc_run(self, org_id: str) -> ScheduledRun:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
        return ScheduledRun(run_id=f"{org_id}:gc:{stamp}", trigger="cron", scheduled_at=datetime.now(timezone.utc))
''',
    "runtime-orchestrator/src/runtime/job_runner.py": '''"""Runs sandboxed jobs with bounded resources."""

from __future__ import annotations

from dataclasses import dataclass


MAX_MEMORY_MB = 4096
DEFAULT_TIMEOUT_S = 300


@dataclass(frozen=True)
class JobSpec:
    image: str
    command: list[str]
    memory_mb: int = MAX_MEMORY_MB
    timeout_s: int = DEFAULT_TIMEOUT_S


def build_job_spec(image: str, command: list[str], memory_mb: int | None = None) -> JobSpec:
    requested = memory_mb or MAX_MEMORY_MB
    if requested > MAX_MEMORY_MB:
        raise ValueError("memory_mb exceeds org budget")
    return JobSpec(image=image, command=command, memory_mb=requested)
''',
    "control-plane/components/ActivityFeed.tsx": '''"use client";

import { formatRelativeTime } from "../lib/format";

export type Activity = {
  id: string;
  kind: "note.created" | "note.injected" | "gc.pruned" | "guardian.rejected";
  actor: string;
  createdAt: string;
  seeded?: boolean;
};

export function ActivityFeed({ items }: { items: Activity[] }) {
  return (
    <section aria-label="Activity feed">
      {items.map((item) => (
        <article key={item.id} data-kind={item.kind}>
          <strong>{item.kind}</strong>
          <span>{item.actor}</span>
          <time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time>
          {item.seeded ? <span data-seeded="true">seeded</span> : null}
        </article>
      ))}
    </section>
  );
}
''',
    "control-plane/package.json": '''{
  "name": "control-plane",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@convex-dev/react-query": "^0.0.0",
    "convex": "^1.20.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
''',
    "control-plane/components/NoteGraph.tsx": '''"use client";

export type GraphEdge = { noteId: string; path: string; weight: number };
export type FolderAnchor = { path: string; collapsed: boolean };

export function effectiveAnchor(path: string, folders: FolderAnchor[]) {
  const collapsed = folders
    .filter((folder) => folder.collapsed && path.startsWith(`${folder.path}/`))
    .sort((a, b) => a.path.length - b.path.length)[0];
  return collapsed?.path ?? path;
}

export function mergeCollapsedEdges(edges: GraphEdge[], folders: FolderAnchor[]) {
  const groups = new Map<string, GraphEdge>();
  for (const edge of edges) {
    const anchor = effectiveAnchor(edge.path, folders);
    const key = `${edge.noteId}:${anchor}`;
    const existing = groups.get(key);
    groups.set(key, existing ? { ...existing, weight: existing.weight + edge.weight } : { ...edge, path: anchor });
  }
  return [...groups.values()];
}
''',
    "control-plane/lib/format.ts": '''const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelativeTime(iso: string, now = new Date()) {
  const then = new Date(iso);
  const diffMs = then.getTime() - now.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}
''',
    "memory-graph/src/context/briefs.py": '''"""Generate skinny work-order briefs for autonomous fixing agents."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FixBrief:
    note_id: str
    defect: str
    requirement: str
    cited_paths: list[str]
    scope: str
    provenance: str


FORBIDDEN_FIELDS = {"transcript", "patch", "excerpt", "importance", "weight", "actor_name"}


def render_brief(brief: FixBrief) -> str:
    lines = [
        f"# Fix candidate: {brief.note_id}",
        "",
        "## Defect",
        brief.defect,
        "",
        "## Requirement",
        brief.requirement,
        "",
        "## Cited paths",
        *[f"- `{path}`" for path in brief.cited_paths],
        "",
        "## Scope",
        brief.scope,
        "",
        "## Provenance",
        brief.provenance,
    ]
    return "\\n".join(lines) + "\\n"


def validate_payload(payload: dict) -> None:
    present = FORBIDDEN_FIELDS.intersection(payload)
    if present:
        raise ValueError(f"brief contains context-poisoning fields: {sorted(present)}")
''',
    "memory-graph/tests/test_briefs.py": '''import pytest

from context.briefs import FixBrief, render_brief, validate_payload


def test_render_brief_contains_requirement_without_patch():
    brief = FixBrief(
        note_id="demo_context_no_patch_briefs",
        defect="Agent embedded suggested patches inside autonomous PR briefs.",
        requirement="Briefs may state requirements but must not include patches.",
        cited_paths=["memory-graph/src/context/briefs.py"],
        scope="repo",
        provenance="Created 2026-05-09 from signals: reverted diff + correction phrase.",
    )

    rendered = render_brief(brief)

    assert "## Requirement" in rendered
    assert "diff --git" not in rendered


def test_validate_payload_rejects_poisoning_fields():
    with pytest.raises(ValueError):
        validate_payload({"note_id": "n1", "patch": "diff --git ..."})
''',
    "memory-graph/tests/test_guardian.py": '''from context.guardian import select_notes


def test_select_notes_respects_budget_and_session_dedupe():
    notes = [
        {"id": "a", "score": 0.99, "token_cost": 400},
        {"id": "b", "score": 0.95, "token_cost": 800},
        {"id": "c", "score": 0.5, "token_cost": 200},
    ]

    kept = select_notes(notes, already_injected={"a"})

    assert [note["id"] for note in kept] == ["b"]
''',
    "memory-graph/src/context/guardian.py": '''"""Short-term injection filter for the current coding session."""

from __future__ import annotations

TOKEN_BUDGET = 900


def select_notes(candidates: list[dict], already_injected: set[str]) -> list[dict]:
    kept: list[dict] = []
    spent = 0
    for note in sorted(candidates, key=lambda n: n["score"], reverse=True):
        if note["id"] in already_injected:
            continue
        cost = int(note.get("token_cost", 160))
        if spent + cost > TOKEN_BUDGET:
            continue
        kept.append(note)
        spent += cost
    return kept
''',
    "memory-graph/src/context/gc.py": '''"""Long-term hygiene for the shared note graph."""

from __future__ import annotations


def should_prune(note: dict, rejected_patterns: set[str]) -> bool:
    if note.get("pattern") in rejected_patterns:
        return False
    return note["importance"] < 0.1 and note.get("inject_count", 0) == 0


def merge_key(note: dict) -> tuple:
    return tuple(sorted(note.get("files", []))), note["correction"].lower().strip()
''',
    "memory-graph/src/context/nia_index.py": '''"""Org-scoped Nia indexing helpers."""

from __future__ import annotations


def index_id(org_id: str, source_id: str) -> str:
    if not org_id or not source_id:
        raise ValueError("org_id and source_id are required")
    return f"{org_id}:{source_id}:notes"
''',
    "connectors/src/github/webhooks.ts": '''import crypto from "crypto";

export function verifyGitHubSignature(secret: string, body: string, signature: string | null) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function parseWebhook(body: string) {
  return JSON.parse(body) as { action?: string; repository?: { full_name?: string } };
}
''',
    "connectors/tests/github-webhooks.test.ts": '''import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyGitHubSignature } from "../src/github/webhooks";

describe("verifyGitHubSignature", () => {
  it("accepts a valid sha256 signature", () => {
    const body = JSON.stringify({ action: "opened" });
    const signature = "sha256=" + crypto.createHmac("sha256", "secret").update(body).digest("hex");

    expect(verifyGitHubSignature("secret", body, signature)).toBe(true);
  });

  it("rejects missing signatures", () => {
    expect(verifyGitHubSignature("secret", "{}", null)).toBe(false);
  });
});
''',
    "connectors/package.json": '''{
  "name": "connectors",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@octokit/webhooks": "^13.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
''',
    "connectors/src/slack/hyperspell.ts": '''export type Enrichment = {
  source: "slack" | "drive" | "github" | "notion";
  title: string;
  url: string;
};

export function attachSupportingContext(noteId: string, refs: Enrichment[]) {
  return {
    noteId,
    primarySignal: "coding-session-friction",
    supportingRefs: refs.slice(0, 3),
  };
}
''',
    "connectors/src/linear/issues.ts": '''const created = new Set<string>();

export function issueExternalId(noteId: string) {
  return `nm-note:${noteId}`;
}

export function reserveIssue(noteId: string) {
  const externalId = issueExternalId(noteId);
  if (created.has(externalId)) return false;
  created.add(externalId);
  return true;
}
''',
    "agent-gateway/src/api/mcp.ts": '''import { redactSecrets } from "../lib/redaction";

export type ToolEvent = {
  orgId: string;
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
};

export function normalizeToolEvent(event: ToolEvent) {
  if (!event.orgId) throw new Error("orgId is required");
  return {
    ...event,
    input: redactSecrets(event.input),
  };
}
''',
    "agent-gateway/tests/mcp.test.ts": '''import { describe, expect, it } from "vitest";
import { normalizeToolEvent } from "../src/api/mcp";

describe("normalizeToolEvent", () => {
  it("redacts secrets before persistence", () => {
    const event = normalizeToolEvent({
      orgId: "org_123",
      sessionId: "sess_123",
      toolName: "Read",
      input: { authorization: "Bearer secret", file_path: "src/api/mcp.ts" },
    });

    expect(event.input.authorization).toBe("[REDACTED]");
    expect(event.input.file_path).toBe("src/api/mcp.ts");
  });
});
''',
    "agent-gateway/package.json": '''{
  "name": "agent-gateway",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
''',
    "agent-gateway/src/lib/redaction.ts": '''const SECRET_KEYS = [/authorization/i, /api[_-]?key/i, /token/i, /secret/i];

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEYS.some((pattern) => pattern.test(key)) ? "[REDACTED]" : redactSecrets(item),
    ]),
  );
}
''',
    "agent-gateway/src/api/rateLimit.ts": '''const buckets = new Map<string, number>();

export function rateLimitKey(orgId: string, agentId: string, ip: string) {
  return `${orgId}:${agentId}:${ip}`;
}

export function consume(key: string, limit = 120) {
  const next = (buckets.get(key) ?? 0) + 1;
  buckets.set(key, next);
  return next <= limit;
}
''',
    "agent-gateway/src/api/sessions.ts": '''export type ReplayMessage = {
  id: string;
  parentUuid?: string | null;
  ts: string;
};

export function orderReplay(messages: ReplayMessage[]) {
  return [...messages].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
}
''',
}


def _file_body(repo: dict[str, Any], rel: str) -> str:
    detailed = DETAILED_MOCK_FILES.get(f"{repo['name']}/{rel}")
    if detailed:
        return detailed
    if rel == "catalog-info.yaml":
        return (
            f"apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n"
            f"  name: {repo['name']}\nspec:\n  type: service\n  owner: {repo['team']}\n"
            f"  lifecycle: experimental\n"
        )
    if rel == "README.md":
        return (
            f"# {repo['name']}\n\n"
            "Mock Northstar AI repository for NM shared-memory demos.\n\n"
            "Conventions:\n"
            "- Route internal service hosts through INTERNAL_API_BASE.\n"
            "- Redact secrets before persisting traces or activity feed rows.\n"
            "- Treat Tensorlake retries as normal and make background work idempotent.\n"
        )
    if rel.endswith("package.json"):
        return json.dumps({"name": repo["name"], "private": True, "scripts": {"test": "vitest run"}}, indent=2) + "\n"
    if rel.endswith("pyproject.toml"):
        return f"[project]\nname = \"{repo['name']}\"\nversion = \"0.1.0\"\n\n[tool.pytest.ini_options]\naddopts = \"-q\"\n"
    ext = Path(rel).suffix
    if ext == ".py":
        fn = Path(rel).stem
        return (
            f'"""Mock module for {repo["name"]}: {rel}."""\n\n'
            "from __future__ import annotations\n\n"
            f"def {fn.replace('-', '_')}_entrypoint(context: dict) -> dict:\n"
            "    \"\"\"Small placeholder used by the NM demo seed.\"\"\"\n"
            "    return {\"ok\": True, \"context_keys\": sorted(context.keys())}\n"
        )
    if ext in (".ts", ".tsx"):
        name = Path(rel).stem.replace("-", "_")
        export = "export function"
        return (
            f"// Mock module for {repo['name']}: {rel}\n\n"
            f"{export} {name}Status(input: Record<string, unknown>) {{\n"
            "  return { ok: true, keys: Object.keys(input).sort() };\n"
            "}\n"
        )
    return f"# Mock file for {repo['name']} / {rel}\n"


def _write_mock_codebase() -> None:
    if MOCK_ORG_ROOT.exists():
        shutil.rmtree(MOCK_ORG_ROOT)
    for repo in REPOS:
        repo_dir = MOCK_ORG_ROOT / repo["name"]
        for rel in repo["files"]:
            path = repo_dir / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(_file_body(repo, rel), encoding="utf-8")
    (MOCK_ORG_ROOT / "README.md").write_text(
        "# Northstar AI Mock Org\n\n"
        "Five-repo organization used by the NM demo. Repos model a small agent-infrastructure company: runtime, dashboard, context memory, integrations, and agent API.\n",
        encoding="utf-8",
    )


def _is_repo_path(path: str) -> bool:
    return path.split("/", 1)[0] in REPO_NAMES


def _wipe_demo_org(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute("SELECT session_id FROM sessions WHERE session_id LIKE 'demo-s%' OR session_id LIKE 'demo-bg-%'")
    sids = [r[0] for r in cur.fetchall()]
    if sids:
        placeholders = ",".join("?" for _ in sids)
        cur.execute(f"DELETE FROM file_touches WHERE session_id IN ({placeholders})", sids)
        cur.execute(f"DELETE FROM tool_calls WHERE session_id IN ({placeholders})", sids)
        cur.execute(f"DELETE FROM content_blocks WHERE message_id IN (SELECT id FROM messages WHERE session_id IN ({placeholders}))", sids)
        cur.execute(f"DELETE FROM messages WHERE session_id IN ({placeholders})", sids)
        cur.execute(f"DELETE FROM sessions WHERE session_id IN ({placeholders})", sids)
        cur.execute(f"DELETE FROM transcript_entries WHERE session_id IN ({placeholders})", sids)
        cur.execute(f"DELETE FROM events WHERE session_id IN ({placeholders})", sids)
        cur.execute(f"DELETE FROM injections WHERE session_id IN ({placeholders})", sids)
        cur.execute(f"DELETE FROM note_feedback WHERE session_id IN ({placeholders})", sids)
        cur.execute(f"DELETE FROM file_note_edges WHERE note_id IN (SELECT id FROM notes WHERE created_from_session IN ({placeholders}))", sids)
        cur.execute(f"DELETE FROM notes WHERE created_from_session IN ({placeholders})", sids)
        cur.execute(f"DELETE FROM hurdle_signals WHERE hurdle_id IN (SELECT id FROM hurdles WHERE session_id IN ({placeholders}))", sids)
        cur.execute(f"DELETE FROM hurdles WHERE session_id IN ({placeholders})", sids)
    cur.execute("DELETE FROM gc_actions WHERE details LIKE '%\"mock_org\": true%'")
    cur.execute("DELETE FROM file_note_edges WHERE note_id LIKE ?", (f"{DEMO_NOTE_PREFIX}%",))
    cur.execute("DELETE FROM notes WHERE id LIKE ?", (f"{DEMO_NOTE_PREFIX}%",))
    for prefix in OLD_REPO_PREFIXES:
        cur.execute("DELETE FROM files WHERE path LIKE ?", (prefix + "%",))
    conn.commit()


def _insert_demo_session(conn: sqlite3.Connection, spec: dict[str, Any], started: datetime) -> None:
    user = next(u for u in USERS if u[0] == spec["user"])
    cwd = str(MOCK_ORG_ROOT / spec["repo"]).replace("\\", "/")
    b = TraceBuilder(spec["session"], started_at=started, vendor=spec["vendor"], cwd=cwd)
    primary_file = spec["files"][0][0]
    primary_abs = str(MOCK_ORG_ROOT / primary_file).replace("\\", "/")
    repo_abs = str(MOCK_ORG_ROOT / spec["repo"]).replace("\\", "/")
    b.user(f"We hit this again in {primary_file}. Verify the repo state and make the smallest safe fix.")
    b.tool_call("LS", {"path": repo_abs}, thinking="I need the repository shape before touching files.")
    b.tool_result(b._open_tool_calls[-1], "README.md\ncatalog-info.yaml\nsrc\ntests\npackage.json or pyproject.toml")
    b.tool_call("Read", {"file_path": str(MOCK_ORG_ROOT / spec["repo"] / "catalog-info.yaml").replace("\\", "/")})
    b.tool_result(b._open_tool_calls[-1], f"owner: {next(r['team'] for r in REPOS if r['name'] == spec['repo'])}\nlifecycle: experimental")
    b.tool_call("Grep", {"path": repo_abs, "pattern": spec["symptom"].split(" ", 2)[-1][:24]})
    b.tool_result(b._open_tool_calls[-1], "No direct matches. Searching by cited file instead.")
    b.tool_call("Read", {"file_path": primary_abs}, thinking="Read HEAD before deciding whether the note still applies.")
    b.tool_result(b._open_tool_calls[-1], f"Loaded {primary_file} from HEAD. The cited behavior is still present in the surrounding code.")
    b.assistant_text(f"I found the live code path. First attempt: I will patch the local symptom in {primary_file}.")
    b.tool_call("Edit", {
        "file_path": primary_abs,
        "old_string": "<mock-old>",
        "new_string": "<mock-new>",
    })
    b.tool_result(b._open_tool_calls[-1], "ok - applied edit to the cited file")
    test_cmd = "pytest -q" if primary_file.endswith(".py") else "npm test -- --runInBand"
    b.tool_call("Bash", {"command": test_cmd})
    b.tool_result(
        b._open_tool_calls[-1],
        f"FAIL: regression still violates org requirement. {spec['root_cause']}",
        is_error=True,
    )
    b.user(f"No — {spec['correction']}")
    b.tool_call("Edit", {
        "file_path": primary_abs,
        "old_string": "<mock-old>",
        "new_string": "<mock-new>",
    })
    b.tool_result(b._open_tool_calls[-1], "ok - mock edit accepted after applying the requirement.")
    b.tool_call("Bash", {"command": test_cmd})
    b.tool_result(b._open_tool_calls[-1], "PASS: targeted regression and adjacent unit tests passed.")
    b.assistant_text("Updated after verifying HEAD, applying the requirement, and running the narrow test.")
    _persist(conn, b)
    _persist_trace_projection(conn, b, {
        "mock_org": True,
        "org": MOCK_ORG["id"],
        "user": user[1],
        "user_id": user[0],
        "repo": spec["repo"],
        "trace_format": "codex-cli" if b.vendor == "codex" else "claude-code-jsonl",
    })


def _persist_trace_projection(conn: sqlite3.Connection, b: TraceBuilder, meta: dict[str, Any]) -> None:
    for m in b.messages:
        blocks = [cb for cb in b.content_blocks if cb["_msg_local_id"] == m["_local_id"]]
        text = "\n".join(
            str(cb.get("text") or cb.get("output_text") or "")
            for cb in blocks
            if cb.get("text") or cb.get("output_text")
        ).strip()
        conn.execute(
            """
            INSERT OR REPLACE INTO transcript_entries
            (uuid, ts, session_id, type, role, content_json, raw_json, transcript_path, ingested_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                m["uuid"],
                m["ts"],
                b.session_id,
                m["type"],
                m["role"],
                json.dumps([{k: v for k, v in cb.items() if not k.startswith("_")} for cb in blocks]),
                m["raw_json"],
                f"<mock-org>/{b.vendor}/{b.session_id}.jsonl",
                now_iso(),
            ),
        )
        if m["role"] in ("user", "assistant") and text:
            conn.execute(
                """
                INSERT INTO events (ts, session_id, role, content, metadata)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    m["ts"],
                    b.session_id,
                    m["role"],
                    text,
                    json.dumps({"mock_org": True, "vendor": b.vendor, "source": "transcript_projection"}),
                ),
            )
    conn.execute(
        "UPDATE sessions SET meta_json = ? WHERE session_id = ?",
        (json.dumps(meta), b.session_id),
    )


def _insert_background_sessions(conn: sqlite3.Connection, specs: list[dict[str, Any]], count: int = BACKGROUND_TRACE_COUNT) -> None:
    start = datetime(2026, 5, 2, 9, 0, tzinfo=timezone.utc)
    task_verbs = [
        "trace a failing test",
        "review a small PR",
        "update an integration edge case",
        "investigate a flaky sandbox run",
        "tighten an auth boundary",
        "prepare the demo dashboard",
        "verify a note injection",
        "add a regression assertion",
    ]
    for i in range(count):
        spec = specs[i % len(specs)]
        user = USERS[(i * 7) % len(USERS)]
        vendor = AGENT_VENDORS[(i * 3 + 1) % len(AGENT_VENDORS)]
        repo = next(r for r in REPOS if r["name"] == spec["repo"])
        sid = f"demo-bg-{i + 1:03d}-{repo['id']}"
        cwd = str(MOCK_ORG_ROOT / repo["name"]).replace("\\", "/")
        b = TraceBuilder(sid, started_at=start + timedelta(minutes=i * 37), vendor=vendor, cwd=cwd)
        primary = spec["files"][0][0]
        if not _is_repo_path(primary):
            primary = f"{spec['repo']}/{primary}"
        secondary = f"{repo['name']}/{repo['files'][(i + 3) % len(repo['files'])]}"
        primary_abs = str(MOCK_ORG_ROOT / primary).replace("\\", "/")
        secondary_abs = str(MOCK_ORG_ROOT / secondary).replace("\\", "/")
        b.user(f"{task_verbs[i % len(task_verbs)].capitalize()} in {primary}. Keep the change narrow.")
        b.tool_call("Read", {"file_path": primary_abs}, thinking="Read the cited file at HEAD.")
        b.tool_result(b._open_tool_calls[-1], f"Loaded {primary}. Relevant convention: {spec['correction']}")
        if i % 3 == 0:
            b.tool_call("Grep", {"path": cwd, "pattern": spec["correction"].split(" ", 1)[0]})
            b.tool_result(b._open_tool_calls[-1], f"{primary}:1 matched convention reference\n{secondary}:12 adjacent usage")
        if i % 4 == 0:
            b.tool_call("Read", {"file_path": secondary_abs})
            b.tool_result(b._open_tool_calls[-1], f"Loaded adjacent file {secondary}.")
        if i % 5 in (0, 2) or i % 11 == 0:
            b.tool_call("Edit", {"file_path": primary_abs, "old_string": "<before>", "new_string": "<after>"})
            b.tool_result(b._open_tool_calls[-1], "ok - applied focused edit")
        test_cmd = "pytest -q" if primary.endswith(".py") else "npm test -- --runInBand"
        b.tool_call("Bash", {"command": test_cmd})
        if i % 11 == 0:
            b.tool_result(b._open_tool_calls[-1], "FAIL: first run exposed the same project convention again.", is_error=True)
            b.user(f"No — {spec['correction']}")
            b.tool_call("Edit", {"file_path": primary_abs, "old_string": "<before>", "new_string": "<requirement-aligned-after>"})
            b.tool_result(b._open_tool_calls[-1], "ok - aligned edit with injected note")
            b.assistant_text("The failure matches an existing org memory note. I adjusted to the requirement and will rerun.")
            b.tool_call("Bash", {"command": test_cmd})
            b.tool_result(b._open_tool_calls[-1], "PASS: narrow regression passed")
        else:
            b.tool_result(b._open_tool_calls[-1], "PASS: targeted tests passed")
        b.assistant_text("Verified the touched path and left adjacent files unchanged.")
        _persist(conn, b)
        _persist_trace_projection(conn, b, {
            "mock_org": True,
            "org": MOCK_ORG["id"],
            "user": user[1],
            "user_id": user[0],
            "repo": spec["repo"],
            "background_trace": True,
            "trace_format": "codex-cli" if b.vendor == "codex" else "claude-code-jsonl",
        })

        # Background sessions create injection/feed history that makes the
        # dashboard feel like a real org under agent load.
        note_id = spec["id"]
        touched_paths = [primary]
        if i % 4 == 0:
            touched_paths.append(secondary)
        for j, path in enumerate(touched_paths):
            ts = datetime.fromisoformat(b.messages[min(len(b.messages) - 1, 1 + j)]["ts"])
            accepted = 0 if (i + j) % 13 == 0 else 1
            cur = conn.execute(
                """
                INSERT INTO injections (ts, session_id, path, tool_name, note_id, accepted, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts.isoformat(),
                    sid,
                    path,
                    "Read" if j == 0 else "Edit",
                    note_id,
                    accepted,
                    "background accepted" if accepted else "background over budget",
                ),
            )
            if i % 9 == 0:
                conn.execute(
                    """
                    INSERT INTO note_feedback (ts, note_id, session_id, injection_id, useful, reason)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (ts.isoformat(), note_id, sid, cur.lastrowid, 0 if i % 27 == 0 else 1, "background demo feedback"),
                )


def _insert_demo_graph(conn: sqlite3.Connection, specs: list[dict[str, Any]]) -> None:
    cur = conn.cursor()
    base = datetime(2026, 5, 9, 16, 30, tzinfo=timezone.utc)
    for idx, repo in enumerate(REPOS):
        for rel in repo["files"]:
            path = f"{repo['name']}/{rel}"
            cur.execute(
                """
                INSERT INTO files (path, type, first_seen, last_seen)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET last_seen = excluded.last_seen
                """,
                (path, Path(path).suffix.lstrip(".") or "?", (base - timedelta(days=21)).isoformat(), base.isoformat()),
            )

    for idx, spec in enumerate(specs):
        created = base - timedelta(hours=idx * 3 + 1)
        cur.execute(
            """
            INSERT INTO hurdles (session_id, start_event_id, end_event_id, score, signals_json, resolved, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                spec["session"],
                1,
                6,
                round(0.72 + (spec["importance"] * 0.18), 3),
                json.dumps(["correction_phrase", "file_touch", "reverted_diff" if idx % 3 == 0 else "failed_test"]),
                1,
                created.isoformat(),
            ),
        )
        hurdle_id = cur.lastrowid
        cur.execute(
            """
            INSERT OR REPLACE INTO notes
            (id, symptom, root_cause, correction, importance, inject_count, created_at,
             created_from_session, created_from_hurdle, last_injected_at, t_invalid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                spec["id"],
                f"[{spec['scope']}] {spec['symptom']}",
                spec["root_cause"],
                f"{spec['correction']} Provenance: {spec['provenance']}",
                spec["importance"],
                spec["injects"],
                created.isoformat(),
                spec["session"],
                hurdle_id,
                (base - timedelta(minutes=idx * 11 + 4)).isoformat(),
            ),
        )
        for path, weight in spec["files"]:
            if not _is_repo_path(path):
                path = f"{spec['repo']}/{path}"
            cur.execute(
                """
                INSERT INTO files (path, type, first_seen, last_seen)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET last_seen = excluded.last_seen
                """,
                (path, Path(path).suffix.lstrip(".") or "?", created.isoformat(), base.isoformat()),
            )
            cur.execute(
                "INSERT OR REPLACE INTO file_note_edges (note_id, path, weight) VALUES (?, ?, ?)",
                (spec["id"], path, weight),
            )
        for sig in ("correction_phrase", "file_touch", "reverted_diff" if idx % 2 else "failed_test"):
            cur.execute(
                "INSERT INTO hurdle_signals (hurdle_id, message_id, signal, weight, details) VALUES (?, NULL, ?, ?, ?)",
                (hurdle_id, sig, 0.34, json.dumps({"mock_org": True, "note_id": spec["id"]})),
            )


def _insert_demo_audit(conn: sqlite3.Connection, specs: list[dict[str, Any]]) -> None:
    cur = conn.cursor()
    base = datetime(2026, 5, 9, 17, 20, tzinfo=timezone.utc)
    accepted_reasons = ["file+session match", "org convention", "repo owner match", "recent failure pattern"]
    reject_reasons = ["over budget", "already injected this session", "scope mismatch"]
    for i in range(96):
        spec = specs[i % len(specs)]
        path = spec["files"][i % len(spec["files"])][0]
        if not _is_repo_path(path):
            path = f"{spec['repo']}/{path}"
        accepted = 0 if i % 7 == 0 else 1
        session_id = specs[(i * 3) % len(specs)]["session"]
        ts = base - timedelta(minutes=i * 4)
        cur.execute(
            """
            INSERT INTO injections (ts, session_id, path, tool_name, note_id, accepted, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ts.isoformat(),
                session_id,
                path,
                ["Read", "Edit", "Write", "MultiEdit"][i % 4],
                spec["id"],
                accepted,
                accepted_reasons[i % len(accepted_reasons)] if accepted else reject_reasons[i % len(reject_reasons)],
            ),
        )
        inj_id = cur.lastrowid
        if i % 5 == 0:
            cur.execute(
                "INSERT INTO note_feedback (ts, note_id, session_id, injection_id, useful, reason) VALUES (?, ?, ?, ?, ?, ?)",
                (ts.isoformat(), spec["id"], session_id, inj_id, 0 if i % 20 == 0 else 1, "mock demo feedback"),
            )

    inactive_ids = []
    for i, spec in enumerate(specs[-6:]):
        nid = spec["id"] + "_stale"
        inactive_ids.append(nid)
        created = base - timedelta(days=18 + i)
        cur.execute(
            """
            INSERT OR REPLACE INTO notes
            (id, symptom, root_cause, correction, importance, inject_count, created_at,
             created_from_session, created_from_hurdle, last_injected_at, t_invalid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (
                nid,
                "[file] Stale duplicate: " + spec["symptom"],
                spec["root_cause"],
                spec["correction"],
                0.08 + i * 0.01,
                i,
                created.isoformat(),
                spec["session"],
                (base - timedelta(days=14)).isoformat(),
                (base - timedelta(minutes=90 - i * 7)).isoformat(),
            ),
        )
        path = spec["files"][0][0]
        cur.execute("INSERT OR REPLACE INTO file_note_edges (note_id, path, weight) VALUES (?, ?, ?)", (nid, path, 0.25))
        cur.execute(
            "INSERT INTO gc_actions (ts, action, note_id, details) VALUES (?, ?, ?, ?)",
            (
                (base - timedelta(minutes=80 - i * 7)).isoformat(),
                "prune" if i % 2 else "merge",
                nid,
                json.dumps({"mock_org": True, "reason": "seeded stale note for live GC demo", "active_after": len(specs) - i}),
            ),
        )


def _write_seed_json(specs: list[dict[str, Any]]) -> None:
    seed_dir = ROOT / "mock" / "seed"
    seed_dir.mkdir(parents=True, exist_ok=True)
    users = [{"id": u[0], "name": u[1], "email": u[2], "role": u[3]} for u in USERS]
    agents = [
        {"id": f"{vendor}-{user[0]}", "vendor": vendor, "user_id": user[0]}
        for i, user in enumerate(USERS)
        for vendor in [AGENT_VENDORS[(i + j) % len(AGENT_VENDORS)] for j in range(2)]
    ]
    files = [
        {"repo": repo["name"], "path": f"{repo['name']}/{rel}", "team": repo["team"], "type": Path(rel).suffix.lstrip(".") or "?"}
        for repo in REPOS
        for rel in repo["files"]
    ]
    notes = [
        {
            "id": s["id"],
            "scope": s["scope"],
            "symptom": s["symptom"],
            "root_cause": s["root_cause"],
            "correction": s["correction"],
            "provenance": s["provenance"],
            "files": [{"path": p, "weight": w} for p, w in s["files"]],
            "created_from_session": s["session"],
        }
        for s in specs
    ]
    for name, data in {
        "org.json": {**MOCK_ORG, "users": users, "agents": agents, "repos": REPOS},
        "files.json": files,
        "notes.json": notes,
    }.items():
        (seed_dir / name).write_text(json.dumps(data, indent=2), encoding="utf-8")


def _write_pr_briefs(specs: list[dict[str, Any]]) -> None:
    brief_dir = MOCK_ORG_ROOT / ".nm" / "briefs"
    brief_dir.mkdir(parents=True, exist_ok=True)

    system_prompt = """# Autonomous Fix Agent System Prompt

ROLE: Open one issue and one PR for the defect described in the user message.

PROCEDURE:
1. Search open and closed issues/PRs for the note id. If one already exists, exit.
2. Read the cited files at HEAD.
3. If the defect is absent, mark the note resolved and exit.
4. Open an issue with the note id in the title.
5. Create a branch, make the minimal fix, and add or update a regression test.
6. Run the narrowest relevant test.
7. Open a PR that links the issue and states the verified behavior.

CONSTRAINTS:
- Treat the brief as a requirement, not evidence that HEAD is broken.
- Do not infer blame from the brief.
- Do not quote user language in the issue or PR.
- Do not use any patch or code that appears outside the live repository.
- Keep the PR scoped to the cited defect.
"""
    (MOCK_ORG_ROOT / ".nm" / "fix-agent-system-prompt.md").write_text(system_prompt, encoding="utf-8")

    for spec in specs:
        primary_repo = spec["repo"]
        files = []
        for path, _weight in spec["files"]:
            if _is_repo_path(path):
                files.append(path)
            else:
                files.append(f"{primary_repo}/{path}")

        body = [
            f"# Fix candidate: {spec['id']}",
            "",
            "## Defect",
            spec["symptom"],
            "",
            "## Requirement",
            spec["correction"],
            "",
            "## Cited paths",
            *[f"- `{path}`" for path in files],
            "",
            "## Scope",
            f"- Org: `{MOCK_ORG['id']}`",
            f"- Repo: `{primary_repo}`",
            f"- Note scope: `{spec['scope']}`",
            "",
            "## Provenance",
            spec["provenance"],
            "",
            "## Exit conditions",
            "- Existing issue or PR already references this note id.",
            "- Live HEAD no longer contains the defect.",
            "- The cited files are unrelated after reading HEAD.",
            "",
        ]
        (brief_dir / f"{spec['id']}.md").write_text("\n".join(body), encoding="utf-8")


def seed_demo_org(conn: sqlite3.Connection, keep: bool = False) -> None:
    if not keep:
        _wipe_demo_org(conn)
    _write_mock_codebase()
    specs = _all_note_specs()
    start = datetime(2026, 5, 9, 15, 0, tzinfo=timezone.utc)
    for i, spec in enumerate(specs):
        _insert_demo_session(conn, spec, start + timedelta(minutes=i * 11))
    _insert_background_sessions(conn, specs)
    _insert_demo_graph(conn, specs)
    _insert_demo_audit(conn, specs)
    _write_seed_json(specs)
    _write_pr_briefs(specs)
    conn.execute(
        "INSERT OR REPLACE INTO nm_meta (key, value) VALUES (?, ?)",
        ("mock_org", json.dumps({
            "org": MOCK_ORG,
            "repos": [r["name"] for r in REPOS],
            "users": len(USERS),
            "notes": len(specs),
            "traces": len(specs) + BACKGROUND_TRACE_COUNT,
            "background_traces": BACKGROUND_TRACE_COUNT,
        })),
    )
    conn.commit()
    print(f"  seeded mock org {MOCK_ORG['id']}  repos={len(REPOS)} users={len(USERS)} notes={len(specs)} traces={len(specs) + BACKGROUND_TRACE_COUNT}")


def _persist(conn: sqlite3.Connection, b: TraceBuilder) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO sessions
        (session_id, agent_vendor, cwd, project_root, transcript_path,
         started_at, last_seen_at, meta_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            b.session_id,
            b.vendor,
            b.cwd,
            b.cwd,
            f"<mock>/{b.vendor}/{b.session_id}.jsonl",
            b.started_at.isoformat(),
            b._t.isoformat(),
            json.dumps({"mock": True, "vendor": b.vendor}),
        ),
    )

    # Write messages, capturing the assigned id back so blocks can FK to it.
    local_to_real_msg_id: dict[int, int] = {}
    for m in b.messages:
        cur.execute(
            """
            INSERT INTO messages
            (uuid, session_id, parent_uuid, ts, type, role, is_meta, raw_json, ingested_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (m["uuid"], m["session_id"], m["parent_uuid"], m["ts"], m["type"],
             m["role"], m["is_meta"], m["raw_json"], m["ingested_at"]),
        )
        local_to_real_msg_id[m["_local_id"]] = cur.lastrowid

    for cb in b.content_blocks:
        msg_real = local_to_real_msg_id[cb["_msg_local_id"]]
        cur.execute(
            """
            INSERT INTO content_blocks
            (message_id, block_index, type, text, tool_use_id, tool_name,
             input_json, output_text, output_json, is_error, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                msg_real,
                cb["block_index"],
                cb["type"],
                cb.get("text"),
                cb.get("tool_use_id"),
                cb.get("tool_name"),
                cb.get("input_json"),
                cb.get("output_text"),
                cb.get("output_json"),
                cb.get("is_error"),
                cb["raw_json"],
            ),
        )

    for tc in b.tool_calls:
        cur.execute(
            """
            INSERT OR REPLACE INTO tool_calls
            (tool_use_id, session_id, tool_name, use_message_id, result_message_id,
             input_json, output_text, is_error, started_at, finished_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tc["tool_use_id"],
                tc["session_id"],
                tc["tool_name"],
                local_to_real_msg_id.get(tc["use_message_id_local"]),
                local_to_real_msg_id.get(tc.get("result_message_id_local", -1)),
                tc["input_json"],
                tc.get("output_text"),
                tc.get("is_error"),
                tc["started_at"],
                tc.get("finished_at"),
            ),
        )

    for ft in b.file_touches:
        # Need the tool_calls.id (PK) for the FK. Query it back.
        cur.execute("SELECT id FROM tool_calls WHERE tool_use_id = ?", (ft["tool_use_id"],))
        row = cur.fetchone()
        if not row:
            continue
        cur.execute(
            """
            INSERT INTO file_touches (tool_call_id, session_id, tool_name, path, ts)
            VALUES (?, ?, ?, ?, ?)
            """,
            (row[0], ft["session_id"], ft["tool_name"], ft["path"], ft["ts"]),
        )

    conn.commit()


# ---------------------------------------------------------------------------
# The 5 hurdle scenarios
# ---------------------------------------------------------------------------

T0 = datetime(2026, 5, 9, 9, 0, 0, tzinfo=timezone.utc)


def session_a_hardcoded_url() -> TraceBuilder:
    """Hurdle: agent hardcodes an API URL. User corrects. Agent re-edits same file
    twice (reverted_edit) and uses correction phrases ("no", "instead").
    """
    sid = MOCK_SESSION_PREFIX + "a-hardcoded-url"
    b = TraceBuilder(sid, started_at=T0)
    b.user("Add a `getActiveOrgs` helper in src/api/client.ts that fetches /orgs/active.")

    b.tool_call("Read", {"file_path": f"{CODEBASE_ROOT}/src/api/client.ts"},
                thinking="Let me see the existing client code.")
    b.tool_result(b._open_tool_calls[-1],
                  "import { z } from 'zod';\n\nconst BASE = process.env.INTERNAL_API_BASE;\nif (!BASE) throw new Error('INTERNAL_API_BASE must be set');\n\nexport async function apiGet<T>(path, schema) { ... }\n")

    b.assistant_text("Got it. I'll add a typed helper that hits the staging host directly to keep the change small.")
    b.tool_call("Edit", {
        "file_path": f"{CODEBASE_ROOT}/src/api/client.ts",
        "old_string": "export async function apiGet<T>(path, schema) { ... }",
        "new_string": "export async function apiGet<T>(path, schema) { ... }\n\nexport async function getActiveOrgs() {\n  const res = await fetch('https://api.staging.acmeware.dev/orgs/active');\n  return res.json();\n}\n",
    })
    b.tool_result(b._open_tool_calls[-1], "ok â€” applied edit to src/api/client.ts (1 hunk)")

    b.user("no â€” please don't hardcode URLs. We always read from process.env.INTERNAL_API_BASE. CI lint will block this.")

    b.assistant_thinking_then_text(
        "Right, the hardcoded URL is the project convention I missed. Re-edit to use BASE.",
        "Apologies â€” fixing now to read from INTERNAL_API_BASE."
    )
    b.tool_call("Edit", {
        "file_path": f"{CODEBASE_ROOT}/src/api/client.ts",
        "old_string": "  const res = await fetch('https://api.staging.acmeware.dev/orgs/active');",
        "new_string": "  const res = await apiGet('/orgs/active', OrgsSchema);",
    })
    b.tool_result(b._open_tool_calls[-1], "ok â€” applied edit to src/api/client.ts (1 hunk)")
    b.assistant_text("Done. Now uses apiGet which reads INTERNAL_API_BASE.")
    return b


def session_b_jwt_decode() -> TraceBuilder:
    """Hurdle: agent uses jwt.decode (no verify). User INTERRUPTS mid tool-flow
    with a correction. Multiple correction phrases.
    """
    sid = MOCK_SESSION_PREFIX + "b-jwt-decode"
    b = TraceBuilder(sid, started_at=T0 + timedelta(hours=1))
    b.user("In src/api/auth.ts, add a quick endpoint that returns the user's email from the bearer token.")

    b.tool_call("Read", {"file_path": f"{CODEBASE_ROOT}/src/api/auth.ts"})
    b.tool_result(b._open_tool_calls[-1],
                  "import { verifyJWT } from '@/lib/auth-helpers';\n\nexport async function requireUser(req) { ... }\n")

    b.assistant_text("I'll add a small route handler. Using jwt.decode for speed since we just need the claim.")
    b.tool_call("Write", {
        "file_path": f"{CODEBASE_ROOT}/src/api/email.ts",
        "content": "import jwt from 'jsonwebtoken';\nexport function GET(req) {\n  const token = req.headers.get('authorization').slice(7);\n  const claims = jwt.decode(token);\n  return new Response(JSON.stringify({ email: claims.email }));\n}\n",
    })
    # User INTERRUPTS before tool_result arrives.
    b.user("stop â€” never use jwt.decode. It skips the signature and expiry check. Use verifyJWT() from lib/auth-helpers, that's literally why it exists.")

    b.assistant_thinking_then_text(
        "User interrupted. I should not be calling jwt.decode in production code â€” verifyJWT is the contract.",
        "Understood. Switching to verifyJWT now."
    )
    b.tool_call("Write", {
        "file_path": f"{CODEBASE_ROOT}/src/api/email.ts",
        "content": "import { verifyJWT } from '@/lib/auth-helpers';\nexport function GET(req) {\n  const token = req.headers.get('authorization').slice(7);\n  const session = verifyJWT(token);\n  return new Response(JSON.stringify({ email: session.email }));\n}\n",
    })
    b.tool_result(b._open_tool_calls[-1], "ok â€” wrote src/api/email.ts (12 lines)")
    b.assistant_text("Done â€” uses verifyJWT, signature + exp are checked.")
    return b


def session_c_webhook_500() -> TraceBuilder:
    """Hurdle: agent returns 500 on validation error. Tests fail twice in a row
    (retry_loop). User corrects.
    """
    sid = MOCK_SESSION_PREFIX + "c-webhook-500"
    b = TraceBuilder(sid, started_at=T0 + timedelta(hours=2))
    b.user("Add a webhook handler at src/api/billing.ts. It should reject malformed bodies.")

    b.tool_call("Read", {"file_path": f"{CODEBASE_ROOT}/src/api/webhooks.ts"})
    b.tool_result(b._open_tool_calls[-1],
                  "import { NextResponse } from 'next/server';\nexport async function POST(req) { ... return 400 on validation, 503 on infra ... }\n")

    b.assistant_text("Modeling on webhooks.ts but I'll return 500 for malformed bodies â€” it's the simplest signal that something went wrong.")
    b.tool_call("Write", {
        "file_path": f"{CODEBASE_ROOT}/src/api/billing.ts",
        "content": "import { NextResponse } from 'next/server';\nexport async function POST(req) {\n  try { const body = await req.json(); } catch { return NextResponse.json({error:'bad body'}, {status:500}); }\n}\n",
    })
    b.tool_result(b._open_tool_calls[-1], "ok â€” wrote src/api/billing.ts (8 lines)")

    # First test run fails â€” Tensorlake retry storm.
    b.tool_call("Bash", {"command": "npm test -- billing"})
    b.tool_result(b._open_tool_calls[-1],
                  "FAIL  src/api/billing.test.ts\n  â— billing webhook â€º retries on bad payload (timed out after 30s)\n  Tensorlake retried 47 times.\n",
                  is_error=True)

    b.assistant_text("Test failure â€” looks flaky. Re-running.")
    b.tool_call("Bash", {"command": "npm test -- billing"})
    b.tool_result(b._open_tool_calls[-1],
                  "FAIL  src/api/billing.test.ts\n  â— billing webhook â€º retries on bad payload (timed out after 30s)\n  Tensorlake retried 47 times.\n",
                  is_error=True)

    b.user("that's wrong â€” Tensorlake retries on 5xx. A bad body is a CLIENT problem, return 400. 5xx is reserved for transient infra. Look at webhooks.ts again.")

    b.assistant_thinking_then_text(
        "Right â€” same convention as webhooks.ts. 400 not 500.",
        "Switching the validation failure to 400 now."
    )
    b.tool_call("Edit", {
        "file_path": f"{CODEBASE_ROOT}/src/api/billing.ts",
        "old_string": "{status:500}",
        "new_string": "{status:400}",
    })
    b.tool_result(b._open_tool_calls[-1], "ok â€” applied edit to src/api/billing.ts (1 hunk)")

    b.tool_call("Bash", {"command": "npm test -- billing"})
    b.tool_result(b._open_tool_calls[-1],
                  "PASS  src/api/billing.test.ts\n  â— billing webhook â€º 400 on bad body (12ms)\n  â— billing webhook â€º 200 on valid body (8ms)\n")
    b.assistant_text("All green. 400 on validation failures.")
    return b


def session_d_read_loop() -> TraceBuilder:
    """Hurdle: agent re-reads same files repeatedly (action_bigram_loop)."""
    sid = MOCK_SESSION_PREFIX + "d-read-loop"
    b = TraceBuilder(sid, started_at=T0 + timedelta(hours=3))
    b.user("Why does our build fail under TS strict mode? Look around and figure it out.")

    for _ in range(4):
        b.tool_call("Read", {"file_path": f"{CODEBASE_ROOT}/tsconfig.json"})
        b.tool_result(b._open_tool_calls[-1],
                      '{"compilerOptions":{"strict":false,"target":"ES2022", ...}}')
        b.tool_call("Read", {"file_path": f"{CODEBASE_ROOT}/package.json"})
        b.tool_result(b._open_tool_calls[-1],
                      '{"name":"acmeware","version":"1.4.0", ...}')

    b.assistant_thinking_then_text(
        "I keep loading these same two files. I'm not finding the answer in them â€” strict is just false.",
        "I see strict: false in tsconfig but I can't tell from these files alone why it was disabled."
    )

    b.user("stop reading the same files in a loop. The answer is in the README â€” strict was disabled in March during the v2 migration and never re-enabled.")

    b.tool_call("Read", {"file_path": f"{CODEBASE_ROOT}/README.md"})
    b.tool_result(b._open_tool_calls[-1],
                  "## Project conventions\n... Don't disable tsconfig.strict. It was briefly disabled during the v2 migration (March) and never re-enabled. Re-enable it before merging new code. ...")
    b.assistant_text("Got it â€” README is explicit. Re-enable `strict: true` in tsconfig and fix the resulting errors.")
    return b


def session_e_tensorlake_memory() -> TraceBuilder:
    """Hurdle: agent calls spawnSandbox with default memory. Cost-alert fires
    in tool result (is_error=True). User corrects.
    """
    sid = MOCK_SESSION_PREFIX + "e-tensorlake-memory"
    b = TraceBuilder(sid, started_at=T0 + timedelta(hours=4))
    b.user("Spawn a Tensorlake sandbox to run the nightly cleanup job. Use the @acmeware/cleanup image.")

    b.tool_call("Read", {"file_path": f"{CODEBASE_ROOT}/src/lib/tensorlake.ts"})
    b.tool_result(b._open_tool_calls[-1],
                  "import { TensorlakeClient } from '@tensorlake/sdk';\nexport async function spawnSandbox(opts) { return tl.sandboxes.create({ ..., memory_mb: 4096, timeout_s: 300 }); }\n")

    b.assistant_text("Calling spawnSandbox with the cleanup image and a generous memory ceiling.")
    b.tool_call("Bash", {
        "command": "node -e \"const {spawnSandbox} = require('./src/lib/tensorlake'); spawnSandbox({image:'@acmeware/cleanup', cmd:['cleanup'], memory_mb: 16384})\"",
    })
    b.tool_result(b._open_tool_calls[-1],
                  "Error: cost-alert: sandbox memory_mb=16384 exceeds org budget cap of 4096 MB. Oncall has been paged.\nExit 1.",
                  is_error=True)

    b.assistant_text("Cost alert. Maybe transient â€” retrying with the same args.")
    b.tool_call("Bash", {
        "command": "node -e \"const {spawnSandbox} = require('./src/lib/tensorlake'); spawnSandbox({image:'@acmeware/cleanup', cmd:['cleanup'], memory_mb: 16384})\"",
    })
    b.tool_result(b._open_tool_calls[-1],
                  "Error: cost-alert: sandbox memory_mb=16384 exceeds org budget cap of 4096 MB. Oncall has been paged.\nExit 1.",
                  is_error=True)

    b.user("no â€” never override memory_mb above 4096. We cap at 4 GB org-wide. Look at the wrapper, it already sets the right value.")

    b.assistant_thinking_then_text(
        "I overrode the wrapper's safe default. Drop the override.",
        "Right. Reverting to the wrapper default."
    )
    b.tool_call("Bash", {
        "command": "node -e \"const {spawnSandbox} = require('./src/lib/tensorlake'); spawnSandbox({image:'@acmeware/cleanup', cmd:['cleanup']})\"",
    })
    b.tool_result(b._open_tool_calls[-1],
                  "spawned sandbox sb_8df3a (image=@acmeware/cleanup, memory_mb=4096, timeout_s=300)")
    b.assistant_text("Sandbox spawned at 4 GB â€” under the org cap.")
    return b


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true",
                    help="Don't wipe existing mock sessions before reseeding")
    args = ap.parse_args()

    init_db()
    conn = connect()
    try:
        if not args.keep:
            _wipe_mock(conn)

        sessions = [
            session_a_hardcoded_url(),
            session_b_jwt_decode(),
            session_c_webhook_500(),
            session_d_read_loop(),
            session_e_tensorlake_memory(),
        ]
        for s in sessions:
            _persist(conn, s)
            print(f"  seeded {s.session_id}  msgs={len(s.messages)}  blocks={len(s.content_blocks)}  tool_calls={len(s.tool_calls)}")
        seed_demo_org(conn, keep=args.keep)
    finally:
        conn.close()
    print(f"\n{len(sessions)} legacy mock sessions + multi-repo org ready in nm.db")


if __name__ == "__main__":
    main()

