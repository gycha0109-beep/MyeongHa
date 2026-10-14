#!/usr/bin/env bash
set -euo pipefail
# R2-H 1670: exact-byte forward replay in an existing CI-owned disposable PG17 DB.
# Parent scripts/ci/run-db-track.mjs owns creation, destruction, role cleanup.
# Watchtower-Track: ops

hold() { echo "HOLD_R2_H_1670_$1" >&2; exit 1; }
pass() { echo "PASS_R2_H_1670_$1"; }

# Reject manual/local/remote execution, even if credentials point at a PG17 server.
[[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || hold NOT_CI_SUITE
[[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGUSER" == postgres ]] || hold NOT_SERVICE_LOCAL
[[ "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE_DB
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold NOT_PG17
[[ "$(psql -X -Atqc 'select current_database()')" == "$PGDATABASE" ]] || hold WRONG_DATABASE
[[ "$(psql -X -Atqc 'select current_user')" == postgres ]] || hold WRONG_FIXTURE_ACTOR
[[ "$(git hash-object supabase/migrations/1670_seyeon_governed_guest_context_lock_v1.sql)" == 90bae4dd44811c07d81be8028c40da0cbb211891 ]] || hold SOURCE_BLOB_CHANGED

# These inputs were applied by the caller after an exact 1510 + two timestamped
# baseline. They MUST be present before the real, internally committed 1670 SQL.
[[ "$(psql -X -Atqc "select count(*) from pg_roles where rolname='myeongha_seyeon_governed_executor'")" == 1 ]] || hold EXECUTOR_MISSING
[[ "$(psql -X -Atqc "select count(*) from pg_proc where oid=to_regprocedure('public.begin_seyeon_governed_guest_subject_context_v1(text)')")" == 0 ]] || hold NOT_FRESH
[[ "$(psql -X -Atqc "select has_function_privilege('myeongha_seyeon_governed_executor','public.begin_guest_subject_context_v1(text)','EXECUTE')")" == t ]] || hold BASELINE_OLD_GRANT_MISSING

snapshot_existing() {
  psql -X -Atqc "select md5(
    pg_get_functiondef('public.begin_guest_subject_context_v1(text)'::regprocedure) ||
    pg_get_functiondef('public.cmd_promote_guest_runtime_v1(uuid,uuid,uuid)'::regprocedure) ||
    (select string_agg(c.relname || ':' || c.relowner::text || ':' ||
      c.relrowsecurity::text || ':' || c.relforcerowsecurity::text || ':' ||
      coalesce(c.relacl::text,'NULL'), '|'
      order by c.relname)
     from pg_class c where c.oid in ('public.subjects'::regclass,'public.guest_sessions'::regclass))
  )"
}
existing_before="$(snapshot_existing)"
[[ -n "$existing_before" ]] || hold PRE_CATALOG_EMPTY

# Original SQL contains BEGIN/COMMIT. NO wrapping BEGIN/ROLLBACK is attempted.
# The current job's case database is subsequently DROP DATABASE-d by the CI owner.
psql -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/1670_seyeon_governed_guest_context_lock_v1.sql >/dev/null || hold SOURCE_FORWARD_REPLAY_FAILED
[[ "$(snapshot_existing)" == "$existing_before" ]] || hold EXISTING_DDL_OR_TABLE_DRIFT

psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $check$
declare
  f oid := to_regprocedure('public.begin_seyeon_governed_guest_subject_context_v1(text)');
  r oid := (select oid from pg_roles where rolname='myeongha_seyeon_governed_executor');
  v_role text;
begin
  if f is null or r is null then raise exception 'HOLD_1670_ABSENT'; end if;
  if not exists (
    select 1 from pg_proc where oid=f and prosecdef
      and proconfig is not null
      and replace(array_to_string(proconfig,','),' ','') like '%search_path=pg_catalog,public%'
  ) then raise exception 'HOLD_1670_FUNCTION_SECURITY'; end if;
  if exists (select 1 from pg_auth_members where roleid=r or member=r)
    or exists (select 1 from pg_roles where oid=r and
      (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls))
  then raise exception 'HOLD_1670_ROLE_MEMBERSHIP'; end if;
  if has_function_privilege('myeongha_seyeon_governed_executor',
      'public.begin_guest_subject_context_v1(text)','EXECUTE')
    or not has_function_privilege('myeongha_seyeon_governed_executor', f,'EXECUTE')
  then raise exception 'HOLD_1670_EXECUTOR_SCOPE'; end if;
  foreach v_role in array array['public','anon','authenticated','service_role','myeongha_api_executor']
  loop
    if has_function_privilege(v_role,f,'EXECUTE') then
      raise exception 'HOLD_1670_UNTRUSTED_EXECUTE';
    end if;
  end loop;
  if has_table_privilege('myeongha_seyeon_governed_executor',
     'public.subjects','INSERT,UPDATE,DELETE')
     or has_table_privilege('myeongha_seyeon_governed_executor',
     'public.guest_sessions','INSERT,UPDATE,DELETE')
  then raise exception 'HOLD_1670_DIRECT_DML'; end if;
end
$check$;
SQL
pass FORWARD_COMMIT_CATALOG_ACL
creator_superuser="$(psql -X -Atqc "select r.rolsuper::text from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='public.begin_seyeon_governed_guest_subject_context_v1(text)'::regprocedure")"
[[ "$creator_superuser" == true || "$creator_superuser" == false ]] || hold CREATOR_OWNER_UNKNOWN
if [[ "$creator_superuser" == true ]]; then
  echo 'HOLD_R2_H_1670_PRIVILEGED_SECURITY_DEFINER_CREATOR_OWNER_REVIEW'
fi

# The source is not an idempotent repeatable migration. An accidental second
# apply must fail, and a failed transaction must not change the catalog.
new_before="$(psql -X -Atqc "select md5(pg_get_functiondef('public.begin_seyeon_governed_guest_subject_context_v1(text)'::regprocedure) || coalesce((select proacl::text from pg_proc where oid='public.begin_seyeon_governed_guest_subject_context_v1(text)'::regprocedure),'NULL'))")"
if psql -X -q -v ON_ERROR_STOP=1 -f supabase/migrations/1670_seyeon_governed_guest_context_lock_v1.sql >/dev/null 2>&1; then
  hold UNEXPECTED_REPLAY_SUCCESS
fi
[[ "$(snapshot_existing)" == "$existing_before" ]] || hold REPLAY_CHANGED_EXISTING
[[ "$(psql -X -Atqc "select md5(pg_get_functiondef('public.begin_seyeon_governed_guest_subject_context_v1(text)'::regprocedure) || coalesce((select proacl::text from pg_proc where oid='public.begin_seyeon_governed_guest_subject_context_v1(text)'::regprocedure),'NULL'))")" == "$new_before" ]] || hold REPLAY_CHANGED_NEW
pass REPEAT_FAIL_CLOSED

# No actual credential. These synthetic hashes have the production FORMAT only.
HASH_A="myeongha-guest-bearer-hmac-sha256-v1:$(printf 'a%.0s' {1..64})"
HASH_B="myeongha-guest-bearer-hmac-sha256-v1:$(printf 'b%.0s' {1..64})"
HASH_C="myeongha-guest-bearer-hmac-sha256-v1:$(printf 'c%.0s' {1..64})"
HASH_D="myeongha-guest-bearer-hmac-sha256-v1:$(printf 'd%.0s' {1..64})"
HASH_E="myeongha-guest-bearer-hmac-sha256-v1:$(printf 'e%.0s' {1..64})"

psql -X -q -v ON_ERROR_STOP=1 \
  -v ha="$HASH_A" -v hb="$HASH_B" -v hc="$HASH_C" -v hd="$HASH_D" -v he="$HASH_E" <<'SQL' >/dev/null
insert into auth.users(id) values
('e0100000-0000-0000-0000-000000000001'),
('e0100000-0000-0000-0000-000000000002');
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at)
select ('e0200000-0000-0000-0000-00000000000' || n)::uuid,'guest',null,'active',null,
clock_timestamp(),clock_timestamp()
from generate_series(1,5) as n;
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,consumed_at,claimed_by_subject_id,created_at)
values
('e0300000-0000-0000-0000-000000000001','e0200000-0000-0000-0000-000000000001',:'ha',clock_timestamp()+interval '1 day',null,null,clock_timestamp()),
('e0300000-0000-0000-0000-000000000002','e0200000-0000-0000-0000-000000000002',:'hb',clock_timestamp()-interval '1 hour',null,null,clock_timestamp()),
('e0300000-0000-0000-0000-000000000003','e0200000-0000-0000-0000-000000000003',:'hc',clock_timestamp()+interval '1 day',clock_timestamp(),null,clock_timestamp()),
('e0300000-0000-0000-0000-000000000004','e0200000-0000-0000-0000-000000000004',:'hd',clock_timestamp()+interval '1 day',null,null,clock_timestamp()),
('e0300000-0000-0000-0000-000000000005','e0200000-0000-0000-0000-000000000005',:'he',clock_timestamp()+interval '1 day',null,null,clock_timestamp());
SQL

expect_denied() {
  local tag="$1" expected="$2" sql="$3" output
  if output="$(psql -X -At -v ON_ERROR_STOP=1 -c "$sql" 2>&1)"; then
    hold "UNEXPECTED_ALLOW_$tag"
  fi
  [[ "$output" == *"$expected"* ]] || hold "WRONG_DENIAL_$tag"
  pass "DENY_$tag"
}

expect_denied BAD_FORMAT 'verified production-format' \
  "begin; set local role myeongha_seyeon_governed_executor; select * from public.begin_seyeon_governed_guest_subject_context_v1('bad');"
expect_denied UNKNOWN_PROOF 'no longer resolves' \
  "begin; set local role myeongha_seyeon_governed_executor; select * from public.begin_seyeon_governed_guest_subject_context_v1('myeongha-guest-bearer-hmac-sha256-v1:$(printf 'f%.0s' {1..64})');"
expect_denied EXPIRED 'expired, consumed, or changed' \
  "begin; set local role myeongha_seyeon_governed_executor; select * from public.begin_seyeon_governed_guest_subject_context_v1('$HASH_B');"
expect_denied CONSUMED 'expired, consumed, or changed' \
  "begin; set local role myeongha_seyeon_governed_executor; select * from public.begin_seyeon_governed_guest_subject_context_v1('$HASH_C');"
expect_denied LEGACY_RPC 'permission denied' \
  "begin; set local role myeongha_seyeon_governed_executor; select * from public.begin_guest_subject_context_v1('$HASH_A');"

success="$(psql -X -At -v ON_ERROR_STOP=1 -c "begin; set local role myeongha_seyeon_governed_executor; select subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$HASH_A'); rollback;")"
[[ "$success" == *guest* ]] || hold ACTIVE_GUEST_NOT_ADMITTED
pass ACTIVE_GUEST_TRANSACTIONAL_CONTEXT

# Two actual independent PostgreSQL connections: Guest resolves first, then
# promotion's Subject FOR UPDATE must wait until the resolver transaction ends.
race_dir="$(mktemp -d)"
trap 'rm -rf -- "$race_dir"' EXIT
(
  PGAPPNAME=r2_1670_guest_first psql -X -qAt -v ON_ERROR_STOP=1 -c \
  "begin; set local statement_timeout='10s'; set local role myeongha_seyeon_governed_executor; select subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$HASH_D'); select pg_sleep(1.8); commit;" \
  >"$race_dir/guest1" 2>&1
) & guest_pid=$!
sleep 0.4
(
  PGAPPNAME=r2_1670_promote_wait psql -X -qAt -v ON_ERROR_STOP=1 -c \
  "begin; set local statement_timeout='10s'; select set_config('myeongha.subject_id','e0200000-0000-0000-0000-000000000004',true); select subject_kind from public.cmd_promote_guest_runtime_v1('e0200000-0000-0000-0000-000000000004','e0300000-0000-0000-0000-000000000004','e0100000-0000-0000-0000-000000000001'); commit;" \
  >"$race_dir/promote1" 2>&1
) & promote_pid=$!
sleep 0.35
wait_state="$(psql -X -Atqc "select count(*) from pg_stat_activity where application_name='r2_1670_promote_wait' and wait_event_type='Lock'")"
[[ "$wait_state" == 1 ]] || hold PROMOTION_NOT_BLOCKED_BY_GUEST_SHARE
wait "$guest_pid" || hold GUEST_FIRST_FAILED
wait "$promote_pid" || hold PROMOTION_AFTER_GUEST_FAILED
[[ "$(psql -X -Atqc "select kind from public.subjects where id='e0200000-0000-0000-0000-000000000004'")" == member ]] || hold POST_GUEST_PROMOTION_STATE
expect_denied PROMOTED_STALE_GUEST 'no longer an active canonical Guest' \
  "begin; set local role myeongha_seyeon_governed_executor; select * from public.begin_seyeon_governed_guest_subject_context_v1('$HASH_D');"
pass GUEST_FIRST_PROMOTION_SERIALIZED

# Opposite order: promotion keeps Subject FOR UPDATE, Guest must wait and then
# reject the stale proof. A lock wait is not by itself an authorization PASS.
(
  PGAPPNAME=r2_1670_promote_first psql -X -qAt -v ON_ERROR_STOP=1 -c \
  "begin; set local statement_timeout='10s'; select set_config('myeongha.subject_id','e0200000-0000-0000-0000-000000000005',true); select subject_kind from public.cmd_promote_guest_runtime_v1('e0200000-0000-0000-0000-000000000005','e0300000-0000-0000-0000-000000000005','e0100000-0000-0000-0000-000000000002'); select pg_sleep(1.8); commit;" \
  >"$race_dir/promote2" 2>&1
) & promote_pid=$!
sleep 0.4
(
  PGAPPNAME=r2_1670_guest_wait psql -X -qAt -v ON_ERROR_STOP=1 -c \
  "begin; set local statement_timeout='10s'; set local role myeongha_seyeon_governed_executor; select subject_kind from public.begin_seyeon_governed_guest_subject_context_v1('$HASH_E'); commit;" \
  >"$race_dir/guest2" 2>&1
) & guest_pid=$!
sleep 0.35
wait_state="$(psql -X -Atqc "select count(*) from pg_stat_activity where application_name='r2_1670_guest_wait' and wait_event_type='Lock'")"
[[ "$wait_state" == 1 ]] || hold GUEST_NOT_BLOCKED_BY_PROMOTION
wait "$promote_pid" || hold PROMOTION_FIRST_FAILED
if wait "$guest_pid"; then hold STALE_GUEST_AFTER_PROMOTION_ALLOWED; fi
grep -q 'no longer an active canonical Guest' "$race_dir/guest2" || hold WRONG_RACE_GUEST_DENIAL
pass PROMOTION_FIRST_STALE_PROOF_REJECTED

[[ "$(snapshot_existing)" == "$existing_before" ]] || hold RACE_DDL_DRIFT
pass ORIGINAL_SQL_FORWARD_COMMIT_AND_RACE_ISOLATED_ONLY
echo "HOLD_R2_H_1670_OWNER_APPROVAL_REQUIRED productionWrites=0 drReady=false"
