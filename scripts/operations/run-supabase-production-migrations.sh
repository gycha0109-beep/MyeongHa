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

# Apply only the exact, reviewed Se-yeon manifest ACL repair and leave every
# unrelated pending migration untouched. No direct role membership changes.
if [[ "${SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:-false}" == 'true' ]]; then
  if [[ "${SUPABASE_PROMOTION_REPAIR_ONLY:-false}" != 'false' ]]; then
    echo 'Conflicting Production repair scopes are forbidden.' >&2
    exit 1
  fi
  repair_version='20261008043000'
  repair_file="supabase/migrations/${repair_version}_seyeon_manifest_acl_restore.sql"
  [[ -f "$repair_file" ]]
  export PGHOST="$host" PGPORT='5432' PGDATABASE='postgres'
  export PGUSER="postgres.$SUPABASE_PROJECT_ID" PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE='require'
  psql -X -v ON_ERROR_STOP=1 -1 -f "$repair_file"
  supabase migration repair "$repair_version" --status applied "${db_args[@]}"
  applied_version="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select version from supabase_migrations.schema_migrations where version='$repair_version'")"
  [[ "$applied_version" == "$repair_version" ]]
  echo 'Se-yeon ContentManifest ACL-only repair applied; unrelated migration backlog untouched.'
  exit 0
fi
if [[ "${SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:-false}" != 'false' ]]; then
  echo 'Invalid Se-yeon manifest ACL repair deployment scope.' >&2
  exit 1
fi

# This approved incident repair must not deploy unrelated historical backlog.
# The workflow selects this mode only when this is the sole changed migration.
if [[ "${SUPABASE_PROMOTION_REPAIR_ONLY:-false}" == 'true' ]]; then
  repair_version='20261007150457'
  repair_file="supabase/migrations/${repair_version}_guest_promotion_auth_fk_validation.sql"
  [[ -f "$repair_file" ]]
  export PGHOST="$host" PGPORT='5432' PGDATABASE='postgres'
  export PGUSER="postgres.$SUPABASE_PROJECT_ID" PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE='require'
  psql -X -v ON_ERROR_STOP=1 -1 -f "$repair_file"
  # Record only the SQL just applied; never mark unrelated pending versions applied.
  supabase migration repair "$repair_version" --status applied "${db_args[@]}"
  applied_version="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select version from supabase_migrations.schema_migrations where version='$repair_version'")"
  [[ "$applied_version" == "$repair_version" ]]
  echo 'Guest promotion function-only repair applied; unrelated migration backlog untouched.'
  exit 0
fi
if [[ "${SUPABASE_PROMOTION_REPAIR_ONLY:-false}" != 'false' ]]; then
  echo 'Invalid promotion repair deployment scope.' >&2
  exit 1
fi

# A historical recovery has already installed 1460-1510 while 1400-1450
# relationship Event/Correction/Snapshot functions are absent in Production.
# Fail CLOSED before legacy migration repair OR db push; ordinary --include-all
# is NOT allowed to backfill those missing dependencies without DB Owner review.
# Scoped, previously reviewed function-only repair branches exit above.
history_admission_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/operations/seyeon-production-history-admission-readonly.sql"
[[ -f "$history_admission_file" ]]
history_admission="$( \
  PGHOST="$host" PGPORT='5432' PGDATABASE='postgres' \
  PGUSER="postgres.$SUPABASE_PROJECT_ID" PGPASSWORD="$SUPABASE_DB_PASSWORD" \
  PGSSLMODE='require' PGOPTIONS='-c default_transaction_read_only=on' \
  psql -X -qAt -v ON_ERROR_STOP=1 -f "$history_admission_file"
)"
if [[ "$history_admission" != 'ALLOW_PRELIMINARY_HISTORY_CHECK' ]]; then
  echo "HOLD: Production migration-history admission blocked: $history_admission" >&2
  echo 'No migration repair / dry-run / db push has been executed by this invocation.' >&2
  exit 1
fi

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
