#!/usr/bin/env bash
set -euo pipefail

# D1: three independent PostgreSQL writers competing for ordered L0 locks.
# No paid T2, Commerce permission, Reader Grant creation, or runtime cutover.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }
tmp="$(mktemp -d)"
pids=()
cleanup() {
  for pid in "${pids[@]}"; do
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  done
  rm -rf "$tmp"
}
trap cleanup EXIT

p -f test/db/official_standard_reading_reader_interpretation.sql >"$tmp/seed.out" 2>"$tmp/seed.err" || {
  cat "$tmp/seed.err" >&2
  fail "official synthetic Reader fixture unavailable"
}
subject="11390000-0000-0000-0000-000000000001"
p_low="11300000-0000-0000-0000-000000000001"
p_high="11392000-0000-0000-0000-000000000001"
reading="12103100-0000-0000-0000-000000000001"

# Two REAL Standard Products exist in the fixture/migrations; the product-
# only helper verifies Product-spec existence, NOT purchaser entitlement.
count="$(p <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_lockset_v1(
 '$subject'::uuid,
 array['$p_high'::uuid,'$p_low'::uuid,'$p_low'::uuid]
);
select count(*) from pg_catalog.pg_locks
where pid=pg_catalog.pg_backend_pid() and locktype='advisory' and granted;
commit;
SQL
)"
grep -qx 2 <<<"$count" || fail "two distinct Products were not locked exactly once"

scope="$(p <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select product_id::text||'|'||reading_ref::text||'|'||reader_character_id
from public.internal_acquire_official_reader_reading_lockset_v1(
 '$subject'::uuid,
 array['$reading'::uuid,'$reading'::uuid,'$reading'::uuid],
 array['z-second-reader','a-first-reader','a-first-reader']
);
select count(*) from pg_catalog.pg_locks
where pid=pg_catalog.pg_backend_pid() and locktype='advisory' and granted;
commit;
SQL
)"
grep -qx "$p_high|$reading|a-first-reader" <<<"$scope" ||
 fail "lockset lost sorted Reader a"
grep -qx "$p_high|$reading|z-second-reader" <<<"$scope" ||
 fail "lockset lost Reader z"
grep -qx 3 <<<"$scope" || fail "one Product and two Reader scopes not held"
[[ "$(grep -c "^$p_high|$reading|" <<<"$scope")" == 2 ]] ||
 fail "duplicate Reader scope not de-duplicated"
pass "duplicate products/readers deduplicated; canonical Source pins Reader scopes"

# Input, subject and transaction isolation deny before lock acquisition.
for expr in \
 "public.internal_acquire_official_reader_product_lockset_v1('$subject'::uuid,array[null]::uuid[])" \
 "public.internal_acquire_official_reader_reading_lockset_v1('$subject'::uuid,array['$reading'::uuid],array[]::text[])" \
 "public.internal_acquire_official_reader_reading_lockset_v1('$subject'::uuid,array['ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid],array['a-reader'])" \
 "public.internal_acquire_official_reader_reading_lockset_v1('$subject'::uuid,array['$reading'::uuid],array[' a-reader'])"; do
  if p >"$tmp/invalid.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select * from $expr;
commit;
SQL
  then
    fail "invalid multi-scope input was accepted: $expr"
  fi
done
for mode in "repeatable read" "serializable"; do
  if p >"$tmp/isolation.out" 2>&1 <<SQL
begin isolation level $mode;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_lockset_v1(
 '$subject'::uuid,array['$p_high'::uuid]
);
commit;
SQL
  then
    fail "stale snapshot accepted: $mode"
  fi
  grep -q 'Official Reader lockset requires READ COMMITTED' "$tmp/isolation.out" ||
    fail "stale snapshot rejected for wrong reason"
done

if p >"$tmp/subject.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id',
 'ffffffff-ffff-ffff-ffff-ffffffffffff',true);
select * from public.internal_acquire_official_reader_reading_lockset_v1(
 '$subject'::uuid,array['$reading'::uuid],array['a-reader']
);
commit;
SQL
then
  fail "cross-Subject request accepted"
fi

for sig in \
 'public.internal_acquire_official_reader_product_lockset_v1(uuid,uuid[])' \
 'public.internal_acquire_official_reader_reading_lockset_v1(uuid,uuid[],text[])'; do
  fn="$(p -c "select count(*) from pg_catalog.pg_proc f
   where f.oid='$sig'::regprocedure and f.provolatile='v'
   and not f.prosecdef;")"
  [[ "$fn" == 1 ]] || fail "not a volatile invoker scope function: $sig"
  roles="$(p -c "select count(*) from pg_catalog.pg_roles r
   where r.rolname in ('anon','authenticated','service_role',
    'myeongha_api_executor','myeongha_commerce_internal_executor',
    'myeongha_seyeon_chat_runtime_owner')
   and pg_catalog.has_function_privilege(r.rolname,'$sig','EXECUTE');")"
  [[ "$roles" == 0 ]] || fail "runtime can execute lockset function: $sig"
done
pass "invalid scope, Subject, stale snapshot and runtime ACL rejected"

wait_for() {
  local label="$1" query="$2"
  for _ in $(seq 1 140); do
    [[ "$(p -c "$query")" == 1 ]] && return 0
    sleep 0.065
  done
  for f in "$tmp"/writer*.out; do
    [[ ! -f "$f" ]] || tail -35 "$f" >&2
  done
  fail "missing 3-session lock observation: $label"
}

# A holds both Products. B sends [LOW,HIGH], C sends [HIGH,LOW].
# All three must select the SAME first advisory L0 lock, regardless of array
# order. B and C may wake in any order; both must eventually COMMIT.
p >"$tmp/writer-a.out" 2>&1 <<SQL &
set application_name='d1_multi_product_A';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_lockset_v1(
 '$subject'::uuid,array['$p_high'::uuid,'$p_low'::uuid]
);
select pg_sleep(6);
select 'A_COMMITTED';
commit;
SQL
pids+=("$!")
wait_for a_holds_both "select count(*) from pg_catalog.pg_stat_activity a
  where a.application_name='d1_multi_product_A'
    and a.wait_event_type='Timeout';"

p >"$tmp/writer-b.out" 2>&1 <<SQL &
set application_name='d1_multi_product_B';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_lockset_v1(
 '$subject'::uuid,array['$p_low'::uuid,'$p_high'::uuid]
);
select 'B_COMMITTED';
commit;
SQL
pids+=("$!")

p >"$tmp/writer-c.out" 2>&1 <<SQL &
set application_name='d1_multi_product_C';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_lockset_v1(
 '$subject'::uuid,array['$p_high'::uuid,'$p_low'::uuid]
);
select 'C_COMMITTED';
commit;
SQL
pids+=("$!")

wait_for both_wait_on_L0 "select case when count(*)=2 then 1 else 0 end
from pg_catalog.pg_stat_activity a
join pg_catalog.pg_locks l on l.pid=a.pid
where a.application_name in ('d1_multi_product_B','d1_multi_product_C')
  and a.wait_event_type='Lock'
  and l.locktype='advisory' and not l.granted;"
for i in 0 1 2; do
  wait "${pids[$i]}" || { cat "$tmp/writer-$(
    printf '%s' abc | cut -c $((i+1))
  ).out" >&2; fail "concurrent multi-Product writer failed/deadlocked"; }
done
pids=()
for name in a b c; do
  grep -qx "${name^^}_COMMITTED" "$tmp/writer-$name.out" ||
    fail "one of three Product transactions did not COMMIT: $name"
done
pass "three simultaneous workers, reversed 2-Product arrays, no deadlock or timeout"

# Another three sessions contend on two L1 Reader keys. L0 comes first
# from the immutable Official Reading Product. No source-level access grant
# or paid response is made by the scope-only resolver.
for worker in a b c; do
  case "$worker" in
    a) readers="'z-second-reader','a-first-reader'"; sleep_time=4 ;;
    b) readers="'a-first-reader','z-second-reader'"; sleep_time=0.2 ;;
    c) readers="'z-second-reader','a-first-reader'"; sleep_time=0.2 ;;
  esac
  p >"$tmp/readers-$worker.out" 2>&1 <<SQL &
set application_name='d1_multi_reader_$worker';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select count(*) from public.internal_acquire_official_reader_reading_lockset_v1(
 '$subject'::uuid,
 array['$reading'::uuid,'$reading'::uuid],
 array[$readers]
);
select pg_sleep($sleep_time);
select 'READER_${worker^^}_COMMITTED';
commit;
SQL
  pids+=("$!")
  if [[ "$worker" == a ]]; then
    wait_for a_reader_holds_scope "select count(*) from pg_catalog.pg_stat_activity
    where application_name='d1_multi_reader_a' and wait_event_type='Timeout';"
  fi
done
wait_for b_c_reader_blocked "select case when count(*)=2 then 1 else 0 end
from pg_catalog.pg_stat_activity a
join pg_catalog.pg_locks l on l.pid=a.pid
where a.application_name in ('d1_multi_reader_b','d1_multi_reader_c')
  and a.wait_event_type='Lock'
  and l.locktype='advisory' and not l.granted;"
for i in 0 1 2; do
  wait "${pids[$i]}" || { cat "$tmp/readers-$(printf %s abc | cut -c $((i+1))).out" >&2; fail "multi-Reader lockset failed/deadlocked"; }
done
pids=()
for name in a b c; do
  grep -qx "READER_${name^^}_COMMITTED" "$tmp/readers-$name.out" ||
    fail "multi-Reader transaction did not COMMIT: $name"
done
pass "three Reader transactions, reverse Reader order, Product first; no deadlock"

echo "PASS: D1 multi-lockset PRIVATE only — all Commerce/T2 production writers OFF"
