#!/usr/bin/env bash
set -euo pipefail

# D1 source-derived L0(Product) -> L1(Reading/Reader) entrypoint.
# Synthetic PostgreSQL, NOT Commerce/Reader T2 cutover or source entitlement.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }
tmpdir="$(mktemp -d)"
holder_pid=""
waiter_pid=""
cleanup() {
  for pid in "$holder_pid" "$waiter_pid"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$tmpdir"
}
trap cleanup EXIT

p -f test/db/official_standard_reading_reader_interpretation.sql \
  >"$tmpdir/fixture.out" 2>"$tmpdir/fixture.err" || {
    cat "$tmpdir/fixture.err" >&2
    fail "synthetic official Reading fixture failed"
  }

subject="11390000-0000-0000-0000-000000000001"
product="11392000-0000-0000-0000-000000000001"
reading="12103100-0000-0000-0000-000000000001"
reader="test-unlockable-reader"
initial_intent="11392300-0000-0000-0000-000000000001"
additional_intent="12192300-0000-0000-0000-000000000002"

# Verify source-derived initial Product has no pre-Reading L1 requirement.
initial="$(p <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select purchase_role || '|' || product_id::text || '|' ||
       coalesce(reading_ref::text,'NONE') || '|' ||
       coalesce(reader_character_id,'NONE')
from public.internal_acquire_official_reader_purchase_scope_v2(
  '$subject'::uuid,'$initial_intent'::uuid
);
commit;
SQL
)"
grep -qx "initial_reading|$product|NONE|NONE" <<<"$initial" ||
  fail "initial purchase did not derive L0-only original Product"

additional="$(p <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select purchase_role || '|' || product_id::text || '|' ||
       reading_ref::text || '|' || reader_character_id
from public.internal_acquire_official_reader_purchase_scope_v2(
  '$subject'::uuid,'$additional_intent'::uuid
);
commit;
SQL
)"
grep -qx "additional_reader_interpretation|$product|$reading|$reader" <<<"$additional" ||
  fail "additional Reader purchase did not derive L0→L1 source scope"

existing="$(p <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select product_id::text || '|' || reading_ref::text || '|' ||
       reader_character_id
from public.internal_acquire_official_reader_existing_scope_v2(
  '$subject'::uuid,'$reading'::uuid,'$reader'
);
select count(*) from pg_catalog.pg_locks
where pid=pg_catalog.pg_backend_pid()
  and locktype='advisory' and granted;
commit;
SQL
)"
grep -qx "$product|$reading|$reader" <<<"$existing" ||
  fail "existing official Reading was not pinned to its authoritative Product"
grep -qx '2' <<<"$existing" ||
  fail "existing scope did not hold both L0 and L1 transaction locks"
pass "initial L0-only; additional and existing Reading scopes acquire both L0 and L1"

for isolation in 'repeatable read' 'serializable'; do
  if p >"$tmpdir/stale.out" 2>&1 <<SQL
begin isolation level $isolation;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select * from public.internal_acquire_official_reader_existing_scope_v2(
 '$subject'::uuid,'$reading'::uuid,'$reader'
);
commit;
SQL
  then
    fail "existing Reader scope accepted stale isolation $isolation"
  fi
  grep -q 'Official Reader unified scope requires READ COMMITTED' "$tmpdir/stale.out" ||
    fail "wrong stale isolation error for $isolation"
done
for invalid in "ffffffff-ffff-ffff-ffff-ffffffffffff"; do
  if p >"$tmpdir/missing.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select * from public.internal_acquire_official_reader_existing_scope_v2(
 '$subject'::uuid,'$invalid'::uuid,'$reader'
);
commit;
SQL
  then
    fail "nonexistent official Reading was admitted"
  fi
  grep -q 'Exactly one subject-owned Official Reading Product is required' \
    "$tmpdir/missing.out" || fail "unexpected nonexistent Reading error"
done
if p >"$tmpdir/subject.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id',
 'ffffffff-ffff-ffff-ffff-ffffffffffff',true);
select * from public.internal_acquire_official_reader_purchase_scope_v2(
 '$subject'::uuid,'$additional_intent'::uuid
);
commit;
SQL
then
  fail "other Subject was admitted to verified purchase scope"
fi

for sig in \
 'public.internal_acquire_official_reader_existing_scope_v2(uuid,uuid,text)' \
 'public.internal_acquire_official_reader_purchase_scope_v2(uuid,uuid)'; do
  fn="$(p -c "select count(*) from pg_catalog.pg_proc f
    join pg_catalog.pg_namespace n on n.oid=f.pronamespace
    where n.nspname='public'
      and f.oid='$sig'::regprocedure
      and f.provolatile='v' and not f.prosecdef;")"
  [[ "$fn" == 1 ]] || fail "unified scope function is not private volatile invoker: $sig"
  roles="$(p -c "select count(*) from pg_catalog.pg_roles r
    where r.rolname in (
      'anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner'
    ) and pg_catalog.has_function_privilege(r.rolname, '$sig', 'EXECUTE');")"
  [[ "$roles" == 0 ]] || fail "unified scope function exposed to runtime: $sig"
done
pass "source absence, wrong Subject, stale snapshots and runtime EXECUTE rejected"

# Session A owns only L0. Session B asks for the existing Reading L0→L1,
# and MUST wait on L0 before touching L1. Also proves product-wide lock:
# two Reader IDs for the same product cannot bypass L0.
p >"$tmpdir/holder.out" 2>&1 <<SQL &
set application_name='d1_product_holder';
set statement_timeout='18s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_scope_lock_v1(
 '$subject'::uuid,'$product'::uuid
);
select pg_sleep(6);
commit;
SQL
holder_pid=$!

wait_for() {
  local label="$1" query="$2"
  for _ in $(seq 1 120); do
    [[ "$(p -c "$query")" == 1 ]] && return 0
    sleep 0.05
  done
  cat "$tmpdir/holder.out" >&2
  [[ ! -f "$tmpdir/waiter.out" ]] || cat "$tmpdir/waiter.out" >&2
  fail "missing actual PostgreSQL lock observation: $label"
}
wait_for holder "select count(*) from pg_catalog.pg_stat_activity
  where application_name='d1_product_holder' and wait_event_type='Timeout';"

p >"$tmpdir/waiter.out" 2>&1 <<SQL &
set application_name='d1_existing_scope_waiter';
set statement_timeout='18s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select product_id::text from public.internal_acquire_official_reader_existing_scope_v2(
 '$subject'::uuid,'$reading'::uuid,'another-reader-same-product'
);
select 'PRODUCT_FIRST_WAITED_THEN_L1';
commit;
SQL
waiter_pid=$!

wait_for l0_before_l1 "select count(*) from pg_catalog.pg_stat_activity a
 join pg_catalog.pg_locks l on a.pid=l.pid
 where a.application_name='d1_existing_scope_waiter'
   and a.wait_event_type='Lock' and l.locktype='advisory' and not l.granted;"

# Distinct L0 product remains independent while an unrelated Product is held.
p -c "begin;
 select pg_catalog.set_config('myeongha.subject_id','$subject',true);
 select public.internal_acquire_official_reader_product_scope_lock_v1(
  '$subject'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
 );
 select 'OTHER_PRODUCT_READY';
 commit;" >"$tmpdir/other.out" 2>&1 ||
  fail "independent Product was blocked"
grep -qx OTHER_PRODUCT_READY "$tmpdir/other.out" ||
  fail "other Product transaction unexpectedly did not complete"

wait "$holder_pid" || { cat "$tmpdir/holder.out" >&2; fail "L0 holder failed"; }
holder_pid=""
wait "$waiter_pid" || { cat "$tmpdir/waiter.out" >&2; fail "L0→L1 waiter failed"; }
waiter_pid=""
grep -qx 'PRODUCT_FIRST_WAITED_THEN_L1' "$tmpdir/waiter.out" ||
  fail "L0→L1 waiter did not resume after original L0 commit"
pass "real two-session L0 contention blocks other Readers before L1; unrelated Product independent"

# Deliberately no T2/HTTP access: these functions assert scope only.
echo 'PASS: D1 private L0→L1 source-derived entry; Commerce/Reader cutover OFF'
