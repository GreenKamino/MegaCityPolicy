#!/usr/bin/env bash
set -Eeuo pipefail

# This intentionally uses only POSIX shell tools. The freshness workflow does
# not install the Steam package dependencies, so the CI guard must not depend
# on a YAML package being present. The workflow shape is small and stable:
# extract the top-level `on` and `jobs.<id>` mappings by YAML indentation, then
# assert the event/job predicates that keep release coverage separate from the
# hosted freshness alert.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
WORKFLOW_PATH="${STEAM_CLOUD_WORKFLOW_PATH:-$REPO_ROOT/.github/workflows/steam-cloud-restore.yml}"

fail() {
  printf 'FAIL: Steam Cloud workflow separation: %s\n' "$1" >&2
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

schedule_count="$(grep -Fc '    - cron:' <<<"$on_block" || true)"
[[ "$schedule_count" == "2" ]] ||
  fail "expected exactly two weekly schedules, found $schedule_count"
grep -Fqx '    - cron: "0 3 * * 1"' <<<"$on_block" ||
  fail "the 03:00 packaged-restore schedule is missing"
grep -Fqx '    - cron: "0 4 * * 1"' <<<"$on_block" ||
  fail "the 04:00 freshness schedule is missing"

job_block() {
  local job_id="$1"
  awk -v heading="  ${job_id}:" '
    $0 == heading { inside = 1; print; next }
    inside && $0 ~ /^  [^[:space:]#][^:]*:/ { exit }
    inside { print }
  ' "$WORKFLOW_PATH"
}

packaged_restore="$(job_block packaged-cloud-restore)"
[[ -n "$packaged_restore" ]] ||
  fail "packaged-cloud-restore job is missing"
grep -Fqx "    if: github.event_name != 'schedule' || github.event.schedule == '0 3 * * 1'" \
  <<<"$packaged_restore" ||
  fail "packaged-cloud-restore is not limited to releases, manual dispatches, and 03:00"
grep -Fqx '    runs-on: [self-hosted, windows, x64, steam]' <<<"$packaged_restore" ||
  fail "packaged-cloud-restore lost its dedicated Windows Steam runner"

weekly_freshness="$(job_block weekly-cloud-freshness)"
[[ -n "$weekly_freshness" ]] ||
  fail "weekly-cloud-freshness job is missing"
grep -Fqx "    if: github.event_name == 'schedule' && github.event.schedule == '0 4 * * 1'" \
  <<<"$weekly_freshness" ||
  fail "weekly-cloud-freshness is not limited to the 04:00 schedule"
grep -Fqx '    runs-on: ubuntu-latest' <<<"$weekly_freshness" ||
  fail "weekly-cloud-freshness is not hosted-runner-only"
if grep -Eq '^[[:space:]]+needs:' <<<"$weekly_freshness"; then
  fail "weekly-cloud-freshness waits on another job"
fi

printf 'PASS: Steam Cloud release, restore, and freshness paths remain separated.\n'