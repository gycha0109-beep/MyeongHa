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

first=$("${psql_base[@]}" -Atc "select subject_id||'|'||guest_session_id||'|'||case when replayed then '1' else '0' end from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','sha256:v1:guest-bootstrap-1',timestamptz '2099-01-01 00:00:00+00');")
[[ "$first" == "61000000-0000-0000-0000-000000000001|62000000-0000-0000-0000-000000000001|0" ]] || fail "guest bootstrap result mismatch: $first"

state=$("${psql_base[@]}" -Atc "select s.kind||'|'||s.status||'|'||case when s.auth_user_id is null then '1' else '0' end||'|'||gs.token_hash||'|'||case when gs.consumed_at is null and gs.claimed_by_subject_id is null then '1' else '0' end from public.subjects s join public.guest_sessions gs on gs.subject_id=s.id where s.id='61000000-0000-0000-0000-000000000001';")
[[ "$state" == "guest|active|1|sha256:v1:guest-bootstrap-1|1" ]] || fail "guest bootstrap authority mismatch: $state"
pass "guest bootstrap atomically creates active guest owner + verifier-only session"

replay=$("${psql_base[@]}" -Atc "select case when replayed then '1' else '0' end from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','sha256:v1:guest-bootstrap-1',timestamptz '2099-01-01 00:00:00+00');")
[[ "$replay" == "1" ]] || fail "exact guest bootstrap retry did not replay: $replay"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.subjects where id='61000000-0000-0000-0000-000000000001';")" == "1" ]] || fail "exact retry duplicated subject"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.guest_sessions where id='62000000-0000-0000-0000-000000000001';")" == "1" ]] || fail "exact retry duplicated session"
pass "exact guest bootstrap retry replays authoritative subject/session"

expect_fail "same session id with different verifier conflicts" "guest bootstrap identity already exists with different canonical input" "select * from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','sha256:v1:DIFFERENT',timestamptz '2099-01-01 00:00:00+00');"
expect_fail "same verifier with different session identity conflicts" "guest bootstrap identity already exists with different canonical input" "select * from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000002','sha256:v1:guest-bootstrap-1',timestamptz '2099-01-01 00:00:00+00');"
expect_fail "same identity with different expiry conflicts" "guest bootstrap identity already exists with different canonical input" "select * from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','sha256:v1:guest-bootstrap-1',timestamptz '2099-01-02 00:00:00+00');"
expect_fail "expired-at-create guest session is denied" "guest session expiry must be in the future" "select * from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000003','62000000-0000-0000-0000-000000000003','sha256:v1:expired',timestamptz '2020-01-01 00:00:00+00');"
expect_fail "blank guest verifier fingerprint is denied" "guest token verifier fingerprint is required" "select * from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000004','62000000-0000-0000-0000-000000000004','   ',timestamptz '2099-01-01 00:00:00+00');"

# Existing unrelated owner must not become a half-created guest session on conflict.
"${psql_base[@]}" -c "insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values ('61000000-0000-0000-0000-000000000010','guest',null,'active',null,clock_timestamp(),clock_timestamp());" >/dev/null
expect_fail "pre-existing subject id cannot be silently attached" "guest bootstrap identity conflict" "select * from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000010','62000000-0000-0000-0000-000000000010','sha256:v1:preexisting-subject',timestamptz '2099-01-01 00:00:00+00');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.guest_sessions where token_hash='sha256:v1:preexisting-subject';")" == "0" ]] || fail "failed bootstrap left a half-created guest session"
pass "identity conflict leaves no half-created session"

# Concurrent exact duplicate: one insert, one authoritative replay after unique-key wait.
rm -f /tmp/guest-bootstrap-same-1.out /tmp/guest-bootstrap-same-2.out
(
  "${psql_base[@]}" -Atc "begin; select case when replayed then '1' else '0' end from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000020','62000000-0000-0000-0000-000000000020','sha256:v1:race-same',timestamptz '2099-01-01 00:00:00+00'); select pg_sleep(0.4); commit;" > /tmp/guest-bootstrap-same-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select case when replayed then '1' else '0' end from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000020','62000000-0000-0000-0000-000000000020','sha256:v1:race-same',timestamptz '2099-01-01 00:00:00+00');" > /tmp/guest-bootstrap-same-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
same_race=$(cat /tmp/guest-bootstrap-same-1.out /tmp/guest-bootstrap-same-2.out)
[[ "$same_race" == *$'0\n'* || "$same_race" == 0* ]] || { cat /tmp/guest-bootstrap-same-1.out /tmp/guest-bootstrap-same-2.out >&2; fail "same bootstrap race missing create"; }
[[ "$same_race" == *"1"* ]] || { cat /tmp/guest-bootstrap-same-1.out /tmp/guest-bootstrap-same-2.out >&2; fail "same bootstrap race missing replay"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.guest_sessions where token_hash='sha256:v1:race-same';")" == "1" ]] || fail "same bootstrap race duplicated session"
pass "concurrent exact guest bootstrap -> one create plus one replay"

# Concurrent different identities cannot claim the same verifier; loser subject insert must roll back too.
rm -f /tmp/guest-bootstrap-token-1.out /tmp/guest-bootstrap-token-2.out
set +e
(
  "${psql_base[@]}" -Atc "begin; select case when replayed then '1' else '0' end from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000030','62000000-0000-0000-0000-000000000030','sha256:v1:race-token',timestamptz '2099-01-01 00:00:00+00'); select pg_sleep(0.4); commit;" > /tmp/guest-bootstrap-token-1.out 2>&1
) & p3=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select case when replayed then '1' else '0' end from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000031','62000000-0000-0000-0000-000000000031','sha256:v1:race-token',timestamptz '2099-01-01 00:00:00+00');" > /tmp/guest-bootstrap-token-2.out 2>&1
) & p4=$!
wait $p3; rc3=$?
wait $p4; rc4=$?
set -e
[[ $rc3 -eq 0 ]] || { cat /tmp/guest-bootstrap-token-1.out >&2; fail "token race intended winner failed"; }
[[ $rc4 -ne 0 ]] || { cat /tmp/guest-bootstrap-token-2.out >&2; fail "token race conflicting identity unexpectedly succeeded"; }
grep -q "guest bootstrap identity conflict" /tmp/guest-bootstrap-token-2.out || { cat /tmp/guest-bootstrap-token-2.out >&2; fail "token race failed for unexpected reason"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.guest_sessions where token_hash='sha256:v1:race-token';")" == "1" ]] || fail "token race produced more than one session"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.subjects where id in ('61000000-0000-0000-0000-000000000030','61000000-0000-0000-0000-000000000031');")" == "1" ]] || fail "token race left orphan loser subject"
pass "concurrent same verifier with different identities -> one canonical guest and no orphan loser"

# A promoted/consumed guest session is no longer a reusable bootstrap identity.
"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values ('63000000-0000-0000-0000-000000000040') on conflict do nothing;
select * from public.cmd_create_guest_session_v1(
  '61000000-0000-0000-0000-000000000040',
  '62000000-0000-0000-0000-000000000040',
  'sha256:v1:promote-terminal',
  timestamptz '2099-01-01 00:00:00+00'
);
select * from public.cmd_promote_guest_v1(
  '61000000-0000-0000-0000-000000000040',
  '62000000-0000-0000-0000-000000000040',
  '63000000-0000-0000-0000-000000000040'
);
SQL
expect_fail "consumed promoted guest cannot bootstrap replay" "guest session is no longer an active reusable guest identity" "select * from public.cmd_create_guest_session_v1('61000000-0000-0000-0000-000000000040','62000000-0000-0000-0000-000000000040','sha256:v1:promote-terminal',timestamptz '2099-01-01 00:00:00+00');"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_create_guest_session_v1(uuid,uuid,text,timestamptz)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "guest bootstrap command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "public table catalog changed"
pass "guest bootstrap command PUBLIC EXECUTE remains revoked and public table catalog remains 60"

bash test/db/guest_bootstrap_runtime_authority.sh

echo "guest bootstrap persistence/concurrency tests passed"
