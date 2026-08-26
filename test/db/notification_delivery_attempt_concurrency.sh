#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose)

expect_failure() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local output status
  set +e
  output="$("${PSQL[@]}" -c "${sql}" 2>&1)"
  status=$?
  set -e
  if [[ ${status} -eq 0 ]]; then
    echo "FAIL ${label}: statement unexpectedly succeeded" >&2
    exit 10
  fi
  if [[ "${output}" != *"${expected}"* ]]; then
    echo "FAIL ${label}: expected ${expected}" >&2
    echo "${output}" >&2
    exit 11
  fi
  echo "PASS ${label} -> ${expected}"
}

prepare_attempt() {
  local delivery_id="$1"
  local attempt_id="$2"
  local provider="$3"
  "${PSQL[@]}" -At -F '|' -c "select attempt_id,attempt_no,attempt_status,replayed
  from public.cmd_prepare_notification_delivery_attempt_v1(
    'aa000000-0000-0000-0000-000000000001',
    '${delivery_id}','${attempt_id}','${provider}'
  );"
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id)
values
  ('00000000-0000-0000-0000-00000000aa01'),
  ('00000000-0000-0000-0000-00000000aa02')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('aa000000-0000-0000-0000-000000000001','member','00000000-0000-0000-0000-00000000aa01','active',now(),now()),
  ('aa000000-0000-0000-0000-000000000002','member','00000000-0000-0000-0000-00000000aa02','active',now(),now());

insert into public.device_installations(
  id,subject_id,platform,installation_key,
  push_token_encrypted,push_token_key_id,token_fingerprint,
  app_version,client_capability,last_seen_at,revoked_at,created_at
) values
  ('aa100000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','ios','install-a1','enc-token-a1','key-v1','fp-a1','1.0','v1',now(),null,now()),
  ('aa100000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','android','install-a2','enc-token-a2','key-v1','fp-a2','1.0','v1',now(),null,now()),
  ('aa100000-0000-0000-0000-000000000003','aa000000-0000-0000-0000-000000000001','web','install-a3','enc-token-a3','key-v1','fp-a3','1.0','v1',now(),null,now()),
  ('aa100000-0000-0000-0000-000000000004','aa000000-0000-0000-0000-000000000001','ios','install-a4','enc-token-a4','key-v1','fp-a4','1.0','v1',now(),null,now()),
  ('aa100000-0000-0000-0000-000000000005','aa000000-0000-0000-0000-000000000001','android','install-a5','enc-token-a5','key-v1','fp-a5','1.0','v1',now(),now(),now()),
  ('aa100000-0000-0000-0000-000000000006','aa000000-0000-0000-0000-000000000001','web','install-a6','enc-token-a6','key-v1','fp-a6','1.0','v1',now(),null,now());

insert into public.notifications(
  id,subject_id,category,character_id,content_bundle_id,source_world_event_id,
  template_key,payload_jsonb,dedupe_key,status,scheduled_at,read_at,created_at
) values
  ('aa200000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','service_notice',null,null,null,'service-a1','{}','notif-a1','ready',now(),null,now()),
  ('aa200000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','service_notice',null,null,null,'service-a2','{}','notif-a2','ready',now(),null,now()),
  ('aa200000-0000-0000-0000-000000000003','aa000000-0000-0000-0000-000000000001','service_notice',null,null,null,'service-a3','{}','notif-a3','ready',now(),null,now()),
  ('aa200000-0000-0000-0000-000000000004','aa000000-0000-0000-0000-000000000001','service_notice',null,null,null,'service-a4','{}','notif-a4','ready',now(),null,now()),
  ('aa200000-0000-0000-0000-000000000005','aa000000-0000-0000-0000-000000000001','service_notice',null,null,null,'service-a5','{}','notif-a5','ready',now(),null,now()),
  ('aa200000-0000-0000-0000-000000000006','aa000000-0000-0000-0000-000000000001','service_notice',null,null,null,'service-a6','{}','notif-a6','cancelled',now(),null,now()),
  ('aa200000-0000-0000-0000-000000000007','aa000000-0000-0000-0000-000000000001','service_notice',null,null,null,'service-a7','{}','notif-a7','ready',now(),null,now());

insert into public.notification_deliveries(
  id,subject_id,notification_id,installation_id,status,next_attempt_no,
  last_provider_message_ref,last_error_code,sent_at,created_at,updated_at
) values
  ('aa300000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','aa200000-0000-0000-0000-000000000001','aa100000-0000-0000-0000-000000000001','pending',1,null,null,null,now(),now()),
  ('aa300000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','aa200000-0000-0000-0000-000000000002','aa100000-0000-0000-0000-000000000002','pending',1,null,null,null,now(),now()),
  ('aa300000-0000-0000-0000-000000000003','aa000000-0000-0000-0000-000000000001','aa200000-0000-0000-0000-000000000003','aa100000-0000-0000-0000-000000000003','pending',1,null,null,null,now(),now()),
  ('aa300000-0000-0000-0000-000000000004','aa000000-0000-0000-0000-000000000001','aa200000-0000-0000-0000-000000000004','aa100000-0000-0000-0000-000000000004','pending',1,null,null,null,now(),now()),
  ('aa300000-0000-0000-0000-000000000005','aa000000-0000-0000-0000-000000000001','aa200000-0000-0000-0000-000000000005','aa100000-0000-0000-0000-000000000005','pending',1,null,null,null,now(),now()),
  ('aa300000-0000-0000-0000-000000000006','aa000000-0000-0000-0000-000000000001','aa200000-0000-0000-0000-000000000006','aa100000-0000-0000-0000-000000000006','pending',1,null,null,null,now(),now()),
  ('aa300000-0000-0000-0000-000000000007','aa000000-0000-0000-0000-000000000001','aa200000-0000-0000-0000-000000000007','aa100000-0000-0000-0000-000000000006','pending',1,null,null,null,now(),now());
SQL

# 1. First provider attempt allocation is atomic and uses delivery.next_attempt_no.
prepared="$(prepare_attempt \
  'aa300000-0000-0000-0000-000000000001' \
  'aa400000-0000-0000-0000-000000000001' \
  'apns')"
shape="$("${PSQL[@]}" -At -F '|' -c "select nd.status,nd.next_attempt_no,nd.sent_at is null,
  nda.attempt_no,nda.status,nda.provider,nda.finished_at is null
from public.notification_deliveries nd
join public.notification_delivery_attempts nda on nda.delivery_id=nd.id
where nd.id='aa300000-0000-0000-0000-000000000001';")"
if [[ "${prepared}|${shape}" != 'aa400000-0000-0000-0000-000000000001|1|running|f|sending|2|t|1|running|apns|t' ]]; then
  echo "FAIL first notification attempt allocation: ${prepared}|${shape}" >&2
  exit 20
fi
echo "PASS notification delivery prepare allocates attempt_no=1 and marks logical delivery sending"

# 2. Exact prepare retry replays the same provider attempt.
replay="$(prepare_attempt \
  'aa300000-0000-0000-0000-000000000001' \
  'aa400000-0000-0000-0000-000000000001' \
  'apns')"
if [[ "${replay}" != 'aa400000-0000-0000-0000-000000000001|1|running|t' ]]; then
  echo "FAIL notification prepare replay: ${replay}" >&2
  exit 21
fi
echo "PASS exact notification attempt prepare retry replays authoritative running attempt"

expect_failure \
  'distinct provider attempt while one is running is denied' \
  'cmd_notification_delivery_attempt_in_flight' \
  "select * from public.cmd_prepare_notification_delivery_attempt_v1(
    'aa000000-0000-0000-0000-000000000001',
    'aa300000-0000-0000-0000-000000000001',
    'aa400000-0000-0000-0000-000000000002','apns');"

# 3. Explicit provider failure terminalizes attempt but leaves logical delivery retryable.
failed="$("${PSQL[@]}" -At -F '|' -c "select attempt_id,attempt_no,delivery_status,replayed
from public.cmd_finalize_notification_delivery_attempt_failed_v1(
  'aa000000-0000-0000-0000-000000000001',
  'aa300000-0000-0000-0000-000000000001',
  'aa400000-0000-0000-0000-000000000001',
  'PROVIDER_TIMEOUT',null
);")"
failed_shape="$("${PSQL[@]}" -At -F '|' -c "select nd.status,nd.next_attempt_no,nd.last_error_code,nd.sent_at is null,
  nda.status,nda.error_code,nda.finished_at is not null
from public.notification_deliveries nd
join public.notification_delivery_attempts nda on nda.id='aa400000-0000-0000-0000-000000000001'
where nd.id='aa300000-0000-0000-0000-000000000001';")"
if [[ "${failed}|${failed_shape}" != 'aa400000-0000-0000-0000-000000000001|1|failed|f|failed|2|PROVIDER_TIMEOUT|t|failed|PROVIDER_TIMEOUT|t' ]]; then
  echo "FAIL notification failed finalize: ${failed}|${failed_shape}" >&2
  exit 22
fi
echo "PASS explicit provider failure records immutable attempt provenance and keeps logical delivery retryable"

failed_replay="$("${PSQL[@]}" -At -F '|' -c "select attempt_id,attempt_no,delivery_status,replayed
from public.cmd_finalize_notification_delivery_attempt_failed_v1(
  'aa000000-0000-0000-0000-000000000001',
  'aa300000-0000-0000-0000-000000000001',
  'aa400000-0000-0000-0000-000000000001',
  'PROVIDER_TIMEOUT',null
);")"
if [[ "${failed_replay}" != 'aa400000-0000-0000-0000-000000000001|1|failed|t' ]]; then
  echo "FAIL notification failure replay: ${failed_replay}" >&2
  exit 23
fi
echo "PASS exact failed finalize retry replays authoritative terminal attempt"

# 4. Retry allocates attempt_no=2 under same logical delivery, then sent finalize closes it.
retry="$(prepare_attempt \
  'aa300000-0000-0000-0000-000000000001' \
  'aa400000-0000-0000-0000-000000000002' \
  'apns')"
if [[ "${retry}" != 'aa400000-0000-0000-0000-000000000002|2|running|f' ]]; then
  echo "FAIL notification retry allocator: ${retry}" >&2
  exit 24
fi
sent="$("${PSQL[@]}" -At -F '|' -c "select attempt_id,attempt_no,delivery_status,replayed
from public.cmd_finalize_notification_delivery_attempt_sent_v1(
  'aa000000-0000-0000-0000-000000000001',
  'aa300000-0000-0000-0000-000000000001',
  'aa400000-0000-0000-0000-000000000002',
  'provider-msg-a2'
);")"
sent_shape="$("${PSQL[@]}" -At -F '|' -c "select nd.status,nd.next_attempt_no,nd.last_provider_message_ref,nd.last_error_code is null,nd.sent_at is not null,
  nda.status,nda.provider_message_ref,nda.finished_at is not null,
  (select count(*) from public.notification_delivery_attempts where delivery_id=nd.id)
from public.notification_deliveries nd
join public.notification_delivery_attempts nda on nda.id='aa400000-0000-0000-0000-000000000002'
where nd.id='aa300000-0000-0000-0000-000000000001';")"
if [[ "${sent}|${sent_shape}" != 'aa400000-0000-0000-0000-000000000002|2|sent|f|sent|3|provider-msg-a2|t|t|sent|provider-msg-a2|t|2' ]]; then
  echo "FAIL notification sent finalize: ${sent}|${sent_shape}" >&2
  exit 25
fi
echo "PASS failed delivery retry uses attempt_no=2 and sent finalize atomically closes one logical delivery"

sent_replay="$("${PSQL[@]}" -At -F '|' -c "select attempt_id,attempt_no,delivery_status,replayed
from public.cmd_finalize_notification_delivery_attempt_sent_v1(
  'aa000000-0000-0000-0000-000000000001',
  'aa300000-0000-0000-0000-000000000001',
  'aa400000-0000-0000-0000-000000000002',
  'provider-msg-a2'
);")"
if [[ "${sent_replay}" != 'aa400000-0000-0000-0000-000000000002|2|sent|t' ]]; then
  echo "FAIL notification sent replay: ${sent_replay}" >&2
  exit 26
fi
echo "PASS provider response-loss retry replays sent authority without another logical send"

expect_failure \
  'sent logical delivery cannot allocate another provider retry' \
  'cmd_notification_delivery_already_sent' \
  "select * from public.cmd_prepare_notification_delivery_attempt_v1(
    'aa000000-0000-0000-0000-000000000001',
    'aa300000-0000-0000-0000-000000000001',
    'aa400000-0000-0000-0000-000000000003','apns');"

# 5. Concurrent distinct prepare calls serialize on delivery; exactly one attempt_no=1 wins.
race_dir="$(mktemp -d)"
set +e
"${PSQL[@]}" -q -At -F '|' -c "begin; select * from public.cmd_prepare_notification_delivery_attempt_v1(
  'aa000000-0000-0000-0000-000000000001',
  'aa300000-0000-0000-0000-000000000002',
  'aa400000-0000-0000-0000-000000000011','fcm'); select pg_sleep(0.4); commit;" >"${race_dir}/a.out" 2>&1 &
a_pid=$!
"${PSQL[@]}" -q -At -F '|' -c "select * from public.cmd_prepare_notification_delivery_attempt_v1(
  'aa000000-0000-0000-0000-000000000001',
  'aa300000-0000-0000-0000-000000000002',
  'aa400000-0000-0000-0000-000000000012','fcm');" >"${race_dir}/b.out" 2>&1 &
b_pid=$!
wait ${a_pid}; a_status=$?
wait ${b_pid}; b_status=$?
set -e
race_shape="$("${PSQL[@]}" -At -F '|' -c "select count(*),count(*) filter(where status='running'),min(attempt_no),max(attempt_no),
  (select status from public.notification_deliveries where id='aa300000-0000-0000-0000-000000000002'),
  (select next_attempt_no from public.notification_deliveries where id='aa300000-0000-0000-0000-000000000002')
from public.notification_delivery_attempts where delivery_id='aa300000-0000-0000-0000-000000000002';")"
if [[ "${race_shape}" != '1|1|1|1|sending|2' ]]; then
  echo "FAIL notification prepare race shape: ${race_shape}" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 27
fi
if [[ ${a_status} -eq 0 && ${b_status} -eq 0 ]]; then
  echo "FAIL concurrent distinct notification prepares both succeeded" >&2
  exit 28
fi
if ! grep -q 'cmd_notification_delivery_attempt_in_flight' "${race_dir}/a.out" && ! grep -q 'cmd_notification_delivery_attempt_in_flight' "${race_dir}/b.out"; then
  echo "FAIL notification prepare loser did not observe in-flight authority" >&2
  cat "${race_dir}/a.out" >&2
  cat "${race_dir}/b.out" >&2
  exit 29
fi
echo "PASS concurrent notification prepare -> one running attempt_no=1; loser denied"

# 6. Sent-vs-failed finalize race converges to exactly one terminal attempt/delivery projection.
prepare_attempt \
  'aa300000-0000-0000-0000-000000000003' \
  'aa400000-0000-0000-0000-000000000021' \
  'webpush' >/dev/null
final_dir="$(mktemp -d)"
set +e
"${PSQL[@]}" -q -At -F '|' -c "select * from public.cmd_finalize_notification_delivery_attempt_sent_v1(
  'aa000000-0000-0000-0000-000000000001','aa300000-0000-0000-0000-000000000003','aa400000-0000-0000-0000-000000000021','provider-race');" >"${final_dir}/sent.out" 2>&1 &
s_pid=$!
"${PSQL[@]}" -q -At -F '|' -c "select * from public.cmd_finalize_notification_delivery_attempt_failed_v1(
  'aa000000-0000-0000-0000-000000000001','aa300000-0000-0000-0000-000000000003','aa400000-0000-0000-0000-000000000021','NETWORK_ERROR',null);" >"${final_dir}/failed.out" 2>&1 &
f_pid=$!
wait ${s_pid}; s_status=$?
wait ${f_pid}; f_status=$?
set -e
final_shape="$("${PSQL[@]}" -At -F '|' -c "select nd.status,nda.status,
  (nd.status='sent' and nda.status='sent' and nd.sent_at is not null)
  or (nd.status='failed' and nda.status='failed' and nd.last_error_code='NETWORK_ERROR')
from public.notification_deliveries nd
join public.notification_delivery_attempts nda on nda.id='aa400000-0000-0000-0000-000000000021'
where nd.id='aa300000-0000-0000-0000-000000000003';")"
if [[ "${final_shape}" != 'sent|sent|t' && "${final_shape}" != 'failed|failed|t' ]]; then
  echo "FAIL sent-vs-failed race projection mismatch: ${final_shape}" >&2
  cat "${final_dir}/sent.out" >&2
  cat "${final_dir}/failed.out" >&2
  exit 30
fi
if [[ ${s_status} -eq 0 && ${f_status} -eq 0 ]]; then
  echo "FAIL sent-vs-failed race both finalized successfully" >&2
  exit 31
fi
if [[ ${s_status} -ne 0 && ${f_status} -ne 0 ]]; then
  echo "FAIL sent-vs-failed race had no winner" >&2
  cat "${final_dir}/sent.out" >&2
  cat "${final_dir}/failed.out" >&2
  exit 32
fi
echo "PASS concurrent sent-vs-failed finalize -> exactly one terminal authority wins"

# 7. Reused attempt id with a different delivery/provider identity is a conflict.
expect_failure \
  'notification attempt id cannot be reparented to another delivery' \
  'cmd_notification_delivery_attempt_replay_conflict' \
  "select * from public.cmd_prepare_notification_delivery_attempt_v1(
    'aa000000-0000-0000-0000-000000000001',
    'aa300000-0000-0000-0000-000000000004',
    'aa400000-0000-0000-0000-000000000001','fcm');"

# 8. Revoked installation and cancelled notification cannot allocate provider attempts.
expect_failure \
  'revoked installation blocks provider send' \
  'cmd_notification_delivery_installation_ineligible' \
  "select * from public.cmd_prepare_notification_delivery_attempt_v1(
    'aa000000-0000-0000-0000-000000000001',
    'aa300000-0000-0000-0000-000000000005',
    'aa400000-0000-0000-0000-000000000051','fcm');"

expect_failure \
  'cancelled notification blocks provider send' \
  'cmd_notification_delivery_notification_ineligible' \
  "select * from public.cmd_prepare_notification_delivery_attempt_v1(
    'aa000000-0000-0000-0000-000000000001',
    'aa300000-0000-0000-0000-000000000006',
    'aa400000-0000-0000-0000-000000000061','webpush');"

# 9. deletion_pending subject cannot start a new provider send.
"${PSQL[@]}" -q -c "update public.subjects set status='deletion_pending',updated_at=now() where id='aa000000-0000-0000-0000-000000000001';" >/dev/null
expect_failure \
  'deletion_pending subject blocks new provider send' \
  'cmd_notification_delivery_subject_ineligible' \
  "select * from public.cmd_prepare_notification_delivery_attempt_v1(
    'aa000000-0000-0000-0000-000000000001',
    'aa300000-0000-0000-0000-000000000007',
    'aa400000-0000-0000-0000-000000000071','webpush');"
"${PSQL[@]}" -q -c "update public.subjects set status='active',updated_at=now() where id='aa000000-0000-0000-0000-000000000001';" >/dev/null

expect_failure \
  'cross-subject notification delivery probe is denied' \
  'cmd_notification_delivery_not_found' \
  "select * from public.cmd_prepare_notification_delivery_attempt_v1(
    'aa000000-0000-0000-0000-000000000002',
    'aa300000-0000-0000-0000-000000000004',
    'aa400000-0000-0000-0000-000000000081','fcm');"

privs="$("${PSQL[@]}" -At -F '|' -c "select
  has_function_privilege('public','public.cmd_prepare_notification_delivery_attempt_v1(uuid,uuid,uuid,text)','EXECUTE'),
  has_function_privilege('public','public.cmd_finalize_notification_delivery_attempt_sent_v1(uuid,uuid,uuid,text)','EXECUTE'),
  has_function_privilege('public','public.cmd_finalize_notification_delivery_attempt_failed_v1(uuid,uuid,uuid,text,text)','EXECUTE');")"
if [[ "${privs}" != 'f|f|f' ]]; then
  echo "FAIL notification delivery command PUBLIC EXECUTE boundary: ${privs}" >&2
  exit 33
fi
echo "PASS Notification delivery commands PUBLIC EXECUTE remain revoked while P0-AUTH-01 is open"

echo "notification delivery attempt persistence/concurrency tests passed"
