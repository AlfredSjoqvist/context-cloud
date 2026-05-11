#!/usr/bin/env bash
# Orchestrator. Runs every eval in evals/. Exits nonzero if any fails.
# Pure stdlib python; no pytest required.

set -u
cd "$(dirname "$0")/.."

# Clear stale bytecode so source mutations during self-tests are always seen.
find . -path ./node_modules -prune -o -name "__pycache__" -type d -print 2>/dev/null \
  | grep -v node_modules \
  | xargs rm -rf 2>/dev/null || true

PASS=0
FAIL=0
FAILED_NAMES=()

run_one() {
  local script="$1"
  local name
  name="$(basename "$script")"
  echo "── $name ──────────────────────────────────────────"
  if python3 "$script" -v; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("$name")
  fi
  echo
}

for script in evals/test_*.py; do
  [ -f "$script" ] || continue
  run_one "$script"
done

echo "════════════════════════════════════════════════════"
echo "evals: passed=$PASS  failed=$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "FAILED:"
  for n in "${FAILED_NAMES[@]}"; do
    echo "  - $n"
  done
  exit 1
fi
exit 0
