#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
# Keep psql command substitutions closed by the shell, not by a stray quoted terminator.

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
  ('c1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values
  (
    'c2000000-0000-0000-0000-000000000001',
    'member',
    'c1000000-0000-0000-0000-000000000001',
    'active',
    null,
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    'c2000000-0000-0000-0000-000000000002',
    'member',
    'c1000000-0000-0000-0000-000000000002',
    'active',
    null,
    clock_timestamp(),
    clock_timestamp()
  );
SQL

result=$("${psql_base[@]}" -Atqc "
begin;
set local role myeongha_api_executor;
select subject_id::text
from public.begin_member_subject_context_v1(
  'c1000000-0000-0000-0000-000000000001'
);
select deletion_job_id::text||':'||deletion_job_status||':'||(replayed::int)
from public.cmd_start_account_deletion_runtime_v1(
  'c2000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000001',
  'runtime-account-delete-1',
  'c4000000-0000-0000-0000-000000000001'
);
commit;
)
[[ "$result" == *"c2000000-0000-0000-0000-000000000001"* ]] || fail "member subject context did not resolve"
[[ "$result" == *"c3000000-0000-0000-0000-000000000001:running:0"* ]] || fail "runtime wrapper did not start deletion"
pass "API executor enters the canonical Member context and starts account deletion through the runtime wrapper"

state=$("${psql_base[@]}" -Atqc "
select
  s.status||'|'||
  dj.status||'|'||
  oe.event_type||'|'||
  oe.status
from public.subjects s
join public.data_deletion_jobs dj on dj.subject_id=s.id
join public.outbox_events oe
  on oe.aggregate_type='data_deletion_job'
 and oe.aggregate_id=dj.id::text
where s.id='c2000000-0000-0000-0000-000000000001'
  and dj.id='c3000000-0000-0000-0000-000000000001'
  and oe.id='c4000000-0000-0000-0000-000000000001';
)
[[ "$state" == "deletion_pending|running|ACCOUNT_DELETION_STARTED|pending" ]] || fail "runtime deletion state mismatch: $state"
pass "runtime wrapper preserves the core account-deletion transaction contract"

expect_fail \
  "API executor cannot invoke the historical core command directly" \
  "permission denied for function cmd_start_account_deletion_v1" \
  "begin; set local role myeongha_api_executor; select * from public.cmd_start_account_deletion_v1('c2000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-000000000002','direct-core-denied','c4000000-0000-0000-0000-000000000002'); rollback;"

expect_fail \
  "runtime wrapper rejects a subject different from the bound Member context" \
  "subject execution context mismatch" \
  "begin; set local role myeongha_api_executor; select * from public.begin_member_subject_context_v1('c1000000-0000-0000-0000-000000000002'); select * from public.cmd_start_account_deletion_runtime_v1('c2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000099','wrong-subject','c4000000-0000-0000-0000-000000000099'); rollback;"

public_exec=$("${psql_base[@]}" -Atqc "
select has_function_privilege(
  'public',
  'public.cmd_start_account_deletion_runtime_v1(uuid,uuid,text,uuid)',
  'EXECUTE'
);
)
[[ "$public_exec" == "f" ]] || fail "runtime wrapper is executable by PUBLIC"

api_direct_dml=$("${psql_base[@]}" -Atqc "
select
  (
    has_table_privilege('myeongha_api_executor','public.subjects','UPDATE')
    or has_table_privilege('myeongha_api_executor','public.data_deletion_jobs','INSERT')
    or has_table_privilege('myeongha_api_executor','public.outbox_events','INSERT')
  )::int;
)
[[ "$api_direct_dml" == "0" ]] || fail "API executor gained direct deletion table DML"
pass "runtime activation preserves closed direct-DML and PUBLIC boundaries"

echo "account deletion start runtime authority tests passed"
