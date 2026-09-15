#!/usr/bin/env bash
set -euo pipefail

# Check the latest scheduled packaged Windows job without waiting for the
# dedicated Windows runner. The label and job name are configurable so the
# same API checker can protect multiple release-only workflows.
# FRESHNESS_CUTOFF_EPOCH is intentionally available for the fixture harness;
# production uses the current UTC clock.

: "${REPOSITORY:?REPOSITORY is required}"
: "${WORKFLOW_FILE:?WORKFLOW_FILE is required}"
: "${CURRENT_RUN_ID:?CURRENT_RUN_ID is required}"
: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is required}"

freshness_label="${FRESHNESS_LABEL:-Steam Cloud}"
freshness_job_name="${FRESHNESS_JOB_NAME:-Scheduled Steam Cloud restore (Windows x64)}"
# Build a jq string literal without relying on shell-style escaping.
jq_job_name="${freshness_job_name//\\/\\\\}"
jq_job_name="${jq_job_name//\"/\\\"}"
freshness_window_days="${FRESHNESS_WINDOW_DAYS:-8}"
if [[ -n "${FRESHNESS_CUTOFF_EPOCH:-}" ]]; then
  cutoff_epoch="$FRESHNESS_CUTOFF_EPOCH"
else
  cutoff_epoch="$(date -u -d "${freshness_window_days} days ago" +%s)"
fi

echo "Checking for a successful scheduled ${freshness_label} completed within ${freshness_window_days} days."

# The workflow can have a second scheduled run for this hosted freshness
# check. That run does not contain the release job, so inspect jobs rather
# than trusting the workflow-run conclusion.
mapfile -t scheduled_runs < <(
  gh api \
    --paginate \
    "repos/${REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?event=schedule&per_page=20" \
    --jq '.workflow_runs[] | [.id, .created_at, .status] | @tsv' |
    sort -k2,2r
)

latest_restore=""
latest_success_epoch=0
latest_success_completed_at=""

for run in "${scheduled_runs[@]}"; do
  IFS=$'\t' read -r run_id created_at run_status <<< "$run"
  if [[ "$run_id" == "$CURRENT_RUN_ID" ]]; then
    continue
  fi
  jobs="$(
    gh api \
      "repos/${REPOSITORY}/actions/runs/${run_id}/jobs?per_page=100" \
      --jq ".jobs[] | select(.name == \"${jq_job_name}\" and .conclusion != \"skipped\") | [.status, (.conclusion // \"\"), (.started_at // \"\"), (.completed_at // \"\")] | @tsv"
  )"

  if [[ -n "$jobs" ]]; then
    job_line="$(printf '%s\n' "$jobs" | head -n 1)"
    IFS=$'\t' read -r job_status job_conclusion started_at completed_at <<< "$job_line"
    if [[ -z "$latest_restore" ]]; then
      latest_restore="$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s' \
        "$run_id" "$created_at" "$run_status" "$job_status" "$job_conclusion" "$started_at" "$completed_at")"
    fi

    if [[ "$job_status" == "completed" && "$job_conclusion" == "success" && -n "$completed_at" ]]; then
      completed_epoch="$(date -u -d "$completed_at" +%s)"
      if (( completed_epoch > latest_success_epoch )); then
        latest_success_epoch="$completed_epoch"
        latest_success_completed_at="$completed_at"
      fi
    fi
    continue
  fi

  # A job waiting for an unavailable self-hosted runner may not have a job
  # record yet. Keep that workflow run as the latest restore state, but ignore
  # completed runs whose restore job was correctly skipped (the 04:00 runs).
  if [[ "$run_status" != "completed" ]]; then
    latest_restore="$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s' \
      "$run_id" "$created_at" "$run_status" "$run_status" "" "" "")"
    break
  fi
done

if [[ -z "$latest_restore" ]]; then
  {
    echo "### ${freshness_label} freshness: missed"
    echo
    echo "**FRESHNESS_MISSED:** no scheduled ${freshness_label} job was found in the Actions history."
  } >> "$GITHUB_STEP_SUMMARY"
  echo "::error title=FRESHNESS_MISSED::No scheduled ${freshness_label} job was found in the Actions history."
  exit 1
fi

IFS=$'\t' read -r latest_run_id latest_created_at latest_run_status latest_job_status latest_job_conclusion latest_started_at latest_completed_at <<< "$latest_restore"

if [[ "$latest_job_status" == "completed" && "$latest_job_conclusion" != "success" ]]; then
  {
    echo "### ${freshness_label} freshness: test failure"
    echo
    echo "**TEST_FAILURE:** scheduled ${freshness_label} run ${latest_run_id} completed with conclusion \`${latest_job_conclusion}\`."
  } >> "$GITHUB_STEP_SUMMARY"
  echo "::error title=TEST_FAILURE::Scheduled ${freshness_label} run ${latest_run_id} completed with ${latest_job_conclusion}."
  exit 1
fi

if (( latest_success_epoch < cutoff_epoch )); then
  if [[ "$latest_job_status" == "queued" || "$latest_run_status" == "queued" ]]; then
    {
      echo "### ${freshness_label} freshness: runner unavailable"
      echo
      echo "**RUNNER_OFFLINE:** latest scheduled ${freshness_label} run ${latest_run_id} is queued; no successful run completed within ${freshness_window_days} days."
    } >> "$GITHUB_STEP_SUMMARY"
    echo "::error title=RUNNER_OFFLINE::Latest scheduled ${freshness_label} run ${latest_run_id} is queued; no successful run completed within ${freshness_window_days} days."
    exit 1
  fi

  if [[ "$latest_job_status" == "in_progress" || "$latest_run_status" == "in_progress" ]]; then
    {
      echo "### ${freshness_label} freshness: runner pending"
      echo
      echo "**RUNNER_PENDING:** latest scheduled ${freshness_label} run ${latest_run_id} is still in progress; no successful run completed within ${freshness_window_days} days."
    } >> "$GITHUB_STEP_SUMMARY"
    echo "::error title=RUNNER_PENDING::Latest scheduled ${freshness_label} run ${latest_run_id} is still in progress; no successful run completed within ${freshness_window_days} days."
    exit 1
  fi

  {
    echo "### ${freshness_label} freshness: missed"
    echo
    echo "**FRESHNESS_MISSED:** no successful scheduled ${freshness_label} completed within ${freshness_window_days} days."
  } >> "$GITHUB_STEP_SUMMARY"
  echo "::error title=FRESHNESS_MISSED::No successful scheduled ${freshness_label} completed within ${freshness_window_days} days."
  exit 1
fi

# A current restore can be queued while the previous weekly success is still
# inside the grace window. It is not a freshness failure yet, but make the
# state visible without conflating it with a failed restore test.
if [[ "$latest_job_status" == "queued" || "$latest_job_status" == "in_progress" || "$latest_run_status" == "queued" || "$latest_run_status" == "in_progress" ]]; then
  {
    echo "### ${freshness_label} freshness: runner pending"
    echo
    echo "**RUNNER_PENDING:** latest scheduled ${freshness_label} run ${latest_run_id} is ${latest_job_status}; the last successful run is still within the freshness window."
  } >> "$GITHUB_STEP_SUMMARY"
  echo "::warning title=RUNNER_PENDING::Latest scheduled ${freshness_label} run ${latest_run_id} is ${latest_job_status}; the last successful run is still within the freshness window."
  exit 0
fi

echo "PASS: latest successful scheduled ${freshness_label} completed at ${latest_success_completed_at}."