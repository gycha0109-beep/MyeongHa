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

# These four scoped migrations were applied through the approved managed API.
# Reconcile their exact SQL receipts only; never replay unrelated historical SQL.
if [[ "${SUPABASE_SAJU_ADMISSION_RECONCILE_ONLY:-false}" == true ]]; then
  [[ "${SUPABASE_PROMOTION_REPAIR_ONLY:-false}" == false && "${SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:-false}" == false ]]
  cert_file="$(mktemp "${RUNNER_TEMP:?}/saju-admission-ca.XXXXXX")"
  trap 'rm -f "$cert_file"' EXIT
  chmod 600 "$cert_file"
  printf '%s\n' "${SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM:?}" > "$cert_file"
  export PGHOST="$host" PGPORT=5432 PGDATABASE=postgres PGUSER="postgres.$SUPABASE_PROJECT_ID"
  export PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE=verify-full PGSSLROOTCERT="$cert_file"
  bash scripts/operations/verify-saju-admission-production-history.sh
  exit 0
fi
[[ "${SUPABASE_SAJU_ADMISSION_RECONCILE_ONLY:-false}" == false ]]

encoded_password="$(python3 - <<'PY'
import os
import urllib.parse
print(urllib.parse.quote(os.environ['SUPABASE_DB_PASSWORD'], safe=''))
PY
)"
db_url="postgresql://postgres.${SUPABASE_PROJECT_ID}:${encoded_password}@${host}:5432/postgres?sslmode=require"
echo "::add-mask::$db_url"
db_args=(--db-url "$db_url")

# Exceptionally admit ONLY the exact vetted 1725 signup wallet migration.
# This exists because legacy Se-yeon 1400-1450 migration lineage is explicitly
# HOLD and normal --include-all must never replay the unrelated backlog.
# Do not accept arbitrary migration files or a generic bypass flag.
if [[ "${SUPABASE_CHAT_CREDIT_SIGNUP_SCOPE_ONLY:-false}" == 'true' ]]; then
  [[ "${SUPABASE_PROMOTION_REPAIR_ONLY:-false}" == false \
    && "${SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:-false}" == false \
    && "${SUPABASE_SAJU_ADMISSION_RECONCILE_ONLY:-false}" == false ]] || {
    echo 'HOLD_CREDIT_SIGNUP_CONFLICTING_PRODUCTION_SCOPE' >&2
    exit 1
  }
  credit_version='1725'
  credit_file="supabase/migrations/${credit_version}_chat_credit_signup_wallet_runtime_v1.sql"
  [[ -f "$credit_file" ]] || { echo 'HOLD_CREDIT_SIGNUP_SQL_MISSING' >&2; exit 1; }
  [[ "$(git hash-object "$credit_file")" == '2b847d1a1b4ae62678e524b7ebcf32835a377ddf' ]] || {
    echo 'HOLD_CREDIT_SIGNUP_SQL_HASH_DRIFT' >&2
    exit 1
  }
  cert_file="$(mktemp "${RUNNER_TEMP:?}/credit-signup-ca.XXXXXX")"
  trap 'rm -f "$cert_file"' EXIT
  chmod 600 "$cert_file"
  printf '%s\n' "${SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM:?}" > "$cert_file"
  export PGHOST="$host" PGPORT=5432 PGDATABASE=postgres
  export PGUSER="postgres.$SUPABASE_PROJECT_ID" PGPASSWORD="$SUPABASE_DB_PASSWORD"
  export PGSSLMODE=verify-full PGSSLROOTCERT="$cert_file"

  # No writes unless the preceding 1720 migration has actually been recorded.
  [[ "$(psql -X -v ON_ERROR_STOP=1 -qAtc "select count(*) from supabase_migrations.schema_migrations where version='1720'")" == 1 ]] || {
    echo 'HOLD_CREDIT_SIGNUP_BASE_MIGRATION_UNAVAILABLE' >&2; exit 1
  }
  [[ "$(psql -X -v ON_ERROR_STOP=1 -qAtc "select to_regprocedure('public.assert_myeongha_subject_context_v1(uuid)') is not null")" == t ]] || {
    echo 'HOLD_CREDIT_SIGNUP_SUBJECT_CONTEXT_MISSING' >&2; exit 1
  }
  credit_applied="$(psql -X -v ON_ERROR_STOP=1 -qAtc "select count(*) from supabase_migrations.schema_migrations where version='$credit_version'")"
  credit_schema="$(psql -X -v ON_ERROR_STOP=1 -qAtc "select to_regclass('public.chat_credit_lots_v1') is not null")"
  if [[ "$credit_applied" == 1 && "$credit_schema" == t ]]; then
    echo 'Credit signup wallet 1725 already applied and recorded; no replay.'
    exit 0
  fi
  [[ "$credit_applied" == 0 && "$credit_schema" == f ]] || {
    echo 'HOLD_CREDIT_SIGNUP_HISTORY_SCHEMA_DISAGREEMENT' >&2; exit 1
  }
  # Execute this file atomically and no other migration. If the CLI history
  # registration fails afterwards, retry must HOLD on schema/history mismatch.
  psql -X -v ON_ERROR_STOP=1 -1 -c "set lock_timeout='5s'; set statement_timeout='30s'" -f "$credit_file"
  supabase migration repair "$credit_version" --status applied "${db_args[@]}"
  [[ "$(psql -X -v ON_ERROR_STOP=1 -qAtc "select count(*) from supabase_migrations.schema_migrations where version='$credit_version'")" == 1 ]] || {
    echo 'HOLD_CREDIT_SIGNUP_HISTORY_NOT_RECORDED' >&2; exit 1
  }
  psql -X -v ON_ERROR_STOP=1 -qAt <<'CREDIT_VERIFY'
do $proof$
begin
  if to_regclass('public.chat_credit_lots_v1') is null
    or to_regprocedure('public.internal_qry_chat_credit_balance_v1(uuid)') is null
    or not exists(select 1 from pg_trigger where tgname='tr_chat_credit_member_signup_v1' and not tgisinternal)
    or not exists(select 1 from pg_trigger where tgname='tr_chat_credit_subject_erasure_v1' and not tgisinternal)
    or not has_function_privilege('myeongha_api_executor','public.internal_qry_chat_credit_balance_v1(uuid)','EXECUTE')
    or has_function_privilege('anon','public.internal_qry_chat_credit_balance_v1(uuid)','EXECUTE')
    or has_function_privilege('myeongha_api_executor','public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'HOLD_CREDIT_SIGNUP_PRODUCTION_VERIFICATION';
  end if;
end $proof$;
CREDIT_VERIFY
  echo 'PASS_CREDIT_SIGNUP_SCOPED_PRODUCTION_1725_APPLIED_NO_BACKLOG_REPLAY'
  exit 0
fi
[[ "${SUPABASE_CHAT_CREDIT_SIGNUP_SCOPE_ONLY:-false}" == false ]] || {
  echo 'HOLD_CREDIT_SIGNUP_INVALID_SCOPE' >&2; exit 1
}

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
