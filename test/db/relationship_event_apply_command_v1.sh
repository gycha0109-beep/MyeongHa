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

policy_hash="sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c"
subject_id="b1380000-0000-4000-8000-000000000001"
character_id="relationship-apply-v1-char"

"${psql_base[@]}" <<SQL
insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values (
  '$subject_id','guest',null,'active',null,clock_timestamp(),clock_timestamp()
);

insert into public.characters(character_id,created_at,retired_at)
values ('$character_id',clock_timestamp(),null);
SQL

role_shape=$("${psql_base[@]}" -At -F '|' -c "select
  r.rolcanlogin,
  r.rolsuper,
  r.rolcreatedb,
  r.rolcreaterole,
  r.rolinherit,
  r.rolreplication,
  r.rolbypassrls,
  pg_has_role('myeongha_api_executor','myeongha_relationship_apply_owner','MEMBER')
from pg_roles r
where r.rolname='myeongha_relationship_apply_owner';")
[[ "$role_shape" == 'f|f|f|f|f|f|f|f' ]] || fail "relationship apply owner role shape mismatch: $role_shape"
pass "relationship apply owner is isolated NOLOGIN/NOBYPASSRLS"

function_shape=$("${psql_base[@]}" -At -F '|' -c "select
  owner.rolname,
  p.prosecdef,
  has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE'),
  has_function_privilege('public',p.oid,'EXECUTE')
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join pg_roles owner on owner.oid=p.proowner
where n.nspname='public'
  and p.proname='cmd_apply_relationship_event_runtime_v1';")
[[ "$function_shape" == 'myeongha_relationship_apply_owner|t|t|f' ]] || fail "relationship apply function ACL/owner mismatch: $function_shape"
pass "executor can invoke only the SECURITY DEFINER relationship apply surface"

policy_shape=$("${psql_base[@]}" -At -F '|' -c "select
  p.policy_version,
  p.artifact_schema_version,
  p.content_hash,
  (p.artifact_jsonb ->> 'authority')
from public.relationship_policy_artifacts p
where p.policy_version='relationship-policy-v1';")
[[ "$policy_shape" == "relationship-policy-v1|relationship-policy-definition-v1|$policy_hash|source_owner_frozen_production_policy" ]] || fail "relationship policy DB binding mismatch: $policy_shape"
pass "compiled Production relationship policy identity is persisted"

first_apply=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  applied,
  replayed,
  revision_before,
  revision_after,
  closeness,
  trust,
  friction,
  attained_stage,
  current_condition
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'b1380000-0000-4000-8000-000000000101',
  'b1380000-0000-4000-8000-000000000102',
  0,
  'history:return-1',
  'b1380000-0000-4000-8000-000000000103',
  'event:return-1',
  '$character_id',
  'RETURN_AFTER_ABSENCE',
  '1',
  null,
  timestamptz '2026-09-27 01:00:00+00',
  'server_observation',
  'observation:return-1',
  '[]'::jsonb,
  '["authority:return-1"]'::jsonb,
  '["b1380000-0000-4000-8000-000000000104"]'::jsonb,
  '[]'::jsonb,
  '[{"factKey":"returned","statement":"server observed return","sourceRefs":["observation:return-1"]}]'::jsonb,
  null,
  '{"observationKey":"return-1"}'::jsonb,
  'return',
  'NON_PROGRESSION',
  false,
  0,0,0,
  null,
  'relationship-policy-v1',
  '$policy_hash',
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  'relationship-policy-state-v1',
  '{}'::jsonb
);
commit;
SQL
)
[[ "$first_apply" == *'t|f|0|1|0|0|0|S0_FIRST_MEETING|STABLE'* ]] || fail "first relationship apply mismatch: $first_apply"
pass "first Production Event atomically creates baseline and consumes revision 1"

first_stored=$("${psql_base[@]}" -At -F '|' -c "select
  s.revision,
  s.closeness,
  s.trust,
  s.friction,
  s.attained_stage,
  count(h.id),
  count(e.id),
  count(pr.id)
from public.user_character_states s
join public.relationship_history_entries h
  on h.subject_id=s.subject_id and h.character_id=s.character_id
join public.relationship_event_records e
  on e.history_entry_id=h.id
join public.relationship_event_provenance_refs pr
  on pr.event_id=e.id
where s.subject_id='$subject_id'
  and s.character_id='$character_id'
group by s.revision,s.closeness,s.trust,s.friction,s.attained_stage;")
[[ "$first_stored" == '1|0|0|0|S0_FIRST_MEETING|1|1|1' ]] || fail "first relationship persistence mismatch: $first_stored"
pass "history/Event/provenance/current projection commit together"

second_apply=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  applied,
  replayed,
  revision_before,
  revision_after,
  closeness,
  trust,
  friction
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'b1380000-0000-4000-8000-000000000201',
  'b1380000-0000-4000-8000-000000000202',
  1,
  'history:care-1',
  'b1380000-0000-4000-8000-000000000203',
  'event:care-1',
  '$character_id',
  'CARE_ACCEPTED_BY_CHARACTER',
  '1',
  '$character_id.accepted_help',
  timestamptz '2026-09-27 02:00:00+00',
  'server_observation',
  'observation:care-1',
  '[]'::jsonb,
  '["authority:care-1"]'::jsonb,
  '["b1380000-0000-4000-8000-000000000204"]'::jsonb,
  '[]'::jsonb,
  '[{"factKey":"care","statement":"server observed accepted care","sourceRefs":["observation:care-1"]}]'::jsonb,
  '{"statement":"character accepted the care","sourceRefs":["authority:care-1"]}'::jsonb,
  '{"careKey":"care-1"}'::jsonb,
  'care',
  'APPLIED',
  true,
  3,4,0,
  'care',
  'relationship-policy-v1',
  '$policy_hash',
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  'relationship-policy-state-v1',
  '{}'::jsonb
);
commit;
SQL
)
[[ "$second_apply" == *'t|f|1|2|3|4|0'* ]] || fail "second relationship apply mismatch: $second_apply"
pass "positive Production Event applies the frozen DB-constrained delta"

replay_shape=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  event_id,
  applied,
  replayed,
  revision_before,
  revision_after,
  closeness,
  trust
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'b1380000-0000-4000-8000-000000000301',
  'b1380000-0000-4000-8000-000000000302',
  0,
  'history:return-retry',
  'b1380000-0000-4000-8000-000000000303',
  'event:return-1',
  '$character_id',
  'RETURN_AFTER_ABSENCE',
  '1',
  null,
  timestamptz '2026-09-27 01:00:00+00',
  'server_observation',
  'observation:return-1',
  '[]'::jsonb,
  '["authority:return-1"]'::jsonb,
  '["b1380000-0000-4000-8000-000000000304"]'::jsonb,
  '[]'::jsonb,
  '[{"factKey":"returned","statement":"server observed return","sourceRefs":["observation:return-1"]}]'::jsonb,
  null,
  '{"observationKey":"return-1"}'::jsonb,
  'return',
  'NON_PROGRESSION',
  false,
  0,0,0,
  null,
  'relationship-policy-v1',
  '$policy_hash',
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  'relationship-policy-state-v1',
  '{}'::jsonb
);
commit;
SQL
)
[[ "$replay_shape" == *'b1380000-0000-4000-8000-000000000103|f|t|2|2|3|4'* ]] || fail "response-loss replay mismatch: $replay_shape"
pass "same logical Event retry replays before stale expectedRevision and consumes no revision"

expect_fail   "same dedupe with changed semantic material"   "already exists with different semantic material"   "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','$subject_id',true); select * from public.cmd_apply_relationship_event_runtime_v1('$subject_id','b1380000-0000-4000-8000-000000000401','b1380000-0000-4000-8000-000000000402',2,'history:return-conflict','b1380000-0000-4000-8000-000000000403','event:return-1','$character_id','RETURN_AFTER_ABSENCE','1',null,timestamptz '2026-09-27 01:00:00+00','server_observation','observation:return-CHANGED','[]'::jsonb,'["authority:return-1"]'::jsonb,'["b1380000-0000-4000-8000-000000000404"]'::jsonb,'[]'::jsonb,'[{"factKey":"returned","statement":"server observed return","sourceRefs":["observation:return-CHANGED"]}]'::jsonb,null,'{"observationKey":"return-1"}'::jsonb,'return','NON_PROGRESSION',false,0,0,0,null,'relationship-policy-v1','$policy_hash','S0_FIRST_MEETING','S0_FIRST_MEETING','STABLE','relationship-policy-state-v1','{}'::jsonb); rollback;"

expect_fail   "new Event with stale revision"   "expected revision is stale"   "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','$subject_id',true); select * from public.cmd_apply_relationship_event_runtime_v1('$subject_id','b1380000-0000-4000-8000-000000000501','b1380000-0000-4000-8000-000000000502',0,'history:return-stale','b1380000-0000-4000-8000-000000000503','event:return-stale','$character_id','RETURN_AFTER_ABSENCE','1',null,timestamptz '2026-09-27 04:00:00+00','server_observation','observation:return-stale','[]'::jsonb,'["authority:return-stale"]'::jsonb,'["b1380000-0000-4000-8000-000000000504"]'::jsonb,'[]'::jsonb,'[{"factKey":"returned","statement":"server observed return","sourceRefs":["observation:return-stale"]}]'::jsonb,null,'{"observationKey":"return-stale"}'::jsonb,'return','NON_PROGRESSION',false,0,0,0,null,'relationship-policy-v1','$policy_hash','S0_FIRST_MEETING','S0_FIRST_MEETING','STABLE','relationship-policy-state-v1','{}'::jsonb); rollback;"

expect_fail   "causal outcome without predecessor rolls back atomically"   "requires exactly one causal predecessor"   "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','$subject_id',true); select * from public.cmd_apply_relationship_event_runtime_v1('$subject_id','b1380000-0000-4000-8000-000000000601','b1380000-0000-4000-8000-000000000602',2,'history:kept-missing-cause','b1380000-0000-4000-8000-000000000603','event:kept-missing-cause','$character_id','COMMITMENT_KEPT','1',null,timestamptz '2026-09-27 05:00:00+00','server_observation','observation:kept-missing-cause','[]'::jsonb,'["authority:kept-missing-cause"]'::jsonb,'["b1380000-0000-4000-8000-000000000604"]'::jsonb,'[]'::jsonb,'[{"factKey":"promise","statement":"promise kept","sourceRefs":["observation:kept-missing-cause"]}]'::jsonb,null,'{"commitmentKey":"promise-1"}'::jsonb,'commitment','APPLIED',true,4,5,0,'commitment_follow_through','relationship-policy-v1','$policy_hash','S0_FIRST_MEETING','S0_FIRST_MEETING','STABLE','relationship-policy-state-v1','{}'::jsonb); rollback;"

atomic_shape=$("${psql_base[@]}" -At -F '|' -c "select
  s.revision,
  s.closeness,
  s.trust,
  count(h.id),
  count(e.id)
from public.user_character_states s
join public.relationship_history_entries h
  on h.subject_id=s.subject_id and h.character_id=s.character_id
join public.relationship_event_records e
  on e.history_entry_id=h.id
where s.subject_id='$subject_id'
  and s.character_id='$character_id'
group by s.revision,s.closeness,s.trust;")
[[ "$atomic_shape" == '2|3|4|2|2' ]] || fail "failed causal Event leaked partial persistence: $atomic_shape"
pass "deferred causal failure leaves history and projection unchanged"

expect_fail   "executor direct relationship history INSERT"   "permission denied"   "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','$subject_id',true); insert into public.relationship_history_entries(id,subject_id,character_id,entry_kind,history_dedupe_key,state_revision_before,state_revision_after,applied_at) values ('b1380000-0000-4000-8000-000000000901','$subject_id','$character_id','event','direct-write',2,3,clock_timestamp()); rollback;"

expect_fail   "relationship apply without canonical Subject context"   "trusted MyeongHa subject execution context is required"   "begin; set local role myeongha_api_executor; select * from public.cmd_apply_relationship_event_runtime_v1('$subject_id','b1380000-0000-4000-8000-000000000701','b1380000-0000-4000-8000-000000000702',2,'history:no-context','b1380000-0000-4000-8000-000000000703','event:no-context','$character_id','RETURN_AFTER_ABSENCE','1',null,timestamptz '2026-09-27 06:00:00+00','server_observation','observation:no-context','[]'::jsonb,'["authority:no-context"]'::jsonb,'["b1380000-0000-4000-8000-000000000704"]'::jsonb,'[]'::jsonb,'[{"factKey":"returned","statement":"server observed return","sourceRefs":["observation:no-context"]}]'::jsonb,null,'{"observationKey":"no-context"}'::jsonb,'return','NON_PROGRESSION',false,0,0,0,null,'relationship-policy-v1','$policy_hash','S0_FIRST_MEETING','S0_FIRST_MEETING','STABLE','relationship-policy-state-v1','{}'::jsonb); rollback;"

echo "Production relationship Event apply V1 DB tests passed"
