#!/usr/bin/env bash
# scripts/verify.sh — cross-language acceptance gate.
#
# Boots the Node mock server on a free port, runs every language's test suite
# against it, and prints a pass/fail matrix. Non-zero exit if any language fails.
#
# Usage: ./scripts/verify.sh
#
# Each per-language suite already starts its own mock server instance (each
# picks a free port), so we don't need a single shared server here — running
# them sequentially is both simpler and isolates each suite's fixture state.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

declare -a LANGS=(mock js ts python go ruby rust)
declare -A RESULT
declare -A DURATION

run_suite() {
  local name="$1"
  shift
  echo
  echo "───── $name ─────"
  local start end
  start=$(date +%s)
  if "$@"; then
    RESULT[$name]="PASS"
  else
    RESULT[$name]="FAIL"
  fi
  end=$(date +%s)
  DURATION[$name]=$((end - start))
}

run_suite mock   bash -c "node --test test/*.test.js"
run_suite js     bash -c "cd js && node --test test/*.test.js"
run_suite ts     bash -c "cd ts && node --test --experimental-strip-types --disable-warning=ExperimentalWarning test/*.test.ts"
run_suite python bash -c "cd python && python3 -m unittest tests.test_client"
run_suite go     bash -c "cd go && go test ./..."
run_suite ruby   bash -c "cd ruby && ruby -Ilib -Itest test/test_client.rb"
run_suite rust   bash -c "cd rust && cargo test --quiet"

echo
echo "===== summary ====="
overall=0
for lang in "${LANGS[@]}"; do
  printf "  %-6s  %-4s  (%ds)\n" "$lang" "${RESULT[$lang]:-MISS}" "${DURATION[$lang]:-0}"
  [[ "${RESULT[$lang]}" != "PASS" ]] && overall=1
done

echo
if [[ $overall -eq 0 ]]; then
  echo "✓ all six suites pass"
else
  echo "✗ some suites failed"
fi
exit $overall
