#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]

pooler_file="$RUNNER_TEMP/myeongha-pi-postdeploy-pooler.json"
cleanup() {
  exit_code=$?
  trap - EXIT
  rm -f "$pooler_file"
  exit "$exit_code"
}
trap cleanup EXIT

curl -fsS \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/config/database/pooler" \
  -o "$pooler_file"

pooler_record="$({
  jq -ce '
    (if type == "array" then . elif (.data? | type) == "array" then .data else [.] end)
    | map(
        select((.database_type // "") == "PRIMARY")
        | . + {
            resolved_connection_string:
              (.connection_string // .connectionString // "")
          }
      )
    | map(
        select(
          (.resolved_connection_string | type) == "string"
          and (.resolved_connection_string | length) > 0
          and (.resolved_connection_string
            | test("\\.pooler\\.supabase\\.com:(5432|6543)/postgres(?:\\?|$)"))
        )
      )
    | sort_by(
        if (.resolved_connection_string | test(":5432/postgres(?:\\?|$)"))
        then 0
        else 1
        end
      )
    | first // empty
  ' "$pooler_file"
})"
test -n "$pooler_record"

connection_string="$(jq -r '.resolved_connection_string // empty' <<<"$pooler_record")"
test -n "$connection_string"

ADMIN_POOL_USER="$(sed -E 's#^[a-zA-Z0-9+.-]+://([^:]+):.*#\1#' <<<"$connection_string")"
POOL_HOST="$(sed -E 's#^[^@]+@([^:/]+):([0-9]+)/.*#\1#' <<<"$connection_string")"
POOL_PORT="$(sed -E 's#^[^@]+@([^:/]+):([0-9]+)/.*#\2#' <<<"$connection_string")"
POOL_DB="$(sed -E 's#^[^@]+@[^/]+/([^?]+).*$#\1#' <<<"$connection_string")"

[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]
[[ "$POOL_HOST" == *.pooler.supabase.com ]]
[[ "$POOL_PORT" == '5432' || "$POOL_PORT" == '6543' ]]
[[ "$POOL_DB" == 'postgres' ]]

export ADMIN_POOL_USER POOL_HOST POOL_PORT POOL_DB

bash scripts/run-production-platform-integrity-read-audit.sh
bash scripts/run-production-platform-integrity-data-api-surface-audit.sh

echo 'Production post-deploy platform-integrity read-only verification passed.'
