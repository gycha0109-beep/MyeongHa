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
  ('d1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('d2000000-0000-0000-0000-000000000001','member','d1000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('d2000000-0000-0000-0000-000000000002','member','d1000000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp());

insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at)
values ('d3000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','self','self',null,null,clock_timestamp(),clock_timestamp());
insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values (
  'd3100000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',1,'solar',date '1991-01-01',time '10:00',true,false,'unspecified',
  'sha256:revoke-birth',clock_timestamp()
);
update public.birth_profiles set current_revision_id='d3100000-0000-0000-0000-000000000001'
where id='d3000000-0000-0000-0000-000000000001';

insert into public.saju_domain_runtime(saju_domain,availability,capability_version,required_engine_version,updated_at)
values ('general','available','resource-revoke-cap-v1',null,clock_timestamp())
on conflict (saju_domain) do update
set availability=excluded.availability,
    capability_version=excluded.capability_version,
    required_engine_version=excluded.required_engine_version,
    updated_at=excluded.updated_at;

select * from public.cmd_create_reading_session_v1(
  'd2000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000001','d4100000-0000-0000-0000-000000000001',
  'resource-revoke-reading','sha256:resource-revoke-reading','reading-request-v1','{}'::jsonb,
  'general','d3000000-0000-0000-0000-000000000001',null,null,null,null,null
);

insert into public.share_artifacts(
  id,subject_id,reading_id,public_token_hash,artifact_version,snapshot_jsonb,snapshot_hash,status,expires_at,revoked_at,created_at
) values
  ('d5000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d4100000-0000-0000-0000-000000000001',
   'sha256:revoke-share-active','share-v1','{"public":"snapshot-a"}'::jsonb,'sha256:revoke-share-snapshot-a','active',null,null,clock_timestamp()),
  ('d5000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','d4100000-0000-0000-0000-000000000001',
   'sha256:revoke-share-expired','share-v1','{"public":"snapshot-b"}'::jsonb,'sha256:revoke-share-snapshot-b','expired',clock_timestamp()-interval '1 hour',null,clock_timestamp()-interval '1 day'),
  ('d5000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001','d4100000-0000-0000-0000-000000000001',
   'sha256:revoke-share-race','share-v1','{"public":"snapshot-c"}'::jsonb,'sha256:revoke-share-snapshot-c','active',null,null,clock_timestamp());

insert into public.device_installations(
  id,subject_id,platform,installation_key,push_token_encrypted,push_token_key_id,token_fingerprint,
  app_version,client_capability,last_seen_at,revoked_at,created_at
) values
  ('d6000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','android','revoke-device-a',
   'ciphertext-a','key-v1','fingerprint-revoke-a','1.0.0','0.0.1-dev',clock_timestamp(),null,clock_timestamp()),
  ('d6000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','ios','revoke-device-b',
   'ciphertext-b','key-v1','fingerprint-revoke-b','1.0.0','0.0.1-dev',clock_timestamp(),null,clock_timestamp()),
  ('d6000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001','web','revoke-device-race',
   'ciphertext-race','key-v1','fingerprint-revoke-race','1.0.0','0.0.1-dev',clock_timestamp(),null,clock_timestamp());

insert into public.notifications(
  id,subject_id,category,character_id,content_bundle_id,source_world_event_id,template_key,payload_jsonb,
  dedupe_key,status,scheduled_at,read_at,created_at
) values (
  'd7000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','service_notice',
  null,null,null,'revoke-test','{}'::jsonb,'revoke-notification-a','ready',clock_timestamp(),null,clock_timestamp()
);
insert into public.notification_deliveries(
  id,subject_id,notification_id,installation_id,status,next_attempt_no,last_provider_message_ref,last_error_code,sent_at,created_at,updated_at
) values (
  'd7100000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001',
  'd7000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001',
  'pending',1,null,null,null,clock_timestamp(),clock_timestamp()
);
SQL

share=$("${psql_base[@]}" -Atc "select share_artifact_id||'|'||effective_status||'|'||case when revoked_at is not null then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_share_artifact_v1('d2000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001');")
[[ "$share" == "d5000000-0000-0000-0000-000000000001|revoked|1|0" ]] || fail "share revoke result mismatch: $share"

share_state=$("${psql_base[@]}" -Atc "select status||'|'||public_token_hash||'|'||snapshot_hash||'|'||reading_id||'|'||case when revoked_at is not null then '1' else '0' end from public.share_artifacts where id='d5000000-0000-0000-0000-000000000001';")
[[ "$share_state" == "revoked|sha256:revoke-share-active|sha256:revoke-share-snapshot-a|d4100000-0000-0000-0000-000000000001|1" ]] || fail "share revoke rewrote immutable provenance: $share_state"
pass "share revoke changes only lifecycle state and preserves token/snapshot/reading provenance"

share_replay=$("${psql_base[@]}" -Atc "select effective_status||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_share_artifact_v1('d2000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000001');")
[[ "$share_replay" == "revoked|1" ]] || fail "share revoke replay mismatch: $share_replay"

expired_before=$("${psql_base[@]}" -Atc "select status||'|'||coalesce(revoked_at::text,'NULL') from public.share_artifacts where id='d5000000-0000-0000-0000-000000000002';")
expired_result=$("${psql_base[@]}" -Atc "select effective_status||'|'||case when revoked_at is null then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_share_artifact_v1('d2000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000002');")
expired_after=$("${psql_base[@]}" -Atc "select status||'|'||coalesce(revoked_at::text,'NULL') from public.share_artifacts where id='d5000000-0000-0000-0000-000000000002';")
[[ "$expired_result" == "expired|1|1" ]] || fail "expired share terminal no-op mismatch: $expired_result"
[[ "$expired_before" == "$expired_after" ]] || fail "expired share was rewritten by revoke: before=$expired_before after=$expired_after"
pass "expired share remains immutable terminal state under revoke request"

expect_fail "cross-owner share revoke is denied" "share artifact was not found for this subject" "select * from public.cmd_revoke_share_artifact_v1('d2000000-0000-0000-0000-000000000002','d5000000-0000-0000-0000-000000000001');"

# Concurrent duplicate share revoke: one mutation plus one replay under row lock.
rm -f /tmp/share-revoke-1.out /tmp/share-revoke-2.out
(
  "${psql_base[@]}" -Atc "begin; select share_artifact_id||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_share_artifact_v1('d2000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000003'); select pg_sleep(0.4); commit;" > /tmp/share-revoke-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select share_artifact_id||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_share_artifact_v1('d2000000-0000-0000-0000-000000000001','d5000000-0000-0000-0000-000000000003');" > /tmp/share-revoke-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
share_race=$(cat /tmp/share-revoke-1.out /tmp/share-revoke-2.out)
[[ "$share_race" == *"d5000000-0000-0000-0000-000000000003|0"* ]] || { cat /tmp/share-revoke-1.out /tmp/share-revoke-2.out >&2; fail "share revoke race missing mutation"; }
[[ "$share_race" == *"d5000000-0000-0000-0000-000000000003|1"* ]] || { cat /tmp/share-revoke-1.out /tmp/share-revoke-2.out >&2; fail "share revoke race missing replay"; }
pass "concurrent duplicate share revoke -> one lifecycle mutation plus one replay"

device=$("${psql_base[@]}" -Atc "select installation_id||'|'||case when revoked_at is not null then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001');")
[[ "$device" == "d6000000-0000-0000-0000-000000000001|1|0" ]] || fail "device revoke result mismatch: $device"

device_state=$("${psql_base[@]}" -Atc "select case when revoked_at is not null then '1' else '0' end||'|'||push_token_encrypted||'|'||token_fingerprint||'|'||installation_key from public.device_installations where id='d6000000-0000-0000-0000-000000000001';")
[[ "$device_state" == "1|ciphertext-a|fingerprint-revoke-a|revoke-device-a" ]] || fail "device revoke destructively rewrote credential/identity provenance: $device_state"
pass "device revoke marks authorization boundary without destructively purging stored credential provenance"

expect_fail "revoked installation cannot begin provider send" "notification installation is revoked or has no active push credential" "select * from public.cmd_prepare_notification_delivery_attempt_v1('d2000000-0000-0000-0000-000000000001','d7100000-0000-0000-0000-000000000001','d7200000-0000-0000-0000-000000000001','fcm');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.notification_delivery_attempts where delivery_id='d7100000-0000-0000-0000-000000000001';")" == "0" ]] || fail "revoked installation fabricated provider attempt"
pass "device revoke immediately blocks new provider attempts without rewriting logical delivery"

device_replay=$("${psql_base[@]}" -Atc "select case when revoked_at is not null then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000001');")
[[ "$device_replay" == "1|1" ]] || fail "device revoke replay mismatch: $device_replay"
expect_fail "cross-owner device revoke is denied" "device installation was not found for this subject" "select * from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000002','d6000000-0000-0000-0000-000000000002');"

# Concurrent duplicate device revoke: one mutation plus one replay under row lock.
rm -f /tmp/device-revoke-1.out /tmp/device-revoke-2.out
(
  "${psql_base[@]}" -Atc "begin; select installation_id||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000003'); select pg_sleep(0.4); commit;" > /tmp/device-revoke-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select installation_id||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_device_installation_v1('d2000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000003');" > /tmp/device-revoke-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
device_race=$(cat /tmp/device-revoke-1.out /tmp/device-revoke-2.out)
[[ "$device_race" == *"d6000000-0000-0000-0000-000000000003|0"* ]] || { cat /tmp/device-revoke-1.out /tmp/device-revoke-2.out >&2; fail "device revoke race missing mutation"; }
[[ "$device_race" == *"d6000000-0000-0000-0000-000000000003|1"* ]] || { cat /tmp/device-revoke-1.out /tmp/device-revoke-2.out >&2; fail "device revoke race missing replay"; }
pass "concurrent duplicate device revoke -> one lifecycle mutation plus one replay"

share_public=$("${psql_base[@]}" -Atc "select has_function_privilege('public','public.cmd_revoke_share_artifact_v1(uuid,uuid)','EXECUTE');")
device_public=$("${psql_base[@]}" -Atc "select has_function_privilege('public','public.cmd_revoke_device_installation_v1(uuid,uuid)','EXECUTE');")
[[ "$share_public" == "f" && "$device_public" == "f" ]] || fail "revocation commands are executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "revocation slice changed public table catalog"
pass "revocation commands PUBLIC EXECUTE remain revoked and public table catalog remains 60"

echo "user resource revocation persistence/concurrency tests passed"
