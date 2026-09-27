#!/usr/bin/env bash
set -euo pipefail

[[ "$BACKUP_RUN_ID" =~ ^[0-9]+$ ]]
incident_roundtrip="$(date -u -d "$INCIDENT_REFERENCE_UTC" +'%Y-%m-%dT%H:%M:%SZ')"
[[ "$incident_roundtrip" == "$INCIDENT_REFERENCE_UTC" ]]

run_json="$RUNNER_TEMP/backup-run.json"
artifact_json="$RUNNER_TEMP/backup-artifacts.json"

curl -fsSL \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs/$BACKUP_RUN_ID" \
  -o "$run_json"

jq -e '
  .path == ".github/workflows/production-postgres-backup.yml"
  and .conclusion == "success"
  and .head_branch == "main"
  and (.event == "schedule" or .event == "workflow_dispatch" or .event == "push")
  and .repository.full_name == env.GITHUB_REPOSITORY
' "$run_json" >/dev/null

source_sha="$(jq -er '.head_sha' "$run_json")"
run_event="$(jq -er '.event' "$run_json")"
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]]

if [[ "$run_event" == 'push' ]]; then
  marker_json="$RUNNER_TEMP/backup-one-shot-marker.json"
  workflow_json="$RUNNER_TEMP/backup-one-shot-workflow.json"

  curl -fsSL \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/contents/.github/ops/postgres-backup-frontier-1310.once?ref=$source_sha" \
    -o "$marker_json"
  curl -fsSL \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/contents/.github/workflows/production-postgres-backup.yml?ref=$source_sha" \
    -o "$workflow_json"

  marker_content="$(jq -er '.content' "$marker_json" | tr -d '\n' | base64 --decode | tr -d '\r\n')"
  workflow_content="$(jq -er '.content' "$workflow_json" | tr -d '\n' | base64 --decode)"

  [[ "$marker_content" == 'POSTGRES-BACKUP-FRONTIER-1310-V1' ]]
  [[ "$workflow_content" == *".github/ops/postgres-backup-frontier-1310.once"* ]]
  [[ "$workflow_content" == *"Gate one-shot frontier-1310 backup marker"* ]]
  [[ "$workflow_content" == *"POSTGRES-BACKUP-FRONTIER-1310-V1"* ]]
fi

curl -fsSL \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/runs/$BACKUP_RUN_ID/artifacts?per_page=100" \
  -o "$artifact_json"

governed_artifacts="$(jq -c '[.artifacts[] | select((.name | test("^myeongha-postgres-[0-9]{8}T[0-9]{6}Z$")) and (.expired == false))]' "$artifact_json")"
[[ "$(jq 'length' <<<"$governed_artifacts")" == '1' ]]

artifact_id="$(jq -er '.[0].id' <<<"$governed_artifacts")"
artifact_name="$(jq -er '.[0].name' <<<"$governed_artifacts")"
artifact_expires_at="$(jq -er '.[0].expires_at' <<<"$governed_artifacts")"
[[ "$artifact_id" =~ ^[0-9]+$ ]]
[[ "$artifact_name" =~ ^myeongha-postgres-[0-9]{8}T[0-9]{6}Z$ ]]

echo "source_sha=$source_sha" >> "$GITHUB_OUTPUT"
echo "artifact_id=$artifact_id" >> "$GITHUB_OUTPUT"
echo "artifact_name=$artifact_name" >> "$GITHUB_OUTPUT"
echo "artifact_expires_at=$artifact_expires_at" >> "$GITHUB_OUTPUT"
