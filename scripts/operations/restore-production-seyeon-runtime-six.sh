#!/usr/bin/env bash
set -euo pipefail

# Exact, one-shot, fail-closed Production restore for the audited Seyeon runtime.
[[ "${SUPABASE_SEYEON_RUNTIME_SIX_ONLY:-false}" == 'true' ]]
[[ "${SUPABASE_PROMOTION_REPAIR_ONLY:-false}" == 'false' ]]
[[ "${SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:-false}" == 'false' ]]
[[ "${SUPABASE_PROJECT_ID:-}" == 'cnsfpcdiyofqvhpcegfc' ]]
: "${SUPABASE_DB_PASSWORD:?required}"
: "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:?required}"
[[ "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]]

versions=(1460 1470 1480 1490 1500 1510)
files=(
  supabase/migrations/1460_seyeon_production_relationship_runtime_read_v1.sql
  supabase/migrations/1470_seyeon_relationship_sync_outbox_v1.sql
  supabase/migrations/1480_seyeon_production_context_runtime_v1.sql
  supabase/migrations/1490_seyeon_production_chat_execution_runtime_v1.sql
  supabase/migrations/1500_seyeon_post_turn_analysis_runtime_v1.sql
  supabase/migrations/1510_seyeon_production_runtime_composition_v1.sql
)
for file in "${files[@]}"; do [[ -f "$file" ]] || { echo "Missing reviewed migration: $file" >&2; exit 1; }; done

export PGHOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" PGPORT=5432 PGDATABASE=postgres
export PGUSER="postgres.$SUPABASE_PROJECT_ID" PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE=require

# Refuse an already-started, partially installed, or differently migrated runtime.
preflight="$(psql -X -v ON_ERROR_STOP=1 -Atq <<'SQL'
BEGIN READ ONLY;
SELECT
  ((SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('1460','1470','1480','1490','1500','1510')) = 0)::text,
  ((SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('myeongha_seyeon_chat_runtime_owner','myeongha_seyeon_post_turn_owner')) = 0)::text,
  (pg_catalog.to_regprocedure('public.qry_production_relationship_runtime_v1(uuid,text)') IS NULL)::text,
  (pg_catalog.to_regprocedure('public.cmd_receive_seyeon_chat_turn_runtime_v1(uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,text)') IS NULL)::text,
  (pg_catalog.to_regprocedure('public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)') IS NULL)::text,
  (pg_catalog.to_regprocedure('public.cmd_receive_chat_turn_v1(uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,jsonb,text)') IS NOT NULL)::text,
  (pg_catalog.to_regprocedure('public.qry_content_bundle_manifest_v1(uuid)') IS NOT NULL)::text,
  (pg_catalog.to_regclass('public.outbox_events') IS NOT NULL)::text;
COMMIT;
SQL
)"
[[ "$preflight" == 'true|true|true|true|true|true|true|true' ]] || {
  echo "Seyeon Production runtime preflight failed; no changes applied." >&2
  exit 1
}

# psql -1 performs all six files under a single server transaction; any error rolls back.
psql -X -v ON_ERROR_STOP=1 -1 ${files[@]/#/-f }

# Record only the six versions whose SQL transaction committed.
encoded_password="$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ['SUPABASE_DB_PASSWORD'], safe=''))
PY
)"
db_url="postgresql://postgres.${SUPABASE_PROJECT_ID}:${encoded_password}@${PGHOST}:5432/postgres?sslmode=require"
echo "::add-mask::$db_url"
for version in "${versions[@]}"; do
  supabase migration repair "$version" --status applied --db-url "$db_url"
done

# History, functions and roles must all have materialized after the reviewed SQL.
postcheck="$(psql -X -v ON_ERROR_STOP=1 -Atq <<'SQL'
BEGIN READ ONLY;
SELECT
  ((SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('1460','1470','1480','1490','1500','1510')) = 6)::text,
  ((SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('myeongha_seyeon_chat_runtime_owner','myeongha_seyeon_post_turn_owner')) = 2)::text,
  (pg_catalog.to_regprocedure('public.qry_production_relationship_runtime_v1(uuid,text)') IS NOT NULL)::text,
  (pg_catalog.to_regprocedure('public.cmd_receive_seyeon_chat_turn_runtime_v1(uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,text)') IS NOT NULL)::text,
  (pg_catalog.to_regprocedure('public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)') IS NOT NULL)::text,
  pg_catalog.has_function_privilege('myeongha_api_executor',
    'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure, 'EXECUTE')::text,
  (NOT pg_catalog.has_function_privilege('anon',
    'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure, 'EXECUTE'))::text,
  (NOT pg_catalog.has_function_privilege('authenticated',
    'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure, 'EXECUTE'))::text,
  (NOT pg_catalog.has_function_privilege('service_role',
    'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure, 'EXECUTE'))::text;
COMMIT;
SQL
)"
[[ "$postcheck" == 'true|true|true|true|true|true|true|true|true' ]] || {
  echo "Seyeon runtime postcheck failed; investigate state before retry." >&2
  exit 1
}
echo 'Seyeon Production: exactly six reviewed runtime migrations applied and verified.'
