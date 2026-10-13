#!/usr/bin/env bash
set -euo pipefail

# D2 PRIVATE: exercise original positive fixture with the NEW 1820 unified
# 1090/1220 wrappers, then a real 3-connection competing bind replay.
# Does not assert that old 1080/1090/1220 direct runtime Writers are safe.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D2: $*" >&2; exit 1; }
pass() { echo "PASS D2: $*"; }
tmpdir="$(mktemp -d)"
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" >/dev/null 2>&1 || true; done
  for pid in "${pids[@]}"; do wait "$pid" >/dev/null 2>&1 || true; done
  rm -rf "$tmpdir"
}
trap cleanup EXIT

# Source fixture, no logical data rewritten:
# replace ONLY positive initial Receipt, later DB-C1 independent additional
# Receipt, actual positive initial bind and actual positive additional bind. The early negative
# legacy binder tests and pre-official additional Receipt remain unchanged.
awk '
  NR==231 {
    if ($0 !~ /internal_apply_verified_receipt_capability_effects_v1/) exit 10
    sub("internal_apply_verified_receipt_capability_effects_v1",
        "internal_apply_official_reader_unified_receipt_v1")
    first++
  }
  NR==897 {
    # DB-C1 second independently purchased additional Reader receipt: the
    # already-committed Official Reading now exists, so L0->L1 is possible.
    if ($0 !~ /internal_apply_verified_receipt_capability_effects_v1/) exit 13
    sub("internal_apply_verified_receipt_capability_effects_v1",
        "internal_apply_official_reader_unified_receipt_v1")
    additional_issued++
  }
  NR==366 || NR==440 {
    if ($0 !~ /cmd_bind_standard_reading_access_v2/) exit 11
    sub("cmd_bind_standard_reading_access_v2",
        "internal_cmd_bind_official_reader_unified_v1")
    binds++
  }
  { print }
  END {
    if (first != 1 || binds != 2 || additional_issued != 1) exit 12
  }
' test/db/official_standard_reading_reader_interpretation.sql >"$tmpdir/fixture.sql" ||
  fail "source fixture format changed; explicit inspection required"

p -f "$tmpdir/fixture.sql" >"$tmpdir/fixture.out" 2>"$tmpdir/fixture.err" || {
  tail -n 120 "$tmpdir/fixture.err" >&2
  tail -n 70 "$tmpdir/fixture.out" >&2
  fail "original v2 fixture failed when three positive calls use D2"
}
pass "initial/additional receipt issuance and both bind roles under D1 unified locks"

subject='11390000-0000-0000-0000-000000000001'
initial='11392300-0000-0000-0000-000000000001'
additional='12102300-0000-0000-0000-000000000001'
reading='12103100-0000-0000-0000-000000000001'
product="$(p -c "select product_id from public.standard_reading_official_bindings
 where subject_id='$subject'::uuid and reading_id='$reading'::uuid;")"
[[ -n "$product" && "$product" != *$'\n'* ]] || fail "exact official Product missing"

state="$(p -c "select concat(
 (select count(*) from public.standard_reading_official_bindings
   where subject_id='$subject'::uuid and product_id='$product'::uuid),
 ':',
 (select count(*) from public.standard_reading_reader_access_grants
   where subject_id='$subject'::uuid and official_reading_id='$reading'::uuid
     and purchase_intent_id in ('$initial'::uuid,'$additional'::uuid)))")"
[[ "$state" == "1:2" ]] || fail "initial/additional did not reuse one Official Reading: $state"
pass "exactly one official Reading, distinct purchase-backed Reader access rows"

# Fresh source-bound classification; no Product/Reading comes from the caller.
scope="$(p <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select purchase_role || ':' || product_id::text || ':' ||
       coalesce(reading_ref::text,'none')
from public.internal_acquire_official_reader_purchase_scope_v2(
 '$subject'::uuid,'$initial'::uuid);
select purchase_role || ':' || product_id::text || ':' || reading_ref::text
from public.internal_acquire_official_reader_purchase_scope_v2(
 '$subject'::uuid,'$additional'::uuid);
commit;
SQL
)"
printf '%s\n' "$scope" | grep -qx "initial_reading:$product:none" ||
  fail "initial L0-only Product scope differs"
printf '%s\n' "$scope" | grep -qx "additional_reader_interpretation:$product:$reading" ||
  fail "additional L0-L1 official scope differs"

# Negative ACL/catalog, isolation and subject identity tests.
for sig in \
  'public.internal_apply_official_reader_unified_receipt_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])' \
  'public.internal_cmd_bind_official_reader_unified_v1(uuid,uuid,uuid,uuid,text,text,jsonb)'; do
  safe="$(p -c "select count(*) from pg_catalog.pg_proc
  where oid='$sig'::regprocedure and prosecdef=false and provolatile='v'")"
  [[ "$safe" == 1 ]] || fail "D2 function must remain volatile SECURITY INVOKER"
  grants="$(p -c "select count(*) from pg_catalog.pg_roles r where r.rolname in (
    'anon','authenticated','service_role','myeongha_api_executor',
    'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
   ) and has_function_privilege(r.rolname,'$sig','EXECUTE')")"
  [[ "$grants" == 0 ]] || fail "D2 function is exposed to runtime/Commerce"
done

if p <<SQL >/dev/null 2>"$tmpdir/wrong-subject.err"; then
begin;
select pg_catalog.set_config('myeongha.subject_id',
 'ffffffff-ffff-ffff-ffff-ffffffffffff',true);
select * from public.internal_cmd_bind_official_reader_unified_v1(
 '$subject'::uuid,'$initial'::uuid,'12103000-0000-0000-0000-000000000001'::uuid,
 '$reading'::uuid,'sha256:v1:1111111111111111111111111111111111111111111111111111111111111111',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"11392300-0000-0000-0000-000000000001"}'::jsonb);
commit;
SQL
  fail "different canonical subject context must reject"
fi
if p <<SQL >/dev/null 2>"$tmpdir/stale.err"; then
begin isolation level repeatable read;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select * from public.internal_acquire_official_reader_purchase_scope_v2(
 '$subject'::uuid,'$additional'::uuid);
commit;
SQL
  fail "REPEATABLE READ must reject D2 scope"
fi
pass "private ACL, wrong subject and wrong isolation rejected"

# THREE actual PG sessions. Two competing Reader bind REPLAYS attempt the same
# Product under distinct Reader identities; neither may get around L0.
p >"$tmpdir/holder.out" 2>&1 <<SQL &
set application_name='d2_product_holder';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_scope_lock_v1(
 '$subject'::uuid,'$product'::uuid);
select pg_sleep(6);
commit;
SQL
pids+=("$!")
for _ in $(seq 1 80); do
  [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
    where application_name='d2_product_holder' and wait_event_type='Timeout'")" == 1 ]] && break
  sleep 0.07
done
[[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
 where application_name='d2_product_holder' and wait_event_type='Timeout'")" == 1 ]] ||
  fail "L0 holder did not acquire lock"

for pair in initial additional; do
  if [[ "$pair" == initial ]]; then
    intent="$initial"; sess='12103000-0000-0000-0000-000000000001'
    proposal="$reading"; hash="$(printf '1%.0s' {1..64})"
  else
    intent="$additional"; sess='12103000-0000-0000-0000-000000000099'
    proposal='12103100-0000-0000-0000-000000000099'
    hash="$(printf '2%.0s' {1..64})"
  fi
  p >"$tmpdir/$pair.out" 2>&1 <<SQL &
set application_name='d2_${pair}_waiter';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select case when replayed and reading_id='$reading'::uuid
 then 'D2_${pair}_REPLAY' else 'D2_REPLAY_MISMATCH' end
from public.internal_cmd_bind_official_reader_unified_v1(
 '$subject'::uuid,'$intent'::uuid,'$sess'::uuid,'$proposal'::uuid,
 'sha256:v1:$hash','standard-reading-access-bind-v2',
 pg_catalog.jsonb_build_object('schemaVersion','standard-reading-access-bind-v2',
                               'purchaseIntentId','$intent'));
commit;
SQL
  pids+=("$!")
done

wait_for_advisory() {
  local pair="$1"
  for _ in $(seq 1 95); do
    if [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity a
      join pg_catalog.pg_locks l on l.pid=a.pid
      where a.application_name='d2_${pair}_waiter'
      and a.wait_event_type='Lock' and l.locktype='advisory'
      and l.granted=false")" == 1 ]]; then return 0; fi
    sleep 0.05
  done
  cat "$tmpdir/holder.out" "$tmpdir/$pair.out" >&2
  fail "missing observed PG advisory L0 wait: $pair"
}
wait_for_advisory initial
wait_for_advisory additional

for pid in "${pids[@]}"; do
  wait "$pid" || {
    cat "$tmpdir/holder.out" "$tmpdir/initial.out" "$tmpdir/additional.out" >&2
    fail "session failed after lock acquisition"
  }
done
pids=()
grep -qx D2_initial_REPLAY "$tmpdir/initial.out" || fail "initial binder replay failed"
grep -qx D2_additional_REPLAY "$tmpdir/additional.out" || fail "additional binder replay failed"

after="$(p -c "select concat(
 (select count(*) from public.standard_reading_official_bindings
   where subject_id='$subject'::uuid and product_id='$product'::uuid),
 ':',
 (select count(*) from public.standard_reading_reader_access_grants
   where subject_id='$subject'::uuid and official_reading_id='$reading'::uuid
     and purchase_intent_id in ('$initial'::uuid,'$additional'::uuid)))")"
[[ "$after" == "$state" ]] || fail "Reader replay changed immutable final state: $after vs $state"
pass "real PG A/B/C: two Readers awaited same L0, both COMMIT, final state unchanged"
echo "PASS: D2 PRIVATE staged unified issue/bind; external writers/refund/T2 still HOLD"
