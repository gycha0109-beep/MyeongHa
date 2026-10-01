#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() {
  printf 'production_privileged_postgres_tls_readonly_proof=fail code=%s\n' "$1" >&2
  exit 1
}

[[ "${GITHUB_EVENT_NAME:-}" == 'workflow_dispatch' ]] || fail DISPATCH_AUTHORITY_INVALID
[[ "${GITHUB_REF:-}" == 'refs/heads/main' ]] || fail MAIN_AUTHORITY_REQUIRED
[[ "${MYEONGHA_WATCHTOWER_TRACK:-}" == 'security' ]] || fail WATCHTOWER_TRACK_INVALID
[[ "${MYEONGHA_PRIVILEGED_POSTGRES_TLS_READONLY_CONFIRM:-}" == 'VERIFY_PRIVILEGED_POSTGRES_TLS_READONLY_D1' ]] || fail CONFIRMATION_INVALID
[[ "${SUPABASE_PROJECT_ID:-}" == 'cnsfpcdiyofqvhpcegfc' ]] || fail PROJECT_REF_MISMATCH
[[ -n "${SUPABASE_DB_PASSWORD:-}" ]] || fail DATABASE_PASSWORD_MISSING
[[ -n "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" ]] || fail POOLER_HOST_MISSING
[[ -n "${SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM:-}" ]] || fail ROOT_CERTIFICATE_MISSING

work_dir="$RUNNER_TEMP/privileged-postgres-tls-readonly-proof"
rm -rf "$work_dir"
mkdir -p "$work_dir"

cleanup() {
  exit_code=$?
  trap - EXIT
  rm -rf "$work_dir"
  exit "$exit_code"
}
trap cleanup EXIT

admin_pool_user="postgres.$SUPABASE_PROJECT_ID"
root_certificate_file="$work_dir/server-root.crt"

node scripts/operations/prepare-production-postgres-strict-libpq.mjs \
  --output "$root_certificate_file" \
  --host "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" \
  --principal "$admin_pool_user" \
  --port '5432' \
  --database 'postgres'

export PGHOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"
export PGPORT='5432'
export PGUSER="$admin_pool_user"
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGDATABASE='postgres'
export PGSSLMODE='verify-full'
export PGSSLROOTCERT="$root_certificate_file"
export PGCONNECT_TIMEOUT='10'
export PGOPTIONS='-c statement_timeout=10000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=10000'

sql="$(cat <<'SQL'
begin transaction read only;
select
  current_setting('transaction_read_only')
  || '|'
  || coalesce(
    (select ssl::text from pg_stat_ssl where pid = pg_backend_pid()),
    'false'
  );
rollback;
SQL
)"

proof_file="$work_dir/proof.txt"
if ! printf '%s\n' "$sql" | psql -X -qAt -v ON_ERROR_STOP=1 > "$proof_file" 2>"$work_dir/psql-error.log"; then
  fail CONNECTION_FAILED
fi

proof_result="$(tr -d '\r' < "$proof_file")"
[[ "$proof_result" == 'on|true' ]] || fail READONLY_TLS_RUNTIME_PROOF_MISMATCH

printf '%s\n' \
  'production_privileged_postgres_tls_readonly_proof=pass' \
  'project_ref=cnsfpcdiyofqvhpcegfc' \
  'database_principal=postgres.cnsfpcdiyofqvhpcegfc' \
  'endpoint_authority_pinned=true' \
  'tls_mode=verify-full' \
  'peer_verification=full' \
  'root_certificate_pinned=true' \
  'default_hostname_verification=true' \
  'connection_succeeded=true' \
  'transaction_read_only=true' \
  'write_executed=false' \
  'database_url_emitted=false' \
  'credential_material_emitted=false' \
  'root_certificate_pem_emitted=false'

trap - EXIT
rm -rf "$work_dir"
