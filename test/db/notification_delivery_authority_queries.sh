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
  ('f4100000-0000-0000-0000-000000000001'),
  ('f4100000-0000-0000-0000-000000000002'),
  ('f4100000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('f4200000-0000-0000-0000-000000000001','member','f4100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('f4200000-0000-0000-0000-000000000002','member','f4100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('f4200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('f4200000-0000-0000-0000-000000000004','member','f4100000-0000-0000-0000-000000000003','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-02 00:00:00+00'),
  ('f4200000-0000-0000-0000-000000000005','guest',null,'merged','f4200000-0000-0000-0000-000000000001',timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00');

insert into public.notifications(
  id,subject_id,category,character_id,content_bundle_id,source_world_event_id,
  template_key,payload_jsonb,dedupe_key,status,scheduled_at,read_at,created_at
) values
  ('f4300000-0000-0000-0000-000000000001','f4200000-0000-0000-0000-000000000001','service_notice',null,null,null,'delivery-main','{}','delivery-main','ready',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-20 00:00:00+00'),
  ('f4300000-0000-0000-0000-000000000002','f4200000-0000-0000-0000-000000000002','service_notice',null,null,null,'delivery-other','{}','delivery-other','ready',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-20 00:00:00+00'),
  ('f4300000-0000-0000-0000-000000000003','f4200000-0000-0000-0000-000000000003','service_notice',null,null,null,'delivery-guest','{}','delivery-guest','ready',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-20 00:00:00+00'),
  ('f4300000-0000-0000-0000-000000000004','f4200000-0000-0000-0000-000000000004','service_notice',null,null,null,'delivery-deleting','{}','delivery-deleting','cancelled',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-20 00:00:00+00'),
  ('f4300000-0000-0000-0000-000000000005','f4200000-0000-0000-0000-000000000005','service_notice',null,null,null,'delivery-merged','{}','delivery-merged','cancelled',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-20 00:00:00+00');

insert into public.device_installations(
  id,subject_id,platform,installation_key,push_token_encrypted,push_token_key_id,
  token_fingerprint,app_version,client_capability,last_seen_at,revoked_at,created_at
) values
  ('f4400000-0000-0000-0000-000000000001','f4200000-0000-0000-0000-000000000001','android','b75-main-1',null,null,null,'1.0','cap-a',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-01 00:00:00+00'),
  ('f4400000-0000-0000-0000-000000000002','f4200000-0000-0000-0000-000000000001','android','b75-main-2',null,null,null,'1.0','cap-a',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-01 00:00:00+00'),
  ('f4400000-0000-0000-0000-000000000003','f4200000-0000-0000-0000-000000000001','ios','b75-main-3',null,null,null,'1.0','cap-a',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-01 00:00:00+00'),
  ('f4400000-0000-0000-0000-000000000004','f4200000-0000-0000-0000-000000000001','web','b75-main-4',null,null,null,'1.0','cap-a',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-01 00:00:00+00'),
  ('f4400000-0000-0000-0000-000000000005','f4200000-0000-0000-0000-000000000001','android','b75-main-5',null,null,null,'1.0','cap-a',timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-21 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('f4400000-0000-0000-0000-000000000006','f4200000-0000-0000-0000-000000000002','android','b75-other',null,null,null,'1.0','cap-a',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-01 00:00:00+00'),
  ('f4400000-0000-0000-0000-000000000007','f4200000-0000-0000-0000-000000000003','android','b75-guest',null,null,null,'1.0','cap-a',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-01 00:00:00+00'),
  ('f4400000-0000-0000-0000-000000000008','f4200000-0000-0000-0000-000000000004','android','b75-deleting',null,null,null,'1.0','cap-a',timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-21 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('f4400000-0000-0000-0000-000000000009','f4200000-0000-0000-0000-000000000005','android','b75-merged',null,null,null,'1.0','cap-a',timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-21 00:00:00+00',timestamptz '2026-08-01 00:00:00+00');

insert into public.notification_deliveries(
  id,subject_id,notification_id,installation_id,status,next_attempt_no,
  last_provider_message_ref,last_error_code,sent_at,created_at,updated_at
) values
  ('f4500000-0000-0000-0000-000000000001','f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001','f4400000-0000-0000-0000-000000000001','pending',1,null,null,null,timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-20 00:00:00+00'),
  ('f4500000-0000-0000-0000-000000000002','f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001','f4400000-0000-0000-0000-000000000002','sending',3,null,'prior-timeout',null,timestamptz '2026-08-20 00:01:00+00',timestamptz '2026-08-20 00:03:00+00'),
  ('f4500000-0000-0000-0000-000000000003','f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001','f4400000-0000-0000-0000-000000000003','sent',2,'provider-sent-1',null,timestamptz '2026-08-20 00:05:00+00',timestamptz '2026-08-20 00:02:00+00',timestamptz '2026-08-20 00:05:00+00'),
  ('f4500000-0000-0000-0000-000000000004','f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001','f4400000-0000-0000-0000-000000000004','failed',2,'provider-failed-1','unavailable',null,timestamptz '2026-08-20 00:03:00+00',timestamptz '2026-08-20 00:06:00+00'),
  ('f4500000-0000-0000-0000-000000000005','f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001','f4400000-0000-0000-0000-000000000005','cancelled',2,null,'token-revoked',null,timestamptz '2026-08-20 00:04:00+00',timestamptz '2026-08-21 00:00:00+00'),
  ('f4500000-0000-0000-0000-000000000006','f4200000-0000-0000-0000-000000000002','f4300000-0000-0000-0000-000000000002','f4400000-0000-0000-0000-000000000006','pending',1,null,null,null,timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-20 00:00:00+00'),
  ('f4500000-0000-0000-0000-000000000007','f4200000-0000-0000-0000-000000000003','f4300000-0000-0000-0000-000000000003','f4400000-0000-0000-0000-000000000007','pending',1,null,null,null,timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-20 00:00:00+00'),
  ('f4500000-0000-0000-0000-000000000008','f4200000-0000-0000-0000-000000000004','f4300000-0000-0000-0000-000000000004','f4400000-0000-0000-0000-000000000008','cancelled',1,null,null,null,timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-21 00:00:00+00'),
  ('f4500000-0000-0000-0000-000000000009','f4200000-0000-0000-0000-000000000005','f4300000-0000-0000-0000-000000000005','f4400000-0000-0000-0000-000000000009','cancelled',1,null,null,null,timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-21 00:00:00+00');

insert into public.notification_delivery_attempts(
  id,delivery_id,subject_id,attempt_no,provider,status,provider_message_ref,error_code,started_at,finished_at
) values
  ('f4600000-0000-0000-0000-000000000001','f4500000-0000-0000-0000-000000000002','f4200000-0000-0000-0000-000000000001',1,'fcm','failed','provider-failed-0','timeout',timestamptz '2026-08-20 00:01:00+00',timestamptz '2026-08-20 00:01:30+00'),
  ('f4600000-0000-0000-0000-000000000002','f4500000-0000-0000-0000-000000000002','f4200000-0000-0000-0000-000000000001',2,'fcm','running',null,null,timestamptz '2026-08-20 00:03:00+00',null),
  ('f4600000-0000-0000-0000-000000000003','f4500000-0000-0000-0000-000000000003','f4200000-0000-0000-0000-000000000001',1,'apns','sent','provider-sent-1',null,timestamptz '2026-08-20 00:04:00+00',timestamptz '2026-08-20 00:05:00+00'),
  ('f4600000-0000-0000-0000-000000000004','f4500000-0000-0000-0000-000000000004','f4200000-0000-0000-0000-000000000001',1,'web_push','failed','provider-failed-1','unavailable',timestamptz '2026-08-20 00:05:00+00',timestamptz '2026-08-20 00:06:00+00'),
  ('f4600000-0000-0000-0000-000000000005','f4500000-0000-0000-0000-000000000005','f4200000-0000-0000-0000-000000000001',1,'fcm','failed',null,'token-revoked',timestamptz '2026-08-20 00:06:00+00',timestamptz '2026-08-20 00:06:10+00');
SQL

deliveries=$("${psql_base[@]}" -Atc "
  select delivery_id||'|'||installation_id||'|'||delivery_status||'|'||next_attempt_no||'|'||coalesce(last_provider_message_ref,'NULL')||'|'||coalesce(last_error_code,'NULL')||'|'||coalesce(to_char(sent_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'NULL')
  from public.qry_notification_deliveries_v1('f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001')
  order by delivery_id;")
expected=$'f4500000-0000-0000-0000-000000000001|f4400000-0000-0000-0000-000000000001|pending|1|NULL|NULL|NULL\nf4500000-0000-0000-0000-000000000002|f4400000-0000-0000-0000-000000000002|sending|3|NULL|prior-timeout|NULL\nf4500000-0000-0000-0000-000000000003|f4400000-0000-0000-0000-000000000003|sent|2|provider-sent-1|NULL|2026-08-20 00:05:00\nf4500000-0000-0000-0000-000000000004|f4400000-0000-0000-0000-000000000004|failed|2|provider-failed-1|unavailable|NULL\nf4500000-0000-0000-0000-000000000005|f4400000-0000-0000-0000-000000000005|cancelled|2|NULL|token-revoked|NULL'
[[ "$deliveries" == "$expected" ]] || fail "notification delivery current projection mismatch: $deliveries"
[[ "$("${psql_base[@]}" -Atc "select count(distinct delivery_status) from public.qry_notification_deliveries_v1('f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001');")" == "5" ]] || fail "delivery projection hid a persisted lifecycle state"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_deliveries_v1('f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001') where installation_id='f4400000-0000-0000-0000-000000000005';")" == "1" ]] || fail "delivery projection hid history for a revoked installation"
pass "delivery projection preserves all persisted current-state classes without retry/device synthesis"

attempts=$("${psql_base[@]}" -Atc "
  select attempt_id||'|'||attempt_no||'|'||provider||'|'||attempt_status||'|'||coalesce(provider_message_ref,'NULL')||'|'||coalesce(error_code,'NULL')||'|'||to_char(started_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')||'|'||coalesce(to_char(finished_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'NULL')
  from public.qry_notification_delivery_attempts_v1('f4200000-0000-0000-0000-000000000001','f4500000-0000-0000-0000-000000000002')
  order by attempt_no;")
expected_attempts=$'f4600000-0000-0000-0000-000000000001|1|fcm|failed|provider-failed-0|timeout|2026-08-20 00:01:00|2026-08-20 00:01:30\nf4600000-0000-0000-0000-000000000002|2|fcm|running|NULL|NULL|2026-08-20 00:03:00|NULL'
[[ "$attempts" == "$expected_attempts" ]] || fail "notification delivery attempt provenance mismatch: $attempts"
[[ "$("${psql_base[@]}" -Atc "select attempt_status from public.qry_notification_delivery_attempts_v1('f4200000-0000-0000-0000-000000000001','f4500000-0000-0000-0000-000000000003');")" == "sent" ]] || fail "sent provider attempt provenance was not preserved"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_delivery_attempts_v1('f4200000-0000-0000-0000-000000000001','f4500000-0000-0000-0000-000000000001');")" == "0" ]] || fail "attempt projection synthesized a provider attempt for pending delivery"
pass "attempt projection preserves stored provider provenance and synthesizes no retry attempt"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_deliveries_v1('f4200000-0000-0000-0000-000000000003','f4300000-0000-0000-0000-000000000003');")" == "1" ]] || fail "active canonical guest delivery authority was not readable"
pass "delivery authority read supports active canonical guest/member subjects"

before_delivery=$("${psql_base[@]}" -Atc "select md5(string_agg(id::text||':'||status||':'||next_attempt_no::text||':'||coalesce(last_error_code,'NULL'),',' order by id)) from public.notification_deliveries where subject_id='f4200000-0000-0000-0000-000000000001';")
before_attempt=$("${psql_base[@]}" -Atc "select md5(string_agg(id::text||':'||status||':'||attempt_no::text||':'||coalesce(error_code,'NULL'),',' order by id)) from public.notification_delivery_attempts where subject_id='f4200000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_notification_deliveries_v1('f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000001');" >/dev/null
"${psql_base[@]}" -Atc "select count(*) from public.qry_notification_delivery_attempts_v1('f4200000-0000-0000-0000-000000000001','f4500000-0000-0000-0000-000000000002');" >/dev/null
after_delivery=$("${psql_base[@]}" -Atc "select md5(string_agg(id::text||':'||status||':'||next_attempt_no::text||':'||coalesce(last_error_code,'NULL'),',' order by id)) from public.notification_deliveries where subject_id='f4200000-0000-0000-0000-000000000001';")
after_attempt=$("${psql_base[@]}" -Atc "select md5(string_agg(id::text||':'||status||':'||attempt_no::text||':'||coalesce(error_code,'NULL'),',' order by id)) from public.notification_delivery_attempts where subject_id='f4200000-0000-0000-0000-000000000001';")
[[ "$before_delivery" == "$after_delivery" && "$before_attempt" == "$after_attempt" ]] || fail "notification delivery authority read mutated source rows"
pass "notification delivery authority projections are read-only"

expect_fail "cross-owner notification delivery read is denied" "notification was not found for this subject" "select * from public.qry_notification_deliveries_v1('f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000002');"
expect_fail "unknown notification delivery target is denied" "notification was not found for this subject" "select * from public.qry_notification_deliveries_v1('f4200000-0000-0000-0000-000000000001','f4300000-0000-0000-0000-000000000099');"
expect_fail "cross-owner provider attempt read is denied" "notification delivery was not found for this subject" "select * from public.qry_notification_delivery_attempts_v1('f4200000-0000-0000-0000-000000000001','f4500000-0000-0000-0000-000000000006');"
expect_fail "unknown provider attempt delivery is denied" "notification delivery was not found for this subject" "select * from public.qry_notification_delivery_attempts_v1('f4200000-0000-0000-0000-000000000001','f4500000-0000-0000-0000-000000000099');"
expect_fail "deletion-pending delivery generic read is denied" "notification delivery read requires an active canonical subject" "select * from public.qry_notification_deliveries_v1('f4200000-0000-0000-0000-000000000004','f4300000-0000-0000-0000-000000000004');"
expect_fail "merged delivery generic read is denied" "notification delivery read requires an active canonical subject" "select * from public.qry_notification_deliveries_v1('f4200000-0000-0000-0000-000000000005','f4300000-0000-0000-0000-000000000005');"
expect_fail "deletion-pending attempt generic read is denied" "notification delivery attempt read requires an active canonical subject" "select * from public.qry_notification_delivery_attempts_v1('f4200000-0000-0000-0000-000000000004','f4500000-0000-0000-0000-000000000008');"
expect_fail "merged attempt generic read is denied" "notification delivery attempt read requires an active canonical subject" "select * from public.qry_notification_delivery_attempts_v1('f4200000-0000-0000-0000-000000000005','f4500000-0000-0000-0000-000000000009');"
expect_fail "delivery query identities are required" "notification delivery subject and notification are required" "select * from public.qry_notification_deliveries_v1(null,'f4300000-0000-0000-0000-000000000001');"
expect_fail "attempt query identities are required" "notification delivery attempt subject and delivery are required" "select * from public.qry_notification_delivery_attempts_v1('f4200000-0000-0000-0000-000000000001',null);"

for fn in 'public.qry_notification_deliveries_v1(uuid,uuid)' 'public.qry_notification_delivery_attempts_v1(uuid,uuid)'; do
  volatility=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='$fn'::regprocedure;")
  [[ "$volatility" == "s" ]] || fail "$fn is not STABLE: $volatility"
  security_definer=$("${psql_base[@]}" -Atc "select case when prosecdef then '1' else '0' end from pg_proc where oid='$fn'::regprocedure;")
  [[ "$security_definer" == "0" ]] || fail "$fn unexpectedly uses SECURITY DEFINER"
  search_path=$("${psql_base[@]}" -Atc "select array_to_string(proconfig, ',') from pg_proc where oid='$fn'::regprocedure;")
  [[ "$search_path" == "search_path=public, pg_temp" ]] || fail "$fn search_path mismatch: $search_path"
  public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','$fn','EXECUTE') then '1' else '0' end;")
  [[ "$public_exec" == "0" ]] || fail "$fn unexpectedly executable by PUBLIC"
done
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "notification delivery authority queries are STABLE/INVOKER, explicit search_path, PUBLIC-revoked, and table catalog remains 59"

echo "notification delivery authority projection tests passed"
