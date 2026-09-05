#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }
expect_fail() {
  local label="$1" needle="$2" sql="$3" out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1); rc=$?
  set -e
  [[ $rc -ne 0 ]] || { echo "$out" >&2; fail "$label unexpectedly succeeded"; }
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('81000000-0000-0000-0000-000000000002'),
  ('81000000-0000-0000-0000-000000000003'),
  ('81000000-0000-0000-0000-000000000004'),
  ('81000000-0000-0000-0000-000000000005')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('82000000-0000-0000-0000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('82000000-0000-0000-0000-000000000002','member','81000000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('82000000-0000-0000-0000-000000000003','member','81000000-0000-0000-0000-000000000003','active',null,clock_timestamp(),clock_timestamp()),
  ('82000000-0000-0000-0000-000000000004','member','81000000-0000-0000-0000-000000000004','deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('82000000-0000-0000-0000-000000000005','member','81000000-0000-0000-0000-000000000005','active',null,clock_timestamp(),clock_timestamp()),
  ('82000000-0000-0000-0000-000000000006','guest',null,'merged','82000000-0000-0000-0000-000000000005',clock_timestamp(),clock_timestamp()),
  ('82000000-0000-0000-0000-000000000007','guest',null,'active',null,clock_timestamp(),clock_timestamp());

insert into public.profiles(subject_id,display_name,locale,timezone,onboarding_state,created_at,updated_at) values
  ('82000000-0000-0000-0000-000000000002','Before','ko-KR','Asia/Seoul','onboarding-v1:birth_done',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 hour'),
  ('82000000-0000-0000-0000-000000000003','Race','ko-KR','Asia/Seoul','onboarding-v1:chat_ready',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 hour'),
  ('82000000-0000-0000-0000-000000000004','Deleting','ko-KR','Asia/Seoul','onboarding-v1:complete',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 hour'),
  ('82000000-0000-0000-0000-000000000006','Merged','ko-KR','Asia/Seoul','onboarding-v1:complete',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 hour');
SQL

created=$("${psql_base[@]}" -At -F '|' -c "select subject_id,display_name,locale,timezone,coalesce(onboarding_state,'NULL'),updated_at is not null from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000001',null,'{\"displayName\":\"Guest Name\",\"locale\":\"ko-KR\",\"timezone\":\"Asia/Seoul\"}'::jsonb);")
[[ "$created" == '82000000-0000-0000-0000-000000000001|Guest Name|ko-KR|Asia/Seoul|NULL|t' ]] || fail "guest profile materialization mismatch: $created"
pass "active guest materializes current product profile with null expectedUpdatedAt"

me=$("${psql_base[@]}" -At -F '|' -c "select subject_id,display_name,locale,timezone,profile_updated_at is not null from public.qry_subject_profile_current_v1('82000000-0000-0000-0000-000000000001');")
[[ "$me" == '82000000-0000-0000-0000-000000000001|Guest Name|ko-KR|Asia/Seoul|t' ]] || fail "GET /api/me projection did not observe materialized profile: $me"
pass "GET /api/me current projection observes profile patch authority"

expect_fail "existing profile cannot be patched with null expectedUpdatedAt" "profile updatedAt does not match expected value" "select * from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000001',null,'{\"displayName\":\"stale\"}'::jsonb);"
expect_fail "missing profile cannot claim a non-null expectedUpdatedAt" "profile updatedAt does not match expected value" "select * from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000007',clock_timestamp(),'{\"displayName\":\"wrong\"}'::jsonb);"

member_before=$("${psql_base[@]}" -At -c "select updated_at from public.profiles where subject_id='82000000-0000-0000-0000-000000000002';")
updated=$("${psql_base[@]}" -At -F '|' -c "select display_name,locale,timezone,onboarding_state,updated_at > '$member_before'::timestamptz from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000002','$member_before'::timestamptz,'{\"displayName\":\"After\",\"timezone\":null}'::jsonb);")
[[ "$updated" == 'After|ko-KR||onboarding-v1:birth_done|t' ]] || fail "member partial patch mismatch: $updated"
pass "partial patch preserves omitted locale/onboarding state and explicit null clears timezone"

member_after=$("${psql_base[@]}" -At -c "select updated_at from public.profiles where subject_id='82000000-0000-0000-0000-000000000002';")
[[ "$member_after" != "$member_before" ]] || fail "profile CAS update did not advance updated_at"
expect_fail "stale profile patch is rejected" "profile updatedAt does not match expected value" "select * from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000002','$member_before'::timestamptz,'{\"locale\":\"en-US\"}'::jsonb);"
state_after_stale=$("${psql_base[@]}" -At -F '|' -c "select display_name,locale,coalesce(timezone,'NULL'),onboarding_state from public.profiles where subject_id='82000000-0000-0000-0000-000000000002';")
[[ "$state_after_stale" == 'After|ko-KR|NULL|onboarding-v1:birth_done' ]] || fail "stale patch mutated profile: $state_after_stale"
pass "stale updatedAt conflict leaves profile unchanged"

pending_before=$("${psql_base[@]}" -At -c "select updated_at from public.profiles where subject_id='82000000-0000-0000-0000-000000000004';")
pending=$("${psql_base[@]}" -At -F '|' -c "select display_name,onboarding_state from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000004','$pending_before'::timestamptz,'{\"displayName\":\"Deleting Updated\"}'::jsonb);")
[[ "$pending" == 'Deleting Updated|onboarding-v1:complete' ]] || fail "deletion-pending member current-profile patch mismatch: $pending"
pass "deletion-pending canonical member follows current /api/me identity boundary"

expect_fail "merged guest cannot patch current profile" "profile patch requires a current canonical guest or member subject" "select * from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000006',(select updated_at from public.profiles where subject_id='82000000-0000-0000-0000-000000000006'),'{\"displayName\":\"forbidden\"}'::jsonb);"
expect_fail "unknown subject cannot patch profile" "profile patch subject was not found" "select * from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000099',null,'{\"displayName\":\"missing\"}'::jsonb);"
expect_fail "null subject is denied" "profile patch subject is required" "select * from public.cmd_patch_profile_v1(null,null,'{\"displayName\":\"missing\"}'::jsonb);"
expect_fail "empty patch is denied" "profile patch must contain at least one supported field" "select * from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000001',(select updated_at from public.profiles where subject_id='82000000-0000-0000-0000-000000000001'),'{}'::jsonb);"
expect_fail "unknown patch field is denied" "profile patch contains an unsupported field" "select * from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000001',(select updated_at from public.profiles where subject_id='82000000-0000-0000-0000-000000000001'),'{\"onboardingState\":\"client-forged\"}'::jsonb);"
expect_fail "non-string patch value is denied" "profile patch fields must be strings or null" "select * from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000001',(select updated_at from public.profiles where subject_id='82000000-0000-0000-0000-000000000001'),'{\"locale\":123}'::jsonb);"
expect_fail "non-object patch is denied" "profile patch must be a JSON object" "select * from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000001',(select updated_at from public.profiles where subject_id='82000000-0000-0000-0000-000000000001'),'[]'::jsonb);"

race_expected=$("${psql_base[@]}" -At -c "select updated_at from public.profiles where subject_id='82000000-0000-0000-0000-000000000003';")
rm -f /tmp/profile-patch-{1,2}.{out,rc}
(
  set +e
  "${psql_base[@]}" -Atc "begin; select display_name from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000003','$race_expected'::timestamptz,'{\"displayName\":\"Race A\"}'::jsonb); select pg_sleep(0.4); commit;" >/tmp/profile-patch-1.out 2>&1
  echo $? >/tmp/profile-patch-1.rc
) & p1=$!
sleep 0.08
(
  set +e
  "${psql_base[@]}" -Atc "select display_name from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000003','$race_expected'::timestamptz,'{\"displayName\":\"Race B\"}'::jsonb);" >/tmp/profile-patch-2.out 2>&1
  echo $? >/tmp/profile-patch-2.rc
) & p2=$!
wait $p1; wait $p2
rc1=$(cat /tmp/profile-patch-1.rc); rc2=$(cat /tmp/profile-patch-2.rc)
[[ "$rc1" == '0' ]] || { cat /tmp/profile-patch-1.out >&2; fail "first profile CAS racer failed"; }
[[ "$rc2" != '0' ]] || { cat /tmp/profile-patch-2.out >&2; fail "second profile CAS racer unexpectedly succeeded"; }
grep -q "profile updatedAt does not match expected value" /tmp/profile-patch-2.out || { cat /tmp/profile-patch-2.out >&2; fail "second profile CAS racer failed for unexpected reason"; }
[[ "$("${psql_base[@]}" -Atc "select display_name from public.profiles where subject_id='82000000-0000-0000-0000-000000000003';")" == 'Race A' ]] || fail "profile CAS race did not preserve single winner"
pass "concurrent same-updatedAt patches -> one winner plus one revision conflict"

rm -f /tmp/profile-create-{1,2}.{out,rc}
(
  set +e
  "${psql_base[@]}" -Atc "begin; select display_name from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000007',null,'{\"displayName\":\"Create A\"}'::jsonb); select pg_sleep(0.4); commit;" >/tmp/profile-create-1.out 2>&1
  echo $? >/tmp/profile-create-1.rc
) & c1=$!
sleep 0.08
(
  set +e
  "${psql_base[@]}" -Atc "select display_name from public.cmd_patch_profile_v1('82000000-0000-0000-0000-000000000007',null,'{\"displayName\":\"Create B\"}'::jsonb);" >/tmp/profile-create-2.out 2>&1
  echo $? >/tmp/profile-create-2.rc
) & c2=$!
wait $c1; wait $c2
crc1=$(cat /tmp/profile-create-1.rc); crc2=$(cat /tmp/profile-create-2.rc)
[[ "$crc1" == '0' ]] || { cat /tmp/profile-create-1.out >&2; fail "first profile materialization racer failed"; }
[[ "$crc2" != '0' ]] || { cat /tmp/profile-create-2.out >&2; fail "second profile materialization racer unexpectedly succeeded"; }
grep -q "profile was created concurrently" /tmp/profile-create-2.out || { cat /tmp/profile-create-2.out >&2; fail "second materialization racer failed for unexpected reason"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.profiles where subject_id='82000000-0000-0000-0000-000000000007';")" == '1' ]] || fail "concurrent profile materialization created duplicate rows"
[[ "$("${psql_base[@]}" -Atc "select display_name from public.profiles where subject_id='82000000-0000-0000-0000-000000000007';")" == 'Create A' ]] || fail "profile materialization race did not preserve first committed authority"
pass "concurrent first profile materialization -> one row plus one revision conflict"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_patch_profile_v1(uuid,timestamp with time zone,jsonb)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "profile patch command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "profile patch PUBLIC EXECUTE remains revoked and public table catalog remains 60"

echo "Profile patch persistence/concurrency tests passed."