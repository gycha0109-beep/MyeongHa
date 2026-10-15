#!/usr/bin/env bash
set -euo pipefail
# R2-H 1680: exact original COMMIT, disposable PG17 service case only.
# Database DROP and role cleanup are owned by scripts/ci/run-db-track.mjs.
# Watchtower-Track: ops
hold() { echo "HOLD_R2_H_1680_$1" >&2; exit 1; }
pass() { echo "PASS_R2_H_1680_$1"; }
[[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || hold CI_ONLY
[[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGUSER" == postgres ]] || hold WRONG_SERVER
[[ "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold NOT_PG17
[[ "$(psql -X -Atqc 'select current_database()')" == "$PGDATABASE" ]] || hold DB_MISMATCH
[[ "$(git hash-object supabase/migrations/1650_seyeon_governed_active_subject_lock_v1.sql)" == 702166644092b8bc4b91ef8428b36901c636811b ]] || hold SOURCE_1650_DRIFT
[[ "$(git hash-object supabase/migrations/1670_seyeon_governed_guest_context_lock_v1.sql)" == 90bae4dd44811c07d81be8028c40da0cbb211891 ]] || hold SOURCE_1670_DRIFT
[[ "$(git hash-object supabase/migrations/1680_seyeon_governed_guest_expiry_admission_guard_v1.sql)" == d1b63f472b620b3250153d59dfeab079c6585e23 ]] || hold SOURCE_1680_DRIFT

guest_fn="public.begin_seyeon_governed_guest_subject_context_v1(text)"
guard_fn="public.seyeon_ai_lock_active_subject_for_cost_v1(uuid)"
start_fn="public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)"
[[ "$(psql -X -Atqc "select count(*) from pg_proc where oid in ('$guest_fn'::regprocedure,'$guard_fn'::regprocedure) and prosecdef")" == 2 ]] || hold PREREQUISITES
catalog() {
  psql -X -Atqc "select md5(string_agg(oid::text||'|'||proowner::text||'|'||coalesce(proacl::text,'NULL')||'|'||prosecdef::text||'|'||coalesce(proconfig::text,'NULL'),E'\n' order by oid)) from pg_proc where oid in ('$guest_fn'::regprocedure,'$guard_fn'::regprocedure)"
}
body() { psql -X -Atqc "select md5(pg_get_functiondef('$1'::regprocedure))"; }
meta_before="$(catalog)"
guest_before="$(body "$guest_fn")"
guard_before="$(body "$guard_fn")"
start_before="$(body "$start_fn")"
legacy_before="$(body public.begin_guest_subject_context_v1\(text\))"
[[ -n "$meta_before" && -n "$start_before" ]] || hold SNAPSHOT_EMPTY
# Original internal BEGIN/COMMIT is allowed only because the entire DB is ephemeral.
psql -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/1680_seyeon_governed_guest_expiry_admission_guard_v1.sql >/dev/null || hold SOURCE_REPLAY
[[ "$(catalog)" == "$meta_before" ]] || hold OWNER_ACL_OID_CHANGED
[[ "$(body "$guest_fn")" != "$guest_before" && "$(body "$guard_fn")" != "$guard_before" ]] || hold MISSING_FUNCTION_REPLACEMENT
[[ "$(body "$start_fn")" == "$start_before" ]] || hold START_CHANGED
[[ "$(body public.begin_guest_subject_context_v1\(text\))" == "$legacy_before" ]] || hold LEGACY_CHANGED
psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $acl$
declare v_role text;
begin
  if not has_function_privilege('myeongha_seyeon_governed_executor','public.begin_seyeon_governed_guest_subject_context_v1(text)','EXECUTE')
    or has_function_privilege('myeongha_seyeon_governed_executor','public.seyeon_ai_lock_active_subject_for_cost_v1(uuid)','EXECUTE')
    or has_function_privilege('myeongha_seyeon_governed_executor','public.begin_guest_subject_context_v1(text)','EXECUTE')
    or not has_function_privilege('myeongha_seyeon_cost_meter_owner','public.seyeon_ai_lock_active_subject_for_cost_v1(uuid)','EXECUTE')
  then raise exception 'HOLD_1680_ROLE_SCOPE'; end if;
  foreach v_role in array array['public','anon','authenticated','service_role','myeongha_api_executor']
  loop
    if has_function_privilege(v_role,'public.begin_seyeon_governed_guest_subject_context_v1(text)','EXECUTE')
      or has_function_privilege(v_role,'public.seyeon_ai_lock_active_subject_for_cost_v1(uuid)','EXECUTE')
    then raise exception 'HOLD_1680_PUBLIC_EXECUTE'; end if;
  end loop;
end $acl$;
SQL
pass SOURCE_COMMIT_OWNER_ACL_PRESERVED
if [[ "$(psql -X -Atqc "select bool_or(r.rolsuper)::text from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid in ('$guest_fn'::regprocedure,'$guard_fn'::regprocedure)")" == true ]]; then
  echo "HOLD_R2_H_1680_PRIVILEGED_SECURITY_DEFINER_OWNER_REVIEW"
fi

HA="myeongha-guest-bearer-hmac-sha256-v1:$(printf 'a%.0s' {1..64})"
HB="myeongha-guest-bearer-hmac-sha256-v1:$(printf 'b%.0s' {1..64})"
HC="myeongha-guest-bearer-hmac-sha256-v1:$(printf 'c%.0s' {1..64})"
psql -X -q -v ON_ERROR_STOP=1 -v ha="$HA" -v hb="$HB" -v hc="$HC" <<'SQL' >/dev/null
insert into auth.users(id) values('e1100000-0000-0000-0000-000000000001'),('e1100000-0000-0000-0000-000000000002'),('e1100000-0000-0000-0000-000000000003');
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
('e1200000-0000-0000-0000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
('e1200000-0000-0000-0000-000000000002','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
('e1200000-0000-0000-0000-000000000003','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
('e1200000-0000-0000-0000-000000000004','member','e1100000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp());
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,consumed_at,claimed_by_subject_id,created_at) values
('e1300000-0000-0000-0000-000000000001','e1200000-0000-0000-0000-000000000001',:'ha',clock_timestamp()+interval '1 day',null,null,clock_timestamp()-interval '1 day'),
('e1300000-0000-0000-0000-000000000002','e1200000-0000-0000-0000-000000000002',:'hb',clock_timestamp()+interval '5 seconds',null,null,clock_timestamp()-interval '1 day'),
('e1300000-0000-0000-0000-000000000003','e1200000-0000-0000-0000-000000000003',:'hc',clock_timestamp()+interval '1 day',null,null,clock_timestamp()-interval '1 day');
SQL
deny() {
  local name="$1" expected="$2" sql="$3" got
  if got="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "$sql" 2>&1)"; then hold "UNEXPECTED_ALLOW_$name"; fi
  [[ "$got" == *"$expected"* ]] || hold "WRONG_DENIAL_$name"
  pass "DENY_$name"
}
psql -X -qAt -v ON_ERROR_STOP=1 -c "begin; set local role myeongha_seyeon_governed_executor; select subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$HA'); set local role myeongha_seyeon_cost_meter_owner; select public.seyeon_ai_lock_active_subject_for_cost_v1('e1200000-0000-0000-0000-000000000001'); rollback;" >/dev/null || hold VALID_GUEST
pass VALID_GUEST_GUARD
psql -X -qAt -v ON_ERROR_STOP=1 -c "begin; select set_config('myeongha.subject_id','e1200000-0000-0000-0000-000000000004',true); set local role myeongha_seyeon_cost_meter_owner; select public.seyeon_ai_lock_active_subject_for_cost_v1('e1200000-0000-0000-0000-000000000004'); rollback;" >/dev/null || hold MEMBER_REGRESSION
pass MEMBER_PATH
deny MISSING_GUEST_SESSION 'requires a locked Guest proof' "begin; select set_config('myeongha.subject_id','e1200000-0000-0000-0000-000000000001',true); set local role myeongha_seyeon_cost_meter_owner; select public.seyeon_ai_lock_active_subject_for_cost_v1('e1200000-0000-0000-0000-000000000001');"
deny CROSS_SUBJECT_SESSION 'expired before paid admission' "begin; set local role myeongha_seyeon_governed_executor; select subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$HA'); select set_config('myeongha.seyeon_governed_guest_session_id','e1300000-0000-0000-0000-000000000003',true); set local role myeongha_seyeon_cost_meter_owner; select public.seyeon_ai_lock_active_subject_for_cost_v1('e1200000-0000-0000-0000-000000000001');"
deny DIRECT_COST_GUARD 'permission denied' "begin; set local role myeongha_seyeon_governed_executor; select public.seyeon_ai_lock_active_subject_for_cost_v1('e1200000-0000-0000-0000-000000000001');"
# Resolver succeeds; real clock crosses expiry before cost guard runs.
deny EXPIRED_AFTER_RESOLUTION 'expired before paid admission' "begin; set local statement_timeout='10s'; set local role myeongha_seyeon_governed_executor; select subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$HB'); select pg_sleep(5.5); set local role myeongha_seyeon_cost_meter_owner; select public.seyeon_ai_lock_active_subject_for_cost_v1('e1200000-0000-0000-0000-000000000002');"
pass POST_RESOLUTION_EXPIRY_GUARD

# 1680 replaces the Guest resolver; check it still protects promotion locks.
race="$(mktemp -d)"
trap 'rm -rf -- "$race"' EXIT
(
  PGAPPNAME=seyeon_1680_guest psql -X -qAt -v ON_ERROR_STOP=1 -c "begin; set local role myeongha_seyeon_governed_executor; select subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$HC'); select pg_sleep(1.8); commit;" >"$race/guest" 2>&1
) & guest_pid=$!
sleep 0.4
(
  PGAPPNAME=seyeon_1680_promotion psql -X -qAt -v ON_ERROR_STOP=1 -c "begin; select set_config('myeongha.subject_id','e1200000-0000-0000-0000-000000000003',true); select subject_kind from public.cmd_promote_guest_runtime_v1('e1200000-0000-0000-0000-000000000003','e1300000-0000-0000-0000-000000000003','e1100000-0000-0000-0000-000000000002'); commit;" >"$race/promotion" 2>&1
) & promotion_pid=$!
sleep 0.4
[[ "$(psql -X -Atqc "select count(*) from pg_stat_activity where application_name='seyeon_1680_promotion' and wait_event_type='Lock'")" == 1 ]] || hold PROMOTION_NOT_LOCKED
wait "$guest_pid" || hold GUEST_SESSION_FAILED
wait "$promotion_pid" || hold PROMOTION_SESSION_FAILED
deny PROMOTED_PROOF 'no longer an active canonical Guest' "begin; set local role myeongha_seyeon_governed_executor; select subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$HC');"
pass SUBJECT_SESSION_LOCK_ORDER
# Reverse race: promotion holds Subject UPDATE; resolver must wait and reject
# the now-consumed Guest proof, never return a stale session context.
(
  PGAPPNAME=seyeon_1680_promotion_first psql -X -qAt -v ON_ERROR_STOP=1 -c "begin; select set_config('myeongha.subject_id','e1200000-0000-0000-0000-000000000001',true); select subject_kind from public.cmd_promote_guest_runtime_v1('e1200000-0000-0000-0000-000000000001','e1300000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000003'); select pg_sleep(1.8); commit;" >"$race/promote_first" 2>&1
) & promotion_pid=$!
sleep 0.4
(
  PGAPPNAME=seyeon_1680_guest_wait psql -X -qAt -v ON_ERROR_STOP=1 -c "begin; set local role myeongha_seyeon_governed_executor; select subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$HA'); commit;" >"$race/guest_wait" 2>&1
) & guest_pid=$!
sleep 0.4
[[ "$(psql -X -Atqc "select count(*) from pg_stat_activity where application_name='seyeon_1680_guest_wait' and wait_event_type='Lock'")" == 1 ]] || hold GUEST_NOT_BLOCKED_BY_PROMOTION
wait "$promotion_pid" || hold PROMOTION_FIRST_FAILED
if wait "$guest_pid"; then hold STALE_GUEST_AFTER_PROMOTION_ALLOWED; fi
grep -q 'no longer an active canonical Guest' "$race/guest_wait" || hold WRONG_STALE_GUEST_DENIAL
pass PROMOTION_FIRST_STALE_GUEST_DENIED
[[ "$(catalog)" == "$meta_before" ]] || hold POST_TEST_OWNER_ACL_DRIFT
echo "HOLD_R2_H_1680_OWNER_APPROVAL_REQUIRED fundedAdmissionE2E=false productionWrites=0 drReady=false"
