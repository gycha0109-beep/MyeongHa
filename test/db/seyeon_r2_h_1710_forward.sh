#!/usr/bin/env bash
set -euo pipefail
# 1710 original SQL replay only inside CI-owned disposable PostgreSQL 17.
# Watchtower-Track: ops
hold() { echo "HOLD_R2_H_1710_$1" >&2; exit 1; }
pass() { echo "PASS_R2_H_1710_$1"; }
[[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || hold NOT_CI
[[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGUSER" == postgres ]] || hold NOT_LOCAL_POSTGRES
[[ "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold NOT_PG17
[[ "$(psql -X -Atqc 'select current_database()')" == "$PGDATABASE" ]] || hold DATABASE_MISMATCH
[[ "$(psql -X -Atqc 'select current_user')" == postgres ]] || hold ACTOR_MISMATCH
[[ "$(git hash-object supabase/migrations/1690_seyeon_detached_cost_settlement_worker_v1.sql)" == 79026a10855fbafaf2e4465e0a382e37ce1a16cd ]] || hold SOURCE_1690_DRIFT
[[ "$(git hash-object supabase/migrations/1700_seyeon_governed_reservation_receipt_pin_v1.sql)" == fb8803f8cdb3b6cfb76dd8e1faa2cc8dcdcf043f ]] || hold SOURCE_1700_DRIFT
[[ "$(git hash-object supabase/migrations/1710_seyeon_provider_receipt_queue_v1.sql)" == 1d0e773a8e8b27474a0fde182d75433077d8add8 ]] || hold SOURCE_1710_DRIFT
[[ "$(psql -X -Atqc "select to_regclass('public.seyeon_ai_provider_receipt_queue_v1') is null")" == t ]] || hold QUEUE_ALREADY_EXISTS
[[ "$(psql -X -Atqc "select to_regprocedure('public.pin_seyeon_governed_reservation_receipt_v1()') is not null")" == t ]] || hold 1700_MISSING
[[ "$(psql -X -Atqc "select to_regrole('myeongha_seyeon_settlement_worker') is not null")" == t ]] || hold 1690_WORKER_MISSING
[[ "$(psql -X -Atqc "select to_regrole('myeongha_seyeon_governed_executor') is not null")" == t ]] || hold 1630_EXECUTOR_MISSING

schema_acl_before="$(psql -X -Atqc "select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='public'")"
ledger_before="$(psql -X -Atqc "select relowner::text||':'||coalesce(relacl::text,'NULL')||':'||relrowsecurity::text||':'||relforcerowsecurity::text from pg_class where oid='public.seyeon_ai_call_cost_events'::regclass")"
[[ -n "$ledger_before" ]] || hold LEDGER_ABSENT
# This original has no internal BEGIN/COMMIT. Prove rollback before forward.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
\i supabase/migrations/1710_seyeon_provider_receipt_queue_v1.sql
rollback;
SQL
[[ "$(psql -X -Atqc "select to_regclass('public.seyeon_ai_provider_receipt_queue_v1') is null")" == t ]] || hold ROLLBACK_QUEUE_REMAINS
[[ "$(psql -X -Atqc "select to_regprocedure('public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)') is null")" == t ]] || hold ROLLBACK_RPC_REMAINS
[[ "$(psql -X -Atqc "select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='public'")" == "$schema_acl_before" ]] || hold ROLLBACK_SCHEMA_ACL_DRIFT
pass ORIGINAL_ROLLBACK

psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1710_seyeon_provider_receipt_queue_v1.sql >/dev/null || hold FORWARD_FAILURE
[[ "$(psql -X -Atqc "select coalesce(nspacl::text,'NULL') from pg_namespace where nspname='public'")" == "$schema_acl_before" ]] || hold FORWARD_TRANSIENT_SCHEMA_GRANT
[[ "$(psql -X -Atqc "select relowner::text||':'||coalesce(relacl::text,'NULL')||':'||relrowsecurity::text||':'||relforcerowsecurity::text from pg_class where oid='public.seyeon_ai_call_cost_events'::regclass")" == "$ledger_before" ]] || hold LEDGER_OWNER_ACL_RLS_DRIFT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $proof$
declare
 f_store oid := to_regprocedure('public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)');
 f_claim oid := to_regprocedure('public.cmd_claim_seyeon_provider_receipt_v1()');
 f_ack oid := to_regprocedure('public.cmd_ack_seyeon_provider_receipt_v1(uuid,uuid)');
 f oid;
begin
 if f_store is null or f_claim is null or f_ack is null
 then raise exception 'HOLD_1710_RPC_MISSING'; end if;
 if not exists (select 1 from pg_class c where c.oid='public.seyeon_ai_provider_receipt_queue_v1'::regclass
   and c.relrowsecurity and c.relforcerowsecurity
   and c.relowner='myeongha_seyeon_cost_meter_owner'::regrole)
 then raise exception 'HOLD_1710_QUEUE_RLS_OWNER'; end if;
 if exists (select 1 from pg_roles where rolname in ('myeongha_seyeon_governed_executor','myeongha_seyeon_settlement_worker')
   and (rolcanlogin or rolinherit or rolbypassrls))
 then raise exception 'HOLD_1710_SERVICE_ROLE_ATTRIBUTES'; end if;
 if exists (
   select 1 from pg_auth_members m
   where m.roleid='myeongha_seyeon_cost_meter_owner'::regrole
     and m.member='postgres'::regrole
 ) or has_schema_privilege('myeongha_seyeon_cost_meter_owner','public','CREATE')
 then raise exception 'HOLD_1710_OWNER_TEMPORARY_MEMBERSHIP_OR_CREATE'; end if;
 foreach f in array array[f_store,f_claim,f_ack] loop
   if not exists (select 1 from pg_proc p where p.oid=f
      and p.prosecdef and p.proowner='myeongha_seyeon_cost_meter_owner'::regrole
      and replace(array_to_string(p.proconfig,','),' ','') like '%search_path=pg_catalog,public%')
     or exists (select 1 from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
       where p.oid=f and acl.grantee=0 and acl.privilege_type='EXECUTE')
     or has_function_privilege('anon',f,'EXECUTE')
     or has_function_privilege('authenticated',f,'EXECUTE')
     or has_function_privilege('service_role',f,'EXECUTE')
   then raise exception 'HOLD_1710_RPC_OWNER_OR_BROWSER_ACL'; end if;
 end loop;
 if not has_function_privilege('myeongha_seyeon_governed_executor',f_store,'EXECUTE')
   or has_function_privilege('myeongha_seyeon_settlement_worker',f_store,'EXECUTE')
   or has_function_privilege('myeongha_seyeon_governed_executor',f_claim,'EXECUTE')
   or has_function_privilege('myeongha_seyeon_governed_executor',f_ack,'EXECUTE')
   or not has_function_privilege('myeongha_seyeon_settlement_worker',f_claim,'EXECUTE')
   or not has_function_privilege('myeongha_seyeon_settlement_worker',f_ack,'EXECUTE')
 then raise exception 'HOLD_1710_WORKER_GOVERNOR_CALLER_CROSS_GRANT'; end if;
 if has_table_privilege('myeongha_seyeon_governed_executor','public.seyeon_ai_provider_receipt_queue_v1','SELECT')
    or has_table_privilege('myeongha_seyeon_settlement_worker','public.seyeon_ai_provider_receipt_queue_v1','SELECT')
    or has_table_privilege('myeongha_seyeon_governed_executor','public.seyeon_ai_provider_receipt_queue_v1','INSERT')
    or has_table_privilege('myeongha_seyeon_settlement_worker','public.seyeon_ai_provider_receipt_queue_v1','UPDATE')
 then raise exception 'HOLD_1710_DIRECT_QUEUE_DML_EXPOSED'; end if;
 if (select count(*) from pg_policy where polrelid='public.seyeon_ai_provider_receipt_queue_v1'::regclass
       and polname='seyeon_ai_provider_receipt_owner_only_v1') <> 1
 then raise exception 'HOLD_1710_RLS_POLICY_MISSING'; end if;
 if (select count(*) from pg_constraint
   where conrelid='public.seyeon_ai_provider_receipt_queue_v1'::regclass and contype='f')<>1
 then raise exception 'HOLD_1710_LEDGER_FK_MISSING'; end if;
end $proof$;
SQL
pass FORWARD_OWNER_RLS_RPC_ACL_ROLE_FK

# Isolated PostgreSQL NULL semantics diagnostic. Original RPC contains
# these two bare NOT IN comparisons in one OR guard. Missing enum fields
# evaluate SQL UNKNOWN, not true; this is not a real admitted call proof.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $null$
declare v_outcome boolean; v_status boolean;
begin
 select (null::text not in (
    'response_received','http_failure','network_failure','timeout',
    'invalid_content_type','invalid_response')),
    (null::text not in ('estimated','usage_unknown'))
   into v_outcome,v_status;
 if v_outcome is not null or v_status is not null
 then raise exception 'HOLD_1710_NULL_ENUM_DIAGNOSTIC_MISMATCH'; end if;
end $null$;
\echo HOLD_R2_H_1710_MISSING_REQUIRED_ENUM_SQL_NULL_DIAGNOSTIC
SQL

# Refuse a second original application, asserting new queue and ACL stay intact.
if psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1710_seyeon_provider_receipt_queue_v1.sql >/dev/null 2>&1; then
  hold REPLAY_UNEXPECTEDLY_ALLOWED
fi
[[ "$(psql -X -Atqc "select to_regclass('public.seyeon_ai_provider_receipt_queue_v1') is not null")" == t ]] || hold REPLAY_CORRUPTED_QUEUE
pass REPLAY_FAIL_CLOSED
# R2-H 1760 nondeployable correction: prove the ORIGINAL Store RPC lets absent
# required enum fields progress past its malformed-receipt guard into the ledger
# lookup, then prove the proposed forward-only replacement rejects them BEFORE
# that lookup. Use only synthetic UUIDs, no reservation or Provider invocation.
fn_meta() {
 psql -X -Atqc "select p.oid::text||':'||p.proowner::text||':'||p.prosecdef::text||':'||coalesce(p.proacl::text,'NULL')||':'||coalesce(array_to_string(p.proconfig,','),'NULL') from pg_proc p where p.oid=to_regprocedure('public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)')"
}
original_fn_meta="$(fn_meta)"
[[ -n "$original_fn_meta" ]] || hold 1760_ORIGINAL_FUNCTION_METADATA_MISSING
psql -X -q -v ON_ERROR_STOP=1 -v expected_constraint=seyeon_provider_receipt_unreserved \\
  -f test/db/seyeon_r2_h_1760_required_enums.sql >/dev/null || hold 1760_ORIGINAL_GAP_NOT_REPRODUCED
pass 1760_ORIGINAL_SQL_NULL_ENUM_GAP_REPRODUCED_REAL_RPC
psql -X -q -v ON_ERROR_STOP=1 \\
  -f test/db/fixtures/1760_seyeon_provider_receipt_store_required_enums_v1.proposed.sql >/dev/null || hold 1760_PROPOSAL_REJECTED
[[ "$(fn_meta)" == "$original_fn_meta" ]] || hold 1760_FUNCTION_OWNER_OR_ACL_DRIFT
psql -X -q -v ON_ERROR_STOP=1 -v expected_constraint=seyeon_provider_receipt_malformed \\
  -f test/db/seyeon_r2_h_1760_required_enums.sql >/dev/null || hold 1760_REQUIRED_ENUMS_NOT_BLOCKED
pass 1760_ABSENT_AND_JSON_NULL_ENUMS_REJECTED_BEFORE_LEDGER
pass 1760_VALID_ENUM_UNRESERVED_PATH_PRESERVED
if psql -X -q -v ON_ERROR_STOP=1 \\
  -f test/db/fixtures/1760_seyeon_provider_receipt_store_required_enums_v1.proposed.sql >/dev/null 2>&1; then
  hold 1760_REPLAY_UNEXPECTEDLY_ALLOWED
fi
[[ "$(fn_meta)" == "$original_fn_meta" ]] || hold 1760_REPLAY_CHANGED_FUNCTION_METADATA
[[ "$(psql -X -Atqc 'select count(*) from public.seyeon_ai_provider_receipt_queue_v1')" == 0 ]] || hold 1760_QUEUE_MUTATED
pass 1760_REPLAY_FAIL_CLOSED_AND_ACL_OWNER_PRESERVED
echo "HOLD_R2_H_1760_OWNER_APPROVAL_REQUIRED original1710Unchanged=true productionWrites=0 positiveReservedReceiptE2E=false authorizedForProduction=false drReady=false"

echo "HOLD_R2_H_1710_OWNER_APPROVAL_REQUIRED missingEnumSqlNullDiagnostic=true actualReservedReceiptE2E=false claimAckConcurrencyE2E=false paidProviderCalls=0 productionWrites=0 drReady=false"
