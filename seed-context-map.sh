#!/usr/bin/env bash
# seed-context-map.sh — mirror the canonical .context-map/library/ into
# every sub-org under mock_org/ that has a src/ directory. Run after
# editing any seed leaf so Guardian (which reads from
# <DEMO_REPO_LOCAL_PATH>/.context-map/library/) sees the latest content.
#
# Usage:
#   bash seed-context-map.sh                # mirror to all sub-orgs
#   bash seed-context-map.sh agent-gateway  # mirror to one sub-org
#
# Idempotent. Run anytime.

set -euo pipefail
cd "$(dirname "$0")"

CANONICAL=".context-map/library"
if [ ! -d "$CANONICAL" ]; then
  echo "error: $CANONICAL does not exist" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  TARGETS=("$@")
else
  TARGETS=()
  for d in mock_org/*/; do
    sub="$(basename "$d")"
    [ -d "${d}src" ] && TARGETS+=("$sub")
  done
fi

if [ ${#TARGETS[@]} -eq 0 ]; then
  echo "no sub-orgs with src/ found under mock_org/" >&2
  exit 1
fi

for sub in "${TARGETS[@]}"; do
  dest="mock_org/${sub}/.context-map"
  mkdir -p "$dest"
  rm -rf "${dest}/library"
  cp -R "$CANONICAL" "${dest}/library"
  echo "mirrored → ${dest}/library"
done

echo
echo "verify with: bash evals/run_all.sh"
