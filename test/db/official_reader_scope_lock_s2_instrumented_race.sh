#!/usr/bin/env bash
set -euo pipefail

# S2 instrumented proposal, NOT a production Writer integration.
# Real verified synthetic Receipt -> Grant -> immutable Reader access INSERT
# is made to participate in the SAME scope lock as a T2-like reader.
# Includes grant-revoke-first opposite ordering and fresh read after wait.
# The production Commerce and Reader writers are deliberately unchanged.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }
tmpdir="$(mktemp -d)"
holder_pid=""
writer_pid=""
reader_pid=""
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


# Case 1: T2-like exact scope reading arrives BEFORE an independently minted
# purchase Grant / Reader bind. The proposed Commerce writer MUST wait.
# The holder sees only the original B2 bundle, then releases the scope.
p >"$tmpdir/t2-first.out" 2>&1 <<SQL &
set application_name='rr_s2_t2_first_holder';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid, '$reading'::uuid, '$reader'
);
select 'T2_PRE_BUNDLE_COUNT=' || count(*)::text
from public.internal_qry_character_standard_reading_access_v2(
  '$subject'::uuid, '$reader', clock_timestamp()
) a where a.reading_id='$reading'::uuid;
select pg_sleep(4);
commit;
SQL
holder_pid=$!

wait_for() {
  local label="$1" query="$2" value=""
  for _ in $(seq 1 120); do
    value="$(p -c "$query")"
    [[ "$value" == "1" ]] && return 0
    sleep 0.05
  done
  for f in "$tmpdir/t2-first.out" "$tmpdir/new-grant.out" "$tmpdir/revoke-first.out" "$tmpdir/t2-after-revoke.out"; do
    [[ ! -f "$f" ]] || tail -40 "$f" >&2
  done
  fail "expected scope race not observed: $label"
}

wait_for "T2 holds scope" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_s2_t2_first_holder'
    and state='active' and wait_event_type='Timeout';
"

p >"$tmpdir/new-grant.out" 2>&1 <<SQL &
set application_name='rr_s2_new_grant_writer';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid, '$reading'::uuid, '$reader'
);
select * from public.internal_apply_verified_receipt_capability_effects_v1(
  '$b4_receipt'::uuid,
  array['test-reader-unit'], array[transaction_timestamp()],
  array[transaction_timestamp()], array[null]::timestamptz[],
  array[null]::text[]
);
select reading_id,reader_character_id,reader_content_bundle_id
from public.cmd_bind_standard_reading_access_v2(
  '$subject'::uuid, '$b4_intent'::uuid,
  '12193000-0000-0000-0000-000000000004'::uuid,
  '12193100-0000-0000-0000-000000000004'::uuid,
  'sha256:v1:7777777777777777777777777777777777777777777777777777777777777777',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$b4_intent"}'::jsonb
);
commit;
SQL
writer_pid=$!

wait_for "new verified Grant writer blocked on same advisory scope" "
  select count(distinct a.pid)
  from pg_catalog.pg_stat_activity a
  join pg_catalog.pg_locks l on l.pid=a.pid
  where a.application_name='rr_s2_new_grant_writer'
    and a.wait_event_type='Lock' and l.locktype='advisory'
    and not l.granted;
"

b4_during="$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b4_intent'::uuid;")"
[[ "$b4_during" == "0" ]] || fail "new Reader access committed before held T2 completed"
if ! wait "$holder_pid"; then cat "$tmpdir/t2-first.out" >&2; fail "T2 holder failed"; fi
holder_pid=""
if ! wait "$writer_pid"; then cat "$tmpdir/new-grant.out" >&2; fail "guarded Grant/Bind writer failed"; fi
writer_pid=""
grep -qx 'T2_PRE_BUNDLE_COUNT=1' "$tmpdir/t2-first.out" ||
  fail "T2 holder did not see exactly one current Reader bundle"
new_access="$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b4_intent'::uuid
    and official_reading_id='$reading'::uuid
    and reader_character_id='$reader';")"
active_bundles="$(p -c "select count(distinct a.reader_content_bundle_id)
  from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader' and g.status='active'
    and g.valid_from<=clock_timestamp()
    and (g.valid_until is null or g.valid_until>clock_timestamp());")"
[[ "$new_access" == "1" && "$active_bundles" == "2" ]] ||
  fail "new Grant must commit only after T2 and then create two-bundle ambiguity"
pass "same scoped new receipt Grant/Bind waits for T2; fresh access becomes ambiguous afterwards"

# Revoke B4 under the same proposed lock (only a disposable synthetic row).
p >"$tmpdir/revoke-b4.out" 2>&1 <<SQL || {
  cat "$tmpdir/revoke-b4.out" >&2
  fail "guarded B4 cleanup failed"
}
begin;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid, '$reading'::uuid, '$reader'
);
update public.entitlement_grants
set status='revoked', revision=revision+1,
    last_effective_at=clock_timestamp(), updated_at=clock_timestamp()
where source_receipt_id='$b4_receipt'::uuid;
commit;
SQL

active_only_b2="$(p -c "select count(distinct a.reader_content_bundle_id)
  from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader' and g.status='active';")"
[[ "$active_only_b2" == "1" ]] || fail "B2 must be the sole remaining bundle"

# Case 2: Revoke of the last active Grant arrives FIRST. T2 must wait and
# re-read after the revocation commits (must observe zero active bundles).
p >"$tmpdir/revoke-first.out" 2>&1 <<SQL &
set application_name='rr_s2_revoke_first_writer';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid, '$reading'::uuid, '$reader'
);
update public.entitlement_grants
set status='revoked', revision=revision+1,
    last_effective_at=clock_timestamp(), updated_at=clock_timestamp()
where id='$b2'::uuid;
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "revoke transaction holds scope" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_s2_revoke_first_writer'
    and state='active' and wait_event_type='Timeout';
"

p >"$tmpdir/t2-after-revoke.out" 2>&1 <<SQL &
set application_name='rr_s2_t2_after_revoke';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid, '$reading'::uuid, '$reader'
);
select 'T2_POST_REVOKE_BUNDLES=' || count(*)::text
from public.internal_qry_character_standard_reading_access_v2(
  '$subject'::uuid, '$reader', clock_timestamp()
) a where a.reading_id='$reading'::uuid;
commit;
SQL
reader_pid=$!
wait_for "T2 waits for scope after revoke" "
  select count(distinct a.pid)
  from pg_catalog.pg_stat_activity a
  join pg_catalog.pg_locks l on l.pid=a.pid
  where a.application_name='rr_s2_t2_after_revoke'
    and a.wait_event_type='Lock' and l.locktype='advisory'
    and not l.granted;
"
if ! wait "$holder_pid"; then cat "$tmpdir/revoke-first.out" >&2; fail "revoke-first writer failed"; fi
holder_pid=""
if ! wait "$reader_pid"; then cat "$tmpdir/t2-after-revoke.out" >&2; fail "T2 after revoke failed"; fi
reader_pid=""
grep -qx 'T2_POST_REVOKE_BUNDLES=0' "$tmpdir/t2-after-revoke.out" ||
  fail "T2 did not see zero active purchase rights after first revoke"
pass "revoke-first scope lock blocks T2 and its fresh read sees no active Grant"

# This validates the proposed all-participants protocol only. Unmodified
# production Commerce/Grant paths may still bypass this advisory lock.
echo "PASS: S2 instrumented two-direction PostgreSQL race; production integration HOLD"
