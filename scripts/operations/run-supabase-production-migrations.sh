#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]

: "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:?SUPABASE_PRODUCTION_SESSION_POOLER_HOST is required}"

host="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"
if [[ ! "$host" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]]; then
  echo 'SUPABASE_PRODUCTION_SESSION_POOLER_HOST must be a bare *.pooler.supabase.com hostname.' >&2
  exit 1
fi

encoded_password="$(python3 - <<'PY'
import os
import urllib.parse
print(urllib.parse.quote(os.environ['SUPABASE_DB_PASSWORD'], safe=''))
PY
)"
db_url="postgresql://postgres.${SUPABASE_PROJECT_ID}:${encoded_password}@${host}:5432/postgres?sslmode=require"
echo "::add-mask::$db_url"
db_args=(--db-url "$db_url")

state_file="$(mktemp)"
trap 'rm -f "$state_file"' EXIT

set +e
supabase migration list "${db_args[@]}" 2>&1 | tee "$state_file"
list_status=${PIPESTATUS[0]}
set -e

legacy_repair=false
duplicate_0830_repair=false

if grep -q '20260830072444' "$state_file"; then
  legacy_repair=true
fi
if grep -q '20260902193252' "$state_file"; then
  duplicate_0830_repair=true
fi

if [[ "$list_status" -ne 0 && "$legacy_repair" != 'true' && "$duplicate_0830_repair" != 'true' ]]; then
  echo 'Migration list failed without a known repair marker.' >&2
  exit "$list_status"
fi

if [[ "$legacy_repair" == 'true' ]]; then
  supabase migration repair 20260830072444 --status reverted "${db_args[@]}"
  supabase migration repair 0010 --status applied "${db_args[@]}"
fi

if [[ "$duplicate_0830_repair" == 'true' ]]; then
  supabase migration repair 20260902193252 --status reverted "${db_args[@]}"
fi

supabase migration list "${db_args[@]}"
supabase db push --include-all --dry-run "${db_args[@]}"
supabase db push --include-all "${db_args[@]}"
supabase migration list "${db_args[@]}"
