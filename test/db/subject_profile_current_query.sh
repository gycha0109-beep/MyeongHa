#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
psql_quiet=(psql -X -qAt -v ON_ERROR_STOP=1)

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

insert into public.guest_sessions(id,subject_id,token_hash,expires_at,consumed_at,claimed_by_subject_id,created_at) values
  ('51200000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000003','hmac-sha256:k-test:guest-current',timestamptz '2099-01-01 00:00:00+00',null,null,timestamptz '2026-08-20 03:05:00+00');

insert into public.profiles(subject_id,display_name,locale,timezone,onboarding_state,created_at,updated_at) values
  ('51100000-0000-0000-0000-000000000001','Current Member','ko-KR','Asia/Seoul','complete',timestamptz '2026-08-20 01:10:00+00',timestamptz '2026-08-21 01:10:00+00'),
  ('51100000-0000-0000-0000-000000000002','Deleting Member','ko-KR','Asia/Seoul','complete',timestamptz '2026-08-20 02:10:00+00',timestamptz '2026-08-21 02:10:00+00'),
  ('51100000-0000-0000-0000-000000000004','Merged Guest','en-US','UTC','started',timestamptz '2026-08-20 04:10:00+00',timestamptz '2026-08-21 04:10:00+00'),
  ('51100000-0000-0000-0000-000000000005','Deleted Member','en-US','UTC','complete',timestamptz '2026-08-20 05:10:00+00',timestamptz '2026-08-21 05:10:00+00');
SQL

role_shape=$("${psql_quiet[@]}" -F '|' -c "select rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname='myeongha_api_executor';")
[[ "$role_shape" == 'f|f|f|f|f' ]] || fail "API execution role privilege shape mismatch: $role_shape"
pass "API execution role is NOLOGIN and cannot bypass RLS"

member=$("${psql_quiet[@]}" -F '|' -c "set local role myeongha_api_executor; select q.subject_id,q.subject_kind,q.subject_status,q.display_name,q.locale,q.timezone,q.onboarding_state,to_char(q.profile_updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.begin_member_subject_context_v1('51000000-0000-0000-0000-000000000001') ctx cross join lateral public.qry_subject_profile_current_v1(ctx.subject_id) q;")
[[ "$member" == '51100000-0000-0000-0000-000000000001|member|active|Current Member|ko-KR|Asia/Seoul|complete|2026-08-21 01:10:00' ]] || fail "active member profile projection mismatch: $member"
pass "verified member auth identity resolves to canonical member subject and current profile"

pending=$("${psql_quiet[@]}" -F '|' -c "set local role myeongha_api_executor; select q.subject_kind,q.subject_status,q.display_name,to_char(q.profile_updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.begin_member_subject_context_v1('51000000-0000-0000-0000-000000000002') ctx cross join lateral public.qry_subject_profile_current_v1(ctx.subject_id) q;")
[[ "$pending" == 'member|deletion_pending|Deleting Member|2026-08-21 02:10:00' ]] || fail "deletion-pending member profile projection mismatch: $pending"
pass "deletion-pending member remains resolvable for current profile read"

guest=$("${psql_quiet[@]}" -F '|' -c "set local role myeongha_api_executor; select q.subject_kind,q.subject_status,coalesce(q.display_name,'<null>'),coalesce(q.locale,'<null>'),coalesce(q.timezone,'<null>'),coalesce(q.onboarding_state,'<null>'),coalesce(q.profile_updated_at::text,'<null>') from public.begin_guest_subject_context_v1('hmac-sha256:k-test:guest-current') ctx cross join lateral public.qry_subject_profile_current_v1(ctx.subject_id) q;")
[[ "$guest" == 'guest|active|<null>|<null>|<null>|<null>|<null>' ]] || fail "active guest without profile projection mismatch: $guest"
pass "verified guest fingerprint resolves to canonical active guest subject"

projection_json=$("${psql_quiet[@]}" -c "set local role myeongha_api_executor; select row_to_json(q)::text from public.begin_member_subject_context_v1('51000000-0000-0000-0000-000000000001') ctx cross join lateral public.qry_subject_profile_current_v1(ctx.subject_id) q;")
for required in subject_id subject_kind subject_status display_name locale timezone onboarding_state profile_updated_at; do
  [[ "$projection_json" == *"\"$required\""* ]] || fail "current profile projection omitted $required: $projection_json"
done
for forbidden in auth_user_id merged_into_subject_id created_at subject_updated_at; do
  [[ "$projection_json" != *"$forbidden"* ]] || fail "current profile projection leaked internal identity/lifecycle field $forbidden: $projection_json"
done
[[ "$projection_json" != *"51000000-0000-0000-0000-000000000001"* ]] || fail "auth identity mapping leaked through current profile projection"
pass "current profile projection omits auth mapping and merged-lineage internals"

before=$("${psql_quiet[@]}" -c "select s.status||'|'||s.updated_at::text||'|'||coalesce(p.display_name,'')||'|'||coalesce(p.updated_at::text,'') from public.subjects s left join public.profiles p on p.subject_id=s.id where s.id='51100000-0000-0000-0000-000000000001';")
"${psql_quiet[@]}" -c "set local role myeongha_api_executor; select count(q.subject_id) from public.begin_member_subject_context_v1('51000000-0000-0000-0000-000000000001') ctx cross join lateral public.qry_subject_profile_current_v1(ctx.subject_id) q;" >/dev/null
after=$("${psql_quiet[@]}" -c "select s.status||'|'||s.updated_at::text||'|'||coalesce(p.display_name,'')||'|'||coalesce(p.updated_at::text,'') from public.subjects s left join public.profiles p on p.subject_id=s.id where s.id='51100000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "current Subject/Profile read mutated owner/profile authority"
pass "current Subject/Profile query remains read-only"

no_context_count=$("${psql_quiet[@]}" -c "set local role myeongha_api_executor; select count(id) from public.subjects;")
[[ "$no_context_count" == '0' ]] || fail "RLS exposed subject rows without trusted context: $no_context_count"
pass "RLS defaults to no visible Subject rows without trusted context"

own_rls_row=$("${psql_quiet[@]}" -F '|' -c "begin; set local role myeongha_api_executor; select * from public.begin_member_subject_context_v1('51000000-0000-0000-0000-000000000001'); select id,kind,status from public.subjects order by id; rollback;" | tail -n 1)
[[ "$own_rls_row" == '51100000-0000-0000-0000-000000000001|member|active' ]] || fail "RLS did not constrain Subject visibility to current canonical owner: $own_rls_row"
pass "RLS exposes only the transaction-bound canonical Subject"

context_after_commit=$("${psql_quiet[@]}" -c "begin; set local role myeongha_api_executor; select * from public.begin_member_subject_context_v1('51000000-0000-0000-0000-000000000001'); commit; select coalesce(public.current_myeongha_subject_id()::text,'<null>');" | tail -n 1)
[[ "$context_after_commit" == '<null>' ]] || fail "subject execution context leaked past transaction boundary: $context_after_commit"
pass "subject execution context is cleared at transaction end"

expect_fail "profile query without trusted context is denied" "trusted MyeongHa subject execution context is required" "set local role myeongha_api_executor; select * from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000001');"
expect_fail "cross-subject query is denied before projection" "subject execution context mismatch" "begin; set local role myeongha_api_executor; select * from public.begin_member_subject_context_v1('51000000-0000-0000-0000-000000000001'); select * from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000002');"
expect_fail "unknown member auth identity cannot establish context" "verified member identity does not resolve to a current canonical subject" "set local role myeongha_api_executor; select * from public.begin_member_subject_context_v1('51000000-0000-0000-0000-000000000099');"
expect_fail "unknown guest verifier cannot establish context" "verified guest identity does not resolve to an active canonical guest subject" "set local role myeongha_api_executor; select * from public.begin_guest_subject_context_v1('hmac-sha256:k-test:unknown');"
expect_fail "member resolver requires verified auth identity" "verified member authentication identity is required" "set local role myeongha_api_executor; select * from public.begin_member_subject_context_v1(null);"
expect_fail "guest resolver requires verified fingerprint" "verified guest credential fingerprint is required" "set local role myeongha_api_executor; select * from public.begin_guest_subject_context_v1('');"

expect_fail "merged guest generic current profile read is denied" "current profile read requires a current canonical guest or member subject" "begin; select set_config('myeongha.subject_id','51100000-0000-0000-0000-000000000004',true); select * from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000004');"
expect_fail "deleted member generic current profile read is denied" "current profile read requires a current canonical guest or member subject" "begin; select set_config('myeongha.subject_id','51100000-0000-0000-0000-000000000005',true); select * from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000005');"
expect_fail "unknown subject current profile read is denied" "current profile read requires a current canonical guest or member subject" "begin; select set_config('myeongha.subject_id','51100000-0000-0000-0000-000000000099',true); select * from public.qry_subject_profile_current_v1('51100000-0000-0000-0000-000000000099');"
expect_fail "current subject id is required" "current subject id is required" "select * from public.qry_subject_profile_current_v1(null);"

expect_fail "API role cannot read auth mapping column" "permission denied" "set local role myeongha_api_executor; select auth_user_id from public.subjects limit 1;"
expect_fail "API role cannot mutate Subject authority directly" "permission denied" "set local role myeongha_api_executor; update public.subjects set updated_at=clock_timestamp() where id='51100000-0000-0000-0000-000000000001';"

for signature in \
  'public.current_myeongha_subject_id()' \
  'public.assert_myeongha_subject_context_v1(uuid)' \
  'public.begin_member_subject_context_v1(uuid)' \
  'public.begin_guest_subject_context_v1(text)' \
  'public.qry_subject_profile_current_v1(uuid)'; do
  public_exec=$("${psql_quiet[@]}" -c "select case when has_function_privilege('public','$signature','EXECUTE') then '1' else '0' end;")
  [[ "$public_exec" == '0' ]] || fail "$signature unexpectedly executable by PUBLIC"
done
pass "identity resolver, context and current profile functions are not PUBLIC executable"

[[ "$("${psql_quiet[@]}" -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '59' ]] || fail "public table catalog changed"
pass "subject execution foundation adds no new product authority table"

echo "current Subject/Profile execution-context and RLS tests passed"
