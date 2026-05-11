#!/usr/bin/env bash
# One-command Claude Code setup for the Hindsight MCP server + NM hooks.
#
# Usage (from anywhere; resolves the script's own location):
#   bash mcp-server/scripts/setup-claude-code.sh [--user|--project] [--convex-url <url>]
#
# Defaults:
#   - scope: --project (writes to ./.claude/settings.json + ./.mcp.json)
#   - convex-url: unused (server falls back to its default demo URL with a loud warn)
#
# What it does:
#   1. cd into mcp-server/
#   2. npm install if node_modules is missing
#   3. npm run build
#   4. node dist/install.js --editor claude-code(-project) --with-hooks --with-nm [--convex-url]
#   5. Echoes the next step.
#
# Idempotent. Re-runnable without rolling forward anything you didn't ask for.

set -euo pipefail

SCOPE="claude-code-project"
CONVEX_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user) SCOPE="claude-code"; shift ;;
    --project) SCOPE="claude-code-project"; shift ;;
    --convex-url) CONVEX_URL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^set -e/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$SERVER_DIR"

if [[ ! -d node_modules ]]; then
  echo ">> npm install"
  npm install
fi

echo ">> npm run build"
npm run build

INSTALL_ARGS=(--editor "$SCOPE" --with-hooks --with-nm)
if [[ -n "$CONVEX_URL" ]]; then
  INSTALL_ARGS+=(--convex-url "$CONVEX_URL")
fi

echo ">> node dist/install.js ${INSTALL_ARGS[*]}"
node dist/install.js "${INSTALL_ARGS[@]}"

echo ""
echo "Done. Restart Claude Code so it picks up the new MCP server + hooks."
