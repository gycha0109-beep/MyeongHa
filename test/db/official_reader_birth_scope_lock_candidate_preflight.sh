#!/usr/bin/env bash
set -euo pipefail

# DB-C5: R2-BP prospective PostgreSQL lock-order CHARACTERIZATION ONLY.
# Demonstrates Birth Profile FOR SHARE blocks actual new Reader bind/access INSERT;
# then reproduces a simple opposing Grant -> Birth vs Birth -> Grant deadlock.
# Does NOT authorize R2-BP, production T2, paid reveal or writer lock ordering.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }
tmpdir="$(mktemp -d)"
holder_pid="" writer_pid="" reader_pid=""
cleanup() {
  for pid in "$holder_pid" "$writer_pid" "$reader_pid"; do
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


bp="$(p -c "select id from public.birth_profiles
  where subject_id='$subject'::uuid and profile_kind='self'
    and archived_at is null;")"
[[ "$bp" =~ ^[0-9a-f-]{36}$ ]] || fail "canonical self Birth Profile is missing or ambiguous"

# A verified B4 receipt and independent active purchase Grant are created
# BEFORE this lock race, while B4 still has ZERO Reader access bindings.
# This keeps the positive case focused on the real v2 binder's Birth row lock.
p >"$tmpdir/b4-grant.out" 2>&1 <<SQL || { cat "$tmpdir/b4-grant.out" >&2; fail "verified B4 purchase Grant setup failed"; }
begin;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
select * from public.internal_apply_verified_receipt_capability_effects_v1(
  '$b4_receipt'::uuid,
  array['test-reader-unit'], array[transaction_timestamp()],
  array[transaction_timestamp()], array[null]::timestamptz[],
  array[null]::text[]
);
commit;
SQL
[[ "$(p -c "select count(*) from public.entitlement_grants g
  join public.commerce_receipts cr on cr.id=g.source_receipt_id
  where cr.purchase_intent_id='$b4_intent'::uuid and g.status='active'
    and g.grant_source_type='purchase';")" == 1 ]] ||
  fail "B4 independent verified purchase Grant was not created"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b4_intent'::uuid;")" == 0 ]] ||
  fail "B4 Reader access must not exist before binder"

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
    fail "PostgreSQL lock session failed"
  fi
}

# Case 1: provisional T2 holds canonical self Birth Profile FOR SHARE first.
# The ACTUAL v2 binder holds B4's exact purchase/Grant locks and must wait at
# its existing Birth Profile FOR UPDATE before it can INSERT Reader access.
p >"$tmpdir/birth-reader-first.out" 2>&1 <<SQL &
set application_name='m3b2b_c5_birth_reader_first';
set statement_timeout='16s';
begin;
select id from public.birth_profiles where id='$bp'::uuid for share;
select pg_sleep(6);
commit;
SQL
holder_pid=$!
wait_backend m3b2b_c5_birth_reader_first Timeout

p >"$tmpdir/new-b4-binder.out" 2>&1 <<SQL &
set application_name='m3b2b_c5_actual_b4_binder';
set statement_timeout='16s';
begin;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
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
writer_pid=$!
wait_backend m3b2b_c5_actual_b4_binder Lock

[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b4_intent'::uuid;")" == 0 ]] ||
  fail "actual new B4 Reader access INSERT crossed held Birth Profile SHARE lock"
active_during="$(p -c "select count(distinct a.reader_content_bundle_id)
  from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid
    and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader'
    and g.status='active' and g.valid_from<=clock_timestamp()
    and (g.valid_until is null or g.valid_until>clock_timestamp());")"
[[ "$active_during" == 1 ]] ||
  fail "Reader access set changed while Birth Profile SHARE held: $active_during"

finish "$holder_pid" "$tmpdir/birth-reader-first.out"; holder_pid=""
finish "$writer_pid" "$tmpdir/new-b4-binder.out"; writer_pid=""
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b4_intent'::uuid
    and subject_id='$subject'::uuid
    and official_reading_id='$reading'::uuid
    and reader_character_id='$reader'
    and reader_content_bundle_id='12191000-0000-0000-0000-000000000002'::uuid;")" == 1 ]] ||
  fail "actual B4 Reader access must INSERT only after Birth Profile SHARE release"
pass "DB-C5: candidate Birth Profile SHARE blocks actual v2 new Reader access INSERT until release"

# Case 2: prospective T2 locks Birth then an existing Grant; the current
# binder locks purchase/Grant then Birth. A two-row synthetic interleaving
# recreates the lock inversion. This is NOT an actual observed Production deadlock.
# Both sessions are confined to this isolated disposable PostgreSQL fixture.
p >"$tmpdir/grant-first-writer.out" 2>&1 <<SQL &
\set VERBOSITY verbose
set application_name='m3b2b_c5_grant_first_writer';
set statement_timeout='17s';
begin;
select id from public.entitlement_grants where id='$b2'::uuid for update;
select pg_sleep(5);
select id from public.birth_profiles where id='$bp'::uuid for update;
commit;
SQL
writer_pid=$!
wait_backend m3b2b_c5_grant_first_writer Timeout

p >"$tmpdir/birth-first-reader.out" 2>&1 <<SQL &
\set VERBOSITY verbose
set application_name='m3b2b_c5_birth_first_reader';
set statement_timeout='17s';
begin;
select id from public.birth_profiles where id='$bp'::uuid for share;
select id from public.entitlement_grants where id='$b2'::uuid for share;
commit;
SQL
reader_pid=$!
wait_backend m3b2b_c5_birth_first_reader Lock

writer_rc=0
reader_rc=0
wait "$writer_pid" || writer_rc=$?
writer_pid=""
wait "$reader_pid" || reader_rc=$?
reader_pid=""
if [[ "$writer_rc" == 0 && "$reader_rc" == 0 ]]; then
  fail "reverse Grant/Birth lock order unexpectedly completed without deadlock"
fi
if ! grep -Eq '40P01|deadlock detected' \
  "$tmpdir/grant-first-writer.out" "$tmpdir/birth-first-reader.out"; then
  cat "$tmpdir/grant-first-writer.out" >&2
  cat "$tmpdir/birth-first-reader.out" >&2
  fail "missing PostgreSQL 40P01 deadlock evidence; timeout is not enough"
fi
pass "DB-C5: Grant->Birth vs Birth->Grant naïve ordering can cause PostgreSQL 40P01"

# All state was synthetic. Revoke purchase Grants in this disposable DB.
p -c "update public.entitlement_grants
  set status='revoked', revision=revision+1,
      last_effective_at=clock_timestamp(), updated_at=clock_timestamp()
  where id='$b2'::uuid or source_receipt_id='$b4_receipt'::uuid;" \
  >"$tmpdir/cleanup-revoke.out" 2>&1
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader' and g.status='active';")" == 0 ]] ||
  fail "synthetic Reader B grants remain active after characterization"
echo "PASS: DB-C5 R2-BP candidate BLOCKING + lock-order INVERSION evidence only; Owner #1827 HOLD, public Reader OFF"
