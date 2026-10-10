#!/usr/bin/env bash
set -euo pipefail

# DB-C4: actual NEW verified synthetic receipt -> independent purchase Grant
# -> immutable Reader access INSERT, while an existing Reader Grant is locked.
# This is a preflight showing the limitation of ONE ROW's FOR SHARE lock.
# It is NOT an approved paid-Reader final-reveal or global writer-lock protocol.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }
tmpdir="$(mktemp -d)"
holder_pid=""
cleanup() {
  if [[ -n "$holder_pid" ]]; then
    kill "$holder_pid" >/dev/null 2>&1 || true
    wait "$holder_pid" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmpdir"
}
trap cleanup EXIT

p -f test/db/official_standard_reading_reader_interpretation.sql \
  >"$tmpdir/fixture.out" 2>"$tmpdir/fixture.err" || {
  cat "$tmpdir/fixture.err" >&2
  fail "isolated verified synthetic Reading/Reader fixture failed"
}

subject="11390000-0000-0000-0000-000000000001"
reader="test-unlockable-reader"
reading="12103100-0000-0000-0000-000000000001"
b2_intent="12192300-0000-0000-0000-000000000002"
b4_intent="12192300-0000-0000-0000-000000000004"
b4_receipt="12192000-0000-0000-0000-000000000004"
b2="$(p -c "select g.id from public.entitlement_grants g
  join public.standard_reading_reader_access_grants a on a.entitlement_grant_id=g.id
  where a.purchase_intent_id='$b2_intent'::uuid and g.grant_source_type='purchase';")"
[[ "$b2" =~ ^[0-9a-f-]{36}$ ]] || fail "existing B2 purchase-backed Grant unavailable"

# Seed a separate immutable selection and synthetic receipt from the earlier
# published B3 bundle. B4 is intentionally NOT yet entitled or Reader-bound.
p >"$tmpdir/seed.out" 2>&1 <<SQL || { cat "$tmpdir/seed.out" >&2; fail "B4 seed failed"; }
begin;
insert into public.purchase_intents(
  id, subject_id, product_offer_id, provider_account_link_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at, expected_amount_minor, expected_currency,
  charge_terms_version, capability_set_id, capability_snapshot_jsonb,
  capability_snapshot_hash
)
select '$b4_intent'::uuid, subject_id, product_offer_id, provider_account_link_id,
       'reader-b4-new-insert-phantom', 'sha256:test:reader-b4-new-insert-phantom',
       offer_snapshot_jsonb, offer_snapshot_hash, 'created',
       clock_timestamp(), clock_timestamp(), expected_amount_minor,
       expected_currency, charge_terms_version, capability_set_id,
       capability_snapshot_jsonb, capability_snapshot_hash
from public.purchase_intents
where id='12192300-0000-0000-0000-000000000003'::uuid;

insert into public.purchase_intent_reader_selections(
  purchase_intent_id, product_id, reader_character_id, reader_content_bundle_id,
  selection_contract_version, selection_snapshot_jsonb, selection_hash, created_at
)
select '$b4_intent'::uuid, product_id, reader_character_id,
       reader_content_bundle_id, selection_contract_version,
       selection_snapshot_jsonb, 'sha256:test:reader-b4-new-selection',
       clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='12192300-0000-0000-0000-000000000003'::uuid;

update public.purchase_intents
set status='verified', updated_at=clock_timestamp()
where id='$b4_intent'::uuid;

insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id, platform, provider,
  external_transaction_id, receipt_fingerprint, verification_status,
  verified_payload_jsonb, verified_at, created_at, environment,
  verifier_revision, verified_amount_minor, verified_currency
)
select '$b4_receipt'::uuid, subject_id, '$b4_intent'::uuid, product_offer_id,
       platform, provider, 'tx-official-reader-b4-new-phantom',
       'hmac-sha256:k1:5555555555555555555555555555555555555555555555555555555555555555',
       verification_status, verified_payload_jsonb, clock_timestamp(),
       clock_timestamp(), environment, verifier_revision, verified_amount_minor,
       verified_currency
from public.commerce_receipts
where id='12192000-0000-0000-0000-000000000003'::uuid;
commit;
SQL

b4_pre="$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='$b4_intent'::uuid;")"
[[ "$b4_pre" == 0 ]] || fail "new B4 must have no existing Reader access before lock race"
grants_pre="$(p -c "select count(*) from public.entitlement_grants g
  join public.commerce_receipts cr on cr.id=g.source_receipt_id
  where cr.purchase_intent_id='$b4_intent'::uuid;")"
[[ "$grants_pre" == 0 ]] || fail "new B4 must have no issued Grant before lock race"

# Make B2 the sole active Reader B grant. Original fixture left B1/B2/B3 revoked.
p -c "update public.entitlement_grants
  set status='active', revision=revision+1,
      last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
  where id='$b2'::uuid;" >"$tmpdir/reactivate-b2.out" 2>&1
baseline="$(p -c "select count(distinct a.reader_content_bundle_id)
  from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader'
    and g.status='active'
    and g.valid_from<=clock_timestamp()
    and (g.valid_until is null or g.valid_until>clock_timestamp());")"
[[ "$baseline" == 1 ]] || fail "expected exactly one active Reader B bundle at baseline"

# Hold B2's existing Grant row lock while B4 enters the full synthetic
# receipt-effect and official v2 Reader access BIND paths.
p >"$tmpdir/holder.out" 2>&1 <<SQL &
set application_name='m3b2b_c4_b2_lock_insert';
set statement_timeout='18s';
begin;
select id from public.entitlement_grants where id='$b2'::uuid for share;
select pg_sleep(10);
commit;
SQL
holder_pid=$!

wait_holder() {
  local count
  for _ in $(seq 1 100); do
    count="$(p -c "select count(*) from pg_catalog.pg_stat_activity
      where application_name='m3b2b_c4_b2_lock_insert'
        and state='active' and wait_event_type='Timeout';")"
    [[ "$count" == 1 ]] && return 0
    sleep 0.05
  done
  fail "B2 FOR SHARE holder not observed; interleaving unverified"
}
wait_holder

p >"$tmpdir/b4-new-insert.out" 2>&1 <<SQL || { cat "$tmpdir/b4-new-insert.out" >&2; fail "new B4 receipt Grant + Reader access INSERT did not complete during B2 SHARE lock"; }
set statement_timeout='7s';
begin;
select * from public.internal_apply_verified_receipt_capability_effects_v1(
  '$b4_receipt'::uuid,
  array['test-reader-unit'], array[transaction_timestamp()],
  array[transaction_timestamp()], array[null]::timestamptz[],
  array[null]::text[]
);
select reading_id,reader_character_id,reader_content_bundle_id
from public.cmd_bind_standard_reading_access_v2(
  '$subject'::uuid,
  '$b4_intent'::uuid,
  '12193000-0000-0000-0000-000000000004'::uuid,
  '12193100-0000-0000-0000-000000000004'::uuid,
  'sha256:v1:7777777777777777777777777777777777777777777777777777777777777777',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$b4_intent"}'::jsonb
);
commit;
SQL

# Must STILL be holding the original Grant lock after B4 committed.
wait_holder
new_grants="$(p -c "select count(*) from public.entitlement_grants g
  join public.commerce_receipts cr on cr.id=g.source_receipt_id
  where cr.purchase_intent_id='$b4_intent'::uuid
    and g.grant_source_type='purchase' and g.status='active';")"
new_access="$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b4_intent'::uuid
    and subject_id='$subject'::uuid
    and official_reading_id='$reading'::uuid
    and reader_character_id='$reader'
    and reader_content_bundle_id='12191000-0000-0000-0000-000000000002'::uuid;")"
active_bundles="$(p -c "select count(distinct a.reader_content_bundle_id)
  from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid
    and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader'
    and g.status='active'
    and g.valid_from<=clock_timestamp()
    and (g.valid_until is null or g.valid_until>clock_timestamp());")"
official_count="$(p -c "select count(*) from public.standard_reading_official_bindings
  where reading_id='$reading'::uuid and subject_id='$subject'::uuid;")"
[[ "$new_grants" == 1 && "$new_access" == 1 && "$active_bundles" == 2 && "$official_count" == 1 ]] ||
  fail "expected B4 NEW grant/access and two bundles while B2 lock held: $new_grants/$new_access/$active_bundles/$official_count"
pass "DB-C4 actual NEW B4 receipt-backed Grant + immutable Reader access INSERT commits while B2 row SHARE locked"

# Restore disabled test purchase Grants; immutable access provenance retained.
if ! wait "$holder_pid"; then cat "$tmpdir/holder.out" >&2; fail "B2 lock holder failed"; fi
holder_pid=""
p -c "update public.entitlement_grants
  set status='revoked', revision=revision+1,
      last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
  where id='$b2'::uuid
    or source_receipt_id='$b4_receipt'::uuid;" >"$tmpdir/revoke.out" 2>&1

remaining="$(p -c "select count(*) from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader' and g.status='active';")"
[[ "$remaining" == 0 ]] || fail "Reader B synthetic fixture must finish with zero active grants"
echo "PASS: new independent verified receipt Grant/access phantom reproduced; NO final reveal policy or public activation"
