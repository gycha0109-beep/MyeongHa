#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${DISPATCH_CONFIRM:?DISPATCH_CONFIRM is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]
[[ "$DISPATCH_CONFIRM" == 'VERIFY_SUPABASE_MANAGEMENT_TOKEN_LEAST_PRIVILEGE' ]]
[[ "$SUPABASE_ACCESS_TOKEN" == sbp_fc* ]]

origin='https://api.supabase.com'
postgrest_url="$origin/v1/projects/$SUPABASE_PROJECT_ID/postgrest"
pooler_url="$origin/v1/projects/$SUPABASE_PROJECT_ID/config/database/pooler"
api_keys_url="$origin/v1/projects/$SUPABASE_PROJECT_ID/api-keys?reveal=true"
auth_config_url="$origin/v1/projects/$SUPABASE_PROJECT_ID/config/auth"

evidence_dir="$RUNNER_TEMP/myeongha-supabase-management-token-least-privilege"
rm -rf "$evidence_dir"
mkdir -p "$evidence_dir"

pre_raw="$RUNNER_TEMP/myeongha-scoped-pat-postgrest-pre.json"
patch_raw="$RUNNER_TEMP/myeongha-scoped-pat-postgrest-patch.json"
post_raw="$RUNNER_TEMP/myeongha-scoped-pat-postgrest-post.json"
request_body="$RUNNER_TEMP/myeongha-scoped-pat-postgrest-request.json"

cleanup() {
  exit_code=$?
  trap - EXIT
  rm -f "$pre_raw" "$patch_raw" "$post_raw" "$request_body"
  exit "$exit_code"
}
trap cleanup EXIT

request_status() {
  local method="$1"
  local url="$2"
  local output="$3"
  shift 3
  curl -sS     -o "$output"     -w '%{http_code}'     --connect-timeout 5     --max-time 20     -X "$method"     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"     "$@"     "$url"
}

pre_status="$(request_status GET "$postgrest_url" "$pre_raw")"
[[ "$pre_status" == '200' ]]
jq -e 'type == "object" and ((.db_schema // "") | type == "string")' "$pre_raw" >/dev/null
before_schema="$(jq -r '.db_schema // ""' "$pre_raw")"
case "$before_schema" in
  ''|'pg_pgrst_no_exposed_schemas'|'public,graphql_public')
    ;;
  *)
    echo 'Refusing least-privilege write proof because Production db_schema is outside the governed states.' >&2
    exit 1
    ;;
esac

jq -n --arg db_schema "$before_schema" '{db_schema: $db_schema}' > "$request_body"
patch_status="$(request_status PATCH "$postgrest_url" "$patch_raw"   -H 'Content-Type: application/json'   --data-binary "@$request_body")"
[[ "$patch_status" == '200' ]]

post_status="$(request_status GET "$postgrest_url" "$post_raw")"
[[ "$post_status" == '200' ]]
jq -e 'type == "object" and ((.db_schema // "") | type == "string")' "$post_raw" >/dev/null
after_schema="$(jq -r '.db_schema // ""' "$post_raw")"
[[ "$after_schema" == "$before_schema" ]]

pooler_status="$(request_status GET "$pooler_url" /dev/null)"
api_keys_status="$(request_status GET "$api_keys_url" /dev/null)"
auth_config_status="$(request_status GET "$auth_config_url" /dev/null)"

[[ "$pooler_status" == '403' ]]
[[ "$api_keys_status" == '403' ]]
[[ "$auth_config_status" == '403' ]]

{
  echo 'supabase_management_token_least_privilege_evidence=pass'
  echo 'token_kind=scoped'
  echo "project_ref=$SUPABASE_PROJECT_ID"
  echo "github_sha=$GITHUB_SHA"
  echo "github_run_id=$GITHUB_RUN_ID"
  echo "postgrest_read_status=$pre_status"
  echo "postgrest_idempotent_write_status=$patch_status"
  echo "postgrest_post_read_status=$post_status"
  echo "pooler_read_status=$pooler_status"
  echo "api_keys_read_status=$api_keys_status"
  echo "auth_config_read_status=$auth_config_status"
  echo 'state_changed=false'
  echo 'credential_logged=false'
  echo 'authorization_header_logged=false'
  echo 'raw_response_logged=false'
  echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$evidence_dir/evidence.txt"

(
  cd "$evidence_dir"
  sha256sum evidence.txt > SHA256SUMS
  sha256sum --check SHA256SUMS
)

cat "$evidence_dir/evidence.txt"
