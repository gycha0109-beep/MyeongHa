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
  ('c1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000003'),
  ('c1000000-0000-0000-0000-000000000004'),
  ('c1000000-0000-0000-0000-000000000005'),
  ('c1000000-0000-0000-0000-000000000006'),
  ('c1000000-0000-0000-0000-000000000007'),
  ('c1000000-0000-0000-0000-000000000008'),
  ('c1000000-0000-0000-0000-000000000009')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('c2000000-0000-0000-0000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('c2000000-0000-0000-0000-000000000002','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('c2000000-0000-0000-0000-000000000003','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('c2000000-0000-0000-0000-000000000004','member','c1000000-0000-0000-0000-000000000004','active',null,clock_timestamp(),clock_timestamp()),
  ('c2000000-0000-0000-0000-000000000005','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('c2000000-0000-0000-0000-000000000006','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('c2000000-0000-0000-0000-000000000007','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('c2000000-0000-0000-0000-000000000008','guest',null,'active',null,clock_timestamp(),clock_timestamp());

insert into public.guest_sessions(id,subject_id,token_hash,expires_at,consumed_at,claimed_by_subject_id,created_at) values
  ('c3000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','guest-token-promote-a',clock_timestamp()+interval '1 day',null,null,clock_timestamp()),
  ('c3000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000002','guest-token-expired',clock_timestamp()-interval '1 hour',null,null,clock_timestamp()-interval '1 day'),
  ('c3000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000003','guest-token-consumed',clock_timestamp()+interval '1 day',clock_timestamp(), 'c2000000-0000-0000-0000-000000000004',clock_timestamp()-interval '1 hour'),
  ('c3000000-0000-0000-0000-000000000005','c2000000-0000-0000-0000-000000000005','guest-token-existing-member',clock_timestamp()+interval '1 day',null,null,clock_timestamp()),
  ('c3000000-0000-0000-0000-000000000006','c2000000-0000-0000-0000-000000000006','guest-token-race-same',clock_timestamp()+interval '1 day',null,null,clock_timestamp()),
  ('c3000000-0000-0000-0000-000000000007','c2000000-0000-0000-0000-000000000007','guest-token-race-different',clock_timestamp()+interval '1 day',null,null,clock_timestamp()),
  ('c3000000-0000-0000-0000-000000000008','c2000000-0000-0000-0000-000000000008','guest-token-cross-subject',clock_timestamp()+interval '1 day',null,null,clock_timestamp());

-- Existing guest-owned state proves same-subject promotion needs no owner-FK rewrite.
insert into public.profiles(subject_id,display_name,locale,timezone,onboarding_state,created_at,updated_at)
values ('c2000000-0000-0000-0000-000000000001','guest-name','ko-KR','Asia/Seoul','guest-started',clock_timestamp(),clock_timestamp());

insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at)
values ('c4000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','self','guest-self',null,null,clock_timestamp(),clock_timestamp());
SQL

result=$("${psql_base[@]}" -Atc "select subject_id||'|'||guest_session_id||'|'||subject_kind||'|'||subject_status||'|'||case when replayed then '1' else '0' end from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001');")
[[ "$result" == "c2000000-0000-0000-0000-000000000001|c3000000-0000-0000-0000-000000000001|member|active|0" ]] || fail "guest promotion result mismatch: $result"

subject_state=$("${psql_base[@]}" -Atc "select kind||'|'||status||'|'||auth_user_id||'|'||case when merged_into_subject_id is null then '1' else '0' end from public.subjects where id='c2000000-0000-0000-0000-000000000001';")
[[ "$subject_state" == "member|active|c1000000-0000-0000-0000-000000000001|1" ]] || fail "promoted subject state mismatch: $subject_state"

session_state=$("${psql_base[@]}" -Atc "select case when consumed_at is not null then '1' else '0' end||'|'||claimed_by_subject_id from public.guest_sessions where id='c3000000-0000-0000-0000-000000000001';")
[[ "$session_state" == "1|c2000000-0000-0000-0000-000000000001" ]] || fail "guest session was not consumed/claimed by same canonical subject: $session_state"

owner_state=$("${psql_base[@]}" -Atc "select p.subject_id||'|'||bp.subject_id from public.profiles p join public.birth_profiles bp on bp.subject_id=p.subject_id where p.subject_id='c2000000-0000-0000-0000-000000000001' and bp.id='c4000000-0000-0000-0000-000000000001';")
[[ "$owner_state" == "c2000000-0000-0000-0000-000000000001|c2000000-0000-0000-0000-000000000001" ]] || fail "guest-owned state was reparented during same-subject promotion: $owner_state"
pass "guest -> new member promotion keeps the same canonical subject and consumes/claims the exact guest session"

replay=$("${psql_base[@]}" -Atc "select subject_id||'|'||subject_kind||'|'||case when replayed then '1' else '0' end from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001');")
[[ "$replay" == "c2000000-0000-0000-0000-000000000001|member|1" ]] || fail "promotion response-loss replay mismatch: $replay"
pass "promotion retry replays final member/session authority without a fabricated idempotency key"

expect_fail "replay with different auth identity is denied" "guest promotion requires an active unmerged guest subject" "select * from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002');"
expect_fail "expired guest session cannot promote" "guest session has expired" "select * from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002');"
expect_fail "consumed guest session cannot be reused" "guest session has already been consumed or claimed" "select * from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000003','c3000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000003');"
expect_fail "existing member login must use guest merge" "auth identity already belongs to another subject; use guest merge" "select * from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000005','c3000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000004');"
expect_fail "guest session cannot be claimed through another subject" "guest session was not found for this subject" "select * from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000005','c3000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000005');"
expect_fail "unknown verified auth identity is denied" "verified auth identity does not exist" "select * from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000008','c3000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000099');"

# Same verified auth promotion racing twice: one mutation, one natural-state replay.
rm -f /tmp/guest-promote-same-1.out /tmp/guest-promote-same-2.out
(
  "${psql_base[@]}" -Atc "begin; select subject_id||'|'||case when replayed then '1' else '0' end from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000006','c3000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000006'); select pg_sleep(0.4); commit;" > /tmp/guest-promote-same-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select subject_id||'|'||case when replayed then '1' else '0' end from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000006','c3000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000006');" > /tmp/guest-promote-same-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
race_same=$(cat /tmp/guest-promote-same-1.out /tmp/guest-promote-same-2.out)
[[ "$race_same" == *"c2000000-0000-0000-0000-000000000006|0"* ]] || { cat /tmp/guest-promote-same-1.out /tmp/guest-promote-same-2.out >&2; fail "same promotion race missing winner"; }
[[ "$race_same" == *"c2000000-0000-0000-0000-000000000006|1"* ]] || { cat /tmp/guest-promote-same-1.out /tmp/guest-promote-same-2.out >&2; fail "same promotion race missing replay"; }
pass "concurrent duplicate guest promotion -> one mutation plus one authoritative replay"

# Two different auth identities race for the same guest/session: subject lock admits one only.
rm -f /tmp/guest-promote-diff-1.out /tmp/guest-promote-diff-2.out
(
  "${psql_base[@]}" -Atc "begin; select subject_id from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000007','c3000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000007'); select pg_sleep(0.4); commit;" > /tmp/guest-promote-diff-1.out 2>&1
) & p1=$!
sleep 0.08
set +e
"${psql_base[@]}" -Atc "select * from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000007','c3000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000008');" > /tmp/guest-promote-diff-2.out 2>&1 & p2=$!
wait $p2; rc2=$?
set -e
wait $p1
[[ $rc2 -ne 0 ]] || { cat /tmp/guest-promote-diff-2.out >&2; fail "different-auth race loser unexpectedly succeeded"; }
grep -q "guest promotion requires an active unmerged guest subject" /tmp/guest-promote-diff-2.out || { cat /tmp/guest-promote-diff-2.out >&2; fail "different-auth race failed for unexpected reason"; }
[[ "$("${psql_base[@]}" -Atc "select auth_user_id from public.subjects where id='c2000000-0000-0000-0000-000000000007';")" == "c1000000-0000-0000-0000-000000000007" ]] || fail "different-auth race did not preserve single winner"
pass "concurrent different-auth promotion -> exact subject lock admits one canonical identity"

# One auth identity cannot become canonical owner of two guest subjects even under concurrency.
"${psql_base[@]}" <<'SQL'
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('c2000000-0000-0000-0000-000000000011','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('c2000000-0000-0000-0000-000000000012','guest',null,'active',null,clock_timestamp(),clock_timestamp());
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,consumed_at,claimed_by_subject_id,created_at) values
  ('c3000000-0000-0000-0000-000000000011','c2000000-0000-0000-0000-000000000011','guest-token-auth-race-1',clock_timestamp()+interval '1 day',null,null,clock_timestamp()),
  ('c3000000-0000-0000-0000-000000000012','c2000000-0000-0000-0000-000000000012','guest-token-auth-race-2',clock_timestamp()+interval '1 day',null,null,clock_timestamp());
SQL

rm -f /tmp/guest-promote-auth-1.out /tmp/guest-promote-auth-2.out
set +e
("${psql_base[@]}" -Atc "select * from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000011','c3000000-0000-0000-0000-000000000011','c1000000-0000-0000-0000-000000000009');" > /tmp/guest-promote-auth-1.out 2>&1) & p1=$!
("${psql_base[@]}" -Atc "select * from public.cmd_promote_guest_v1('c2000000-0000-0000-0000-000000000012','c3000000-0000-0000-0000-000000000012','c1000000-0000-0000-0000-000000000009');" > /tmp/guest-promote-auth-2.out 2>&1) & p2=$!
wait $p1; rc1=$?
wait $p2; rc2=$?
set -e
if [[ $rc1 -eq 0 && $rc2 -eq 0 ]]; then
  cat /tmp/guest-promote-auth-1.out /tmp/guest-promote-auth-2.out >&2
  fail "same auth identity was bound to two subjects"
fi
if [[ $rc1 -ne 0 && $rc2 -ne 0 ]]; then
  cat /tmp/guest-promote-auth-1.out /tmp/guest-promote-auth-2.out >&2
  fail "same auth identity race produced no canonical winner"
fi
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.subjects where auth_user_id='c1000000-0000-0000-0000-000000000009';")" == "1" ]] || fail "auth identity uniqueness did not leave exactly one canonical subject"
pass "concurrent two-guest claim of one auth identity -> unique canonical member only"

public_exec=$("${psql_base[@]}" -Atc "select has_function_privilege('public','public.cmd_promote_guest_v1(uuid,uuid,uuid)','EXECUTE');")
[[ "$public_exec" == "f" ]] || fail "guest promotion command is executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "guest promotion slice changed public table catalog"
pass "guest promotion command PUBLIC EXECUTE remains revoked and public table catalog remains 60"

echo "guest promotion persistence/concurrency tests passed"
