#!/usr/bin/env bash
set -euo pipefail

# Disposable PG15/PG17 S2->S7 snapshot race, NOT Production.
# Runs real migrated 1900/1910 verified PortOne full-cancel against B2 and
# preserves sibling B3. The S7 v1 source/protected-body evidence gate is
# temporarily substituted ONLY inside this disposed test DB, so this case
# isolates the v2 post-lock Receipt status snapshot. It is NOT an end-to-end
# S5 body, client ACK, or legal delivery proof. The production 2240 gate
# remains unchanged and still requires real protected-body lineage.
if [[ "${CI:-}" != 'true' || "${PGHOST:-}" != 'localhost' ||
      "${PGDATABASE:-}" != 'myeongha_reader_s7_receipt_snapshot_race_test' ]]; then
  echo 'FAIL: isolated CI PostgreSQL required for Reader S7 snapshot race' >&2
  exit 1
fi
p() { psql -X -At -v ON_ERROR_STOP=1 "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }
tmpdir="$(mktemp -d)"
holder_pid="" reader_pid=""
cleanup() {
  for pid in "$holder_pid" "$reader_pid"; do
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
  { tail -80 "$tmpdir/fixture.err" >&2; fail "official Reader purchase fixture"; }

subject='11390000-0000-0000-0000-000000000001'
reading='12103100-0000-0000-0000-000000000001'
reader='test-unlockable-reader'
intent='12192300-0000-0000-0000-000000000002'
receipt='12192000-0000-0000-0000-000000000002'
sibling_intent='12192300-0000-0000-0000-000000000003'
sibling_receipt='12192000-0000-0000-0000-000000000003'
body='ee225000-0000-4000-8000-000000000001'
grant="$(p -c "select g.id from public.entitlement_grants g
  join public.commerce_receipts r on r.id=g.source_receipt_id
  where r.id='$receipt'::uuid and g.grant_source_type='purchase';")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail "exact original Receipt Grant missing"
sibling_grant="$(p -c "select g.id from public.entitlement_grants g
  join public.commerce_receipts r on r.id=g.source_receipt_id
  where r.id='$sibling_receipt'::uuid and g.grant_source_type='purchase';")"
[[ "$sibling_grant" =~ ^[0-9a-f-]{36}$ && "$sibling_grant" != "$grant" ]] ||
  fail "independent sibling Receipt Grant missing"

# The core official fixture ends with both Reader B Grants revoked for other
# tests. This disposable case reactivates both before verified full cancel.
p -c "update public.entitlement_grants
  set status='active',revision=revision+1,
      last_effective_at=clock_timestamp()-interval '5 minutes',
      updated_at=clock_timestamp()
  where id in ('$grant'::uuid,'$sibling_grant'::uuid);" >/dev/null
[[ "$(p -c "select count(*) from public.entitlement_grants
  where id in ('$grant'::uuid,'$sibling_grant'::uuid) and status='active';")" == 2 ]] ||
  fail "independent B2/B3 precondition not active"
[[ "$(p -c "select count(*) from public.commerce_receipts
  where id in ('$receipt'::uuid,'$sibling_receipt'::uuid) and verification_status='verified';")" == 2 ]] ||
  fail "both original verified Receipts required"

# Narrow v1 test double: simulate ONLY 2240's lock acquisition and historical
# evidence return without constructing an unapproved private S5 body or ACK.
# The real 2240 proof function is exercised elsewhere and is never changed in
# any checked-in migration. This override dies with the isolated DB clone.
p >/dev/null <<SQL
create or replace function public.internal_qry_official_reader_withdrawal_delivery_evidence_v1(
  p_subject_id uuid,p_purchase_intent_id uuid,
  p_originating_grant_id uuid,p_body_id uuid
)
returns table (
  purchase_intent_id uuid,unit_id uuid,product_spec_version text,
  s5_committed_at timestamptz,response_prepared_at timestamptz,
  client_acknowledged_at timestamptz,delivery_attempt_count bigint,
  acknowledged_attempt_count bigint
)
language plpgsql volatile security definer
set search_path=pg_catalog,public
as \$reader_s7_snapshot_fixture\$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform public.internal_acquire_official_reader_scope_lock_v1(
    p_subject_id,'$reading'::uuid,'$reader'
  );
  return query
  select p_purchase_intent_id,p_originating_grant_id,'fixture-only'::text,
    null::timestamptz,null::timestamptz,null::timestamptz,
    0::bigint,0::bigint
  where p_subject_id='$subject'::uuid
    and p_purchase_intent_id='$intent'::uuid
    and p_originating_grant_id='$grant'::uuid
    and p_body_id='$body'::uuid;
end
\$reader_s7_snapshot_fixture\$;
SQL

# A real PortOne verified-effect command gets the S1 lock, changes only B2
# Grant/Event/Receipt, then HOLDS the transaction open while the S7 query
# starts with a snapshot from BEFORE the refund transaction can commit.
p >"$tmpdir/cancellation.out" 2>&1 <<SQL &
set application_name='reader_s2_s7_cancel_holder';
set statement_timeout='30s';
begin;
select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'synthetic-portone-reader-b2-payment',
  'tx-official-reader-b2',
  's7-original-receipt-postlock-snapshot-race',
  clock_timestamp(),cr.verified_amount_minor,cr.verified_currency,
  'production',
  'hmac-sha256:k1:abababababababababababababababababababababababababababababababab',
  'official-reader-s7-pg-snapshot-race-v1'
)->'revoke'->>'grantCount' as cancelled_grants
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
select pg_sleep(5);
commit;
SQL
holder_pid=$!

wait_state() {
  local app="$1" kind="$2"
  for _ in $(seq 1 100); do
    if [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
      where application_name='$app' and state='active'
        and wait_event_type='$kind';")" == 1 ]]; then
      return 0
    fi
    sleep 0.05
  done
  cat "$tmpdir/cancellation.out" "$tmpdir/reader.out" 2>/dev/null >&2 || true
  fail "missing observed $kind overlap: $app"
}
wait_state 'reader_s2_s7_cancel_holder' 'Timeout'

p >"$tmpdir/reader.out" 2>&1 <<SQL &
set application_name='reader_s2_s7_evidence_reader';
set statement_timeout='30s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select original_receipt_status || '|' || product_spec_version || '|' ||
       delivery_attempt_count::text
from public.internal_qry_official_reader_withdrawal_delivery_state_v2(
  '$subject'::uuid,'$intent'::uuid,'$grant'::uuid,'$body'::uuid
);
commit;
SQL
reader_pid=$!
wait_state 'reader_s2_s7_evidence_reader' 'Lock'
wait "$holder_pid" ||
  { cat "$tmpdir/cancellation.out" >&2; fail "real S2 cancellation failed"; }
holder_pid=""
wait "$reader_pid" ||
  { cat "$tmpdir/reader.out" >&2; fail "S7 post-lock evidence read failed"; }
reader_pid=""

grep -qx '1' "$tmpdir/cancellation.out" ||
  { cat "$tmpdir/cancellation.out" >&2; fail "exact original B2 Grant effect not applied"; }
grep -qx 'revoked|fixture-only|0' "$tmpdir/reader.out" ||
  { cat "$tmpdir/reader.out" >&2; fail "S7 saw pre-lock verified status or leaked cross-Receipt evidence"; }
[[ "$(p -c "select verification_status from public.commerce_receipts
    where id='$receipt'::uuid;")" == revoked ]] ||
  fail "S2 failed to revoke original B2 Receipt"
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid;")" == revoked ]] ||
  fail "S2 failed to revoke original B2 Grant"
[[ "$(p -c "select count(*) from public.entitlement_events ev
  join public.commerce_provider_events pe on pe.id=ev.source_provider_event_id
  where ev.grant_id='$grant'::uuid and ev.event_type='revoked'
    and pe.event_type='Transaction.Cancelled' and pe.resolved_receipt_id='$receipt'::uuid;")" == 1 ]] ||
  fail "exact PortOne verified cancellation Event missing"
[[ "$(p -c "select verification_status from public.commerce_receipts
    where id='$sibling_receipt'::uuid;")" == verified ]] ||
  fail "unrelated sibling Receipt incorrectly revoked"
[[ "$(p -c "select status from public.entitlement_grants
    where id='$sibling_grant'::uuid;")" == active ]] ||
  fail "independent purchased sibling Grant incorrectly revoked"
pass "real S2 PortOne cancellation serialized before S7 original-status snapshot; sibling untouched"

# Still no real S5 body or legal delivery acceptance. The v1 fixture was a
# narrowly scoped dependency stub; all private execution grants stay revoked.
[[ "$(p -c "select count(*) from pg_catalog.pg_roles r where
  r.rolname in ('anon','authenticated','service_role','myeongha_api_executor')
  and pg_catalog.has_function_privilege(
    r.rolname,
    'public.internal_qry_official_reader_withdrawal_delivery_state_v2(uuid,uuid,uuid,uuid)',
    'EXECUTE');")" == 0 ]] || fail "S7 v2 leaked runtime EXECUTE"
pass "S7 remains non-public and makes no statutory refund/delivery decision"
