#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

subject_a='d1000000-0000-4000-8000-000000000001'
subject_b='d1000000-0000-4000-8000-000000000002'
install_a='d2000000-0000-4000-8000-000000000001'
install_b='d2000000-0000-4000-8000-000000000002'
install_c='d2000000-0000-4000-8000-000000000003'
install_d='d2000000-0000-4000-8000-000000000004'
token1='hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
token2='hmac-sha256:k1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
cipher1='aes-256-gcm:k1:aGVsbG9oZWxsbw:Y2lwaGVydGV4dA:dGFnMTIzNDU2Nzg'
cipher2='aes-256-gcm:k1:d29ybGR3b3JsZA:Y2lwaGVydGV4dDI:dGFnODc2NTQzMjE'

"${psql_base[@]}" -c "
insert into public.subjects(id,kind,status,created_at,updated_at)
values
('$subject_a','member','active',clock_timestamp(),clock_timestamp()),
('$subject_b','member','active',clock_timestamp(),clock_timestamp());
" >/dev/null

register_as() {
  local subject="$1"
  local id="$2"
  local platform="$3"
  local key="$4"
  local cipher="$5"
  local fingerprint="$6"
  "${psql_base[@]}" -Atc "
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select installation_id||'|'||registration_state||'|'||
       case when token_changed then '1' else '0' end
from public.cmd_register_device_installation_runtime_v1(
  '$subject','$id','$platform','$key','$cipher','k1','$fingerprint',
  '0.1.0','mobile-push-registration-v1'
);
commit;"
}

first="$(register_as "$subject_a" "$install_a" ios 'ios-install-a' "$cipher1" "$token1")"
[[ "$first" == *"$install_a|created|0"* ]] || fail "first registration mismatch: $first"
pass "first registration creates one server-owned active generation"

retry="$(register_as "$subject_a" "$install_b" ios 'ios-install-a' "$cipher1" "$token1")"
[[ "$retry" == *"$install_a|refreshed|0"* ]] || fail "same-install retry mismatch: $retry"
count="$("${psql_base[@]}" -Atc "select count(*) from public.device_installations where subject_id='$subject_a' and revoked_at is null")"
[[ "$count" == '1' ]] || fail "exact retry duplicated active installation"
pass "same-subject exact retry converges to existing active row"

rotated="$(register_as "$subject_a" "$install_b" ios 'ios-install-a' "$cipher2" "$token2")"
[[ "$rotated" == *"$install_a|refreshed|1"* ]] || fail "token rotation mismatch: $rotated"
pass "same installation rotates token in place"

rebound="$(register_as "$subject_a" "$install_b" ios 'ios-install-b' "$cipher2" "$token2")"
[[ "$rebound" == *"$install_b|rebound|0"* ]] || fail "same-subject token rebind mismatch: $rebound"
old_revoked="$("${psql_base[@]}" -Atc "select case when revoked_at is null then '0' else '1' end from public.device_installations where id='$install_a'")"
[[ "$old_revoked" == '1' ]] || fail "rebind did not revoke prior generation"
pass "same token moving to another installation key revokes old row and creates new generation"

revoke="$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_a',true);
select installation_id||'|'||case when replayed then '1' else '0' end
from public.cmd_revoke_device_installation_runtime_v1('$subject_a','$install_b');
commit;")"
[[ "$revoke" == *"$install_b|0"* ]] || fail "revoke mismatch: $revoke"

new_generation="$(register_as "$subject_a" "$install_c" ios 'ios-install-b' "$cipher2" "$token2")"
[[ "$new_generation" == *"$install_c|created|0"* ]] || fail "revoked-row re-registration mismatch: $new_generation"
pass "revoked row is not resurrected; re-registration creates a new generation"

set +e
conflict_out="$("${psql_base[@]}" -c "
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_b',true);
select * from public.cmd_register_device_installation_runtime_v1(
  '$subject_b','$install_d','ios','ios-install-b',
  '$cipher1','k1','$token1','0.1.0','mobile-push-registration-v1'
);
rollback;" 2>&1)"
conflict_rc=$?
set -e
[[ $conflict_rc -ne 0 ]] || fail "cross-subject active installation claim unexpectedly succeeded"
[[ "$conflict_out" == *'device installation identity is already active'* ]] ||
  fail "cross-subject conflict failed for unexpected reason: $conflict_out"
pass "cross-subject installation ownership cannot be stolen before revoke"

set +e
direct_out="$("${psql_base[@]}" -c "
begin;
set local role myeongha_api_executor;
insert into public.device_installations(
  id,subject_id,platform,installation_key,client_capability,last_seen_at,created_at
) values (
  '$install_d','$subject_a','ios','direct-write','mobile-push-registration-v1',
  clock_timestamp(),clock_timestamp()
);
rollback;" 2>&1)"
direct_rc=$?
set -e
[[ $direct_rc -ne 0 ]] || fail "API executor direct Device Installation insert unexpectedly succeeded"
[[ "$direct_out" == *'permission denied'* ]] || fail "direct insert failed for unexpected reason"
pass "API executor has no direct Device Installation table mutation authority"

register_sig='public.cmd_register_device_installation_runtime_v1(uuid,uuid,text,text,text,text,text,text,text)'
register_core_sig='public.cmd_register_device_installation_v1(uuid,uuid,text,text,text,text,text,text,text)'
revoke_sig='public.cmd_revoke_device_installation_runtime_v1(uuid,uuid)'
revoke_core_sig='public.cmd_revoke_device_installation_v1(uuid,uuid)'

[[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','$register_sig','EXECUTE') then '1' else '0' end")" == '1' ]] || fail "executor cannot execute registration runtime"
[[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','$revoke_sig','EXECUTE') then '1' else '0' end")" == '1' ]] || fail "executor cannot execute revoke runtime"
[[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','$register_core_sig','EXECUTE') then '1' else '0' end")" == '0' ]] || fail "executor bypasses registration runtime"
[[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','$revoke_core_sig','EXECUTE') then '1' else '0' end")" == '0' ]] || fail "executor bypasses revoke runtime"
pass "runtime wrapper ACL boundary is closed"

echo "Device Installation registration runtime authority tests passed"
