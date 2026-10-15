#!/usr/bin/env bash
set -euo pipefail

# Guard: synthetic PostgreSQL17 ONLY; no Production/project credentials accepted.
[[ "${GITHUB_ACTIONS:-}" == true && "${DB_SUITE:-}" == postgres17
    && "${PGHOST:-}" == localhost && "${PGPORT:-}" == 5432
    && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
  echo HOLD_SAJU_SINGLE_PROJECT_PG17_WRONG_ENVIRONMENT >&2; exit 1;
}
[[ -z "${SUPABASE_DB_PASSWORD:-}" && -z "${DATABASE_URL:-}"
    && -z "${SUPABASE_PROJECT_ID:-}" ]] || {
  echo HOLD_SAJU_SINGLE_PROJECT_PRODUCTION_CREDENTIALS_PRESENT >&2; exit 1;
}

q() { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
fail() { echo "FAIL SAJU_SINGLE_PROJECT_PG17: $*" >&2; exit 1; }
pass() { echo "PASS SAJU_SINGLE_PROJECT_PG17: $*"; }
deny() {
  local name="$1" sql="$2" output rc
  set +e
  output="$(q "$sql" 2>&1)"; rc=$?
  set -e
  [[ "$rc" != 0 ]] || fail "$name unexpectedly succeeded"
  [[ "$output" == *"permission denied"* || "$output" == *"row-level security"* ]] ||
    fail "$name failed for an unexpected reason"
  pass "$name denied"
}
reject() {
  local name="$1" sql="$2" rc
  set +e; q "$sql" >/dev/null 2>&1; rc=$?; set -e
  [[ "$rc" != 0 ]] || fail "$name incorrectly allowed"
  pass "$name rejected"
}

# The real schema proposal stays outside supabase/migrations, so the
# repository's Production main-push workflow can never auto-apply it.
[[ ! -e supabase/migrations/1730_saju_bridge_single_project_operator_permit_v1.sql ]] ||
  fail "proposal must NEVER be in auto-deploy migrations"
psql -X -1 -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql >/dev/null
q "create role myeongha_runtime nologin; create role myeongha_worker_runtime nologin;
  create role myeongha_api_executor nologin;" >/dev/null
# Match Supabase's managed migration actor, NOT PostgreSQL SUPERUSER.
# The managed principal can CREATE ROLE but cannot bypass object ownership;
# this catches COMMENT/ALTER after owner membership has been revoked.
q "create role ci_saju_managed_migration
  login nosuperuser createdb createrole noinherit noreplication nobypassrls;
  grant create on database \"$PGDATABASE\" to ci_saju_managed_migration;" >/dev/null
{
  printf '%s\n' 'set session authorization ci_saju_managed_migration;'
  printf '%s\n' '\\i supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql'
} | psql -X -1 -v ON_ERROR_STOP=1 >/dev/null
[[ "$(q "select pg_get_userbyid(nspowner) from pg_namespace
  where nspname='saju_bridge_private'")" == ci_saju_managed_migration ]] ||
  fail "managed migration schema owner drift"

schema=saju_bridge_private
table="$schema.operator_permits_v1"
audit="$schema.audit_events_v1"
rpc="$schema.cmd_consume_operator_permit_v1(uuid,text,text,text,text,text,uuid,text)"
executor=myeongha_saju_bridge_permit_executor
owner=myeongha_saju_bridge_permit_owner
project=cnsfpcdiyofqvhpcegfc
scope="$(printf 'a%.0s' {1..64})"
owner_digest="$(printf 'b%.0s' {1..64})"
audit_digest="$(printf 'c%.0s' {1..64})"
wrong_digest="$(printf 'f%.0s' {1..64})"
msha="$(printf 'a%.0s' {1..40})"
ssha="$(printf 'b%.0s' {1..40})"

[[ "$(q "select count(*) from pg_roles where rolname in ('$executor','$owner')
  and not rolcanlogin and not rolinherit and not rolsuper
  and not rolcreatedb and not rolcreaterole and not rolreplication
  and not rolbypassrls")" == 2 ]] || fail "NOLOGIN NOINHERIT role invariants"
[[ "$(q "select count(*) from pg_class where oid in ('$table'::regclass,
  '$audit'::regclass) and relrowsecurity and relforcerowsecurity")" == 2 ]] ||
  fail "force RLS on private tables"
[[ "$(q "select case when
  has_schema_privilege('$executor','$schema','USAGE')
  and has_function_privilege('$executor','$rpc','EXECUTE')
  and not has_table_privilege('$executor','$table','SELECT')
  and not has_table_privilege('$executor','$table','UPDATE')
  and not has_table_privilege('$executor','$table','INSERT')
  and not has_table_privilege('$executor','$audit','SELECT')
  and not has_table_privilege('$executor','$audit','DELETE')
  and not has_schema_privilege('anon','$schema','USAGE')
  and not has_schema_privilege('authenticated','$schema','USAGE')
  and not has_schema_privilege('service_role','$schema','USAGE')
  and not has_function_privilege('public','$rpc','EXECUTE')
  and not has_function_privilege('anon','$rpc','EXECUTE')
  and not has_function_privilege('authenticated','$rpc','EXECUTE')
  and not has_function_privilege('service_role','$rpc','EXECUTE')
  and not has_function_privilege('myeongha_runtime','$rpc','EXECUTE')
  and not has_function_privilege('myeongha_api_executor','$rpc','EXECUTE')
  and (select p.prosecdef from pg_proc p where p.oid='$rpc'::regprocedure)
  then 1 else 0 end")" == 1 ]] || fail "ACL or security definer"
pass "Postgres17 actual catalog: private ACL/RLS and NOLOGIN roles"

for role in anon authenticated service_role myeongha_api_executor myeongha_runtime; do
  deny "$role direct table SELECT" \
    "begin; set local role $role; select * from $table;"
  deny "$role function EXECUTE" \
    "begin; set local role $role;
     select $schema.cmd_consume_operator_permit_v1(
      '123e4567-e89b-42d3-a456-426614174001','$project','$scope',
      '$owner_digest','$msha','$ssha',
      '123e4567-e89b-42d3-a456-426614174091','$audit_digest');"
done
deny "executor direct table INSERT" \
  "begin; set local role $executor;
   insert into $table(permit_id) values('123e4567-e89b-42d3-a456-426614174000');"
deny "executor direct table UPDATE" \
  "begin; set local role $executor; update $table set status='ISSUED';"
deny "executor direct audit DELETE" \
  "begin; set local role $executor; delete from $audit;"
pass "actual SQL privilege escapes denied"

seed() {
  local id="$1" issued="${2:-clock_timestamp() - interval '10 seconds'}"
  local expires="${3:-clock_timestamp() + interval '3 minutes'}"
  local status="${4:-ISSUED}"
  q "insert into $table(permit_id,project_ref,action,scope_digest,
    owner_intent_digest,myeongha_commit_sha,saju_commit_sha,
    issued_at,expires_at,status)
  values ('$id','$project','SINGLE_PROJECT_INTEGRATION_PROBE',
    '$scope','$owner_digest','$msha','$ssha',
    $issued,$expires,'$status');" >/dev/null
}
consume() {
  local id="$1" event="$2" digest="${3:-$scope}"
  printf "select %s.cmd_consume_operator_permit_v1(
    '%s'::uuid,'%s','%s','%s','%s','%s','%s'::uuid,'%s');" \
    "$schema" "$id" "$project" "$digest" "$owner_digest" "$msha" "$ssha" "$event" "$audit_digest"
}
run_consume() { q "begin; set local role $executor; $(consume "$@") commit;"; }

single=123e4567-e89b-42d3-a456-426614174001
race=123e4567-e89b-42d3-a456-426614174002
expired=123e4567-e89b-42d3-a456-426614174003
revoked=123e4567-e89b-42d3-a456-426614174004
future=123e4567-e89b-42d3-a456-426614174005
rollback=123e4567-e89b-42d3-a456-426614174006
audit_collision=123e4567-e89b-42d3-a456-426614174007
locked_expiry=123e4567-e89b-42d3-a456-426614174008
event1=123e4567-e89b-42d3-a456-426614174101
event2=123e4567-e89b-42d3-a456-426614174102
event6=123e4567-e89b-42d3-a456-426614174106
event8=123e4567-e89b-42d3-a456-426614174108

seed "$single"
[[ "$(run_consume "$single" "$event1" "$wrong_digest")" == f ]] ||
  fail "wrong digest consumed"
[[ "$(run_consume "$single" "$event1")" == t ]] || fail "first claim did not commit"
[[ "$(run_consume "$single" "$event1")" == f ]] || fail "replay succeeded"
[[ "$(q "select count(*) from $table where permit_id='$single'
  and status='CONSUMED' and consumed_at is not null")" == 1 ]] ||
  fail "one-shot state not durable"
[[ "$(q "select count(*) from $audit where permit_id='$single'
  and event_id='$event1'")" == 1 ]] || fail "atomic audit missing"
pass "one-shot + exact digest + audit"

seed "$expired" "clock_timestamp() - interval '3 minutes'" \
  "clock_timestamp() - interval '2 minutes'"
seed "$revoked" "clock_timestamp() - interval '10 seconds'" \
  "clock_timestamp() + interval '3 minutes'" REVOKED
seed "$future" "clock_timestamp() + interval '30 seconds'" \
  "clock_timestamp() + interval '4 minutes'"
for id in "$expired" "$revoked" "$future"; do
  [[ "$(run_consume "$id" "$event2")" == f ]] || fail "invalid timed/state permit consumed $id"
done
[[ "$(q "select count(*) from $audit")" == 1 ]] || fail "invalid permit wrote audit"
pass "expiry, revoke and future-issued gate"

seed "$rollback"
[[ "$(q "begin; set local role $executor; $(consume "$rollback" "$event6")
  rollback;")" == t ]] || fail "pre-rollback claim not executed"
[[ "$(q "select status from $table where permit_id='$rollback'")" == ISSUED ]] ||
  fail "transaction rollback left permit consumed"
[[ "$(q "select count(*) from $audit where permit_id='$rollback'")" == 0 ]] ||
  fail "transaction rollback left audit"
[[ "$(run_consume "$rollback" "$event6")" == t ]] ||
  fail "rollback did not permit clean later claim"
pass "rollback atomicity"

seed "$audit_collision"
reject "colliding audit inserts MUST rollback permit" \
  "begin; set local role $executor; $(consume "$audit_collision" "$event1") commit;"
[[ "$(q "select status from $table where permit_id='$audit_collision'")" == ISSUED ]] ||
  fail "audit conflict left permit consumed"
[[ "$(q "select count(*) from $audit where permit_id='$audit_collision'")" == 0 ]] ||
  fail "audit conflict left partial audit"
pass "audit failure rolls back permit"

seed "$race"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
(
  q "begin; set local role $executor; $(consume "$race" "$event2")
     select pg_sleep(2); commit;" >"$scratch/race-first" 2>"$scratch/race-first.err"
) &
p1=$!
sleep 0.4
(
  q "begin; set local role $executor; $(consume "$race"
    '123e4567-e89b-42d3-a456-426614174112') commit;" \
      >"$scratch/race-second" 2>"$scratch/race-second.err"
) &
p2=$!
wait "$p1" || fail "race first query failed"
wait "$p2" || fail "race second query failed"
[[ "$(head -n 1 "$scratch/race-first")" == t ]] || fail "first race claim wrong"
[[ "$(head -n 1 "$scratch/race-second")" == f ]] || fail "second race claim wrong"
[[ "$(q "select count(*) from $audit where permit_id='$race'")" == 1 ]] ||
  fail "concurrent race caused multiple audits"
pass "two PostgreSQL sessions: exactly one committed"

# A lock can block beyond the expiry: the post-lock UPDATE must recheck real time.
seed "$locked_expiry" "clock_timestamp() - interval '10 seconds'" \
  "clock_timestamp() + interval '2 seconds'"
(
  q "begin; select permit_id from $table where permit_id='$locked_expiry'
  for update; select pg_sleep(4); commit;" >"$scratch/lock" 2>"$scratch/lock.err"
) &
locker=$!
sleep 0.35
(
  q "begin; set local role $executor; $(consume "$locked_expiry" "$event8") commit;" \
    >"$scratch/lock-wait" 2>"$scratch/lock-wait.err"
) &
waiter=$!
wait "$locker" || fail "expiry locking session failed"
wait "$waiter" || fail "post-wait consumption session failed"
[[ "$(head -n 1 "$scratch/lock-wait")" == f ]] ||
  fail "EXPIRED_WHILE_WAITING_LOCK consumed (stale predicate vulnerability)"
[[ "$(q "select status from $table where permit_id='$locked_expiry'")" == ISSUED ]] ||
  fail "expiry lock left consumed row"
pass "lock wait expiry re-evaluated after lock (not stale)"

[[ "$(q "select count(*) from $audit")" == 3 ]] ||
  fail "unexpected audit count after all tests"
pass "S2 real PostgreSQL17 one-project private ACL/atomicity verification complete"

# Scope: disposable synthetic cluster only, not an active Owner credential or
# a Production-proof Saju/Reading/Commerce release authorization.
