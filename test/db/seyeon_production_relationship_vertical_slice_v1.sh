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
subject_id="d1430000-0000-4000-8000-000000000001"
character_id="seyeon"

# Reuse an existing Se-yeon Character row when the canonical seed is already present.
"${psql_base[@]}" <<SQL
insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values (
  '$subject_id','guest',null,'active',null,clock_timestamp(),clock_timestamp()
);

insert into public.characters(character_id,created_at,retired_at)
values ('$character_id',clock_timestamp(),null)
on conflict (character_id) do nothing;
SQL

empty_read=$("${psql_base[@]}" -At <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select count(*)
from public.qry_production_relationship_runtime_v1(
  '$subject_id',
  '$character_id'
);
commit;
SQL
)
[[ "$empty_read" == *$'0
COMMIT'* ]] || fail "empty Production relationship read invented a baseline: $empty_read"
pass "Production relationship runtime read returns zero rows before first governed Event"

first_apply=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  revision_after,
  attained_stage,
  current_condition
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'd1430000-0000-4000-8000-000000000101',
  'd1430000-0000-4000-8000-000000000102',
  0,
  'history:seyeon-return',
  'd1430000-0000-4000-8000-000000000103',
  'seyeon-prod:return',
  '$character_id',
  'RETURN_AFTER_ABSENCE',
  '1',
  null,
  timestamptz '2026-09-28 01:00:00+00',
  'server_observation',
  'server:observation:return-v1',
  '[]'::jsonb,
  jsonb_build_array('seyeon-production-admission:return-v1'),
  jsonb_build_array('d1430000-0000-4000-8000-000000000104'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'factKey','return',
      'statement','server observed return',
      'sourceRefs',jsonb_build_array('server:observation:return-v1')
    )
  ),
  null,
  jsonb_build_object('observationKey','return-v1'),
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
  jsonb_build_object('behaviorAccess','STAGE_ALIGNED')
);
commit;
SQL
)
[[ "$first_apply" == *'1|S0_FIRST_MEETING|STABLE'* ]] || fail "first Se-yeon Production apply mismatch: $first_apply"

read_after_first=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  revision,
  attained_stage,
  current_candidate_stage,
  current_condition,
  policy_version,
  policy_content_hash
from public.qry_production_relationship_runtime_v1(
  '$subject_id',
  '$character_id'
);
commit;
SQL
)
[[ "$read_after_first" == *"1|S0_FIRST_MEETING|S0_FIRST_MEETING|STABLE|relationship-policy-v1|$policy_hash"* ]] || fail "Production relationship read after first Event mismatch: $read_after_first"
pass "next-turn read pins the committed Production revision and policy identity"

conflict_apply=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  revision_after,
  trust,
  friction,
  attained_stage,
  current_condition
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'd1430000-0000-4000-8000-000000000101',
  'd1430000-0000-4000-8000-000000000202',
  1,
  'history:seyeon-conflict',
  'd1430000-0000-4000-8000-000000000203',
  'seyeon-prod:conflict',
  '$character_id',
  'CONFLICT_OPENED',
  '1',
  'seyeon.conflict_opened',
  timestamptz '2026-09-28 02:00:00+00',
  'server_observation',
  'server:observation:conflict-v1',
  '[]'::jsonb,
  jsonb_build_array('seyeon-production-admission:conflict-v1'),
  jsonb_build_array('d1430000-0000-4000-8000-000000000204'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'factKey','conflict',
      'statement','server observed relationship conflict',
      'sourceRefs',jsonb_build_array('server:observation:conflict-v1')
    )
  ),
  null,
  jsonb_build_object('conflictKey','conflict-v1'),
  'conflict_repair',
  'NEGATIVE',
  false,
  0,-6,8,
  null,
  'relationship-policy-v1',
  '$policy_hash',
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'OPEN_CONFLICT',
  'relationship-policy-state-v1',
  jsonb_build_object('behaviorAccess','RESTRICTED_BY_CONFLICT')
);
commit;
SQL
)
[[ "$conflict_apply" == *'2|0|8|S0_FIRST_MEETING|OPEN_CONFLICT'* ]] || fail "Se-yeon conflict apply mismatch: $conflict_apply"

conflict_read=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  revision,
  attained_stage,
  current_condition,
  policy_state_jsonb ->> 'behaviorAccess'
from public.qry_production_relationship_runtime_v1(
  '$subject_id',
  '$character_id'
);
commit;
SQL
)
[[ "$conflict_read" == *'2|S0_FIRST_MEETING|OPEN_CONFLICT|RESTRICTED_BY_CONFLICT'* ]] || fail "Se-yeon Production conflict read mismatch: $conflict_read"
pass "conflict changes next-turn condition/access without regressing attained stage"

function_shape=$("${psql_base[@]}" -At -F '|' -c "select
  owner.rolname,
  p.prosecdef,
  has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE'),
  has_function_privilege('public',p.oid,'EXECUTE')
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join pg_roles owner on owner.oid=p.proowner
where n.nspname='public'
  and p.proname='qry_production_relationship_runtime_v1';")
[[ "$function_shape" == 'myeongha_relationship_apply_owner|t|t|f' ]] || fail "Production relationship read ACL/owner mismatch: $function_shape"
pass "Production relationship read remains a narrow SECURITY DEFINER surface"

expect_fail   "authenticated direct Production relationship runtime read"   "permission denied"   "begin; set local role authenticated; select * from public.qry_production_relationship_runtime_v1('$subject_id','$character_id'); rollback;"

echo "Se-yeon Production relationship vertical slice V1 DB tests passed"
