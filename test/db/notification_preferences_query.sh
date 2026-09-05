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
  ('5a100000-0000-0000-0000-000000000001'),
  ('5a100000-0000-0000-0000-000000000002'),
  ('5a100000-0000-0000-0000-000000000005');

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('5a200000-0000-0000-0000-000000000001','member','5a100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('5a200000-0000-0000-0000-000000000002','member','5a100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('5a200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('5a200000-0000-0000-0000-000000000004','guest',null,'merged','5a200000-0000-0000-0000-000000000001',timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-02 00:00:00+00'),
  ('5a200000-0000-0000-0000-000000000005','member','5a100000-0000-0000-0000-000000000005','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00'),
  ('5a200000-0000-0000-0000-000000000006','member',null,'deleted',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-04 00:00:00+00');

insert into public.notification_settings(subject_id,timezone_override,quiet_start,quiet_end,preview_mode,global_enabled,updated_at) values
  ('5a200000-0000-0000-0000-000000000001','Asia/Seoul',time '23:30',time '07:15','character_only',true,timestamptz '2026-08-20 10:00:00+00'),
  ('5a200000-0000-0000-0000-000000000002',null,null,null,'discreet',false,timestamptz '2026-08-21 11:00:00+00'),
  ('5a200000-0000-0000-0000-000000000005','UTC',time '22:00',time '06:00','full',true,timestamptz '2026-08-22 12:00:00+00');

insert into public.notification_preferences(subject_id,category,enabled,updated_at) values
  ('5a200000-0000-0000-0000-000000000001','character_return',true,timestamptz '2026-08-20 10:01:00+00'),
  ('5a200000-0000-0000-0000-000000000001','service_notice',false,timestamptz '2026-08-20 10:02:00+00'),
  ('5a200000-0000-0000-0000-000000000002','new_character',true,timestamptz '2026-08-21 11:01:00+00'),
  ('5a200000-0000-0000-0000-000000000005','episode_unlock',true,timestamptz '2026-08-22 12:01:00+00');
SQL

settings_row=$("${psql_base[@]}" -Atc "select coalesce(timezone_override,'NULL')||'|'||coalesce(quiet_start::text,'NULL')||'|'||coalesce(quiet_end::text,'NULL')||'|'||preview_mode||'|'||case when global_enabled then '1' else '0' end||'|'||to_char(updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_notification_settings_v1('5a200000-0000-0000-0000-000000000001');")
[[ "$settings_row" == "Asia/Seoul|23:30:00|07:15:00|character_only|1|2026-08-20 10:00:00" ]] || fail "notification settings projection mismatch: $settings_row"
pass "stored global/quiet-hours/preview settings projection is returned exactly"

prefs=$("${psql_base[@]}" -Atc "select category||'|'||case when enabled then '1' else '0' end from public.qry_notification_preferences_v1('5a200000-0000-0000-0000-000000000001');")
expected=$'character_return|1\nservice_notice|0'
[[ "$prefs" == "$expected" ]] || fail "notification category preference projection mismatch: $prefs"
pass "stored category preferences are returned exactly and deterministically"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_settings_v1('5a200000-0000-0000-0000-000000000003');")" == "0" ]] || fail "missing settings row was fabricated for active guest"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_preferences_v1('5a200000-0000-0000-0000-000000000003');")" == "0" ]] || fail "missing category defaults were fabricated for active guest"
pass "missing settings/preferences remain absent; no database default projection is invented"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_notification_preferences_v1('5a200000-0000-0000-0000-000000000001');")" == "2" ]] || fail "other subject preference rows leaked into owner projection"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.notification_preferences where subject_id='5a200000-0000-0000-0000-000000000002';")" == "1" ]] || fail "fixture for second subject preference missing"
pass "current preference read remains scoped to the requested subject projection"

settings_json=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_notification_settings_v1('5a200000-0000-0000-0000-000000000001') q;")
[[ "$settings_json" != *"provider"* ]] || fail "provider state was invented in notification settings projection"
[[ "$settings_json" != *"permission"* ]] || fail "OS permission state was invented in notification settings projection"
[[ "$settings_json" != *"push_token"* ]] || fail "device token material leaked in notification settings projection"
prefs_json=$("${psql_base[@]}" -Atc "select coalesce(json_agg(q)::text,'[]') from public.qry_notification_preferences_v1('5a200000-0000-0000-0000-000000000001') q;")
[[ "$prefs_json" != *"provider"* ]] || fail "provider state was invented in category preference projection"
[[ "$prefs_json" != *"permission"* ]] || fail "OS permission state was invented in category preference projection"
pass "provider/OS permission and device state are not fabricated by database preference reads"

before_settings=$("${psql_base[@]}" -Atc "select timezone_override||'|'||preview_mode||'|'||global_enabled::text||'|'||updated_at::text from public.notification_settings where subject_id='5a200000-0000-0000-0000-000000000001';")
before_prefs=$("${psql_base[@]}" -Atc "select string_agg(category||':'||enabled::text||':'||updated_at::text,',' order by category) from public.notification_preferences where subject_id='5a200000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_notification_settings_v1('5a200000-0000-0000-0000-000000000001');" >/dev/null
"${psql_base[@]}" -Atc "select count(*) from public.qry_notification_preferences_v1('5a200000-0000-0000-0000-000000000001');" >/dev/null
after_settings=$("${psql_base[@]}" -Atc "select timezone_override||'|'||preview_mode||'|'||global_enabled::text||'|'||updated_at::text from public.notification_settings where subject_id='5a200000-0000-0000-0000-000000000001';")
after_prefs=$("${psql_base[@]}" -Atc "select string_agg(category||':'||enabled::text||':'||updated_at::text,',' order by category) from public.notification_preferences where subject_id='5a200000-0000-0000-0000-000000000001';")
[[ "$before_settings" == "$after_settings" ]] || fail "settings read mutated current projection"
[[ "$before_prefs" == "$after_prefs" ]] || fail "preferences read mutated current projection"
pass "notification preference reads are projection-only and leave authority unchanged"

expect_fail "deletion-pending subject generic preference read is denied" "notification preference read requires an active canonical subject" "select * from public.qry_notification_settings_v1('5a200000-0000-0000-0000-000000000005');"
expect_fail "deletion-pending subject category read is denied" "notification preference read requires an active canonical subject" "select * from public.qry_notification_preferences_v1('5a200000-0000-0000-0000-000000000005');"
expect_fail "merged subject preference read is denied" "notification preference read requires an active canonical subject" "select * from public.qry_notification_settings_v1('5a200000-0000-0000-0000-000000000004');"
expect_fail "deleted subject preference read is denied" "notification preference read requires an active canonical subject" "select * from public.qry_notification_preferences_v1('5a200000-0000-0000-0000-000000000006');"
expect_fail "notification settings subject is required" "notification settings subject is required" "select * from public.qry_notification_settings_v1(null);"
expect_fail "notification preferences subject is required" "notification preferences subject is required" "select * from public.qry_notification_preferences_v1(null);"

settings_public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_notification_settings_v1(uuid)','EXECUTE') then '1' else '0' end;")
prefs_public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_notification_preferences_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$settings_public_exec" == "0" ]] || fail "notification settings query unexpectedly executable by PUBLIC"
[[ "$prefs_public_exec" == "0" ]] || fail "notification preferences query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "public table catalog changed"
pass "notification preference query PUBLIC EXECUTE remains revoked and public table catalog remains 60"

echo "notification preference query tests passed"
