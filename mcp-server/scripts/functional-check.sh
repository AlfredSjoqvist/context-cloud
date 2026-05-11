#!/usr/bin/env bash
# Functional check — exercises every user-facing surface of the integration end to end.
# Run from the repo root or anywhere; this script resolves its own location.
#
# Steps:
#   1. Build mcp-server (verifies tsc + chmod are healthy).
#   2. Run unit + e2e tests.
#   3. Boot the server, send initialize + tools/list + resources/list, assert shapes.
#   4. Call get_status against the deployment (if HINDSIGHT_CONVEX_URL set).
#   5. Install CLI smoke: --print for every editor variant.
#   6. Install → uninstall round-trip in a temp dir; assert no leftover files.
#   7. Verify CLI smoke (if HINDSIGHT_CONVEX_URL set).
#   8. Python hook scripts (nm_capture.py / nm_inject.py) accept realistic payloads.
#
# Exits non-zero on any failure. Each step prints a one-line PASS/FAIL.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SERVER_DIR/.." && pwd)"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

cd "$SERVER_DIR"

echo "--- 1. build ---"
npm run build > /tmp/fchk-build.log 2>&1 || { cat /tmp/fchk-build.log; fail "build"; }
[ -x dist/index.js ] && [ -x dist/install.js ] && [ -x dist/verify.js ] || fail "dist/*.js missing exec bit"
pass "build + chmod"

echo "--- 2. tests ---"
npm test > /tmp/fchk-test.log 2>&1 || { cat /tmp/fchk-test.log; fail "tests"; }
grep -q "Tests  *[0-9]\+ passed" /tmp/fchk-test.log || fail "test summary not found"
pass "tests ($(grep -oE 'Tests  [0-9]+ passed' /tmp/fchk-test.log | head -1))"

echo "--- 3. server boot + initialize + tools/list + resources/list ---"
HINDSIGHT_LOG=off node -e '
  const { spawn } = require("child_process");
  const p = spawn("node", ["dist/index.js"]);
  let out = "";
  p.stdout.on("data", d => out += d.toString());
  function send(id, method, params={}) { p.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n"); }
  send(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "fchk", version: "0" } });
  setTimeout(() => send(2, "tools/list"), 100);
  setTimeout(() => send(3, "resources/list"), 200);
  setTimeout(() => {
    p.kill();
    const lines = out.split("\n").filter(Boolean).map(l => JSON.parse(l));
    const init = lines.find(l => l.id === 1);
    const tools = lines.find(l => l.id === 2);
    const resources = lines.find(l => l.id === 3);
    if (init?.result?.serverInfo?.name !== "hindsight") { console.error("init bad"); process.exit(1); }
    if ((tools?.result?.tools ?? []).length !== 5) { console.error("expected 5 tools"); process.exit(1); }
    if ((resources?.result?.resources ?? []).length !== 8) { console.error("expected 8 resources"); process.exit(1); }
    console.log("ok");
    process.exit(0);
  }, 1000);
' > /tmp/fchk-mcp.log 2>&1 || { cat /tmp/fchk-mcp.log; fail "server protocol"; }
pass "server protocol (1 server, 5 tools, 8 resources)"

if [ -n "${HINDSIGHT_CONVEX_URL:-}" ]; then
  echo "--- 4. live get_status ---"
  HINDSIGHT_LOG=off node -e '
    const { spawn } = require("child_process");
    const p = spawn("node", ["dist/index.js"]);
    let out = "";
    p.stdout.on("data", d => out += d.toString());
    p.stdin.write(JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"x",version:"0"}}})+"\n");
    setTimeout(() => p.stdin.write(JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"get_status",arguments:{}}})+"\n"), 100);
    setTimeout(() => {
      p.kill();
      const r = JSON.parse(out.split("\n").filter(Boolean).find(l => JSON.parse(l).id === 2));
      if (r.result?.isError) { console.error(r.result.content[0].text); process.exit(1); }
      const t = r.result.content[0].text;
      if (!t.startsWith("hindsight-mcp v")) { console.error("bad output", t); process.exit(1); }
      console.log("ok");
      process.exit(0);
    }, 10000);
  ' > /tmp/fchk-live.log 2>&1 || { cat /tmp/fchk-live.log; fail "live get_status"; }
  pass "live get_status against $HINDSIGHT_CONVEX_URL"
else
  echo "SKIP: 4. live get_status (set HINDSIGHT_CONVEX_URL to enable)"
fi

echo "--- 5. install CLI --print for every editor ---"
for editor in cursor claude-code-project codex; do
  node dist/install.js --editor "$editor" --print --convex-url https://x.convex.cloud > /tmp/fchk-print-$editor.log 2>&1 \
    || { cat /tmp/fchk-print-$editor.log; fail "install --print $editor"; }
done
pass "install --print for 3 editors"

echo "--- 6. install → uninstall round-trip ---"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
( cd "$TMP" && node "$SERVER_DIR/dist/install.js" --editor claude-code-project --with-hooks --convex-url https://x.convex.cloud > /dev/null )
[ -f "$TMP/.mcp.json" ] || fail "install didn't create .mcp.json"
[ -f "$TMP/.claude/settings.json" ] || fail "install didn't create .claude/settings.json"
( cd "$TMP" && node "$SERVER_DIR/dist/install.js" --editor claude-code-project --with-hooks --uninstall > /dev/null )
[ ! -f "$TMP/.mcp.json" ] || fail "uninstall didn't delete .mcp.json"
[ ! -d "$TMP/.claude" ] || fail "uninstall didn't delete .claude/"
pass "install → uninstall round-trip (no leftovers)"

if [ -n "${HINDSIGHT_CONVEX_URL:-}" ]; then
  echo "--- 7. verify CLI ---"
  node dist/verify.js --json > /tmp/fchk-verify.log 2>&1 || { cat /tmp/fchk-verify.log; fail "verify"; }
  grep -q '"failed": 0' /tmp/fchk-verify.log || { cat /tmp/fchk-verify.log; fail "verify reported failures"; }
  pass "verify CLI (4/4 checks green)"
else
  echo "SKIP: 7. verify CLI (set HINDSIGHT_CONVEX_URL to enable)"
fi

echo "--- 8. Python hook scripts ---"
cd "$REPO_ROOT"
if [ -f nm_capture.py ] && [ -f nm_inject.py ]; then
  echo '{"transcript_path":"/tmp/x.jsonl"}' | python3 nm_capture.py 2>/dev/null
  cap=$?
  echo '{"transcript_path":"/tmp/x.jsonl","tool_input":{"file_path":"agent/main.ts"}}' | python3 nm_inject.py 2>/dev/null
  inj=$?
  [ "$cap" = "0" ] && [ "$inj" = "0" ] || fail "Python hooks exited non-zero (capture=$cap inject=$inj)"
  pass "Python hooks (nm_capture.py, nm_inject.py) run cleanly"
else
  echo "SKIP: 8. Python hooks (nm_capture.py / nm_inject.py not in $REPO_ROOT)"
fi

echo ""
echo "========================================"
echo "All checks passed."
