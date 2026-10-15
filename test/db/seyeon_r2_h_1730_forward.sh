#!/usr/bin/env bash
set -euo pipefail
# Independent R2-H 1730 forward-only proposal; CI-owned disposable PG17 only.
# Watchtower-Track: ops
hold() { echo "HOLD_R2_H_1730_$1" >&2; exit 1; }
pass() { echo "PASS_R2_H_1730_$1"; }
[[ "${GITHUB_ACTIONS:-}" == true && "${DB_SUITE:-}" == postgres17 ]] || hold NOT_CI
[[ "${PGHOST:-}" == localhost && "${PGPORT:-}" == 5432 && "${PGUSER:-}" == postgres ]] || hold NOT_LOCAL
[[ "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold WRONG_PG
[[ "$(psql -X -Atqc 'select current_database()')" == "$PGDATABASE" ]] || hold DB_MISMATCH
[[ "$(git hash-object supabase/migrations/1700_seyeon_governed_reservation_receipt_pin_v1.sql)" == fb8803f8cdb3b6cfb76dd8e1faa2cc8dcdcf043f ]] || hold SOURCE_1700_DRIFT
[[ "$(git hash-object supabase/migrations/1710_seyeon_provider_receipt_queue_v1.sql)" == 1d0e773a8e8b27474a0fde182d75433077d8add8 ]] || hold SOURCE_1710_DRIFT
[[ "$(git hash-object test/db/fixtures/1730_seyeon_receipt_null_safe_constraints_v1.proposed.sql)" == bce667156a7235b59b7f0cd6d885d83f6e203e6b ]] || hold SOURCE_1730_DRIFT

before_catalog="$(psql -X -Atqc "select string_agg(c.relname||':'||c.relowner||':'||coalesce(c.relacl::text,'NULL')||':'||c.relrowsecurity||':'||c.relforcerowsecurity,'|' order by c.relname) from pg_class c where c.oid in ('public.seyeon_ai_call_cost_events'::regclass,'public.seyeon_ai_provider_receipt_queue_v1'::regclass)")"
before_rpc="$(psql -X -Atqc "select string_agg(p.proname||':'||p.proowner||':'||coalesce(p.proacl::text,'NULL')||':'||p.prosecdef,'|' order by p.proname) from pg_proc p where p.oid in ('public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)'::regprocedure,'public.cmd_claim_seyeon_provider_receipt_v1()'::regprocedure,'public.cmd_ack_seyeon_provider_receipt_v1(uuid,uuid)'::regprocedure)")"
[[ -n "$before_catalog" && -n "$before_rpc" ]] || hold BASE_CATALOG_EMPTY
[[ "$(psql -X -Atqc "select count(*) from pg_constraint where conname='seyeon_provider_queue_required_enums_v1'")" == 0 ]] || hold NOT_FRESH

# The 1730 proposal is internally atomic and revalidates both real tables.
psql -X -q -v ON_ERROR_STOP=1 -f test/db/fixtures/1730_seyeon_receipt_null_safe_constraints_v1.proposed.sql >/dev/null || hold APPLY
[[ "$(psql -X -Atqc "select string_agg(c.relname||':'||c.relowner||':'||coalesce(c.relacl::text,'NULL')||':'||c.relrowsecurity||':'||c.relforcerowsecurity,'|' order by c.relname) from pg_class c where c.oid in ('public.seyeon_ai_call_cost_events'::regclass,'public.seyeon_ai_provider_receipt_queue_v1'::regclass)")" == "$before_catalog" ]] || hold OWNER_ACL_RLS_CHANGED
[[ "$(psql -X -Atqc "select string_agg(p.proname||':'||p.proowner||':'||coalesce(p.proacl::text,'NULL')||':'||p.prosecdef,'|' order by p.proname) from pg_proc p where p.oid in ('public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)'::regprocedure,'public.cmd_claim_seyeon_provider_receipt_v1()'::regprocedure,'public.cmd_ack_seyeon_provider_receipt_v1(uuid,uuid)'::regprocedure)")" == "$before_rpc" ]] || hold RPC_OWNER_ACL_CHANGED
[[ "$(psql -X -Atqc "select count(*) from pg_constraint where (conrelid='public.seyeon_ai_call_cost_events'::regclass and conname='seyeon_ai_governor_receipt_pin_shape_v1' and convalidated) or (conrelid='public.seyeon_ai_provider_receipt_queue_v1'::regclass and conname='seyeon_provider_queue_required_enums_v1' and convalidated)")" == 2 ]] || hold REQUIRED_CONSTRAINTS_NOT_VALIDATED
pass REAL_TABLE_CONSTRAINTS_VALIDATED_OWNER_ACL_PRESERVED

# Reflect the ACTUAL installed CHECK expressions in synthetic temp tables:
# don't rely on manually duplicated predicates. All rows are fake/ephemeral.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $build$
declare receipt_expr text; event_expr text;
begin
  select pg_get_constraintdef(oid) into receipt_expr from pg_constraint
   where conrelid='public.seyeon_ai_call_cost_events'::regclass
    and conname='seyeon_ai_governor_receipt_pin_shape_v1';
  select pg_get_constraintdef(oid) into event_expr from pg_constraint
   where conrelid='public.seyeon_ai_provider_receipt_queue_v1'::regclass
    and conname='seyeon_provider_queue_required_enums_v1';
  if receipt_expr is null or event_expr is null then
    raise exception 'HOLD_1730_MISSING_REAL_CHECK';
  end if;
  execute format('create temporary table synthetic_1730_receipt (
    governor_bucket_utc_date date, governor_receipt_pinned_at timestamptz,
    governor_input_rate_micro_usd_per_million bigint,
    governor_cached_input_rate_micro_usd_per_million bigint,
    governor_output_rate_micro_usd_per_million bigint,
    %s)', receipt_expr);
  execute format('create temporary table synthetic_1730_queue (
    provider_event jsonb, %s)', event_expr);
end $build$;

insert into synthetic_1730_receipt values (null,null,null,null,null);
insert into synthetic_1730_receipt values (current_date,now(),2000000,0,4000000);
insert into synthetic_1730_queue values ('{"outcome":"timeout","costStatus":"usage_unknown"}');
insert into synthetic_1730_queue values ('{"outcome":"response_received","costStatus":"estimated"}');
\echo PASS_R2_H_1730_SYNTHETIC_VALID_STATES

do $negative$
begin
  begin
    insert into synthetic_1730_receipt values (current_date,now(),null,0,4000000);
    raise exception 'HOLD_1730_NULL_INPUT_RATE_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_receipt values (current_date,now(),2000000,null,4000000);
    raise exception 'HOLD_1730_NULL_CACHED_RATE_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_receipt values (current_date,now(),2000000,0,null);
    raise exception 'HOLD_1730_NULL_OUTPUT_RATE_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_receipt values (current_date,now(),0,0,4000000);
    raise exception 'HOLD_1730_ZERO_INPUT_RATE_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_receipt values (null,null,2000000,null,null);
    raise exception 'HOLD_1730_UNPINNED_RATE_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_queue values ('{"costStatus":"usage_unknown"}');
    raise exception 'HOLD_1730_MISSING_OUTCOME_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_queue values ('{"outcome":"timeout"}');
    raise exception 'HOLD_1730_MISSING_COST_STATUS_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_queue values ('{"outcome":null,"costStatus":"usage_unknown"}');
    raise exception 'HOLD_1730_JSON_NULL_OUTCOME_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_queue values ('{"outcome":"timeout","costStatus":null}');
    raise exception 'HOLD_1730_JSON_NULL_STATUS_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_queue values ('{"outcome":3,"costStatus":"usage_unknown"}');
    raise exception 'HOLD_1730_NONSTRING_OUTCOME_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into synthetic_1730_queue values ('{"outcome":"timeout","costStatus":"invoiced"}');
    raise exception 'HOLD_1730_BAD_ENUM_ACCEPTED';
  exception when check_violation then null; end;
end $negative$;
\echo PASS_R2_H_1730_NULL_MISSING_JSON_NULL_NONSTRING_BAD_ENUM_DENIED
SQL

# A second application must fail closed without erasing validated constraints.
if psql -X -q -v ON_ERROR_STOP=1 -f test/db/fixtures/1730_seyeon_receipt_null_safe_constraints_v1.proposed.sql >/dev/null 2>&1; then
  hold REPLAY_ALLOWED
fi
[[ "$(psql -X -Atqc "select count(*) from pg_constraint where (conrelid='public.seyeon_ai_call_cost_events'::regclass and conname='seyeon_ai_governor_receipt_pin_shape_v1' and convalidated) or (conrelid='public.seyeon_ai_provider_receipt_queue_v1'::regclass and conname='seyeon_provider_queue_required_enums_v1' and convalidated)")" == 2 ]] || hold REPLAY_DROPPED_CONSTRAINTS
pass REPLAY_FAIL_CLOSED
echo "HOLD_R2_H_1730_OWNER_APPROVAL_REQUIRED actualFundedE2E=false sourceLineageReconciled=false productionWrites=0 drReady=false"
