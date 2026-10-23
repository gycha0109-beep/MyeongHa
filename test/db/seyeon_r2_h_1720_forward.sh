#!/usr/bin/env bash
set -euo pipefail
# R2-H 1720 original D-01 SQL, CI-owned disposable PostgreSQL 17 ONLY.
# Watchtower-Track: ops
hold() { echo "HOLD_R2_H_1720_$1" >&2; exit 1; }
pass() { echo "PASS_R2_H_1720_$1"; }
[[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || hold NOT_CI
[[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGUSER" == postgres ]] || hold NOT_LOCAL_PG17
[[ "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold WRONG_PG_VERSION
[[ "$(psql -X -Atqc 'select current_database()')" == "$PGDATABASE" ]] || hold WRONG_DATABASE
[[ "$(psql -X -Atqc 'select current_user')" == postgres ]] || hold WRONG_ACTOR
[[ "$(git hash-object supabase/migrations/1720_standard_reader_product_scope_read_v1.sql)" == 659df0d5a039d6617de20407ea129aab95fe1201 ]] || hold SOURCE_BLOB_DRIFT
[[ "$(psql -X -Atqc "select to_regrole('myeongha_api_executor') is not null")" == t ]] || hold API_EXECUTOR_MISSING
[[ "$(psql -X -Atqc "select to_regclass('public.standard_reading_product_specs') is not null")" == t ]] || hold PRODUCT_SPEC_SOURCE_MISSING
[[ "$(psql -X -Atqc "select to_regclass('public.products') is not null")" == t ]] || hold PRODUCTS_SOURCE_MISSING
[[ "$(psql -X -Atqc "select to_regprocedure('public.qry_standard_reading_product_scope_v1(uuid,text)') is null")" == t ]] || hold ALREADY_PRESENT
tables_acl() {
 psql -X -Atqc "select md5(string_agg(c.oid::text||':'||c.relowner::text||':'||coalesce(c.relacl::text,'NULL')||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text,'|' order by c.oid)) from pg_class c where c.oid in ('public.standard_reading_product_specs'::regclass,'public.products'::regclass)"
}
before="$(tables_acl)"
[[ -n "$before" ]] || hold EMPTY_TABLE_ACL_BASELINE

# Positive fact measured on PG17: the built-in accepts 'public' as the
# special PUBLIC privilege query despite no pg_roles row named public.
[[ "$(psql -X -Atqc "select to_regrole('public') is null")" == t ]] || hold UNEXPECTED_NAMED_PUBLIC_ROLE
pass PUBLIC_PSEUDO_GRANTEE_NO_NAMED_ROLE

# Original has no internal BEGIN/COMMIT. Verify full transaction rollback.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
\i supabase/migrations/1720_standard_reader_product_scope_read_v1.sql
rollback;
SQL
[[ "$(psql -X -Atqc "select to_regprocedure('public.qry_standard_reading_product_scope_v1(uuid,text)') is null")" == t ]] || hold ROLLBACK_FUNCTION_REMAINS
[[ "$(tables_acl)" == "$before" ]] || hold ROLLBACK_TABLE_ACL_DRIFT
pass ORIGINAL_ROLLBACK

# Apply exact original under a single explicit CI transaction (disposed).
psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1720_standard_reader_product_scope_read_v1.sql > /dev/null || hold ORIGINAL_FORWARD_FAILED
[[ "$(tables_acl)" == "$before" ]] || hold HISTORICAL_PRODUCT_ACL_RLS_DRIFT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL' > /dev/null
do $proof$
declare f oid := to_regprocedure('public.qry_standard_reading_product_scope_v1(uuid,text)');
begin
 if f is null then raise exception 'HOLD_1720_FUNCTION_MISSING'; end if;
 if not exists(select 1 from pg_proc p where p.oid=f
     and p.prosecdef and p.provolatile='v'
     and replace(array_to_string(p.proconfig,','),' ','') like '%search_path=pg_catalog,public%')
 then raise exception 'HOLD_1720_FUNCTION_PROPERTIES'; end if;
 if not has_function_privilege('myeongha_api_executor',f,'EXECUTE')
    or has_function_privilege('public',f,'EXECUTE')
    or has_function_privilege('anon',f,'EXECUTE')
    or has_function_privilege('authenticated',f,'EXECUTE')
    or has_function_privilege('service_role',f,'EXECUTE')
 then raise exception 'HOLD_1720_RPC_ACL'; end if;
 if exists(select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid=f and a.grantee=0 and a.privilege_type='EXECUTE')
 then raise exception 'HOLD_1720_PUBLIC_ACL_EXPLODED'; end if;
 if (select p.proowner::regrole::text from pg_proc p where p.oid=f) <> current_user
 then raise exception 'HOLD_1720_UNEXPECTED_TEST_FUNCTION_OWNER'; end if;
 if (select count(*) from public.qry_standard_reading_product_scope_v1(null::uuid,null::text)) <> 0
  or (select count(*) from public.qry_standard_reading_product_scope_v1(null::uuid,''::text)) <> 0
 then raise exception 'HOLD_1720_NULL_OR_EMPTY_LOOKUP_ACCEPTED'; end if;
end $proof$;
SQL
pass ORIGINAL_FORWARD_CATALOG_OWNER_ACL
pass NULL_OR_EMPTY_SCOPE_DENIED
pass PUBLIC_PRIVILEGE_CHECK_EXECUTED_AS_DESIGNED
echo "HOLD_R2_H_1720_PRIVILEGED_SECURITY_DEFINER_CREATOR_OWNER_REVIEW creatorInCi=postgres positiveProductScopeE2E=false productionWrites=0 readerActivation=false drReady=false"
