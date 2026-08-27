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
  ('51000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000002');

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('51100000-0000-0000-0000-000000000001','member','51000000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-20 01:00:00+00',timestamptz '2026-08-20 01:30:00+00'),
  ('51100000-0000-0000-0000-000000000002','member','51000000-0000-0000-0000-000000000002','deletion_pending',null,timestamptz '2026-08-20 02:00:00+00',timestamptz '2026-08-20 02:30:00+00'),
  ('51100000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-20 03:00:00+00',timestamptz '2026-08-20 03:30:00+00'),
  ('51100000-0000-0000-0000-000000000004','guest',null,'merged','51100000-0000-0000-0000-000000000001',timestamptz '2026-08-20 04:00:00+00',timestamptz '2026-08-20 04:30:00+00'),
  ('51100000-0000-0000-0000-000000000005','member',null,'deleted',null,timestamptz '2026-08-20 05:00:00+00',timestamptz '2026-08-20 05:30:00+00');

insert into public.profiles(subject_id,display_name,locale,timezone,onboarding_state,created_at,updated_at) values
  ('51100000-0000-0000-0000-000000000001','Current Member','ko-KR','Asia/Seoul','complete',timestamptz '2026-08-20 01:10:00+00',timestamptz '2026-08-21 01:10:00+00'),
  ('51100000-0000-0000-0000-000000000002','Deleting Member','ko-KR','Asia/Seoul','complete',timestamptz '2026-08-20 02:10:00+00',timestamptz '2026-08-21 02:10:00+00'),
  ('51100000-0000-0000-0000-000000000004','Merged Guest','en-US','UTC','started',timestamptz '2026-08-20 04:10:00+00',timestamptz '2026-08-21 04:10:00+00'),
  ('51100000-0000-0000-0000-000000000005','Deleted Member','en-US','UTC','complete',timestamptz '2026-08-20 05:10:00+00',timestamptz '2026-08-21 05:10:00+00');
SQL

member=$("${psql_base[@]}" -At -F '|' -c "select subject_id,subject_kind,subject_status,display_name,locale,timezone,onboarding_state,to_char(profile_updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000001');")
[[ "$member" == '51100000-0000-0000-0000-000000000001|member|active|Current Member|ko-KR|Asia/Seoul|complete|2026-08-21 01:10:00' ]] || fail "active member profile projection mismatch: $member"
pass "active member receives current Subject/Profile projection"

pending=$("${psql_base[@]}" -At -F '|' -c "select subject_kind,subject_status,display_name,to_char(profile_updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000002');")
[[ "$pending" == 'member|deletion_pending|Deleting Member|2026-08-21 02:10:00' ]] || fail "deletion-pending member profile projection mismatch: $pending"
pass "deletion-pending member remains a current authenticated identity for profile read"

guest=$("${psql_base[@]}" -At -F '|' -c "select subject_kind,subject_status,coalesce(display_name,'<null>'),coalesce(locale,'<null>'),coalesce(timezone,'<null>'),coalesce(onboarding_state,'<null>'),coalesce(profile_updated_at::text,'<null>') from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000003');")
[[ "$guest" == 'guest|active|<null>|<null>|<null>|<null>|<null>' ]] || fail "active guest without profile projection mismatch: $guest"
pass "active guest identity remains readable without inventing a profile row or defaults"

projection_json=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000001') q;")
for required in subject_id subject_kind subject_status display_name locale timezone onboarding_state profile_updated_at; do
  [[ "$projection_json" == *"\"$required\""* ]] || fail "current profile projection omitted $required: $projection_json"
done
for forbidden in auth_user_id merged_into_subject_id created_at subject_updated_at; do
  [[ "$projection_json" != *"$forbidden"* ]] || fail "current profile projection leaked internal identity/lifecycle field $forbidden: $projection_json"
done
[[ "$projection_json" != *"51000000-0000-0000-0000-000000000001"* ]] || fail "auth identity mapping leaked through current profile projection"
pass "current profile projection omits auth mapping and merged-lineage internals"

before=$("${psql_base[@]}" -Atc "select s.status||'|'||s.updated_at::text||'|'||coalesce(p.display_name,'')||'|'||coalesce(p.updated_at::text,'') from public.subjects s left join public.profiles p on p.subject_id=s.id where s.id='51100000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select s.status||'|'||s.updated_at::text||'|'||coalesce(p.display_name,'')||'|'||coalesce(p.updated_at::text,'') from public.subjects s left join public.profiles p on p.subject_id=s.id where s.id='51100000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "current Subject/Profile read mutated owner/profile authority"
pass "current Subject/Profile query is read-only"

expect_fail "merged guest generic current profile read is denied" "current profile read requires a current canonical guest or member subject" "select * from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000004');"
expect_fail "deleted member generic current profile read is denied" "current profile read requires a current canonical guest or member subject" "select * from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000005');"
expect_fail "unknown subject current profile read is denied" "current profile read requires a current canonical guest or member subject" "select * from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000099');"
expect_fail "current subject id is required" "current subject id is required" "select * from public.qry_subject_profile_current_v1(null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_subject_profile_current_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "current Subject/Profile query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '59' ]] || fail "public table catalog changed"
pass "current Subject/Profile read remains API-mediated and public table catalog remains 59"

echo "current Subject/Profile query tests passed"
