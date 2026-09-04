#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${CONTAINMENT_MODE:?CONTAINMENT_MODE is required}"
: "${DISPATCH_CONFIRM:?DISPATCH_CONFIRM is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]
[[ "$CONTAINMENT_MODE" == 'contain' || "$CONTAINMENT_MODE" == 'rollback' ]]

baseline_schema='public,graphql_public'
contained_schema='pg_pgrst_no_exposed_schemas'

case "$CONTAINMENT_MODE" in
  contain)
    [[ "$DISPATCH_CONFIRM" == 'DISABLE_PRODUCT_DATA_API' ]]
    expected_before="$baseline_schema"
    expected_after="$contained_schema"
    ;;
  rollback)
    [[ "$DISPATCH_CONFIRM" == 'RESTORE_PRODUCT_DATA_API' ]]
    expected_before="$contained_schema"
    expected_after="$baseline_schema"
    ;;
esac

snapshot_dir="$RUNNER_TEMP/myeongha-data-api-containment"
rm -rf "$snapshot_dir"
mkdir -p "$snapshot_dir"

pre_raw="$RUNNER_TEMP/myeongha-data-api-pre.json"
patch_raw="$RUNNER_TEMP/myeongha-data-api-patch.json"
post_raw="$RUNNER_TEMP/myeongha-data-api-post.json"
request_body="$RUNNER_TEMP/myeongha-data-api-request.json"

cleanup() {
  exit_code=$?
  trap - EXIT
  rm -f "$pre_raw" "$patch_raw" "$post_raw" "$request_body"
  exit "$exit_code"
}
trap cleanup EXIT

sanitize_config() {
  local source_file="$1"
  local destination_file="$2"

  jq -e '
    if type != "object" or ((.db_schema // "") | type) != "string" then
      error("unexpected PostgREST config response")
    else
      {
        db_schema: (.db_schema // ""),
        db_extra_search_path: (.db_extra_search_path // ""),
        max_rows: (.max_rows // null),
        db_pool: (.db_pool // null),
        db_pool_acquisition_timeout: (.db_pool_acquisition_timeout // null)
      }
    end
  ' "$source_file" > "$destination_file"

  if jq -e 'has("jwt_secret")' "$destination_file" >/dev/null; then
    echo 'Sanitized PostgREST config must never contain jwt_secret.' >&2
    exit 1
  fi
}

read_postgrest_config() {
  local raw_file="$1"
  curl -fsS \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/postgrest" \
    -o "$raw_file"
}

write_patch_failure_evidence() {
  local failure_kind="$1"
  local http_status="$2"
  local safe_code='unspecified'
  local safe_message='unspecified'

  if [[ -s "$patch_raw" ]] && jq -e 'type == "object"' "$patch_raw" >/dev/null 2>&1; then
    safe_code="$(jq -r '(.code // .error_code // "unspecified") | tostring' "$patch_raw" | tr -d '\r\n' | cut -c1-120)"
    safe_message="$(jq -r '(.message // "unspecified") | tostring' "$patch_raw" | tr -d '\r\n' | cut -c1-240)"
  fi

  {
    echo "project_ref=$SUPABASE_PROJECT_ID"
    echo "github_sha=$GITHUB_SHA"
    echo "github_run_id=$GITHUB_RUN_ID"
    echo "mode=$CONTAINMENT_MODE"
    echo "failure_kind=$failure_kind"
    echo "patch_http_status=$http_status"
    echo "before_db_schema=$before_schema"
    echo "expected_after_db_schema=$expected_after"
    echo "management_api_error_code=$safe_code"
    echo "management_api_error_message=$safe_message"
    echo 'mutation_scope=management_api_postgrest_db_schema_only'
    echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$snapshot_dir/containment_failure.txt"

  (
    cd "$snapshot_dir"
    sha256sum pre_config.json containment_failure.txt > SHA256SUMS
    sha256sum --check SHA256SUMS
  )
}

read_postgrest_config "$pre_raw"
sanitize_config "$pre_raw" "$snapshot_dir/pre_config.json"

before_schema="$(jq -r '.db_schema' "$snapshot_dir/pre_config.json")"
mutation_state='not_required'
patch_http_status='not_required'

if [[ "$before_schema" == "$expected_after" ]]; then
  mutation_state='idempotent_replay'
elif [[ "$before_schema" != "$expected_before" ]]; then
  echo "Refusing Data API containment mutation because production db_schema drifted: $before_schema" >&2
  exit 1
else
  jq -n --arg db_schema "$expected_after" '{db_schema: $db_schema}' > "$request_body"

  if ! patch_http_status="$(curl -sS \
    -o "$patch_raw" \
    -w '%{http_code}' \
    -X PATCH \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H 'Content-Type: application/json' \
    --data-binary "@$request_body" \
    "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/postgrest")"; then
    write_patch_failure_evidence 'transport_error' 'unavailable'
    echo 'Data API containment PATCH transport failed before a valid HTTP response was received.' >&2
    exit 1
  fi

  if [[ "$patch_http_status" != '200' ]]; then
    write_patch_failure_evidence 'management_api_rejected' "$patch_http_status"
    echo "Data API containment PATCH rejected with HTTP $patch_http_status; see containment_failure.txt artifact evidence." >&2
    exit 1
  fi

  mutation_state='applied'
fi

read_postgrest_config "$post_raw"
sanitize_config "$post_raw" "$snapshot_dir/post_config.json"

after_schema="$(jq -r '.db_schema' "$snapshot_dir/post_config.json")"
[[ "$after_schema" == "$expected_after" ]]

pre_non_schema="$(jq -S 'del(.db_schema)' "$snapshot_dir/pre_config.json")"
post_non_schema="$(jq -S 'del(.db_schema)' "$snapshot_dir/post_config.json")"
[[ "$pre_non_schema" == "$post_non_schema" ]]

if [[ "$CONTAINMENT_MODE" == 'contain' ]]; then
  [[ "$after_schema" != *'public'* ]]
  [[ "$after_schema" != *'graphql_public'* ]]
fi

{
  echo "project_ref=$SUPABASE_PROJECT_ID"
  echo "github_sha=$GITHUB_SHA"
  echo "github_run_id=$GITHUB_RUN_ID"
  echo "mode=$CONTAINMENT_MODE"
  echo "mutation_state=$mutation_state"
  echo "patch_http_status=$patch_http_status"
  echo "before_db_schema=$before_schema"
  echo "after_db_schema=$after_schema"
  echo 'mutation_scope=management_api_postgrest_db_schema_only'
  echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$snapshot_dir/containment_metadata.txt"

(
  cd "$snapshot_dir"
  sha256sum pre_config.json post_config.json containment_metadata.txt > SHA256SUMS
  sha256sum --check SHA256SUMS
)

echo "Production Data API surface $CONTAINMENT_MODE completed with db_schema=$after_schema."
