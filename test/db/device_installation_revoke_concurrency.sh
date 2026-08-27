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
  ('d1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('d2000000-0000-0000-0000-000000000001','member','d1000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('d2000000-0000-0000-0000-000000000002','member','d1000000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('d2000000-0000-0000-0000-000000000003','member','d1000000-0000-0000-0000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('d2000000-0000-0000-0000-000000000004','member','d1000000-0000-0000-0000-000000000004','active',null,clock_timestamp(),clock_timestamp()),
  ('d2000000-0000-0000-0000-000000000005','guest',null,'merged','d2000000-0000-0000-0000-000000000004',clock_timestamp(),clock_timestamp()),
  ('d2000000-0000-0000-0000-000000000006','guest',null,'active',null,clock_timestamp(),clock_timestamp());

insert into public.device_installations(
  id,subject_id,platform,installation_key,push_token_encrypted,push_token_key_id,token_fingerprint,
  app_version,client_capability,last_seen_at,revoked_at,created_at
) values
  ('d3000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','android','device-revoke-a','cipher-a','key-v1','fp-device-revoke-a','1.0.0','cap-v1',clock_timestamp(),null,clock_timestamp()),
  ('d3000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','ios','device-revoke-b','cipher-b','key-v1','fp-device-revoke-b','1.0.0','cap-v1',clock_timestamp(),null,clock_timestamp()),
  ('d3000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001','web','device-revoke-web',null,null,null,'1.0.0','cap-v1',clock_timestamp(),null,clock_timestamp()),
  ('d3000000-0000-0000-0000-000000000004','d2000000-0000-0000-0000-000000000003','android','device-revoke-pending','cipher-p','key-v1','fp-device-revoke-pending','1.0.0','cap-v1',clock_timestamp(),null,clock_timestamp()),
  ('d3000000-0000-0000-0000-000000000005','d2000000-0000-0000-0000-000000000005','android','device-revoke-merged','cipher-m','key-v1','fp-device-revoke-merged','1.0.0','cap-v1',clock_timestamp(),null,clock_timestamp()),
  ('d3000000-0000-0000-0000-000000000006','d2000000-0000-0000-0000-000000000006','android','device-revoke-guest','cipher-g','key-v1','fp-device-revoke-guest','1.0.0','cap-v1',clock_timestamp(),null,clock_timestamp()),
  ('d3000000-0000-0000-0000-000000000007','d2000000-0000-0000-0000-000000000001','ios','device-revoke-race','cipher-r','key-v1','fp-device-revoke-race','1.0.0','cap-v1',clock_timestamp(),null,clock_timestamp());
SQL

result=$("${psql_base[@]}" -At -F '|' -c "select installation_id,revoked_at is not null,replayed from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001');")
[[ "$result" == 'd3000000-0000-0000-0000-000000000001|t|f' ]] || fail "device revoke result mismatch: $result"
preserved=$("${psql_base[@]}" -At -F '|' -c "select push_token_encrypted,push_token_key_id,token_fingerprint,revoked_at is not null from public.device_installations where id='d3000000-0000-0000-0000-000000000001';")
[[ "$preserved" == 'cipher-a|key-v1|fp-device-revoke-a|t' ]] || fail "device revoke rewrote credential provenance: $preserved"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.device_installations where id in ('d3000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000003') and revoked_at is null;")" == '2' ]] || fail "device revoke changed unrelated installations"
pass "standalone revoke changes only the owned installation revocation boundary"

replay=$("${psql_base[@]}" -At -F '|' -c "select r.installation_id,r.revoked_at=di.revoked_at,r.replayed from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001') r join public.device_installations di on di.id=r.installation_id;")
[[ "$replay" == 'd3000000-0000-0000-0000-000000000001|t|t' ]] || fail "device revoke replay mismatch: $replay"
pass "repeat revoke replays the original authoritative revoked_at"

expect_fail "cross-owner installation probe is denied" "device installation was not found for this subject" "select * from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000003');"
expect_fail "unknown installation revoke is denied" "device installation was not found for this subject" "select * from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000099');"
expect_fail "deletion-pending subject cannot start standalone installation revoke" "device installation revoke requires an active canonical subject" "select * from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000003','d3000000-0000-0000-0000-000000000004');"
expect_fail "merged guest cannot mutate installation authority" "device installation revoke requires an active canonical subject" "select * from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000005','d3000000-0000-0000-0000-000000000005');"
expect_fail "null revoke ids are denied" "subject and installation ids are required" "select * from public.cmd_revoke_device_installation_v1(null,'d3000000-0000-0000-0000-000000000001');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.device_installations where id in ('d3000000-0000-0000-0000-000000000004','d3000000-0000-0000-0000-000000000005') and revoked_at is null;")" == '2' ]] || fail "denied lifecycle revoke mutated installation state"

# Active canonical guests use the same owner-scoped installation authority; no member-only
# constraint is invented for the notification transport boundary.
guest=$("${psql_base[@]}" -At -F '|' -c "select installation_id,revoked_at is not null,replayed from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000006','d3000000-0000-0000-0000-000000000006');")
[[ "$guest" == 'd3000000-0000-0000-0000-000000000006|t|f' ]] || fail "guest installation revoke mismatch: $guest"
pass "active canonical guest retains owner-scoped revoke capability"

rm -f /tmp/device-revoke-{1,2}.{out,rc}
(
  set +e
  "${psql_base[@]}" -Atc "begin; select case when replayed then 'REPLAY' else 'MUTATE' end from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000007'); select pg_sleep(0.4); commit;" >/tmp/device-revoke-1.out 2>&1
  echo $? >/tmp/device-revoke-1.rc
) & p1=$!
sleep 0.08
(
  set +e
  "${psql_base[@]}" -Atc "select case when replayed then 'REPLAY' else 'MUTATE' end from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000007');" >/tmp/device-revoke-2.out 2>&1
  echo $? >/tmp/device-revoke-2.rc
) & p2=$!
wait $p1; wait $p2
rc1=$(cat /tmp/device-revoke-1.rc); rc2=$(cat /tmp/device-revoke-2.rc)
[[ "$rc1" == '0' ]] || { cat /tmp/device-revoke-1.out >&2; fail "first concurrent device revoke failed"; }
[[ "$rc2" == '0' ]] || { cat /tmp/device-revoke-2.out >&2; fail "second concurrent device revoke failed"; }
race=$(cat /tmp/device-revoke-1.out /tmp/device-revoke-2.out)
[[ "$race" == *'MUTATE'* ]] || { echo "$race" >&2; fail "device revoke race missing mutation"; }
[[ "$race" == *'REPLAY'* ]] || { echo "$race" >&2; fail "device revoke race missing replay"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.device_installations where id='d3000000-0000-0000-0000-000000000007' and revoked_at is not null;")" == '1' ]] || fail "device revoke race did not terminalize exactly one installation"
pass "concurrent duplicate device revoke -> one mutation plus one authoritative replay"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_revoke_device_installation_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "device installation revoke command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '59' ]] || fail "public table catalog changed"
pass "device installation revoke PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "Device installation revoke persistence/concurrency tests passed"
