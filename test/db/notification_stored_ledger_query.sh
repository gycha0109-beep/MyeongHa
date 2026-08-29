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
  ('f1100000-0000-0000-0000-000000000001'),
  ('f1100000-0000-0000-0000-000000000002'),
  ('f1100000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('f2100000-0000-0000-0000-000000000001','member','f1100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('f2100000-0000-0000-0000-000000000002','member','f1100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('f2100000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('f2100000-0000-0000-0000-000000000004','member','f1100000-0000-0000-0000-000000000003','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-02 00:00:00+00'),
  ('f2100000-0000-0000-0000-000000000005','guest',null,'merged','f2100000-0000-0000-0000-000000000001',timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00');

insert into public.notifications(
  id,subject_id,category,character_id,content_bundle_id,source_world_event_id,
  template_key,payload_jsonb,dedupe_key,status,scheduled_at,read_at,created_at
) values
  ('f3100000-0000-0000-0000-000000000001','f2100000-0000-0000-0000-000000000001','character_return',null,null,null,'tpl-queued','{"marker":"queued"}','dedupe-queued','queued',timestamptz '2026-08-20 01:00:00+00',null,timestamptz '2026-08-20 00:00:00+00'),
  ('f3100000-0000-0000-0000-000000000002','f2100000-0000-0000-0000-000000000001','new_monthly_reading',null,null,null,'tpl-ready','{"marker":"ready"}','dedupe-ready','ready',timestamptz '2026-08-20 02:00:00+00',null,timestamptz '2026-08-20 00:01:00+00'),
  ('f3100000-0000-0000-0000-000000000003','f2100000-0000-0000-0000-000000000001','episode_unlock',null,null,null,'tpl-read','{"marker":"read"}','dedupe-read','read',timestamptz '2026-08-20 03:00:00+00',timestamptz '2026-08-20 04:00:00+00',timestamptz '2026-08-20 00:02:00+00'),
  ('f3100000-0000-0000-0000-000000000004','f2100000-0000-0000-0000-000000000001','new_character',null,null,null,'tpl-cancelled','{"marker":"cancelled"}','dedupe-cancelled','cancelled',timestamptz '2026-08-20 05:00:00+00',null,timestamptz '2026-08-20 00:03:00+00'),
  ('f3100000-0000-0000-0000-000000000005','f2100000-0000-0000-0000-000000000001','service_notice',null,null,null,'tpl-expired','{"marker":"expired"}','dedupe-expired','expired',timestamptz '2026-08-20 06:00:00+00',null,timestamptz '2026-08-20 00:04:00+00'),
  ('f3100000-0000-0000-0000-000000000006','f2100000-0000-0000-0000-000000000001','service_notice',null,null,null,'tpl-future','{"marker":"future"}','dedupe-future','queued',timestamptz '2099-01-01 00:00:00+00',null,timestamptz '2026-08-20 00:05:00+00'),
  ('f3100000-0000-0000-0000-000000000007','f2100000-0000-0000-0000-000000000002','service_notice',null,null,null,'tpl-other','{"marker":"other"}','dedupe-other','ready',timestamptz '2026-08-20 07:00:00+00',null,timestamptz '2026-08-20 00:06:00+00'),
  ('f3100000-0000-0000-0000-000000000008','f2100000-0000-0000-0000-000000000003','service_notice',null,null,null,'tpl-guest','{"marker":"guest"}','dedupe-guest','ready',timestamptz '2026-08-20 08:00:00+00',null,timestamptz '2026-08-20 00:07:00+00'),
  ('f3100000-0000-0000-0000-000000000009','f2100000-0000-0000-0000-000000000004','service_notice',null,null,null,'tpl-deleting','{"marker":"deleting"}','dedupe-deleting','ready',timestamptz '2026-08-20 09:00:00+00',null,timestamptz '2026-08-20 00:08:00+00'),
  ('f3100000-0000-0000-0000-000000000010','f2100000-0000-0000-0000-000000000005','service_notice',null,null,null,'tpl-merged','{"marker":"merged"}','dedupe-merged','ready',timestamptz '2026-08-20 10:00:00+00',null,timestamptz '2026-08-20 00:09:00+00');
SQL

rows=$("${psql_base[@]}" -Atc "
  select notification_id||'|'||category||'|'||template_key||'|'||(payload_jsonb->>'marker')||'|'||dedupe_key||'|'||notification_status||'|'||to_char(scheduled_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')||'|'||coalesce(to_char(read_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'NULL')||'|'||to_char(created_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')
  from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000001')
  order by notification_id;")
expected=$'f3100000-0000-0000-0000-000000000001|character_return|tpl-queued|queued|dedupe-queued|queued|2026-08-20 01:00:00|NULL|2026-08-20 00:00:00\nf3100000-0000-0000-0000-000000000002|new_monthly_reading|tpl-ready|ready|dedupe-ready|ready|2026-08-20 02:00:00|NULL|2026-08-20 00:01:00\nf3100000-0000-0000-0000-000000000003|episode_unlock|tpl-read|read|dedupe-read|read|2026-08-20 03:00:00|2026-08-20 04:00:00|2026-08-20 00:02:00\nf3100000-0000-0000-0000-000000000004|new_character|tpl-cancelled|cancelled|dedupe-cancelled|cancelled|2026-08-20 05:00:00|NULL|2026-08-20 00:03:00\nf3100000-0000-0000-0000-000000000005|service_notice|tpl-expired|expired|dedupe-expired|expired|2026-08-20 06:00:00|NULL|2026-08-20 00:04:00\nf3100000-0000-0000-0000-000000000006|service_notice|tpl-future|future|dedupe-future|queued|2099-01-01 00:00:00|NULL|2026-08-20 00:05:00'
[[ "$rows" == "$expected" ]] || fail "stored notification ledger projection mismatch: $rows"
pass "stored notification ledger preserves all persisted lifecycle rows and fields"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000001');")" == "6" ]] || fail "stored ledger unexpectedly applied inbox membership filtering"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000001') where scheduled_at >= timestamptz '2099-01-01 00:00:00+00';")" == "1" ]] || fail "future-scheduled row was hidden by invented visibility timing"
[[ "$("${psql_base[@]}" -Atc "select count(distinct notification_status) from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000001');")" == "5" ]] || fail "stored ledger did not preserve all persisted status classes"
pass "stored ledger does not invent status, scheduling, unread, or final-inbox membership semantics"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000001') where notification_id='f3100000-0000-0000-0000-000000000007';")" == "0" ]] || fail "other subject notification leaked into stored ledger"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000003');")" == "1" ]] || fail "active canonical guest notification ledger was not readable"
pass "stored notification ledger remains owner-scoped for active canonical member/guest subjects"

before=$("${psql_base[@]}" -Atc "select md5(string_agg(id::text||':'||status||':'||coalesce(read_at::text,'NULL'),',' order by id)) from public.notifications where subject_id='f2100000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5(string_agg(id::text||':'||status||':'||coalesce(read_at::text,'NULL'),',' order by id)) from public.notifications where subject_id='f2100000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "stored notification ledger read mutated notification authority"
pass "stored notification ledger read is projection-only"

expect_fail "deletion-pending notification ledger generic read is denied" "notification ledger read requires an active canonical subject" "select * from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000004');"
expect_fail "merged notification ledger generic read is denied" "notification ledger read requires an active canonical subject" "select * from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000005');"
expect_fail "unknown notification ledger subject is denied" "notification ledger read requires an active canonical subject" "select * from public.qry_notification_stored_ledger_v1('f2100000-0000-0000-0000-000000000099');"
expect_fail "notification ledger subject is required" "notification ledger subject is required" "select * from public.qry_notification_stored_ledger_v1(null);"

volatility=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.qry_notification_stored_ledger_v1(uuid)'::regprocedure;")
[[ "$volatility" == "s" ]] || fail "notification stored ledger query is not STABLE: $volatility"
security_definer=$("${psql_base[@]}" -Atc "select case when prosecdef then '1' else '0' end from pg_proc where oid='public.qry_notification_stored_ledger_v1(uuid)'::regprocedure;")
[[ "$security_definer" == "0" ]] || fail "notification stored ledger query unexpectedly uses SECURITY DEFINER"
search_path=$("${psql_base[@]}" -Atc "select array_to_string(proconfig, ',') from pg_proc where oid='public.qry_notification_stored_ledger_v1(uuid)'::regprocedure;")
[[ "$search_path" == "search_path=public, pg_temp" ]] || fail "notification stored ledger query search_path mismatch: $search_path"
public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_notification_stored_ledger_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "notification stored ledger query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "notification stored ledger query is STABLE/INVOKER, explicit search_path, PUBLIC-revoked, and table catalog remains 59"

echo "notification stored ledger projection tests passed"
