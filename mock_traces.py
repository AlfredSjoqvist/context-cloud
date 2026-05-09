"""Seed mock reasoning traces into nm.db (v2 schema).

Builds 5 sessions, each demonstrating a different hurdle pattern:
  A. hardcoded API URL → reverted_edit + correction_phrase
  B. jwt.decode without verifying → interrupt + correction_phrase
  C. webhook returns 500 → retry_loop + correction_phrase
  D. agent re-reads same files → action_bigram_loop + correction_phrase
  E. spawnSandbox without memory_mb → tool-error + correction_phrase

Run:
    python mock_traces.py            # idempotent: wipes prior mock_* sessions, reseeds
    python mock_traces.py --keep     # additive (don't wipe existing mock data)

The trace shape mirrors what nm_capture.py writes when ingesting Claude Code
JSONL hooks. Direct table inserts are simpler than mimicking JSONL exactly.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from nm_db import canonical_path, connect, init_db, now_iso

CODEBASE_ROOT = "C:/Users/Alfred/Desktop/nozomio/codebase"


# ---------------------------------------------------------------------------
# Session builder
# ---------------------------------------------------------------------------

class TraceBuilder:
    """Tiny DSL for building one Claude Code-shaped session."""

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

    def _add_message(self, mtype: str, role: str | None, content: list[dict[str, Any]],
                     stop_reason: str | None = None) -> int:
        ts = self._ts()
        msg_uuid = self._new_uuid()
        msg_id = self._next_msg_id()
        raw = {
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
    # Clean up extracted notes from prior mock runs.
    # Order matters with foreign_keys=ON:
    #   file_note_edges → notes → hurdle_signals → hurdles
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
            f"<mock>/{b.session_id}.jsonl",
            b.started_at.isoformat(),
            b._t.isoformat(),
            json.dumps({"mock": True}),
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
    b.tool_result(b._open_tool_calls[-1], "ok — applied edit to src/api/client.ts (1 hunk)")

    b.user("no — please don't hardcode URLs. We always read from process.env.INTERNAL_API_BASE. CI lint will block this.")

    b.assistant_thinking_then_text(
        "Right, the hardcoded URL is the project convention I missed. Re-edit to use BASE.",
        "Apologies — fixing now to read from INTERNAL_API_BASE."
    )
    b.tool_call("Edit", {
        "file_path": f"{CODEBASE_ROOT}/src/api/client.ts",
        "old_string": "  const res = await fetch('https://api.staging.acmeware.dev/orgs/active');",
        "new_string": "  const res = await apiGet('/orgs/active', OrgsSchema);",
    })
    b.tool_result(b._open_tool_calls[-1], "ok — applied edit to src/api/client.ts (1 hunk)")
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
    b.user("stop — never use jwt.decode. It skips the signature and expiry check. Use verifyJWT() from lib/auth-helpers, that's literally why it exists.")

    b.assistant_thinking_then_text(
        "User interrupted. I should not be calling jwt.decode in production code — verifyJWT is the contract.",
        "Understood. Switching to verifyJWT now."
    )
    b.tool_call("Write", {
        "file_path": f"{CODEBASE_ROOT}/src/api/email.ts",
        "content": "import { verifyJWT } from '@/lib/auth-helpers';\nexport function GET(req) {\n  const token = req.headers.get('authorization').slice(7);\n  const session = verifyJWT(token);\n  return new Response(JSON.stringify({ email: session.email }));\n}\n",
    })
    b.tool_result(b._open_tool_calls[-1], "ok — wrote src/api/email.ts (12 lines)")
    b.assistant_text("Done — uses verifyJWT, signature + exp are checked.")
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

    b.assistant_text("Modeling on webhooks.ts but I'll return 500 for malformed bodies — it's the simplest signal that something went wrong.")
    b.tool_call("Write", {
        "file_path": f"{CODEBASE_ROOT}/src/api/billing.ts",
        "content": "import { NextResponse } from 'next/server';\nexport async function POST(req) {\n  try { const body = await req.json(); } catch { return NextResponse.json({error:'bad body'}, {status:500}); }\n}\n",
    })
    b.tool_result(b._open_tool_calls[-1], "ok — wrote src/api/billing.ts (8 lines)")

    # First test run fails — Tensorlake retry storm.
    b.tool_call("Bash", {"command": "npm test -- billing"})
    b.tool_result(b._open_tool_calls[-1],
                  "FAIL  src/api/billing.test.ts\n  ● billing webhook › retries on bad payload (timed out after 30s)\n  Tensorlake retried 47 times.\n",
                  is_error=True)

    b.assistant_text("Test failure — looks flaky. Re-running.")
    b.tool_call("Bash", {"command": "npm test -- billing"})
    b.tool_result(b._open_tool_calls[-1],
                  "FAIL  src/api/billing.test.ts\n  ● billing webhook › retries on bad payload (timed out after 30s)\n  Tensorlake retried 47 times.\n",
                  is_error=True)

    b.user("that's wrong — Tensorlake retries on 5xx. A bad body is a CLIENT problem, return 400. 5xx is reserved for transient infra. Look at webhooks.ts again.")

    b.assistant_thinking_then_text(
        "Right — same convention as webhooks.ts. 400 not 500.",
        "Switching the validation failure to 400 now."
    )
    b.tool_call("Edit", {
        "file_path": f"{CODEBASE_ROOT}/src/api/billing.ts",
        "old_string": "{status:500}",
        "new_string": "{status:400}",
    })
    b.tool_result(b._open_tool_calls[-1], "ok — applied edit to src/api/billing.ts (1 hunk)")

    b.tool_call("Bash", {"command": "npm test -- billing"})
    b.tool_result(b._open_tool_calls[-1],
                  "PASS  src/api/billing.test.ts\n  ● billing webhook › 400 on bad body (12ms)\n  ● billing webhook › 200 on valid body (8ms)\n")
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
        "I keep loading these same two files. I'm not finding the answer in them — strict is just false.",
        "I see strict: false in tsconfig but I can't tell from these files alone why it was disabled."
    )

    b.user("stop reading the same files in a loop. The answer is in the README — strict was disabled in March during the v2 migration and never re-enabled.")

    b.tool_call("Read", {"file_path": f"{CODEBASE_ROOT}/README.md"})
    b.tool_result(b._open_tool_calls[-1],
                  "## Project conventions\n... Don't disable tsconfig.strict. It was briefly disabled during the v2 migration (March) and never re-enabled. Re-enable it before merging new code. ...")
    b.assistant_text("Got it — README is explicit. Re-enable `strict: true` in tsconfig and fix the resulting errors.")
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

    b.assistant_text("Cost alert. Maybe transient — retrying with the same args.")
    b.tool_call("Bash", {
        "command": "node -e \"const {spawnSandbox} = require('./src/lib/tensorlake'); spawnSandbox({image:'@acmeware/cleanup', cmd:['cleanup'], memory_mb: 16384})\"",
    })
    b.tool_result(b._open_tool_calls[-1],
                  "Error: cost-alert: sandbox memory_mb=16384 exceeds org budget cap of 4096 MB. Oncall has been paged.\nExit 1.",
                  is_error=True)

    b.user("no — never override memory_mb above 4096. We cap at 4 GB org-wide. Look at the wrapper, it already sets the right value.")

    b.assistant_thinking_then_text(
        "I overrode the wrapper's safe default. Drop the override.",
        "Right. Reverting to the wrapper default."
    )
    b.tool_call("Bash", {
        "command": "node -e \"const {spawnSandbox} = require('./src/lib/tensorlake'); spawnSandbox({image:'@acmeware/cleanup', cmd:['cleanup']})\"",
    })
    b.tool_result(b._open_tool_calls[-1],
                  "spawned sandbox sb_8df3a (image=@acmeware/cleanup, memory_mb=4096, timeout_s=300)")
    b.assistant_text("Sandbox spawned at 4 GB — under the org cap.")
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
    finally:
        conn.close()
    print(f"\n{len(sessions)} mock sessions ready in nm.db")


if __name__ == "__main__":
    main()
