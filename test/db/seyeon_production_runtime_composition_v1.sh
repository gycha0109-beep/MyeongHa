#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

shape=$("${psql_base[@]}" -At -F '|' -c "
select
  pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  pg_catalog.has_function_privilege(
    'anon',
    'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_content_bundle_manifest_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ),
  pg_catalog.has_column_privilege(
    'myeongha_api_executor','public.content_bundles','id','SELECT'
  ),
  pg_catalog.has_column_privilege(
    'myeongha_api_executor','public.content_bundles','content_version','SELECT'
  ),
  pg_catalog.has_column_privilege(
    'myeongha_api_executor','public.character_runtime_catalog','content_bundle_id','SELECT'
  ),
  pg_catalog.has_column_privilege(
    'myeongha_api_executor','public.character_runtime_catalog','character_id','SELECT'
  );
")

[[ "$shape" == "t|f|f|f|t|t|t|t" ]] ||
  fail "Se-yeon dogfood manifest ACL mismatch: $shape"
pass "exact pinned bundle manifest is server-executor-only"

source=$(grep -F "does not decide client/content compatibility"   supabase/migrations/1480_seyeon_production_runtime_composition_v1.sql || true)
[[ -n "$source" ]] ||
  fail "migration lost explicit client compatibility non-authority statement"
pass "internal manifest authority does not claim SRC-15 compatibility"

echo "Se-yeon Production runtime composition V1 DB checks passed."
