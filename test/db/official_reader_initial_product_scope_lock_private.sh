#!/usr/bin/env bash
set -euo pipefail

# S2 private initial Reader product-scope prototype.
# The original synthetic Official Reading fixture is run intact except:
# - first verified Receipt -> Grant call uses the locked initial issuer;
# - first successful Official Reading creation uses locked initial binder.
# No runtime grant/public Reader or Commerce cutover is authorized.
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

# Exact original fixture replacement only within the first receipt issuance
# and first positive initial Reading binder; all other legacy tests unchanged.
awk '
  /select \* from public.internal_apply_verified_receipt_capability_effects_v1\(/ && !receipt_replaced {
    sub("internal_apply_verified_receipt_capability_effects_v1",
        "internal_apply_initial_official_reader_receipt_locked_v1")
    receipt_replaced = 1
  }
  /first Reader purchase creates exactly one Reader-independent official Reading/ {
    positive_initial = 1
  }
  positive_initial && /from public.cmd_bind_standard_reading_access_v2\(/ {
    sub("cmd_bind_standard_reading_access_v2",
        "internal_cmd_bind_initial_official_reader_locked_v1")
    positive_initial = 0
    bind_replaced = 1
  }
  { print }
  END {
    if (receipt_replaced != 1 || bind_replaced != 1) exit 51
  }
' test/db/official_standard_reading_reader_interpretation.sql >"$tmpdir/initial-fixture.sql" ||
  fail "could not safely instrument initial Reader fixture"

grep -q 'from public.internal_cmd_bind_initial_official_reader_locked_v1(' "$tmpdir/initial-fixture.sql" ||
  fail "positive initial Reader binding not instrumented"
grep -q 'select \* from public.internal_apply_initial_official_reader_receipt_locked_v1(' "$tmpdir/initial-fixture.sql" ||
  fail "initial Receipt issuance not instrumented"

p -f "$tmpdir/initial-fixture.sql" >"$tmpdir/fixture.out" 2>"$tmpdir/fixture.err" || {
  cat "$tmpdir/fixture.err" >&2
  fail "initial Reader private issue/bind failed the original synthetic authority fixture"
}
pass "first verified Receipt Grant and first new Official Reading created by locked commands"

subject="11390000-0000-0000-0000-000000000001"
product="11392000-0000-0000-0000-000000000001"
initial="11392300-0000-0000-0000-000000000001"
additional="12102300-0000-0000-0000-000000000001"
product_id="$(p -c "begin; select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_qry_official_reader_initial_product_candidate_v1('$subject'::uuid,'$initial'::uuid); commit;")"
[[ "$(printf '%s\n' "$product_id" | grep -xc "$product")" == 1 ]] ||
  fail "candidate failed to resolve canonical existing first Reading Product"

# Additional-Reader purchases, unknown intentions, wrong Subject, and
# non-READ-COMMITTED MVCC snapshots MUST deny before any lifecycle mutation.
for candidate in "$additional" "ffffffff-ffff-ffff-ffff-ffffffffffff"; do
  if p -c "begin; select pg_catalog.set_config('myeongha.subject_id','$subject',true);
    select public.internal_qry_official_reader_initial_product_candidate_v1(
      '$subject'::uuid, '$candidate'::uuid); commit;" >"$tmpdir/rejected.out" 2>&1; then
    fail "non-initial/unknown Purchase Intent was accepted as an initial purchase"
  fi
  grep -q 'One verified initial Official Reading Product scope is required' "$tmpdir/rejected.out" ||
    fail "non-initial Purchase rejected for unexpected reason"
done

if p -c "begin; select pg_catalog.set_config('myeongha.subject_id',
 'ffffffff-ffff-ffff-ffff-ffffffffffff',true);
 select public.internal_acquire_official_reader_product_scope_lock_v1(
 '$subject'::uuid,'$product'::uuid); commit;" >"$tmpdir/wrong-subject.out" 2>&1; then
  fail "other Subject could lock initial Product scope"
fi

for isolation in "repeatable read" "serializable"; do
  if p -c "begin isolation level $isolation;
    select pg_catalog.set_config('myeongha.subject_id','$subject',true);
    select public.internal_qry_official_reader_initial_product_candidate_v1(
      '$subject'::uuid,'$initial'::uuid); commit;" >"$tmpdir/stale.out" 2>&1; then
    fail "initial Product resolver accepted stale isolation: $isolation"
  fi
  grep -q 'Official Reader product scope requires READ COMMITTED' "$tmpdir/stale.out" ||
    fail "initial Product resolver isolation error mismatch: $isolation"
done
pass "additional/unknown purchases, mismatched Subject and stale isolation rejected"

role_count="$(p -c "select count(*) from pg_catalog.pg_roles r
  where r.rolname in (
    'anon','authenticated','service_role','myeongha_api_executor',
    'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
  ) and (
    pg_catalog.has_function_privilege(r.rolname,
     'public.internal_acquire_official_reader_product_scope_lock_v1(uuid,uuid)','EXECUTE')
    or pg_catalog.has_function_privilege(r.rolname,
     'public.internal_qry_official_reader_initial_product_candidate_v1(uuid,uuid)','EXECUTE')
    or pg_catalog.has_function_privilege(r.rolname,
     'public.internal_apply_initial_official_reader_receipt_locked_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])','EXECUTE')
    or pg_catalog.has_function_privilege(r.rolname,
     'public.internal_cmd_bind_initial_official_reader_locked_v1(uuid,uuid,uuid,uuid,text,text,jsonb)','EXECUTE')
  );")"
[[ "$role_count" == 0 ]] || fail "private initial Reader functions exposed to runtime/Commerce roles"

p >"$tmpdir/holder.out" 2>&1 <<SQL &
set application_name='rr_initial_product_holder';
set statement_timeout='14s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_scope_lock_v1(
  '$subject'::uuid,'$product'::uuid
);
select pg_sleep(5);
commit;
SQL
holder_pid=$!
wait_state() {
  local label="$1" sql="$2"
  for _ in $(seq 1 90); do
    [[ "$(p -c "$sql")" == 1 ]] && return
    sleep 0.07
  done
  cat "$tmpdir/holder.out" >&2
  [[ -f "$tmpdir/waiter.out" ]] && cat "$tmpdir/waiter.out" >&2
  fail "$label was never observed"
}
wait_state holder_active "select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_initial_product_holder' and wait_event_type='Timeout';"

p >"$tmpdir/waiter.out" 2>&1 <<SQL &
set application_name='rr_initial_product_waiter';
set statement_timeout='14s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_scope_lock_v1(
 '$subject'::uuid,'$product'::uuid
);
select 'SAME_INITIAL_PRODUCT_WAITED';
commit;
SQL
waiter_pid=$!
wait_state same_product_blocked "select count(*) from pg_catalog.pg_stat_activity a
 join pg_catalog.pg_locks l on a.pid=l.pid
 where a.application_name='rr_initial_product_waiter'
   and a.wait_event_type='Lock' and l.locktype='advisory' and not l.granted;"

p -c "begin; select pg_catalog.set_config('myeongha.subject_id','$subject',true);
 select public.internal_acquire_official_reader_product_scope_lock_v1(
 '$subject'::uuid,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
 );
 select 'DIFFERENT_PRODUCT_INDEPENDENT'; commit;" >"$tmpdir/different.out" 2>&1 ||
  fail "different initial Product scope blocked"
grep -qx DIFFERENT_PRODUCT_INDEPENDENT "$tmpdir/different.out" ||
  fail "different Product scope was not independent"

wait "$holder_pid" || { cat "$tmpdir/holder.out" >&2; fail "holder failed"; }
holder_pid=""
wait "$waiter_pid" || { cat "$tmpdir/waiter.out" >&2; fail "waiter failed"; }
waiter_pid=""
grep -qx SAME_INITIAL_PRODUCT_WAITED "$tmpdir/waiter.out" ||
  fail "waiter never acquired initial Product lock after COMMIT"
pass "same Subject×Product serializes, distinct Products independent"

replay="$(p -c "begin;
  select pg_catalog.set_config('myeongha.subject_id','$subject',true);
  select concat_ws('|',access_role,official_reading_created,replayed)
  from public.internal_cmd_bind_initial_official_reader_locked_v1(
  '$subject'::uuid,'$initial'::uuid,
  '12103000-0000-0000-0000-000000000001'::uuid,
  '12103100-0000-0000-0000-000000000001'::uuid,
  'sha256:v1:1111111111111111111111111111111111111111111111111111111111111111',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"11392300-0000-0000-0000-000000000001"}'::jsonb
  ); commit;")"
printf '%s\n' "$replay" | grep -qx 'initial_reader|false|true' ||
  fail "original initial Reader replay contract changed"
pass "existing initial Reading binding replay is preserved without new Reading"

echo "PASS: S2 product scope first Reading private candidate; no public/Commerce cutover"
