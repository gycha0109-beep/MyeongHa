#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1"
  local needle="$2"
  local sql="$3"
  local out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "$out" >&2
    fail "$label unexpectedly succeeded"
  fi
  if [[ "$out" != *"$needle"* ]]; then
    echo "$out" >&2
    fail "$label failed for unexpected reason"
  fi
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('c1100000-0000-0000-0000-000000000001'),
  ('c1100000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values
  ('c1200000-0000-0000-0000-000000000001','member','c1100000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('c1200000-0000-0000-0000-000000000002','member','c1100000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp())
on conflict do nothing;

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,source_kind,
  source_message_id,source_merge_action_id,supersedes_fact_id,confirmed_at,revoked_at,created_at
) values
  ('c1300000-0000-0000-0000-000000000001','c1200000-0000-0000-0000-000000000001','employment_status','life-fact-v1','{"value":"owner-record"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('c1300000-0000-0000-0000-000000000002','c1200000-0000-0000-0000-000000000002','employment_status','life-fact-v1','{"value":"other-record"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp());

insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,
  source_merge_action_id,created_by_character_id,revoked_at,created_at
) values
  ('c1400000-0000-0000-0000-000000000001','c1200000-0000-0000-0000-000000000001','consultation_detail','memory-v1','{"value":"owner-memory"}','user_approved',null,null,null,null,null,clock_timestamp()),
  ('c1400000-0000-0000-0000-000000000002','c1200000-0000-0000-0000-000000000002','consultation_detail','memory-v1','{"value":"other-memory"}','user_approved',null,null,null,null,null,clock_timestamp());
SQL

rls_shape=$("${psql_base[@]}" -At -F '|' -c "select
  (select relrowsecurity from pg_class where oid='public.life_facts'::regclass),
  (select relrowsecurity from pg_class where oid='public.memory_items'::regclass);")
[[ "$rls_shape" == 't|t' ]] || fail "Records runtime tables do not both have RLS enabled: $rls_shape"
pass "Records runtime tables have RLS enabled"

privilege_shape=$("${psql_base[@]}" -At -F '|' -c "select
  has_function_privilege('myeongha_api_executor','public.qry_life_record_ledger_v1(uuid)','EXECUTE'),
  has_function_privilege('myeongha_api_executor','public.qry_memory_items_v1(uuid)','EXECUTE'),
  has_column_privilege('myeongha_api_executor','public.life_facts','subject_id','SELECT'),
  has_column_privilege('myeongha_api_executor','public.memory_items','content_jsonb','SELECT'),
  has_column_privilege('myeongha_api_executor','public.memory_items','source_message_id','SELECT'),
  has_table_privilege('myeongha_api_executor','public.life_facts','INSERT'),
  has_table_privilege('myeongha_api_executor','public.life_facts','UPDATE'),
  has_table_privilege('myeongha_api_executor','public.memory_items','INSERT'),
  has_table_privilege('myeongha_api_executor','public.memory_items','UPDATE');")
[[ "$privilege_shape" == 't|t|t|t|f|f|f|f|f' ]] || fail "Records runtime privilege shape mismatch: $privilege_shape"
pass "executor has only intended Records read projection privileges"

owner_shape=$("${psql_base[@]}" -At -F '|' <<'SQL'
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','c1200000-0000-0000-0000-000000000001',true);
select
  (select value_jsonb->>'value' from public.qry_life_record_ledger_v1('c1200000-0000-0000-0000-000000000001') limit 1),
  (select content_jsonb->>'value' from public.qry_memory_items_v1('c1200000-0000-0000-0000-000000000001') limit 1);
rollback;
SQL
)
[[ "$owner_shape" == *'owner-record|owner-memory'* ]] || fail "executor owner Records read failed: $owner_shape"
pass "executor reads current-subject Life Record and Memory projections"

isolation_shape=$("${psql_base[@]}" -At -F '|' <<'SQL'
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','c1200000-0000-0000-0000-000000000001',true);
select
  (select count(*) from public.life_facts),
  (select count(*) from public.memory_items);
rollback;
SQL
)
[[ "$isolation_shape" == *'1|1'* ]] || fail "executor Records RLS owner isolation mismatch: $isolation_shape"
pass "executor direct Records SELECT is restricted to the transaction subject"

no_context_shape=$("${psql_base[@]}" -At -F '|' <<'SQL'
begin;
set local role myeongha_api_executor;
select
  (select count(*) from public.life_facts),
  (select count(*) from public.memory_items);
rollback;
SQL
)
[[ "$no_context_shape" == *'0|0'* ]] || fail "executor Records rows were visible without subject context: $no_context_shape"
pass "executor sees no Records rows without trusted subject context"

expect_fail \
  "executor cross-subject Life Record query" \
  "life record read requires an active canonical subject" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','c1200000-0000-0000-0000-000000000001',true); select * from public.qry_life_record_ledger_v1('c1200000-0000-0000-0000-000000000002'); rollback;"

expect_fail \
  "executor cross-subject Memory query" \
  "memory list requires an active canonical subject" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','c1200000-0000-0000-0000-000000000001',true); select * from public.qry_memory_items_v1('c1200000-0000-0000-0000-000000000002'); rollback;"

expect_fail \
  "executor hidden Memory provenance probe" \
  "permission denied" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','c1200000-0000-0000-0000-000000000001',true); select source_message_id from public.memory_items; rollback;"

echo "Records production read runtime authority tests passed"
