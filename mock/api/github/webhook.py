"""Hindsight GitHub App webhook handler.

Receives webhook deliveries from GitHub, verifies the X-Hub-Signature-256
header against GITHUB_WEBHOOK_SECRET, and dispatches by event type.

Active behaviors:
  - pull_request.opened/synchronize/reopened
        -> fetch changed files
        -> match against DEMO_NOTES below
        -> post a single PR comment listing the relevant notes

Stubbed (logs + 200 OK):
  - installation.*
  - installation_repositories.*
  - issues.*
  - issue_comment.*
  - pull_request_review*
  - push
"""

import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler

import jwt as pyjwt
import requests


GITHUB_API = "https://api.github.com"

WEBHOOK_SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET", "")
APP_ID = os.environ.get("GITHUB_APP_ID", "")
# Vercel sometimes turns real linebreaks into the literal string "\n"; normalize.
PRIVATE_KEY = os.environ.get("GITHUB_PRIVATE_KEY", "").replace("\\n", "\n")


# DEMO_NOTES: maps a path-suffix to a list of notes that should fire on it.
# Replace with real DB lookup once Convex is wired up.
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
# Signature verification
# ---------------------------------------------------------------------------

def _verify_signature(payload: bytes, signature_header: str | None) -> bool:
    if not signature_header or not WEBHOOK_SECRET:
        return False
    if not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    received = signature_header[len("sha256="):]
    return hmac.compare_digest(expected, received)


# ---------------------------------------------------------------------------
# GitHub App auth — JWT -> installation access token
# ---------------------------------------------------------------------------

def _app_jwt() -> str:
    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + 540, "iss": APP_ID}
    return pyjwt.encode(payload, PRIVATE_KEY, algorithm="RS256")


def _installation_token(installation_id: int) -> str:
    url = f"{GITHUB_API}/app/installations/{installation_id}/access_tokens"
    headers = {
        "Authorization": f"Bearer {_app_jwt()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    resp = requests.post(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()["token"]


# ---------------------------------------------------------------------------
# Note matching + comment formatting
# ---------------------------------------------------------------------------

def _match_notes(file_paths: list[str]) -> list[tuple[str, dict]]:
    matches: list[tuple[str, dict]] = []
    for path in file_paths:
        lower = path.lower()
        for suffix, notes in DEMO_NOTES.items():
            if lower.endswith(suffix.lower()):
                for note in notes:
                    matches.append((path, note))
    return matches


def _format_comment(matches: list[tuple[str, dict]]) -> str:
    lines = [
        "**Hindsight** found notes from prior sessions relevant to this PR:",
        "",
    ]
    for path, note in matches:
        lines.append(
            f"### `{path}` — `{note['id']}`  "
            f"(importance {note['importance']:.2f}, {note['injects']} injects)"
        )
        lines.append(f"**Defect:** {note['symptom']}")
        lines.append(f"**Cause:** {note['cause']}")
        lines.append(f"**Fix:** {note['correction']}")
        lines.append("")
    lines.append("---")
    lines.append(
        "_Captured from this org's coding sessions. "
        "[Open the Hindsight dashboard](https://hindsight-nm.vercel.app)_"
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Per-event handlers
# ---------------------------------------------------------------------------

def _handle_pull_request(body: dict) -> dict:
    action = body.get("action", "")
    if action not in ("opened", "synchronize", "reopened"):
        return {"routed": "pull_request", "action": action, "skipped": True}

    pr = body.get("pull_request", {}) or {}
    repo = body.get("repository", {}) or {}
    installation = body.get("installation", {}) or {}
    installation_id = installation.get("id")
    owner = (repo.get("owner") or {}).get("login")
    name = repo.get("name")
    number = pr.get("number")

    if not (installation_id and owner and name and number):
        return {"routed": "pull_request", "error": "missing payload fields"}

    try:
        token = _installation_token(installation_id)
    except Exception as e:
        return {"routed": "pull_request", "error": f"token: {e}"}

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    files_url = f"{GITHUB_API}/repos/{owner}/{name}/pulls/{number}/files"
    fr = requests.get(files_url, headers=headers, timeout=15)
    if fr.status_code != 200:
        return {"routed": "pull_request", "error": f"files: {fr.status_code}"}

    changed = [f.get("filename", "") for f in fr.json()]
    matches = _match_notes(changed)

    if not matches:
        return {
            "routed": "pull_request",
            "action": action,
            "matched_notes": 0,
            "files_changed": len(changed),
        }

    comment_url = f"{GITHUB_API}/repos/{owner}/{name}/issues/{number}/comments"
    body_md = _format_comment(matches)
    cr = requests.post(comment_url, headers=headers, json={"body": body_md}, timeout=15)
    if cr.status_code not in (200, 201):
        return {
            "routed": "pull_request",
            "error": f"comment: {cr.status_code} {cr.text[:200]}",
        }

    return {
        "routed": "pull_request",
        "action": action,
        "matched_notes": len(matches),
        "comment_id": cr.json().get("id"),
    }


def _handle(event: str, action: str, body: dict, delivery: str) -> dict:
    if event == "pull_request":
        return _handle_pull_request(body)

    if event == "installation":
        # TODO: action=created -> create org row, mint token, commit .mcp.json
        return {
            "routed": "installation",
            "action": action,
            "installation_id": (body.get("installation") or {}).get("id"),
        }

    if event == "installation_repositories":
        return {"routed": "installation_repositories", "action": action}

    if event in ("pull_request_review", "pull_request_review_comment"):
        # TODO: capture reviewer text as note signal.
        return {"routed": event, "action": action}

    if event == "issue_comment":
        return {"routed": "issue_comment", "action": action}

    if event == "issues":
        return {"routed": "issues", "action": action}

    if event == "push":
        return {"routed": "push"}

    if event == "ping":
        return {"routed": "ping"}

    return {"routed": "unhandled", "event": event}


# ---------------------------------------------------------------------------
# HTTP entry point
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        payload = self.rfile.read(length) if length else b""
        sig = self.headers.get("X-Hub-Signature-256")

        if not _verify_signature(payload, sig):
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"invalid signature"}')
            return

        event = self.headers.get("X-GitHub-Event") or "ping"
        delivery = self.headers.get("X-GitHub-Delivery") or ""

        try:
            body = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            body = {}

        action = body.get("action") or ""
        print(f"[hindsight-webhook] delivery={delivery} event={event} action={action}")

        result = _handle(event, action, body, delivery)
        result["ok"] = True

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

    def do_GET(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"hindsight":"webhook online"}')
