"""Hindsight MCP server — HTTP transport, Convex-backed.

Mounted at  /api/mcp/<installation_id>.

The installation_id in the URL path is the org binding: every call is
implicitly scoped to whichever GitHub App installation owns that id.

All reads (get_relevant_notes) go to Convex via the query API. All writes
(record_event) go to Convex via the http.ts /sync/* endpoints. Each
get_relevant_notes call also logs a synthetic injection so the dashboard's
activity feed updates in real time.

MCP methods implemented:
  - initialize / notifications/initialized / ping
  - tools/list
  - tools/call

Tools:
  - get_relevant_notes(file_paths) -> notes from Convex notes:graphSnapshot
  - record_event(event)            -> /sync/session upsert
"""

import json
import os
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

import requests


PROTOCOL_VERSION = "2024-11-05"

CONVEX_URL = os.environ.get(
    "CONVEX_URL", "https://colorless-porcupine-926.convex.cloud"
)
CONVEX_SITE_URL = os.environ.get(
    "CONVEX_SITE_URL", "https://colorless-porcupine-926.convex.site"
)
NM_SYNC_TOKEN = os.environ.get("NM_SYNC_TOKEN", "")


# ---------------------------------------------------------------------------
# Convex helpers
# ---------------------------------------------------------------------------

def _convex_query(path: str, args: dict) -> object:
    """Call a Convex query function. Returns parsed value, or None on error."""
    try:
        r = requests.post(
            f"{CONVEX_URL}/api/query",
            json={"path": path, "args": args, "format": "json"},
            timeout=8,
        )
        if r.status_code != 200:
            print(f"[mcp] convex query {path} -> {r.status_code} {r.text[:200]}")
            return None
        body = r.json()
        if body.get("status") != "success":
            print(f"[mcp] convex query {path} not ok: {body}")
            return None
        return body.get("value")
    except Exception as e:
        print(f"[mcp] convex query {path} exception: {e}")
        return None


def _convex_post(route: str, body: dict) -> bool:
    """POST to a Convex http.ts /sync/* route. Returns True on 200."""
    try:
        headers = {"Content-Type": "application/json"}
        if NM_SYNC_TOKEN:
            headers["X-NM-TOKEN"] = NM_SYNC_TOKEN
        r = requests.post(
            f"{CONVEX_SITE_URL}{route}",
            json=body,
            headers=headers,
            timeout=8,
        )
        if r.status_code != 200:
            print(f"[mcp] convex POST {route} -> {r.status_code} {r.text[:200]}")
            return False
        return True
    except Exception as e:
        print(f"[mcp] convex POST {route} exception: {e}")
        return False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Note matching
# ---------------------------------------------------------------------------

def _normalize_path(p: str) -> str:
    return (p or "").replace("\\", "/").lower()


def _basename(p: str) -> str:
    return _normalize_path(p).rsplit("/", 1)[-1]


def _match_notes_from_graph(graph: dict, requested_paths: list[str]) -> list[dict]:
    """Filter notes whose edges match any requested path (full or basename)."""
    if not graph or not isinstance(graph, dict):
        return []
    notes = graph.get("notes") or []
    edges = graph.get("edges") or []

    note_by_id: dict[str, dict] = {}
    for n in notes:
        nid = n.get("noteId")
        if nid and not n.get("invalidatedAt"):
            note_by_id[nid] = n

    requested_norm = {_normalize_path(p) for p in requested_paths if p}
    requested_base = {_basename(p) for p in requested_paths if p}

    edge_weight: dict[str, float] = {}
    for e in edges:
        ep = _normalize_path(e.get("path") or "")
        if not ep:
            continue
        if ep in requested_norm or _basename(ep) in requested_base:
            nid = e.get("noteId")
            if nid in note_by_id:
                w = float(e.get("weight") or 0.0)
                if w > edge_weight.get(nid, -1.0):
                    edge_weight[nid] = w

    matched = []
    for nid, w in edge_weight.items():
        n = note_by_id[nid]
        score = (n.get("importance") or 0.0) * (w if w > 0 else 0.5)
        matched.append((score, w, n))
    matched.sort(key=lambda t: t[0], reverse=True)
    return [{"_edge_weight": w, **n} for _, w, n in matched]


def _format_notes_text(notes: list[dict], paths: list[str]) -> str:
    if not notes:
        return f"No Hindsight notes attached to: {', '.join(paths) or '(no paths)'}"
    lines = [f"Hindsight injected {len(notes)} note(s) for {', '.join(paths)}:"]
    for n in notes:
        nid = n.get("noteId", "?")
        importance = float(n.get("importance") or 0.0)
        injects = int(n.get("injectCount") or 0)
        edge_w = float(n.get("_edge_weight") or 0.0)
        lines.append("")
        lines.append(
            f"[{nid}]  importance={importance:.2f}  injects={injects}  edge={edge_w:.2f}"
        )
        lines.append(f"  Defect: {n.get('symptom', '')}")
        lines.append(f"  Cause:  {n.get('rootCause', '')}")
        if n.get("correction"):
            lines.append(f"  Fix:    {n['correction']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _tool_get_relevant_notes(args: dict, installation_id: str) -> dict:
    paths_arg = args.get("file_paths") or []
    if isinstance(paths_arg, str):
        paths = [paths_arg]
    elif isinstance(paths_arg, list):
        paths = [p for p in paths_arg if isinstance(p, str)]
    else:
        paths = []

    graph = _convex_query("notes:graphSnapshot", {})
    notes = _match_notes_from_graph(graph or {}, paths)[:5]

    print(
        f"[hindsight-mcp:{installation_id}] get_relevant_notes "
        f"paths={paths} matched={len(notes)}"
    )

    # Side effect — log each match as an injection so the dashboard's
    # activity feed updates live. Best-effort; never blocks the tool result.
    # Body shape constrained to recordInjection's validator (no rich fields).
    now_iso = _now_iso()
    for n in notes:
        primary_path = paths[0] if paths else None
        _convex_post(
            "/sync/injection",
            {
                "ts": now_iso,
                "sessionId": f"mcp-{installation_id}",
                "path": primary_path,
                "toolName": "Claude Code (hosted MCP)",
                "noteId": n.get("noteId"),
                "accepted": True,
            },
        )

    return {
        "content": [{"type": "text", "text": _format_notes_text(notes, paths)}]
    }


def _tool_record_event(args: dict, installation_id: str) -> dict:
    event = args.get("event") or {}
    summary = json.dumps(event)[:300]
    print(f"[hindsight-mcp:{installation_id}] record_event {summary}")

    session_id = (
        event.get("session_id")
        or event.get("sessionId")
        or f"mcp-{installation_id}"
    )
    cwd = event.get("cwd") or event.get("project_root") or ""
    _convex_post(
        "/sync/session",
        {
            "sessionId": session_id,
            "agentVendor": event.get("agent") or "Claude Code (hosted MCP)",
            "cwd": cwd,
            "projectRoot": event.get("project_root") or cwd,
            "startedAt": event.get("started_at") or _now_iso(),
            "lastSeenAt": _now_iso(),
            "messageCount": event.get("message_count") or 1,
        },
    )
    return {"content": [{"type": "text", "text": "recorded"}]}


# ---------------------------------------------------------------------------
# JSON-RPC routing
# ---------------------------------------------------------------------------

def _initialize_result() -> dict:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {"tools": {"listChanged": False}},
        "serverInfo": {"name": "hindsight", "version": "0.2.0"},
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
                    "convex": CONVEX_URL,
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
