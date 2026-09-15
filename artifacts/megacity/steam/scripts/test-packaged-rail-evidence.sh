#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_SCRIPT="$SCRIPT_DIR/verify-packaged-rail-evidence.mjs"
WORKFLOW_PATH="$SCRIPT_DIR/../../../../.github/workflows/steam-profile-tmp-cleanup.yml"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

[[ -f "$WORKFLOW_PATH" ]] || {
  printf 'FAIL: packaged rail-module workflow not found at %s\n' "$WORKFLOW_PATH" >&2
  exit 1
}
grep -Fq "name: Validate packaged rail-module release evidence" "$WORKFLOW_PATH" ||
  { printf 'FAIL: packaged rail-module workflow has no release evidence guard\n' >&2; exit 1; }
grep -Fq "MEGACITY_EXPECTED_COMMIT: \${{ github.sha }}" "$WORKFLOW_PATH" ||
  { printf 'FAIL: packaged rail-module workflow does not pass the tested commit\n' >&2; exit 1; }

write_evidence() {
  local path="$1"
  local commit="$2"
  local result="$3"
  local saves="$4"
  local profile="$5"
  cat > "$path" <<JSON
{
  "schemaVersion": 1,
  "test": "packaged-rail-modules",
  "status": "$result",
  "runnerResult": "$result",
  "testedCommit": "$commit",
  "runner": {"os": "windows", "architecture": "x64"},
  "normalSteamSavesUntouched": $saves,
  "temporaryProfileRemoved": $profile,
  "logCaptured": true
}
JSON
}

run_case() {
  local name="$1"
  local expected_exit="$2"
  local evidence_path="$3"
  local output
  local actual_exit

  set +e
  output="$(
    MEGACITY_PACKAGED_RAIL_EVIDENCE_PATH="$evidence_path" \
      MEGACITY_EXPECTED_COMMIT="commit-good" \
      node "$VERIFY_SCRIPT" 2>&1
  )"
  actual_exit=$?
  set -e

  if [[ "$actual_exit" -ne "$expected_exit" ]]; then
    printf 'FAIL: %s exited %s, expected %s\n%s\n' "$name" "$actual_exit" "$expected_exit" "$output" >&2
    exit 1
  fi
  printf 'PASS: %-8s -> exit %s\n' "$name" "$actual_exit"
}

pass_path="$TEMP_DIR/pass.json"
write_evidence "$pass_path" "commit-good" "passed" true true
run_case pass 0 "$pass_path"

stale_path="$TEMP_DIR/stale.json"
write_evidence "$stale_path" "commit-old" "passed" true true
run_case stale 1 "$stale_path"

failed_path="$TEMP_DIR/failed.json"
write_evidence "$failed_path" "commit-good" "failed" true true
run_case failed 1 "$failed_path"

unsafe_path="$TEMP_DIR/unsafe.json"
write_evidence "$unsafe_path" "commit-good" "passed" false true
run_case unsafe 1 "$unsafe_path"

run_case missing 1 "$TEMP_DIR/missing.json"

echo "Packaged rail-module evidence fixture checks passed."