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
  ('1a100000-0000-0000-0000-000000000001'),
  ('1a100000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('1a200000-0000-0000-0000-000000000001','member','1a100000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('1a200000-0000-0000-0000-000000000002','member','1a100000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp());

insert into public.device_installations(
  id,subject_id,platform,installation_key,push_token_encrypted,push_token_key_id,token_fingerprint,
  app_version,client_capability,last_seen_at,revoked_at,created_at
) values (
  '1a500000-0000-0000-0000-000000000001','1a200000-0000-0000-0000-000000000001','web',
  'notification-read-install-1','enc:notification-read','test-key','sha256:notification-read-token',
  'test','test-v1',clock_timestamp(),null,clock_timestamp()
);

insert into public.notifications(
  id,subject_id,category,character_id,content_bundle_id,source_world_event_id,template_key,payload_jsonb,
  dedupe_key,status,scheduled_at,read_at,created_at
) values
  ('1a300000-0000-0000-0000-000000000001','1a200000-0000-0000-0000-000000000001','service_notice',null,null,null,'read-test','{"kind":"ready"}','notification-read-ready','ready',clock_timestamp(),null,clock_timestamp()),
  ('1a300000-0000-0000-0000-000000000002','1a200000-0000-0000-0000-000000000001','service_notice',null,null,null,'read-test','{"kind":"queued"}','notification-read-queued','queued',clock_timestamp(),null,clock_timestamp()),
  ('1a300000-0000-0000-0000-000000000003','1a200000-0000-0000-0000-000000000001','service_notice',null,null,null,'read-test','{"kind":"already-read"}','notification-read-replay','read',clock_timestamp(),timestamptz '2026-01-01 00:00:00+00',clock_timestamp()),
  ('1a300000-0000-0000-0000-000000000004','1a200000-0000-0000-0000-000000000001','service_notice',null,null,null,'read-test','{"kind":"cancelled"}','notification-read-cancelled','cancelled',clock_timestamp(),null,clock_timestamp()),
  ('1a300000-0000-0000-0000-000000000005','1a200000-0000-0000-0000-000000000001','service_notice',null,null,null,'read-test','{"kind":"expired"}','notification-read-expired','expired',clock_timestamp(),null,clock_timestamp()),
  ('1a300000-0000-0000-0000-000000000006','1a200000-0000-0000-0000-000000000002','service_notice',null,null,null,'read-test','{"kind":"other-owner"}','notification-read-other-owner','ready',clock_timestamp(),null,clock_timestamp()),
  ('1a300000-0000-0000-0000-000000000007','1a200000-0000-0000-0000-000000000001','service_notice',null,null,null,'read-test','{"kind":"race"}','notification-read-race','ready',clock_timestamp(),null,clock_timestamp()),
  ('1a300000-0000-0000-0000-000000000008','1a200000-0000-0000-0000-000000000001','service_notice',null,null,null,'read-test','{"kind":"unrelated"}','notification-read-unrelated','ready',clock_timestamp(),null,clock_timestamp());

insert into public.notification_deliveries(
  id,subject_id,notification_id,installation_id,status,next_attempt_no,last_provider_message_ref,last_error_code,
  sent_at,created_at,updated_at
) values
  ('1a400000-0000-0000-0000-000000000001','1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000001','1a500000-0000-0000-0000-000000000001','pending',1,null,null,null,clock_timestamp(),clock_timestamp()),
  ('1a400000-0000-0000-0000-000000000002','1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000002','1a500000-0000-0000-0000-000000000001','pending',1,null,null,null,clock_timestamp(),clock_timestamp());
SQL

result=$("${psql_base[@]}" -Atc "select notification_id||'|'||notification_status||'|'||case when read_at is not null then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000001');")
[[ "$result" == "1a300000-0000-0000-0000-000000000001|read|1|0" ]] || fail "ready notification read result mismatch: $result"

preserved=$("${psql_base[@]}" -Atc "select (select count(*) from public.notifications where id='1a300000-0000-0000-0000-000000000001' and status='read' and read_at is not null and template_key='read-test' and payload_jsonb ->> 'kind'='ready')::text||'|'||(select count(*) from public.notification_deliveries where id in ('1a400000-0000-0000-0000-000000000001','1a400000-0000-0000-0000-000000000002') and status='pending' and next_attempt_no=1)::text||'|'||(select count(*) from public.notification_delivery_attempts where subject_id='1a200000-0000-0000-0000-000000000001')::text||'|'||(select count(*) from public.notifications where id='1a300000-0000-0000-0000-000000000008' and status='ready' and read_at is null)::text;")
[[ "$preserved" == "1|2|0|1" ]] || fail "notification read changed delivery/provenance/unrelated authority: $preserved"
pass "ready notification read updates only logical inbox state and preserves delivery/provenance"

queued=$("${psql_base[@]}" -Atc "select notification_status||'|'||case when read_at is not null then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000002');")
[[ "$queued" == "read|1|0" ]] || fail "queued notification read result mismatch: $queued"
pass "queued logical inbox row can be marked read without fabricating provider delivery state"

first_read_at=$("${psql_base[@]}" -Atc "select read_at from public.notifications where id='1a300000-0000-0000-0000-000000000001';")
replay=$("${psql_base[@]}" -Atc "select case when read_at::text='${first_read_at}' then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000001');")
[[ "$replay" == "1|1" ]] || fail "notification read replay mismatch: $replay"
pass "repeat notification read replays the original read timestamp"

pre_read=$("${psql_base[@]}" -Atc "select case when read_at=timestamptz '2026-01-01 00:00:00+00' then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000003');")
[[ "$pre_read" == "1|1" ]] || fail "pre-read notification replay mismatch: $pre_read"
pass "already-read notification is an exact state-derived replay"

expect_fail "cancelled notification remains terminal" "cancelled or expired notification cannot be marked read" "select * from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000004');"
expect_fail "expired notification remains terminal" "cancelled or expired notification cannot be marked read" "select * from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000005');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.notifications where id in ('1a300000-0000-0000-0000-000000000004','1a300000-0000-0000-0000-000000000005') and status in ('cancelled','expired') and read_at is null;")" == "2" ]] || fail "terminal notification read request rewrote lifecycle authority"

expect_fail "cross-owner notification read probe is denied" "notification was not found for this subject" "select * from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000002','1a300000-0000-0000-0000-000000000001');"
expect_fail "unknown notification read is denied" "notification was not found for this subject" "select * from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000099');"
expect_fail "notification read identity is required" "notification read subject/id is required" "select * from public.cmd_mark_notification_read_v1(null,'1a300000-0000-0000-0000-000000000001');"

rm -f /tmp/notification-read-1.out /tmp/notification-read-2.out
(
  "${psql_base[@]}" -Atc "begin; select case when replayed then '1' else '0' end from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000007'); select pg_sleep(0.4); commit;" > /tmp/notification-read-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select case when replayed then '1' else '0' end from public.cmd_mark_notification_read_v1('1a200000-0000-0000-0000-000000000001','1a300000-0000-0000-0000-000000000007');" > /tmp/notification-read-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
race=$(cat /tmp/notification-read-1.out /tmp/notification-read-2.out)
[[ "$race" == *"0"* ]] || { cat /tmp/notification-read-1.out /tmp/notification-read-2.out >&2; fail "notification read race missing mutation"; }
[[ "$race" == *"1"* ]] || { cat /tmp/notification-read-1.out /tmp/notification-read-2.out >&2; fail "notification read race missing replay"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.notifications where id='1a300000-0000-0000-0000-000000000007' and status='read' and read_at is not null;")" == "1" ]] || fail "notification read race did not produce one authoritative read state"
pass "concurrent duplicate notification read -> one mutation plus one authoritative replay"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_mark_notification_read_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "notification read command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "notification read command PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "notification read persistence/concurrency tests passed"
