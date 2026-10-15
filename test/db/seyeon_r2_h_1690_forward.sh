#!/usr/bin/env bash
set -euo pipefail
# R2-H 1690: original internally committed SQL, disposable PG17 CI DB only.
# The CI run-db-track owner creates/drops the case DB and removes created roles.
# Watchtower-Track: ops
hold() { echo "HOLD_R2_H_1690_$1" >&2; exit 1; }
pass() { echo "PASS_R2_H_1690_$1"; }

[[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || hold NOT_CI
[[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGUSER" == postgres ]] || hold NOT_LOCAL_PG17
[[ "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold PG_VERSION
[[ "$(psql -X -Atqc 'select current_database()')" == "$PGDATABASE" ]] || hold WRONG_DB
[[ "$(psql -X -Atqc 'select current_user')" == postgres ]] || hold WRONG_MIGRATION_ACTOR
[[ "$(git hash-object supabase/migrations/1590_seyeon_ai_governor_atomic_settlement_v1.sql)" == 1a36e8f8b98f6c98c591572729685d7f6e319249 ]] || hold SOURCE_1590
[[ "$(git hash-object supabase/migrations/1610_seyeon_ai_governor_legacy_settlement_guard_v1.sql)" == ad4a961d4474b9048c8e397d092f354e032bd057 ]] || hold SOURCE_1610
[[ "$(git hash-object supabase/migrations/1630_seyeon_governed_execution_role_v1.sql)" == f02299ebc1d400532756c14101bc50e8423158d0 ]] || hold SOURCE_1630
[[ "$(git hash-object supabase/migrations/1690_seyeon_detached_cost_settlement_worker_v1.sql)" == 79026a10855fbafaf2e4465e0a382e37ce1a16cd ]] || hold SOURCE_1690

worker="myeongha_seyeon_settlement_worker"
owner="myeongha_seyeon_cost_meter_owner"
func="public.cmd_settle_seyeon_ai_call_detached_v1(uuid,uuid,uuid,text,jsonb)"
start="public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)"
settle="public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)"
[[ "$(psql -X -Atqc "select count(*) from pg_roles where rolname='myeongha_seyeon_governed_executor'")" == 1 ]] || hold MISSING_1630_ROLE
[[ "$(psql -X -Atqc "select count(*) from pg_proc where oid in ('$settle'::regprocedure,'$start'::regprocedure)")" == 2 ]] || hold MISSING_GOVERNED_FUNCTIONS
[[ "$(psql -X -Atqc "select count(*) from pg_roles where rolname='$worker'")" == 0 ]] || hold WORKER_ALREADY_PRESENT
[[ "$(psql -X -Atqc "select to_regprocedure('$func') is null")" == t ]] || hold FUNCTION_ALREADY_PRESENT
role_graph() { psql -X -Atqc "select md5(coalesce(string_agg(roleid::text||':'||member::text||':'||grantor::text,'|' order by roleid,member,grantor),'EMPTY')) from pg_auth_members"; }
schema_acl() { psql -X -Atqc "select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='public'"; }
routine() { psql -X -Atqc "select md5(pg_get_functiondef('$1'::regprocedure))"; }
graph_before="$(role_graph)"
schema_before="$(schema_acl)"
start_before="$(routine "$start")"
settle_before="$(routine "$settle")"
[[ -n "$graph_before" && -n "$schema_before" ]] || hold BASELINE_CATALOG

# Execute ORIGINAL 1690 BEGIN/COMMIT. No outer BEGIN/ROLLBACK imitation.
psql -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/1690_seyeon_detached_cost_settlement_worker_v1.sql >/dev/null || hold ORIGINAL_COMMIT_FAILED
[[ "$(routine "$start")" == "$start_before" && "$(routine "$settle")" == "$settle_before" ]] || hold HISTORICAL_SETTLEMENT_DRIFT
[[ "$(role_graph)" == "$graph_before" ]] || hold TRANSIENT_ROLE_MEMBERSHIP_REMAINED
[[ "$(schema_acl)" == "$schema_before" ]] || hold TRANSIENT_SCHEMA_CREATE_REMAINED

psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $audit$
declare
  v_worker oid := (select oid from pg_roles where rolname='myeongha_seyeon_settlement_worker');
  v_owner oid := (select oid from pg_roles where rolname='myeongha_seyeon_cost_meter_owner');
  v_func oid := to_regprocedure('public.cmd_settle_seyeon_ai_call_detached_v1(uuid,uuid,uuid,text,jsonb)');
  v_role text;
begin
  if v_worker is null or v_owner is null or v_func is null then
    raise exception 'HOLD_1690_MISSING_ROLE_OR_FUNCTION'; end if;
  if exists (select 1 from pg_roles where oid=v_worker and (
      rolcanlogin or rolsuper or rolcreatedb or rolcreaterole
      or rolinherit or rolreplication or rolbypassrls))
    or exists (select 1 from pg_auth_members where member=v_worker or roleid=v_worker)
  then raise exception 'HOLD_1690_WORKER_ESCALATED'; end if;
  if not exists (select 1 from pg_proc where oid=v_func and proowner=v_owner
      and prosecdef and replace(array_to_string(proconfig,','),' ','')
      like '%search_path=pg_catalog,public%')
  then raise exception 'HOLD_1690_SECURITY_DEFINER_OWNER'; end if;
  if not has_function_privilege('myeongha_seyeon_settlement_worker',v_func,'EXECUTE')
     or has_function_privilege('myeongha_seyeon_settlement_worker',
         'public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)','EXECUTE')
     or has_function_privilege('myeongha_seyeon_settlement_worker',
         'public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)','EXECUTE')
  then raise exception 'HOLD_1690_UNBOUNDED_WORKER_EXECUTE'; end if;
  foreach v_role in array array[
     'public','anon','authenticated','service_role',
     'myeongha_api_executor','myeongha_seyeon_governed_executor'
  ] loop
    if has_function_privilege(v_role,v_func,'EXECUTE') then
      raise exception 'HOLD_1690_PUBLIC_OR_GOVERNED_EXECUTE'; end if;
  end loop;
  if has_table_privilege('myeongha_seyeon_settlement_worker','public.seyeon_ai_call_cost_events','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('myeongha_seyeon_settlement_worker','public.seyeon_ai_governor_daily_budgets_v1','SELECT,INSERT,UPDATE,DELETE')
    or has_schema_privilege('myeongha_seyeon_cost_meter_owner','public','CREATE')
  then raise exception 'HOLD_1690_DIRECT_LEDGER_OR_SCHEMA_GRANT'; end if;
end
$audit$;
SQL
pass ORIGINAL_FORWARD_COMMIT_ROLE_ACL_OWNER
if [[ "$(psql -X -Atqc "select r.rolsuper::text from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='$func'::regprocedure")" == true ]]; then
  hold SUPERUSER_FUNCTION_OWNER
fi

expect_denied() {
  local tag="$1" expected="$2" sql="$3" result
  if result="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "$sql" 2>&1)"; then
    hold "UNEXPECTED_ALLOW_$tag"
  fi
  [[ "$result" == *"$expected"* ]] || hold "WRONG_DENIAL_$tag"
  pass "DENY_$tag"
}
expect_denied INVALID_INPUT 'requires a reserved call and exact source IDs' \
  "begin; set local role myeongha_seyeon_settlement_worker; select * from public.cmd_settle_seyeon_ai_call_detached_v1(null,null,null,'chat','{}'::jsonb);"
expect_denied UNRESERVED_CALL 'cannot create or claim a missing reservation' \
  "begin; set local role myeongha_seyeon_settlement_worker; select * from public.cmd_settle_seyeon_ai_call_detached_v1('e9900000-0000-0000-0000-000000000001','e9900000-0000-0000-0000-000000000002','e9900000-0000-0000-0000-000000000003','chat','{\"callId\":\"e9900000-0000-0000-0000-000000000004\"}'::jsonb);"
expect_denied GOVERNED_DIRECT 'permission denied' \
  "begin; set local role myeongha_seyeon_governed_executor; select * from public.cmd_settle_seyeon_ai_call_detached_v1(null,null,null,'chat','{}'::jsonb);"
pass NO_ARBITRARY_RESERVATION_OR_REOPEN

catalog_before="$(psql -X -Atqc "select md5(pg_get_functiondef('$func'::regprocedure)||coalesce((select proacl::text from pg_proc where oid='$func'::regprocedure),'NULL'))")"
# Reapplying non-idempotent SQL must fail and leave role/catalog unchanged.
if psql -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/1690_seyeon_detached_cost_settlement_worker_v1.sql >/dev/null 2>&1; then
  hold DUPLICATE_APPLICATION_ALLOWED
fi
[[ "$(role_graph)" == "$graph_before" && "$(schema_acl)" == "$schema_before" ]] || hold REPLAY_GRANT_DRIFT
[[ "$(psql -X -Atqc "select md5(pg_get_functiondef('$func'::regprocedure)||coalesce((select proacl::text from pg_proc where oid='$func'::regprocedure),'NULL'))")" == "$catalog_before" ]] || hold REPLAY_FUNCTION_DRIFT
pass REPLAY_FAIL_CLOSED
echo "HOLD_R2_H_1690_OWNER_APPROVAL_REQUIRED actualSettlementE2E=false credentialsProvisioned=false productionWrites=0 drReady=false"
