#!/usr/bin/env bash
set -Eeuo pipefail

# Keep the release-only utility parity job and its hosted freshness alert
# independent. This contract is intentionally dependency-free so it can run
# before installing the Steam package.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
WORKFLOW_PATH="${UTILITY_PARITY_WORKFLOW_PATH:-$REPO_ROOT/.github/workflows/steam-profile-tmp-cleanup.yml}"

fail() {
  printf 'FAIL: Windows utility parity workflow separation: %s\n' "$1" >&2
  exit 1
}

[[ -f "$WORKFLOW_PATH" ]] || fail "workflow not found at $WORKFLOW_PATH"

on_block="$(
  awk '
    $0 == "on:" { inside = 1; next }
    inside && $0 ~ /^[^[:space:]#]/ { exit }
    inside { print }
  ' "$WORKFLOW_PATH"
)"

[[ -n "$on_block" ]] || fail "could not parse the top-level on mapping"
grep -Fqx '  workflow_dispatch:' <<<"$on_block" ||
  fail "workflow_dispatch is not declared"
grep -Fqx '  release:' <<<"$on_block" ||
  fail "release is not declared"
grep -Fqx '    types: [published]' <<<"$on_block" ||
  fail "release is not limited to published releases"
grep -Fqx '    - cron: "30 3 * * 1"' <<<"$on_block" ||
  fail "the 03:30 packaged utility parity schedule is missing"
grep -Fqx '    - cron: "30 4 * * 1"' <<<"$on_block" ||
  fail "the 04:30 freshness schedule is missing"
grep -Fq 'group: windows-profile-slot-cleanup-${{ github.event_name == '\''schedule'\'' && github.event.schedule || '\''release'\'' }}' \
  "$WORKFLOW_PATH" ||
  fail "scheduled freshness and Windows runs share a concurrency group"

job_block() {
  local job_id="$1"
  awk -v heading="  ${job_id}:" '
    $0 == heading { inside = 1; print; next }
    inside && $0 ~ /^  [^[:space:]#][^:]*:/ { exit }
    inside { print }
  ' "$WORKFLOW_PATH"
}

packaged_job="$(job_block packaged-profile-tmp-cleanup)"
[[ -n "$packaged_job" ]] || fail "packaged-profile-tmp-cleanup job is missing"
grep -Fqx "    if: github.event_name != 'schedule' || github.event.schedule == '30 3 * * 1'" \
  <<<"$packaged_job" ||
  fail "packaged-profile-tmp-cleanup is not limited to releases, manual dispatches, and 03:30"
grep -Fqx '    runs-on: [self-hosted, windows, x64, steam]' <<<"$packaged_job" ||
  fail "packaged-profile-tmp-cleanup lost its dedicated Windows Steam runner"

freshness_job="$(job_block weekly-utility-parity-freshness)"
[[ -n "$freshness_job" ]] ||
  fail "weekly-utility-parity-freshness job is missing"
grep -Fqx "    if: github.event_name == 'schedule' && github.event.schedule == '30 4 * * 1'" \
  <<<"$freshness_job" ||
  fail "weekly-utility-parity-freshness is not limited to the 04:30 schedule"
grep -Fqx '    runs-on: ubuntu-latest' <<<"$freshness_job" ||
  fail "weekly-utility-parity-freshness is not hosted-runner-only"
if grep -Eq '^[[:space:]]+needs:' <<<"$freshness_job"; then
  fail "weekly-utility-parity-freshness waits on another job"
fi

printf 'PASS: Windows utility parity release and freshness paths remain separated.\n'