#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_SCRIPT="$SCRIPT_DIR/check-cloud-freshness.sh"
WORKFLOW_ASSERT_SCRIPT="$SCRIPT_DIR/assert-cloud-workflow-separation.sh"
TEMP_DIR="$(mktemp -d)"
MOCK_BIN="$TEMP_DIR/bin"
mkdir -p "$MOCK_BIN"
trap 'rm -rf "$TEMP_DIR"' EXIT

bash "$WORKFLOW_ASSERT_SCRIPT"

cat > "$MOCK_BIN/gh" <<'MOCK_GH'
#!/usr/bin/env bash
set -euo pipefail

url=""
for argument in "$@"; do
  if [[ "$argument" == repos/* ]]; then
    url="$argument"
    break
  fi
done

scenario="${FRESHNESS_FIXTURE:?FRESHNESS_FIXTURE is required}"

if [[ "$url" == repos/*/actions/workflows/*/runs\?* ]]; then
  latest_status=completed
  if [[ "$scenario" == "queued" ]]; then
    latest_status=queued
  elif [[ "$scenario" == "in_progress" ]]; then
    latest_status=in_progress
  fi
  case "$scenario" in
    queued|in_progress|failed|recent|expired)
      printf '%b\n' \
        '101\t2024-01-08T04:00:00Z\t'"$latest_status" \
        '100\t2024-01-01T04:00:00Z\tcompleted'
      ;;
    *)
      printf 'unknown fixture: %s\n' "$scenario" >&2
      exit 2
      ;;
  esac
  exit 0
fi

if [[ "$url" == repos/*/actions/runs/*/jobs\?* ]]; then
  run_id="${url#*/actions/runs/}"
  run_id="${run_id%%/*}"
  case "$scenario:$run_id" in
    queued:101)
      # No job record: the self-hosted runner has not accepted the job.
      ;;
    queued:100|failed:100)
      printf '%b\n' 'completed\tsuccess\t2023-12-01T03:00:00Z\t2023-12-01T03:05:00Z'
      ;;
    in_progress:100)
      printf '%b\n' 'completed\tsuccess\t2023-10-01T03:00:00Z\t2023-10-01T03:05:00Z'
      ;;
    in_progress:101)
      printf '%b\n' 'in_progress\t\t\t'
      ;;
    failed:101)
      printf '%b\n' 'completed\tfailure\t2024-01-08T04:01:00Z\t2024-01-08T04:02:00Z'
      ;;
    recent:101)
      printf '%b\n' 'completed\tsuccess\t2024-01-08T04:01:00Z\t2024-01-08T04:02:00Z'
      ;;
    expired:101)
      printf '%b\n' 'completed\tsuccess\t2022-01-08T04:01:00Z\t2022-01-08T04:02:00Z'
      ;;
    recent:100|expired:100)
      ;;
    *)
      printf 'unknown fixture run: %s:%s\n' "$scenario" "$run_id" >&2
      exit 2
      ;;
  esac
  exit 0
fi

printf 'unexpected gh API request: %s\n' "$url" >&2
exit 2
MOCK_GH
chmod +x "$MOCK_BIN/gh"

run_case() {
  local scenario="$1"
  local expected_exit="$2"
  local expected_state="$3"
  local summary="$TEMP_DIR/${scenario}.summary"
  local output
  local actual_exit

  : > "$summary"
  set +e
  output="$(
    PATH="$MOCK_BIN:$PATH" \
      GH_TOKEN=fixture-token \
      REPOSITORY=example/megacity \
      WORKFLOW_FILE=steam-cloud-restore.yml \
      CURRENT_RUN_ID=999 \
      GITHUB_STEP_SUMMARY="$summary" \
      FRESHNESS_CUTOFF_EPOCH=1700000000 \
      FRESHNESS_FIXTURE="$scenario" \
      bash "$CHECK_SCRIPT" 2>&1
  )"
  actual_exit=$?
  set -e

  if [[ "$actual_exit" -ne "$expected_exit" ]]; then
    printf 'FAIL: %s exited %s, expected %s\n%s\n' "$scenario" "$actual_exit" "$expected_exit" "$output" >&2
    exit 1
  fi

  if ! printf '%s\n%s\n' "$output" "$(cat "$summary")" | grep -Fq "$expected_state"; then
    printf 'FAIL: %s did not emit %s\n%s\n' "$scenario" "$expected_state" "$output" >&2
    cat "$summary" >&2
    exit 1
  fi

  printf 'PASS: %-12s -> %s\n' "$scenario" "$expected_state"
}

run_case queued 1 RUNNER_OFFLINE
run_case in_progress 1 RUNNER_PENDING
run_case failed 1 TEST_FAILURE
run_case recent 0 'PASS:'
run_case expired 1 FRESHNESS_MISSED

echo "Steam Cloud freshness fixture checks passed."