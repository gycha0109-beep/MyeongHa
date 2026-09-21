#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${BACKUP_RUN_ID:?BACKUP_RUN_ID is required}"
: "${PRIVACY_LEDGER_RUN_ID:?PRIVACY_LEDGER_RUN_ID is required}"
: "${PRODUCTION_PRIVACY_CANARY_RUN_ID:?PRODUCTION_PRIVACY_CANARY_RUN_ID is required}"

[[ "$BACKUP_RUN_ID" =~ ^[1-9][0-9]*$ ]]
[[ "$PRIVACY_LEDGER_RUN_ID" =~ ^[1-9][0-9]*$ ]]
[[ "$PRODUCTION_PRIVACY_CANARY_RUN_ID" =~ ^[1-9][0-9]*$ ]]

request_json() {
  local url="$1"
  local output="$2"
  curl -fsSL \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H 'Accept: application/vnd.github+json' \
    "$url" \
    -o "$output"
}

ledger_run_json="$RUNNER_TEMP/privacy-ledger-run.json"
ledger_artifacts_json="$RUNNER_TEMP/privacy-ledger-artifacts.json"
canary_run_json="$RUNNER_TEMP/privacy-canary-run.json"
canary_artifacts_json="$RUNNER_TEMP/privacy-canary-artifacts.json"

request_json \
  "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs/$PRIVACY_LEDGER_RUN_ID" \
  "$ledger_run_json"

jq -e '
  .name == "Production PostgreSQL Privacy Recovery Ledger"
  and .path == ".github/workflows/production-postgres-privacy-recovery-ledger.yml"
  and .conclusion == "success"
  and .head_branch == "main"
  and (.event == "schedule" or .event == "workflow_dispatch")
  and .repository.full_name == env.GITHUB_REPOSITORY
' "$ledger_run_json" >/dev/null

request_json \
  "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs/$PRIVACY_LEDGER_RUN_ID/artifacts?per_page=100" \
  "$ledger_artifacts_json"

ledger_artifacts="$(jq -c '
  [
    .artifacts[]
    | select(
        (.name | test("^myeongha-privacy-ledger-[0-9]{8}T[0-9]{6}Z$"))
        and (.expired == false)
      )
  ]
' "$ledger_artifacts_json")"
[[ "$(jq 'length' <<<"$ledger_artifacts")" == '1' ]]

ledger_artifact_id="$(jq -er '.[0].id' <<<"$ledger_artifacts")"
ledger_artifact_name="$(jq -er '.[0].name' <<<"$ledger_artifacts")"
[[ "$ledger_artifact_id" =~ ^[1-9][0-9]*$ ]]
[[ "$ledger_artifact_name" =~ ^myeongha-privacy-ledger-[0-9]{8}T[0-9]{6}Z$ ]]

request_json \
  "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs/$PRODUCTION_PRIVACY_CANARY_RUN_ID" \
  "$canary_run_json"

jq -e '
  .name == "Production Privacy Recovery Canary"
  and .path == ".github/workflows/production-privacy-recovery-canary.yml"
  and .conclusion == "success"
  and .head_branch == "main"
  and .event == "workflow_dispatch"
  and .repository.full_name == env.GITHUB_REPOSITORY
' "$canary_run_json" >/dev/null

request_json \
  "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs/$PRODUCTION_PRIVACY_CANARY_RUN_ID/artifacts?per_page=100" \
  "$canary_artifacts_json"

canary_artifacts="$(jq -c \
  --arg expected "production-privacy-recovery-canary-$PRODUCTION_PRIVACY_CANARY_RUN_ID" '
  [
    .artifacts[]
    | select(.name == $expected and (.expired == false))
  ]
' "$canary_artifacts_json")"
[[ "$(jq 'length' <<<"$canary_artifacts")" == '1' ]]

canary_artifact_id="$(jq -er '.[0].id' <<<"$canary_artifacts")"
canary_artifact_name="$(jq -er '.[0].name' <<<"$canary_artifacts")"
[[ "$canary_artifact_id" =~ ^[1-9][0-9]*$ ]]

echo "ledger_artifact_id=$ledger_artifact_id" >> "$GITHUB_OUTPUT"
echo "ledger_artifact_name=$ledger_artifact_name" >> "$GITHUB_OUTPUT"
echo "canary_artifact_id=$canary_artifact_id" >> "$GITHUB_OUTPUT"
echo "canary_artifact_name=$canary_artifact_name" >> "$GITHUB_OUTPUT"
