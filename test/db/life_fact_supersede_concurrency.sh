#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose)

fail() {
  echo "FAIL $*" >&2
  exit 1
}

expect_failure() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local output status

  set +e
  output="$("${PSQL[@]}" -c "${sql}" 2>&1)"
  status=$?
  set -e

  [[ ${status} -ne 0 ]] || fail "${label}: statement unexpectedly succeeded"
  [[ "${output}" == *"${expected}"* ]] || {
    echo "${output}" >&2
    fail "${label}: expected ${expected}"
  }
  echo "PASS ${label} -> ${expected}"
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id) values
  ('fa010000-0000-0000-0000-000000000001'),
  ('fa010000-0000-0000-0000-000000000002'),
  ('fa010000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('fa100000-0000-0000-0000-000000000001','member','fa010000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('fa100000-0000-0000-0000-000000000002','member','fa010000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('fa100000-0000-0000-0000-000000000003','member','fa010000-0000-0000-0000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('fa100000-0000-0000-0000-000000000004','guest',null,'merged','fa100000-0000-0000-0000-000000000001',clock_timestamp(),clock_timestamp());

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,
  source_kind,source_message_id,source_merge_action_id,supersedes_fact_id,
  confirmed_at,revoked_at,created_at
) values
  ('fb100000-0000-0000-0000-000000000001','fa100000-0000-0000-0000-000000000001','relationship_status','v1','{"status":"dating"}'::jsonb,null,null,'profile_edit',null,null,null,clock_timestamp()-interval '2 days',null,clock_timestamp()-interval '2 days'),
  ('fb100000-0000-0000-0000-000000000010','fa100000-0000-0000-0000-000000000001','employment_status','v1','{"status":"employed"}'::jsonb,null,null,'profile_edit',null,null,null,clock_timestamp()-interval '2 days',null,clock_timestamp()-interval '2 days'),
  ('fb100000-0000-0000-0000-000000000020','fa100000-0000-0000-0000-000000000002','relationship_status','v1','{"status":"single"}'::jsonb,null,null,'profile_edit',null,null,null,clock_timestamp()-interval '2 days',null,clock_timestamp()-interval '2 days'),
  ('fb100000-0000-0000-0000-000000000030','fa100000-0000-0000-0000-000000000001','planned_event','v1','{"event":"trip"}'::jsonb,null,null,'profile_edit',null,null,null,clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day',clock_timestamp()-interval '2 days'),
  ('fb100000-0000-0000-0000-000000000040','fa100000-0000-0000-0000-000000000003','employment_status','v1','{"status":"employed"}'::jsonb,null,null,'profile_edit',null,null,null,clock_timestamp()-interval '2 days',null,clock_timestamp()-interval '2 days'),
  ('fb100000-0000-0000-0000-000000000050','fa100000-0000-0000-0000-000000000004','employment_status','v1','{"status":"employed"}'::jsonb,null,null,'profile_edit',null,null,null,clock_timestamp()-interval '2 days',null,clock_timestamp()-interval '2 days');
SQL

# 1. Normal PATCH semantics append a same-type successor and preserve the predecessor.
normal="$("${PSQL[@]}" -At -F '|' -c "select life_fact_id,supersedes_fact_id,fact_type,schema_version
from public.cmd_supersede_life_fact_v1(
  'fa100000-0000-0000-0000-000000000001',
  'fb100000-0000-0000-0000-000000000001',
  'fb100000-0000-0000-0000-000000000002',
  'v2', '{\"status\":\"single\"}'::jsonb,
  timestamptz '2026-08-28 00:00:00+00', null,
  'profile_edit', null
);")"
[[ "${normal}" == 'fb100000-0000-0000-0000-000000000002|fb100000-0000-0000-0000-000000000001|relationship_status|v2' ]] || fail "normal supersede result mismatch: ${normal}"

shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select value_jsonb->>'status' from public.life_facts where id='fb100000-0000-0000-0000-000000000001'),
  (select revoked_at is null from public.life_facts where id='fb100000-0000-0000-0000-000000000001'),
  (select value_jsonb->>'status' from public.life_facts where id='fb100000-0000-0000-0000-000000000002'),
  (select source_merge_action_id is null from public.life_facts where id='fb100000-0000-0000-0000-000000000002'),
  (select count(*) from public.record_access_grants where subject_id='fa100000-0000-0000-0000-000000000001');")"
[[ "${shape}" == 'dating|t|single|t|0' ]] || fail "append-only persistence/provenance shape mismatch: ${shape}"
echo "PASS Life Fact supersede appends same-type history and does not rewrite predecessor or fabricate grants"

# 2. The predecessor is no longer current and cannot branch to a second successor.
expect_failure \
  'stale predecessor cannot be superseded twice' \
  'cmd_life_fact_supersede_revision_conflict' \
  "select * from public.cmd_supersede_life_fact_v1(
    'fa100000-0000-0000-0000-000000000001',
    'fb100000-0000-0000-0000-000000000001',
    'fb100000-0000-0000-0000-000000000003',
    'v2', '{\"status\":\"married\"}'::jsonb,
    null, null, 'profile_edit', null);"

current_count="$("${PSQL[@]}" -At -c "select count(*) from public.life_facts lf
where lf.subject_id='fa100000-0000-0000-0000-000000000001'
  and lf.fact_type='relationship_status'
  and lf.revoked_at is null
  and not exists (select 1 from public.life_facts s where s.subject_id=lf.subject_id and s.supersedes_fact_id=lf.id);")"
[[ "${current_count}" == '1' ]] || fail "relationship_status current lineage branched: ${current_count}"
echo "PASS current lineage has exactly one non-revoked leaf after supersede"

# 3. A current successor may itself be superseded, forming a linear immutable chain.
chain="$("${PSQL[@]}" -At -F '|' -c "select life_fact_id,supersedes_fact_id,fact_type
from public.cmd_supersede_life_fact_v1(
  'fa100000-0000-0000-0000-000000000001',
  'fb100000-0000-0000-0000-000000000002',
  'fb100000-0000-0000-0000-000000000004',
  'v2', '{\"status\":\"married\"}'::jsonb,
  null, null, 'user_explicit', null
);")"
[[ "${chain}" == 'fb100000-0000-0000-0000-000000000004|fb100000-0000-0000-0000-000000000002|relationship_status' ]] || fail "linear chain append mismatch: ${chain}"
echo "PASS same-type Life Fact history advances as a linear successor chain"

# 4. Revoked and non-owner/current-subject inputs are denied.
expect_failure \
  'revoked fact is not a current supersession base' \
  'cmd_life_fact_supersede_revision_conflict' \
  "select * from public.cmd_supersede_life_fact_v1(
    'fa100000-0000-0000-0000-000000000001',
    'fb100000-0000-0000-0000-000000000030',
    'fb100000-0000-0000-0000-000000000031',
    'v1', '{\"event\":\"cancelled\"}'::jsonb,
    null, null, 'profile_edit', null);"

expect_failure \
  'cross-owner fact probing cannot mutate another owner fact' \
  'cmd_life_fact_supersede_current_not_found' \
  "select * from public.cmd_supersede_life_fact_v1(
    'fa100000-0000-0000-0000-000000000001',
    'fb100000-0000-0000-0000-000000000020',
    'fb100000-0000-0000-0000-000000000021',
    'v1', '{\"status\":\"dating\"}'::jsonb,
    null, null, 'profile_edit', null);"

expect_failure \
  'deletion-pending subject cannot write Life Record' \
  'cmd_life_fact_supersede_subject_ineligible' \
  "select * from public.cmd_supersede_life_fact_v1(
    'fa100000-0000-0000-0000-000000000003',
    'fb100000-0000-0000-0000-000000000040',
    'fb100000-0000-0000-0000-000000000041',
    'v1', '{\"status\":\"unemployed\"}'::jsonb,
    null, null, 'profile_edit', null);"

expect_failure \
  'merged guest cannot receive current Life Record writes' \
  'cmd_life_fact_supersede_subject_ineligible' \
  "select * from public.cmd_supersede_life_fact_v1(
    'fa100000-0000-0000-0000-000000000004',
    'fb100000-0000-0000-0000-000000000050',
    'fb100000-0000-0000-0000-000000000051',
    'v1', '{\"status\":\"unemployed\"}'::jsonb,
    null, null, 'profile_edit', null);"

# 5. Direct PATCH provenance is user/profile only; merge import remains merge-action authority.
expect_failure \
  'merge_import cannot bypass merge action authority through direct supersede' \
  'cmd_life_fact_supersede_source_kind' \
  "select * from public.cmd_supersede_life_fact_v1(
    'fa100000-0000-0000-0000-000000000001',
    'fb100000-0000-0000-0000-000000000010',
    'fb100000-0000-0000-0000-000000000011',
    'v1', '{\"status\":\"unemployed\"}'::jsonb,
    null, null, 'merge_import', null);"

expect_failure \
  'profile edit cannot claim conversation provenance' \
  'cmd_life_fact_supersede_profile_message_shape' \
  "select * from public.cmd_supersede_life_fact_v1(
    'fa100000-0000-0000-0000-000000000001',
    'fb100000-0000-0000-0000-000000000010',
    'fb100000-0000-0000-0000-000000000012',
    'v1', '{\"status\":\"unemployed\"}'::jsonb,
    null, null, 'profile_edit', 'fb990000-0000-0000-0000-000000000001');"

expect_failure \
  'invalid validity interval is rejected before insert' \
  'cmd_life_fact_supersede_valid_range' \
  "select * from public.cmd_supersede_life_fact_v1(
    'fa100000-0000-0000-0000-000000000001',
    'fb100000-0000-0000-0000-000000000010',
    'fb100000-0000-0000-0000-000000000013',
    'v1', '{\"status\":\"unemployed\"}'::jsonb,
    timestamptz '2026-09-02 00:00:00+00', timestamptz '2026-09-01 00:00:00+00',
    'profile_edit', null);"

# 6. Two writers targeting the same current fact serialize; exactly one successor wins.
race_dir="$(mktemp -d)"
set +e
"${PSQL[@]}" -q -c "begin; select * from public.cmd_supersede_life_fact_v1(
  'fa100000-0000-0000-0000-000000000001',
  'fb100000-0000-0000-0000-000000000010',
  'fc100000-0000-0000-0000-000000000001',
  'v2', '{\"status\":\"self_employed\"}'::jsonb,
  null, null, 'profile_edit', null); select pg_sleep(0.4); commit;" >"${race_dir}/a.out" 2>&1 &
a_pid=$!
"${PSQL[@]}" -q -c "begin; select * from public.cmd_supersede_life_fact_v1(
  'fa100000-0000-0000-0000-000000000001',
  'fb100000-0000-0000-0000-000000000010',
  'fc100000-0000-0000-0000-000000000002',
  'v2', '{\"status\":\"unemployed\"}'::jsonb,
  null, null, 'profile_edit', null); select pg_sleep(0.4); commit;" >"${race_dir}/b.out" 2>&1 &
b_pid=$!
wait "${a_pid}"; a_status=$?
wait "${b_pid}"; b_status=$?
set -e

if [[ ${a_status} -eq ${b_status} ]]; then
  echo "FAIL concurrent supersede expected exactly one winner: a=${a_status} b=${b_status}" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 20
fi
if [[ ${a_status} -ne 0 && "$(cat "${race_dir}/a.out")" != *'cmd_life_fact_supersede_revision_conflict'* ]]; then
  cat "${race_dir}/a.out" >&2
  fail "writer A lost without revision conflict"
fi
if [[ ${b_status} -ne 0 && "$(cat "${race_dir}/b.out")" != *'cmd_life_fact_supersede_revision_conflict'* ]]; then
  cat "${race_dir}/b.out" >&2
  fail "writer B lost without revision conflict"
fi
race_shape="$("${PSQL[@]}" -At -F '|' -c "select
  count(*),
  count(*) filter (where supersedes_fact_id='fb100000-0000-0000-0000-000000000010'),
  count(*) filter (where id in ('fc100000-0000-0000-0000-000000000001','fc100000-0000-0000-0000-000000000002'))
from public.life_facts
where subject_id='fa100000-0000-0000-0000-000000000001';")"
IFS='|' read -r race_total race_successors race_winners <<<"${race_shape}"
[[ "${race_successors}|${race_winners}" == '1|1' ]] || fail "concurrent supersede branched lineage: ${race_shape}"
echo "PASS double-supersede concurrency serializes to exactly one successor"
rm -rf "${race_dir}"

# 7. Database command surface remains narrow while application registry owns semantic value validation.
fn_shape="$("${PSQL[@]}" -At -F '|' -c "select p.provolatile,p.prosecdef,pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.oid='public.cmd_supersede_life_fact_v1(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz,text,uuid)'::regprocedure;")"
[[ "${fn_shape}" == 'v|f|TABLE(life_fact_id uuid, supersedes_fact_id uuid, fact_type text, schema_version text, confirmed_at timestamp with time zone)' ]] || fail "Life Fact supersede function shape mismatch: ${fn_shape}"

public_exec="$("${PSQL[@]}" -Atc "select case when has_function_privilege('public','public.cmd_supersede_life_fact_v1(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz,text,uuid)','EXECUTE') then '1' else '0' end;")"
[[ "${public_exec}" == '0' ]] || fail "Life Fact supersede unexpectedly executable by PUBLIC"

[[ "$("${PSQL[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
echo "PASS Life Fact supersede is VOLATILE, SECURITY INVOKER, PUBLIC-denied, and preserves the 60-table baseline"

echo "Life Fact supersede persistence/concurrency tests passed"
