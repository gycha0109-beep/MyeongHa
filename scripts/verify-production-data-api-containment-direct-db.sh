#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${POOL_HOST:?POOL_HOST is required}"
: "${POOL_PORT:?POOL_PORT is required}"
: "${POOL_DB:?POOL_DB is required}"
: "${ADMIN_POOL_USER:?ADMIN_POOL_USER is required}"
: "${RUNTIME_DB_PRINCIPAL:?RUNTIME_DB_PRINCIPAL is required}"
: "${API_EXECUTION_ROLE:?API_EXECUTION_ROLE is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]
[[ "$RUNTIME_DB_PRINCIPAL" == 'myeongha_runtime' ]]
[[ "$API_EXECUTION_ROLE" == 'myeongha_api_executor' ]]
[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]
[[ "$POOL_HOST" == *.pooler.supabase.com ]]
[[ "$POOL_PORT" == '5432' || "$POOL_PORT" == '6543' ]]
[[ "$POOL_DB" == 'postgres' ]]

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE=require

role_state="$(psql \
  -X -A -t -q -v ON_ERROR_STOP=1 \
  -h "$POOL_HOST" \
  -p "$POOL_PORT" \
  -U "$ADMIN_POOL_USER" \
  -d "$POOL_DB" <<SQL
BEGIN READ ONLY;
SELECT CASE WHEN
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles runtime
    WHERE runtime.rolname = '$RUNTIME_DB_PRINCIPAL'
      AND runtime.rolcanlogin
      AND NOT runtime.rolsuper
      AND NOT runtime.rolcreatedb
      AND NOT runtime.rolcreaterole
      AND NOT runtime.rolinherit
      AND NOT runtime.rolreplication
      AND NOT runtime.rolbypassrls
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles executor
    WHERE executor.rolname = '$API_EXECUTION_ROLE'
      AND NOT executor.rolcanlogin
      AND NOT executor.rolsuper
      AND NOT executor.rolcreatedb
      AND NOT executor.rolcreaterole
      AND NOT executor.rolinherit
      AND NOT executor.rolreplication
      AND NOT executor.rolbypassrls
  )
  AND pg_catalog.pg_has_role('$RUNTIME_DB_PRINCIPAL', '$API_EXECUTION_ROLE', 'MEMBER')
THEN 'READY' ELSE 'BLOCKED' END;
ROLLBACK;
SQL
)"

[[ "$role_state" == *'READY'* ]]
[[ "$role_state" != *'BLOCKED'* ]]

execution_state="$(psql \
  -X -A -t -q -v ON_ERROR_STOP=1 \
  -h "$POOL_HOST" \
  -p "$POOL_PORT" \
  -U "$ADMIN_POOL_USER" \
  -d "$POOL_DB" <<SQL
BEGIN READ ONLY;
SET LOCAL ROLE $API_EXECUTION_ROLE;
SELECT CASE WHEN
  current_user = '$API_EXECUTION_ROLE'
  AND current_setting('transaction_read_only') = 'on'
THEN 'READY' ELSE 'BLOCKED' END;
ROLLBACK;
SQL
)"

[[ "$execution_state" == *'READY'* ]]
[[ "$execution_state" != *'BLOCKED'* ]]

echo 'Production direct PostgreSQL execution authority smoke passed in an explicit read-only transaction.'
