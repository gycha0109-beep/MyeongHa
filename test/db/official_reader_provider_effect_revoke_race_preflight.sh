#!/usr/bin/env bash
set -euo pipefail

# S2 actual verified provider full-cancellation -> all scoped Reader Grants.
# Tests the private event dispatcher (1770 -> existing 1080) against Reader
# FOR SHARE and proves a partial cancellation never revokes a full Grant. NOT an actual
# PortOne refund callback, approved T2 final reveal, or release authorization.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }
tmpdir="$(mktemp -d)"
writer_pid="" reader_pid=""
cleanup() {
  for pid in "$writer_pid" "$reader_pid"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$tmpdir"
}
trap cleanup EXIT

p -f test/db/official_standard_reading_reader_interpretation.sql \
  >"$tmpdir/fixture.out" 2>"$tmpdir/fixture.err" ||
  { cat "$tmpdir/fixture.err" >&2; fail "synthetic official Reader fixture failed"; }

subject="11390000-0000-0000-0000-000000000001"
reader="test-unlockable-reader"
reading="12103100-0000-0000-0000-000000000001"
intent="12192300-0000-0000-0000-000000000002"
b2="$(p -c "select g.id from public.entitlement_grants g
  join public.standard_reading_reader_access_grants a on a.entitlement_grant_id=g.id
  where a.purchase_intent_id='$intent'::uuid and a.subject_id='$subject'::uuid
    and a.reader_character_id='$reader' and a.official_reading_id='$reading'::uuid
    and g.grant_source_type='purchase';")"
[[ "$b2" =~ ^[0-9a-f-]{36}$ ]] || fail "exact independent B2 purchase Grant not found"
receipt="$(p -c "select source_receipt_id from public.entitlement_grants where id='$b2'::uuid;")"
[[ "$receipt" =~ ^[0-9a-f-]{36}$ ]] || fail "B2 verified synthetic receipt not found"

# Synthetic provider events are confined to this disposable isolated database;
# production receipts, customer records, and operational Grants are untouched.
p >"$tmpdir/events.out" 2>&1 <<SQL || { cat "$tmpdir/events.out" >&2; fail "synthetic provider event seed failed"; }
insert into public.commerce_provider_events(
  id,provider,external_event_id,event_type,external_transaction_id,
  resolved_subject_id,resolution_source_type,resolved_receipt_id,
  payload_fingerprint,provider_occurred_at,provider_ordering_key,
  verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select x.id,cr.provider,x.event_id,'payment.cancelled',cr.external_transaction_id,
       cr.subject_id,'receipt',cr.id,x.fingerprint,
       clock_timestamp(),x.ordering_key,
       '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
       'verified',clock_timestamp(),'production','synthetic-race-verifier-v1'
from public.commerce_receipts cr
cross join (values
  ('12196000-0000-0000-0000-000000000001'::uuid,'synthetic-reader-revoke-race-1',
   'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','race-order-1')
) as x(id,event_id,fingerprint,ordering_key)
where cr.id='$receipt'::uuid and cr.subject_id='$subject'::uuid
  and cr.verification_status='verified' and cr.environment='production';
SQL
[[ "$(p -c "select count(*) from public.commerce_provider_events
  where id='12196000-0000-0000-0000-000000000001'::uuid;")" == 1 ]] ||
  fail "first verified synthetic receipt-lineage event must exist"

activate_b2() {
  p -c "update public.entitlement_grants set status='active', revision=revision+1,
    updated_at=clock_timestamp()
    where id='$b2'::uuid and grant_source_type='purchase';" >/dev/null
  [[ "$(p -c "select status from public.entitlement_grants where id='$b2'::uuid;")" == active ]] ||
    fail "synthetic B2 activation failed"
}
wait_backend() {
  local name="$1" event="$2" count
  for _ in $(seq 1 100); do
    count="$(p -c "select count(*) from pg_catalog.pg_stat_activity
      where application_name='$name' and state='active'
        and wait_event_type='$event';")"
    [[ "$count" == 1 ]] && return 0
    sleep 0.05
  done
  fail "missing observed PostgreSQL $event wait for $name"
}
finish() {
  if ! wait "$1"; then
    cat "$2" >&2
    fail "PostgreSQL concurrent session failed"
  fi
}
apply_effect_sql() {
  local event_id="$1"
  cat <<SQL
select 'S2_PROVIDER_REVOKE=' || (result->>'contractVersion')
  || ':' || (result->>'grantCount')
from (
  select public.internal_dispatch_verified_official_reader_revoke_event_v1(
    '$event_id'::uuid
  ) as result
) s;
SQL
}
assert_committed_revoke() {
  local event_id="$1"
  [[ "$(p -c "select status from public.entitlement_grants where id='$b2'::uuid;")" == revoked ]] ||
    fail "Commerce Writer did not revoke exact B2"
  [[ "$(p -c "select count(*) from public.entitlement_events
    where grant_id='$b2'::uuid and source_provider_event_id='$event_id'::uuid
      and event_type='revoked' and target_status='revoked';")" == 1 ]] ||
    fail "exact synthetic provider revoke ledger was not atomically committed"
  [[ "$(p -c "select count(*) from public.standard_reading_official_bindings
    where reading_id='$reading'::uuid and subject_id='$subject'::uuid;")" == 1 ]] ||
    fail "official Reading provenance changed"
  [[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants a
    join public.entitlement_grants g on g.id=a.entitlement_grant_id
    where a.subject_id='$subject'::uuid and a.reader_character_id='$reader'
      and a.official_reading_id='$reading'::uuid and g.status='active';")" == 0 ]] ||
    fail "revoked Reader B still has active synthetic access"

  # The actual Reader metadata and raw-Reading production query wrappers must
  # both deny this Reader immediately after the provider-effect COMMIT. The
  # immutable Reader purchase binding remains, but is not access authority.
  local visibility
  visibility="$(p -c "begin;
    select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
    select
      (select count(*) from public.qry_character_standard_reading_access_runtime_v2(
        '$subject'::uuid, '$reader', clock_timestamp()
      ))::text || ':' ||
      (select count(*) from public.qry_standard_reading_artifact_source_runtime_v1(
        '$subject'::uuid, '$reading'::uuid, '$reader', clock_timestamp()
      ))::text;
    commit;")" || fail "revoked Reader runtime queries failed"
  printf '%s\n' "$visibility" | grep -qx '0:0' ||
    fail "revoked Reader remained visible to production metadata or raw artifact query"
}

# A signed-looking partial cancellation must never be promoted to a
# verified full revocation. A separate partial-refund policy is required.
p >"$tmpdir/partial-seed.out" 2>&1 <<SQL || fail "partial cancellation fixture failed"
insert into public.commerce_provider_events(
  id,provider,external_event_id,event_type,external_transaction_id,
  resolved_subject_id,resolution_source_type,resolved_receipt_id,
  payload_fingerprint,provider_occurred_at,provider_ordering_key,
  verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select '12196000-0000-0000-0000-000000000003'::uuid,
  cr.provider,'synthetic-reader-partial-cancel','Transaction.PartialCancelled',
  cr.external_transaction_id,cr.subject_id,'receipt',cr.id,
  'sha256:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  clock_timestamp(),'race-order-partial',
  '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  'verified',clock_timestamp(),'production','synthetic-race-verifier-v1'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
SQL
activate_b2
if p -c "begin;
  select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
  select public.internal_dispatch_verified_official_reader_revoke_event_v1(
    '12196000-0000-0000-0000-000000000003'::uuid
  ); commit;" >"$tmpdir/partial-reject.out" 2>&1; then
  fail "partial cancellation illegally revoked all Reader rights"
fi
[[ "$(p -c "select status from public.entitlement_grants where id='$b2'::uuid;")" == active ]] ||
  fail "partial cancellation changed the Reader purchase Grant"
[[ "$(p -c "select count(*) from public.entitlement_events
  where source_provider_event_id='12196000-0000-0000-0000-000000000003'::uuid;")" == 0 ]] ||
  fail "partial cancellation produced a full-revoke event"
pass "verified partial cancellation is rejected without changing Reader rights"

# Direct legacy 1080 must no longer mutate an official Reader purchase Grant
# without the same held S1 scope lock as the 1770/1780 paths.
activate_b2
if p -c "begin;
  select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
  select * from public.internal_apply_entitlement_effect_v1(
    'provider_event',
    '12196000-0000-0000-0000-000000000001'::uuid,
    '$b2'::uuid,
    null,
    (select revision from public.entitlement_grants where id='$b2'::uuid),
    null,
    'revoked',
    clock_timestamp(),
    'revoked',
    (select valid_from from public.entitlement_grants where id='$b2'::uuid),
    (select valid_until from public.entitlement_grants where id='$b2'::uuid),
    'legacy_direct_without_reader_scope_lock'
  );
  commit;" >"$tmpdir/direct1080.out" 2>&1; then
  fail "legacy 1080 bypassed the official Reader shared scope lock"
fi
grep -q 'Legacy Reader provider effect cannot bypass the S1 scope lock' "$tmpdir/direct1080.out" ||
  { cat "$tmpdir/direct1080.out" >&2; fail "legacy 1080 rejected for an unrelated reason"; }
[[ "$(p -c "select status from public.entitlement_grants where id='$b2'::uuid;")" == active ]] ||
  fail "legacy 1080 bypass modified Reader Grant"
pass "direct legacy 1080 Reader effect requires an already held S1 scope lock"

# CASE 1: Commerce effect owns the Grant row before Reader reads.
# Reader must actually wait on PostgreSQL Lock and subsequently see DENY.
activate_b2
{
  echo "set application_name='m3b2b_effect_writer_first';"
  echo "set statement_timeout='12s';"
  echo "begin;"
  echo "select pg_catalog.set_config('myeongha.subject_id', '$subject', true);"
  apply_effect_sql '12196000-0000-0000-0000-000000000001'
  echo "select pg_sleep(4);"
  echo "commit;"
} | p >"$tmpdir/writer-first.out" 2>&1 &
writer_pid=$!
wait_backend m3b2b_effect_writer_first Timeout
p >"$tmpdir/reader-after.out" 2>&1 <<SQL &
set application_name='m3b2b_effect_reader_after';
set statement_timeout='12s';
begin;
select case when status='active'
  and valid_from<=clock_timestamp()
  and (valid_until is null or valid_until>clock_timestamp())
  then 'ALLOW' else 'DENY' end
from public.entitlement_grants where id='$b2'::uuid for share;
commit;
SQL
reader_pid=$!
wait_backend m3b2b_effect_reader_after Lock
finish "$writer_pid" "$tmpdir/writer-first.out"; writer_pid=""
grep -qx 'S2_PROVIDER_REVOKE=official-reader-s2-revoke-dispatch-v1:1' "$tmpdir/writer-first.out" ||
  fail "actual first scoped provider revoke writer did not complete"
finish "$reader_pid" "$tmpdir/reader-after.out"; reader_pid=""
grep -qx DENY "$tmpdir/reader-after.out" ||
  { cat "$tmpdir/reader-after.out" >&2; fail "post-effect Reader-like locked read must DENY"; }
assert_committed_revoke '12196000-0000-0000-0000-000000000001'
pass "S2 real scoped revoke first: provider-event Grant FOR UPDATE blocks Reader, then DENY"

# Insert a distinct newer provider cancellation AFTER the earlier effect has
# been committed. An older event must not be replayed to rewrite newer state.
p >"$tmpdir/second-event.out" 2>&1 <<SQL || fail "second cancellation fixture failed"
insert into public.commerce_provider_events(
  id,provider,external_event_id,event_type,external_transaction_id,
  resolved_subject_id,resolution_source_type,resolved_receipt_id,
  payload_fingerprint,provider_occurred_at,provider_ordering_key,
  verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select '12196000-0000-0000-0000-000000000002'::uuid,
  cr.provider,'synthetic-reader-revoke-race-2','Transaction.Cancelled',
  cr.external_transaction_id,cr.subject_id,'receipt',cr.id,
  'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  clock_timestamp(),'race-order-2',
  '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  'verified',clock_timestamp(),'production','synthetic-race-verifier-v1'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
SQL
[[ "$(p -c "select count(*) from public.commerce_provider_events
  where id='12196000-0000-0000-0000-000000000002'::uuid;")" == 1 ]] ||
  fail "newer verified synthetic full cancellation missing"

# CASE 2: Reader FOR SHARE owns the row first. The real Entitlement Effect
# writer waits, then commits the independent second synthetic revoke event.
# ALLOW here is a row-lock observation, NEVER an HTTP reveal authorization.
activate_b2
p >"$tmpdir/reader-first.out" 2>&1 <<SQL &
set application_name='m3b2b_effect_reader_first';
set statement_timeout='12s';
begin;
select case when status='active' then 'ALLOW' else 'DENY' end
from public.entitlement_grants where id='$b2'::uuid for share;
select pg_sleep(4);
commit;
SQL
reader_pid=$!
wait_backend m3b2b_effect_reader_first Timeout
{
  echo "set application_name='m3b2b_effect_writer_after';"
  echo "set statement_timeout='12s';"
  echo "begin;"
  echo "select pg_catalog.set_config('myeongha.subject_id', '$subject', true);"
  apply_effect_sql '12196000-0000-0000-0000-000000000002'
  echo "commit;"
} | p >"$tmpdir/writer-after.out" 2>&1 &
writer_pid=$!
wait_backend m3b2b_effect_writer_after Lock
finish "$reader_pid" "$tmpdir/reader-first.out"; reader_pid=""
finish "$writer_pid" "$tmpdir/writer-after.out"; writer_pid=""
grep -qx 'S2_PROVIDER_REVOKE=official-reader-s2-revoke-dispatch-v1:1' "$tmpdir/writer-after.out" ||
  fail "actual second scoped provider revoke writer did not complete"
grep -qx ALLOW "$tmpdir/reader-first.out" ||
  { cat "$tmpdir/reader-first.out" >&2; fail "Reader-first synthetic lock read changed"; }
assert_committed_revoke '12196000-0000-0000-0000-000000000002'
pass "S2 real scoped revoke after Reader: FOR SHARE blocks Entitlement Effect writer"


# CASE 3: The actual INTERNAL COMMERCE command persists an independently
# server-verified PortOne full cancellation and applies existing 1770/1080
# under the same scope lock. Unrelated products are never mutated.
# The original verified B2 payment attempt is supplied by the shared fixture.
activate_b2
cancelled_at="$(p -c "select pg_catalog.to_char(clock_timestamp() at time zone 'UTC',
  'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
apply_full_cancel() {
  local amount="$1" cancellation="$2"
  p -c "begin;
    set local role myeongha_commerce_internal_executor;
    select (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
      'synthetic-portone-reader-b2-payment',
      'tx-official-reader-b2',
      '$cancellation',
      '$cancelled_at'::timestamptz,
      $amount, 'KRW', 'production',
      'hmac-sha256:k1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'synthetic-portone-cancel-verifier-v1'
    )->>'contractVersion');
    commit;"
}
if apply_full_cancel 9999 'wrong-amount-cancellation' >"$tmpdir/invalid-money.out" 2>&1; then
  fail "mismatching original Receipt amount cannot cancel a Reader"
fi
[[ "$(p -c "select status from public.entitlement_grants where id='$b2'::uuid;")" == active ]] ||
  fail "invalid PortOne payment evidence changed the Reader Grant"
apply_full_cancel 1 'synthetic-full-cancel-b2' >"$tmpdir/full-cancel.out" 2>&1 ||
  { cat "$tmpdir/full-cancel.out" >&2; fail "verified full-cancel command failed"; }
grep -qx 'portone-reader-full-cancellation-v1' "$tmpdir/full-cancel.out" ||
  fail "internal PortOne cancellation did not use authoritative DB command"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$receipt'::uuid;")" == revoked ]] ||
  fail "canonical original Receipt was not atomically marked revoked"
[[ "$(p -c "select status from public.entitlement_grants where id='$b2'::uuid;")" == revoked ]] ||
  fail "canonical Reader Grant was not atomically revoked"
[[ "$(p -c "select count(*) from public.commerce_provider_events
  where provider='portone_v2' and event_type='Transaction.Cancelled'
  and resolved_receipt_id='$receipt'::uuid
  and external_event_id='myeongha:portone-v2:full-cancel:v1:synthetic-full-cancel-b2';")" == 1 ]] ||
  fail "verified full-cancel event provenance was not persisted"
apply_full_cancel 1 'synthetic-full-cancel-b2' >"$tmpdir/replay.out" 2>&1 ||
  { cat "$tmpdir/replay.out" >&2; fail "idempotent PortOne cancellation replay failed"; }
[[ "$(p -c "select count(*) from public.entitlement_events ee
  join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
  where ee.grant_id='$b2'::uuid
    and pe.external_event_id='myeongha:portone-v2:full-cancel:v1:synthetic-full-cancel-b2';")" == 1 ]] ||
  fail "PortOne cancellation replay duplicated the Grant lifecycle event"
pass "actual internal Commerce PortOne full cancellation: receipt + Reader Grant revoked and replay safe"


echo "PASS: S2 real scoped provider-event -> Commerce EntitlementEffect Grant/Event/Projection mutation; no provider refund API call or paid Reader reveal"
