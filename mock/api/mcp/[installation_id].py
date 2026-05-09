"""Hindsight MCP server — HTTP transport.

Mounted at  /api/mcp/<installation_id>.

The installation_id in the URL path is the org binding: every call is
implicitly scoped to whichever GitHub App installation owns that id. No
separate auth token is required for v1; the URL itself is the credential
(it's randomly assigned by GitHub on install and only known to repos that
have `.mcp.json` committed).

Implements the JSON-RPC subset of MCP that Claude Code, Cursor, and Cline
need to connect, list tools, and call them:

  - initialize
  - notifications/initialized   (no-response notification)
  - tools/list
  - tools/call
  - ping

Tools exposed:

  - get_relevant_notes(file_paths)  -> notes attached to those files
  - record_event(event)             -> stub: logs to Vercel function logs

For the demo, notes come from a hardcoded DEMO_NOTES dict (kept in sync
with mock/api/github/webhook.py). A real backend (Convex) replaces this
in v2 without changing the protocol surface.
"""

import json
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler


PROTOCOL_VERSION = "2024-11-05"


# Keep in sync with mock/api/github/webhook.py
DEMO_NOTES: dict[str, list[dict]] = {
    "client.ts": [
        {
            "id": "note-7f3a",
            "symptom": "Hardcoded API URL committed in client code.",
            "cause": "Project convention requires INTERNAL_API_BASE env var; literal hosts must never be committed.",
            "correction": "Read from process.env.INTERNAL_API_BASE.",
            "importance": 0.82,
            "injects": 14,
        }
    ],
    ".env.example": [
        {
            "id": "note-2c19",
            "symptom": "Real values leaked into the example env file.",
            "cause": "Sample env files should reflect the convention, not real secrets.",
            "correction": "Use placeholders like `INTERNAL_API_BASE=https://api.example.com`.",
            "importance": 0.55,
            "injects": 6,
        }
    ],
    "auth.ts": [
        {
            "id": "note-9b41",
            "symptom": "Logging full auth tokens in error paths.",
            "cause": "Tokens in logs end up in third-party log aggregators; org-wide rule.",
            "correction": "Wrap with `redact_token()` before any logger call.",
            "importance": 0.91,
            "injects": 22,
        }
    ],
}


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _match_notes(file_paths: list) -> list[dict]:
    matches: list[dict] = []
    for p in file_paths or []:
        if not isinstance(p, str):
            continue
        lower = p.lower()
        for suffix, notes in DEMO_NOTES.items():
            if lower.endswith(suffix.lower()):
                for n in notes:
                    if n not in matches:
                        matches.append(n)
    return matches


def _format_notes_text(notes: list[dict], paths: list[str]) -> str:
    if not notes:
        return f"No Hindsight notes attached to: {', '.join(paths) or '(no paths)'}"
    lines = [f"Hindsight injected {len(notes)} note(s) for {', '.join(paths)}:"]
    for n in notes:
        lines.append("")
        lines.append(
            f"[{n['id']}]  importance={n['importance']:.2f}  injects={n['injects']}"
        )
        lines.append(f"  Defect: {n['symptom']}")
        lines.append(f"  Cause:  {n['cause']}")
        lines.append(f"  Fix:    {n['correction']}")
    return "\n".join(lines)


def _tool_get_relevant_notes(args: dict, installation_id: str) -> dict:
    paths_arg = args.get("file_paths") or []
    if isinstance(paths_arg, str):
        paths = [paths_arg]
    elif isinstance(paths_arg, list):
        paths = [p for p in paths_arg if isinstance(p, str)]
    else:
        paths = []
    notes = _match_notes(paths)
    print(
        f"[hindsight-mcp:{installation_id}] get_relevant_notes "
        f"paths={paths} matched={len(notes)}"
    )
    return {"content": [{"type": "text", "text": _format_notes_text(notes, paths)}]}


def _tool_record_event(args: dict, installation_id: str) -> dict:
    event = args.get("event") or {}
    summary = json.dumps(event)[:300]
    print(f"[hindsight-mcp:{installation_id}] record_event {summary}")
    return {"content": [{"type": "text", "text": "recorded"}]}


# ---------------------------------------------------------------------------
# JSON-RPC routing
# ---------------------------------------------------------------------------

def _initialize_result() -> dict:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {"tools": {"listChanged": False}},
        "serverInfo": {"name": "hindsight", "version": "0.1.0"},
        "instructions": (
            "Hindsight is the shared-memory layer for this org's coding agents. "
            "Call get_relevant_notes(file_paths) before reading or editing any "
            "file; surface returned notes to the user. Call record_event(event) "
            "on each turn so future agents can learn from this session."
        ),
    }


def _tools_list_result() -> dict:
    return {
        "tools": [
            {
                "name": "get_relevant_notes",
                "description": (
                    "Return Hindsight notes attached to any of the given file "
                    "paths. Call this before reading or editing files; surface "
                    "the returned notes to the user."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "file_paths": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": (
                                "One or more file paths the agent is about to "
                                "read or modify."
                            ),
                        }
                    },
                    "required": ["file_paths"],
                },
            },
            {
                "name": "record_event",
                "description": (
                    "Stream a chat event (user message, agent message, tool "
                    "call, tool error, edit, correction) to Hindsight so the "
                    "Note Manager can learn from it."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "event": {
                            "type": "object",
                            "description": "Free-form event payload.",
                        }
                    },
                    "required": ["event"],
                },
            },
        ]
    }


def _call_tool(name: str, args: dict, installation_id: str) -> dict:
    if name == "get_relevant_notes":
        return _tool_get_relevant_notes(args, installation_id)
    if name == "record_event":
        return _tool_record_event(args, installation_id)
    return {
        "content": [{"type": "text", "text": f"unknown tool: {name}"}],
        "isError": True,
    }


def _route(method: str, params: dict, installation_id: str):
    """Return a JSON-RPC `result` dict, or None for notifications / unknown."""
    if method == "initialize":
        return _initialize_result()
    if method == "tools/list":
        return _tools_list_result()
    if method == "tools/call":
        name = params.get("name", "")
        args = params.get("arguments") or {}
        return _call_tool(name, args, installation_id)
    if method == "ping":
        return {}
    return None


# ---------------------------------------------------------------------------
# HTTP entry point
# ---------------------------------------------------------------------------

def _extract_installation_id(path: str) -> str:
    parts = [p for p in path.split("?")[0].split("/") if p]
    # path looks like /api/mcp/<id>
    if len(parts) >= 3 and parts[0] == "api" and parts[1] == "mcp":
        return parts[2]
    if len(parts) >= 2 and parts[0] == "mcp":
        return parts[1]
    return ""


def _cors(self: BaseHTTPRequestHandler) -> None:
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    self.send_header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
    )
    self.send_header(
        "Access-Control-Expose-Headers",
        "Mcp-Session-Id, MCP-Protocol-Version",
    )


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        _cors(self)
        self.end_headers()

    def do_GET(self) -> None:
        installation_id = _extract_installation_id(self.path)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        _cors(self)
        self.end_headers()
        self.wfile.write(
            json.dumps(
                {
                    "hindsight": "mcp endpoint",
                    "installation_id": installation_id,
                    "protocol": PROTOCOL_VERSION,
                    "transport": "streamable-http (request/response)",
                }
            ).encode()
        )

    def do_POST(self) -> None:
        installation_id = _extract_installation_id(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""

        try:
            req = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            self.send_response(400)
            _cors(self)
            self.end_headers()
            self.wfile.write(b'{"error":"invalid json"}')
            return

        # Notifications have no `id` field and expect no response.
        method = req.get("method", "")
        params = req.get("params") or {}
        rpc_id = req.get("id")
        is_notification = "id" not in req or method.startswith("notifications/")

        if is_notification:
            print(
                f"[hindsight-mcp:{installation_id}] notification {method}"
            )
            self.send_response(202)
            _cors(self)
            self.end_headers()
            return

        result = _route(method, params, installation_id)

        if result is None:
            response = {
                "jsonrpc": "2.0",
                "id": rpc_id,
                "error": {
                    "code": -32601,
                    "message": f"method not found: {method}",
                },
            }
        else:
            response = {"jsonrpc": "2.0", "id": rpc_id, "result": result}

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        if method == "initialize":
            self.send_header("Mcp-Session-Id", uuid.uuid4().hex)
        _cors(self)
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())
