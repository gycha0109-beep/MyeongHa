#!/usr/bin/env bash
set -euo pipefail

: "${VERCEL_PROJECT_ID:?}"
: "${VERCEL_TEAM_ID:?}"
: "${VERCEL_PROJECT_NAME:?}"
: "${VERCEL_TOKEN:?}"
: "${GITHUB_SHA:?}"
: "${RUNNER_TEMP:?}"

verify_governed_vercel_project() (
  set -euo pipefail
  local project_file="$RUNNER_TEMP/vercel-project.json"
  trap 'rm -f "$project_file"' EXIT

  curl -fsS     -H "Authorization: Bearer $VERCEL_TOKEN"     "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_TEAM_ID"     -o "$project_file"

  jq -e     --arg project_id "$VERCEL_PROJECT_ID"     --arg project_name "$VERCEL_PROJECT_NAME" '
      (.id // "") == $project_id and (.name // "") == $project_name
    ' "$project_file" >/dev/null
)

wait_exact_main_deployment() (
  set -euo pipefail
  local deployments_file="$RUNNER_TEMP/vercel-deployments.json"
  local candidate_file="$RUNNER_TEMP/vercel-source-deployment.json"
  trap 'rm -f "$deployments_file" "$candidate_file"' EXIT

  local deadline=$((SECONDS + 600))
  while (( SECONDS < deadline )); do
    curl -fsS       -H "Authorization: Bearer $VERCEL_TOKEN"       "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&target=production&limit=20&teamId=$VERCEL_TEAM_ID"       -o "$deployments_file"

    jq -ce       --arg sha "$GITHUB_SHA" '
        [.deployments[]
          | select(
              (.meta.githubCommitSha // "") == $sha
              and (.target // "") == "production"
            )]
        | sort_by(.created // 0)
        | last // empty
      ' "$deployments_file" > "$candidate_file" || true

    if [[ -s "$candidate_file" ]]; then
      local state id name
      state="$(jq -r '.state // .readyState // empty' "$candidate_file")"
      id="$(jq -r '.uid // .id // empty' "$candidate_file")"
      name="$(jq -r '.name // empty' "$candidate_file")"
      test -n "$id"
      [[ "$name" == "$VERCEL_PROJECT_NAME" ]]
      case "$state" in
        READY)
          printf '%s\t%s\n' "$id" "$name"
          return 0
          ;;
        ERROR|CANCELED)
          echo "Exact main production deployment entered terminal state: $state" >&2
          return 1
          ;;
      esac
    fi
    sleep 10
  done

  echo 'Timed out waiting for the exact main revision production deployment.' >&2
  return 1
)

request_exact_redeploy() (
  set -euo pipefail
  local source_id="${1:?source deployment id required}"
  local source_name="${2:?source deployment name required}"
  [[ "$source_name" == "$VERCEL_PROJECT_NAME" ]]

  local payload_file="$RUNNER_TEMP/vercel-redeploy.json"
  local response_file="$RUNNER_TEMP/vercel-redeploy-response.json"
  trap 'rm -f "$payload_file" "$response_file"' EXIT

  jq -n     --arg deployment_id "$source_id"     --arg name "$source_name" '
      {
        deploymentId: $deployment_id,
        meta: {action: "redeploy"},
        name: $name,
        target: "production"
      }
    ' > "$payload_file"

  local http_code
  http_code="$(curl -sS     -X POST     -H "Authorization: Bearer $VERCEL_TOKEN"     -H 'Content-Type: application/json'     --data-binary "@$payload_file"     -o "$response_file"     -w '%{http_code}'     "https://api.vercel.com/v13/deployments?forceNew=1&teamId=$VERCEL_TEAM_ID")"

  if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    local error_code
    error_code="$(jq -r '.error.code // "unknown"' "$response_file" 2>/dev/null || printf 'unknown')"
    echo "Vercel redeploy failed: HTTP $http_code code=$error_code" >&2
    return 1
  fi

  jq -er '.id // .uid // empty' "$response_file"
)

wait_exact_redeploy_ready() (
  set -euo pipefail
  local redeploy_id="${1:?redeployment id required}"
  local deployment_file="$RUNNER_TEMP/vercel-redeployment.json"
  trap 'rm -f "$deployment_file"' EXIT

  local deadline=$((SECONDS + 600))
  while (( SECONDS < deadline )); do
    curl -fsS       -H "Authorization: Bearer $VERCEL_TOKEN"       "https://api.vercel.com/v13/deployments/$redeploy_id?teamId=$VERCEL_TEAM_ID"       -o "$deployment_file"

    local state
    state="$(jq -r '.readyState // .state // .status // empty' "$deployment_file")"
    case "$state" in
      READY)
        jq -e           --arg project_id "$VERCEL_PROJECT_ID"           --arg sha "$GITHUB_SHA" '
            (.projectId // "") == $project_id
            and (.target // "") == "production"
            and (.meta.githubCommitSha // "") == $sha
            and (.meta.action // "") == "redeploy"
          ' "$deployment_file" >/dev/null
        return 0
        ;;
      ERROR|CANCELED)
        echo "Production redeploy entered terminal state: $state" >&2
        return 1
        ;;
    esac
    sleep 10
  done

  echo 'Timed out waiting for production redeploy readiness.' >&2
  return 1
)

verify_canonical_alias_and_readiness() (
  set -euo pipefail
  : "${CANONICAL_PRODUCTION_HOST:?}"
  local redeploy_id="${1:?redeployment id required}"
  local aliases_file="$RUNNER_TEMP/vercel-redeployment-aliases.json"
  local readiness_file="$RUNNER_TEMP/myeongha-readiness.json"
  trap 'rm -f "$aliases_file" "$readiness_file"' EXIT

  local deadline=$((SECONDS + 180))
  while (( SECONDS < deadline )); do
    curl -fsS       -H "Authorization: Bearer $VERCEL_TOKEN"       "https://api.vercel.com/v2/deployments/$redeploy_id/aliases?teamId=$VERCEL_TEAM_ID"       -o "$aliases_file"

    if jq -e       --arg alias "$CANONICAL_PRODUCTION_HOST"       '(.aliases | type) == "array" and any(.aliases[]; .alias == $alias)'       "$aliases_file" >/dev/null; then
      break
    fi
    sleep 5
  done

  jq -e     --arg alias "$CANONICAL_PRODUCTION_HOST"     '(.aliases | type) == "array" and any(.aliases[]; .alias == $alias)'     "$aliases_file" >/dev/null

  curl -fsS     -H 'Cache-Control: no-cache'     "https://$CANONICAL_PRODUCTION_HOST/api/readiness"     -o "$readiness_file"

  jq -e '
    .status == "ready"
    and .capabilities.userData == "ready"
    and .capabilities.sajuCalculation == "ready"
  ' "$readiness_file" >/dev/null
)
