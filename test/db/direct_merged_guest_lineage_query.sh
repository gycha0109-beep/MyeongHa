#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1" needle="$2" sql="$3" out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  [[ $rc -ne 0 ]] || { echo "$out" >&2; fail "$label unexpectedly succeeded"; }
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('f8a10000-0000-4000-8000-000000000001'),
  ('f8a10000-0000-4000-8000-000000000002'),
  ('f8a10000-0000-4000-8000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('f8a20000-0000-4000-8000-000000000001','member','f8a10000-0000-4000-8000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('f8a20000-0000-4000-8000-000000000002','member','f8a10000-0000-4000-8000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('f8a20000-0000-4000-8000-000000000003','member','f8a10000-0000-4000-8000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('f8a20000-0000-4000-8000-000000000004','member',null,'deleted',null,clock_timestamp(),clock_timestamp()),
  ('f8a30000-0000-4000-8000-000000000001','guest',null,'merged','f8a20000-0000-4000-8000-000000000001',clock_timestamp()-interval '3 days',clock_timestamp()),
  ('f8a30000-0000-4000-8000-000000000002','guest',null,'merged','f8a20000-0000-4000-8000-000000000001',clock_timestamp()-interval '2 days',clock_timestamp()),
  ('f8a30000-0000-4000-8000-000000000003','guest',null,'merged','f8a20000-0000-4000-8000-000000000002',clock_timestamp()-interval '1 day',clock_timestamp()),
  ('f8a30000-0000-4000-8000-000000000004','guest',null,'active',null,clock_timestamp(),clock_timestamp());
SQL

member_one=$("${psql_base[@]}" -Atc "select coalesce(string_agg(guest_subject_id::text,',' order by guest_subject_id),'') from public.qry_direct_merged_guest_subjects_v1('f8a20000-0000-4000-8000-000000000001');")
[[ "$member_one" == 'f8a30000-0000-4000-8000-000000000001,f8a30000-0000-4000-8000-000000000002' ]] || fail "member one direct lineage mismatch: $member_one"
pass "canonical member sees only its direct merged guest subjects"

member_two=$("${psql_base[@]}" -Atc "select coalesce(string_agg(guest_subject_id::text,',' order by guest_subject_id),'') from public.qry_direct_merged_guest_subjects_v1('f8a20000-0000-4000-8000-000000000002');")
[[ "$member_two" == 'f8a30000-0000-4000-8000-000000000003' ]] || fail "member two direct lineage mismatch: $member_two"
pass "merged guest lineage does not leak across canonical members"

pending=$("${psql_base[@]}" -Atc "select count(*) from public.qry_direct_merged_guest_subjects_v1('f8a20000-0000-4000-8000-000000000003');")
[[ "$pending" == '0' ]] || fail "deletion-pending canonical member unexpectedly received lineage: $pending"
pass "deletion-pending canonical member remains a readable current identity without fabricated lineage"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_direct_merged_guest_subjects_v1('f8a20000-0000-4000-8000-000000000001') q where q.guest_subject_id='f8a30000-0000-4000-8000-000000000004';")" == '0' ]] || fail "active guest leaked into merged history lineage"
pass "active non-merged guest is excluded from history lineage"

expect_fail "active guest cannot act as canonical history reader" "merged guest history read requires a current canonical member subject" "select * from public.qry_direct_merged_guest_subjects_v1('f8a30000-0000-4000-8000-000000000004');"
expect_fail "deleted member cannot act as current canonical history reader" "merged guest history read requires a current canonical member subject" "select * from public.qry_direct_merged_guest_subjects_v1('f8a20000-0000-4000-8000-000000000004');"
expect_fail "unknown subject cannot act as canonical history reader" "merged guest history read requires a current canonical member subject" "select * from public.qry_direct_merged_guest_subjects_v1('f8a20000-0000-4000-8000-000000000099');"
expect_fail "null canonical subject is denied" "canonical member subject id is required" "select * from public.qry_direct_merged_guest_subjects_v1(null);"

shape=$("${psql_base[@]}" -At -F '|' -c "select p.provolatile, pg_get_function_result(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.oid='public.qry_direct_merged_guest_subjects_v1(uuid)'::regprocedure;")
[[ "$shape" == 's|TABLE(guest_subject_id uuid)' ]] || fail "lineage query function shape mismatch: $shape"
public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_direct_merged_guest_subjects_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "direct merged guest lineage query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "lineage query is STABLE, UUID-only, PUBLIC EXECUTE revoked, and table catalog remains 60"

echo "Direct merged guest lineage projection tests passed"
