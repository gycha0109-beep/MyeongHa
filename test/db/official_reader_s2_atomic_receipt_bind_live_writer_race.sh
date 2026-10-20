#!/usr/bin/env bash
set -euo pipefail

# S2 ACTUAL PRIVATE Receipt -> Grant -> Reader bind orchestration using locked transaction.
# Real verified synthetic Receipt -> Grant -> immutable Reader access INSERT
# is made to participate in the SAME scope lock as a T2-like reader.
# Includes grant-revoke-first opposite ordering and fresh read after wait.
# Existing standalone Commerce/refund writers are unchanged and remain a separate S2 gap.
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

# S5 uses the same S1 lock and fresh authoritative bundle lookup, but is
# permanently HOLD/BLOCKED pending official Saju and Privacy Owner approval.
b2_bundle="$(p -c "select a.reader_content_bundle_id
  from public.standard_reading_reader_access_grants a
  where a.purchase_intent_id='$b2_intent'::uuid
    and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader';")"
[[ "$b2_bundle" =~ ^[0-9a-f-]{36}$ ]] || fail "original current Reader bundle missing"
s5_gate() {
  local expected_bundle="${1:-$b2_bundle}"
  p -c "
    begin;
    select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
    select gate_state || '|' || reason_code || '|' ||
           can_persist::text || '|' || can_disclose::text
    from public.internal_qry_official_reader_s5_precommit_held_scope_v1(
      '$subject'::uuid, '$reading'::uuid, '$reader',
      '$expected_bundle'::uuid
    );
    commit;
  " | grep -E '^(held|blocked)[|]'
}
[[ "$(s5_gate)" == 'held|saju_and_privacy_owner_contracts_missing|false|false' ]] ||
  fail "S5 matching current purchase bundle must remain HOLD"
[[ "$(s5_gate 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')" == 'blocked|current_bundle_changed|false|false' ]] ||
  fail "S5 wrong expected bundle was not denied"
s5_runtime_grants="$(p -c "
  select count(*) from pg_catalog.pg_roles r
  where r.rolname in (
    'anon','authenticated','service_role','myeongha_api_executor',
    'myeongha_seyeon_chat_runtime_owner','myeongha_commerce_internal_executor'
  ) and pg_catalog.has_function_privilege(
    r.rolname,
    'public.internal_qry_official_reader_s5_precommit_held_scope_v1(uuid,uuid,text,uuid)',
    'EXECUTE'
  );")"
[[ "$s5_runtime_grants" == 0 ]] || fail "S5 internal HOLD gate leaked runtime EXECUTE privilege"
pass "S5 same-bundle HOLD, different-bundle denial, and private ACL"


# Read after taking the same scope lock, inside one trusted transaction.
read_locked_scope_state() {
  p -c "
    begin;
    select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
    select scope_state || '|' || active_bundle_count::text || '|' ||
           coalesce(current_bundle_id::text, '')
    from public.internal_qry_official_reader_locked_bundle_scope_v1(
      '$subject'::uuid, '$reading'::uuid, '$reader'
    );
    commit;
  " | grep -E '^(no_active_grant|one_current_bundle|ambiguous_bundles)\|'
}
initial_scope="$(read_locked_scope_state)"
[[ "$initial_scope" =~ ^one_current_bundle\|1\|[0-9a-f-]{36}$ ]] ||
  fail "private post-lock scope query missed initial single bundle"

# A transaction-level repeatable snapshot must never be used as the
# post-lock source of truth for the final paid Writer. In particular,
# REPEATABLE READ could cache an active Grant before waiting on refund.
for isolation in 'repeatable read' 'serializable'; do
  if p >"$tmpdir/stale-snapshot-denied.out" 2>&1 <<SQL
begin isolation level $isolation;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
select * from public.internal_qry_official_reader_locked_bundle_scope_v1(
  '$subject'::uuid, '$reading'::uuid, '$reader'
);
commit;
SQL
  then
    fail "post-lock Reader query accepted stale transaction isolation: $isolation"
  fi
  grep -q 'Official Reader locked scope requires READ COMMITTED' \
    "$tmpdir/stale-snapshot-denied.out" ||
    { cat "$tmpdir/stale-snapshot-denied.out" >&2; fail "incorrect isolation guard for $isolation"; }
done
pass "post-lock Reader bundle query enforces READ COMMITTED and rejects stale transaction snapshots"

# No public, session, or privileged API runtime role may call this
# pre-authority helper; successful owner-side SQL tests do not grant EXECUTE.
private_function_count="$(p -c "
  select count(*)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='internal_qry_official_reader_locked_bundle_scope_v1'
    and p.prosecdef=false and p.provolatile='v';
")"
[[ "$private_function_count" == "1" ]] ||
  fail "post-lock current bundle query must be volatile SECURITY INVOKER"
runtime_exec_count="$(p -c "
  select count(*)
  from pg_catalog.pg_roles r
  where r.rolname in (
    'anon','authenticated','service_role','myeongha_api_executor',
    'myeongha_seyeon_chat_runtime_owner'
  ) and pg_catalog.has_function_privilege(
    r.rolname,
    'public.internal_qry_official_reader_locked_bundle_scope_v1(uuid,uuid,text)',
    'EXECUTE'
  );
")"
[[ "$runtime_exec_count" == "0" ]] ||
  fail "post-lock bundle query exposes unauthorized EXECUTE privilege"

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
select 'S2_ATOMIC_WORKFLOW=' ||
       (result->>'contractVersion')
from (
  select public.internal_apply_verified_reader_purchase_under_scope_v1(
    '$subject'::uuid,'$reading'::uuid,'$reader',
    '$b4_receipt'::uuid,'$b4_intent'::uuid,
    array['test-reader-unit'], array[transaction_timestamp()],
    array[transaction_timestamp()], array[null]::timestamptz[],
    array[null]::text[],
    '12193000-0000-0000-0000-000000000004'::uuid,
    '12193100-0000-0000-0000-000000000004'::uuid,
    'sha256:v1:7777777777777777777777777777777777777777777777777777777777777777',
    'standard-reading-access-bind-v2',
    '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$b4_intent"}'::jsonb
  ) as result
) s;
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
grep -qx 'S2_ATOMIC_WORKFLOW=official-reader-s2-atomic-receipt-bind-v1' "$tmpdir/new-grant.out" ||
  fail "actual combined Receipt/Grant/Reader binder did not run to completion"
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
after_new_scope="$(read_locked_scope_state)"
[[ "$after_new_scope" == 'ambiguous_bundles|2|' ]] ||
  fail "private post-lock scope query selected a bundle under two-bundle ambiguity"
[[ "$(s5_gate)" == 'blocked|multiple_current_bundles|false|false' ]] ||
  fail "S5 must reject multiple concurrent purchase bundles"
pass "same scoped new receipt Grant/Bind waits for T2; fresh access becomes ambiguous afterwards"

# Direct legacy 1220 bind must never evaluate expired/refunded Grants using
# an old REPEATABLE READ or SERIALIZABLE snapshot after an S1 lock wait.
for isolation in "repeatable read" "serializable"; do
  if p >"$tmpdir/bind-stale-snapshot.out" 2>&1 <<SQL
begin isolation level $isolation;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select replayed
from public.cmd_bind_standard_reading_access_v2(
  '$subject'::uuid,'$b4_intent'::uuid,
  '12193000-0000-0000-0000-000000000004'::uuid,
  '12193100-0000-0000-0000-000000000004'::uuid,
  'sha256:v1:7777777777777777777777777777777777777777777777777777777777',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$b4_intent"}'::jsonb
);
rollback;
SQL
  then
    fail "direct Reader bind accepted old $isolation transaction snapshot"
  fi
  grep -q 'Official Reader binding requires READ COMMITTED'     "$tmpdir/bind-stale-snapshot.out" ||
    fail "direct Reader bind rejected $isolation for an unexpected reason"
done
pass "direct Reader bind refuses stale repeatable/serializable snapshots"


# Revoke B4 under the same proposed lock (only a disposable synthetic row).
if ! p >"$tmpdir/revoke-b4.out" 2>&1 <<SQL
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
then
  cat "$tmpdir/revoke-b4.out" >&2
  fail "guarded B4 cleanup failed"
fi

active_only_b2="$(p -c "select count(distinct a.reader_content_bundle_id)
  from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader' and g.status='active';")"
[[ "$active_only_b2" == "1" ]] || fail "B2 must be the sole remaining bundle"
after_b4_revoke_scope="$(read_locked_scope_state)"
[[ "$after_b4_revoke_scope" =~ ^one_current_bundle\|1\|[0-9a-f-]{36}$ ]] ||
  fail "private post-lock scope query missed surviving B2"
[[ "$(s5_gate)" == 'held|saju_and_privacy_owner_contracts_missing|false|false' ]] ||
  fail "S5 must return to HOLD only after extra bundle has been revoked"


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
after_all_revoke_scope="$(read_locked_scope_state)"
[[ "$after_all_revoke_scope" == 'no_active_grant|0|' ]] ||
  fail "private post-lock scope query returned paid access after all Grants revoked"
[[ "$(s5_gate)" == 'blocked|no_current_purchase_right|false|false' ]] ||
  fail "S5 must reject refunded/fully revoked Reader rights"
pass "revoke-first scope lock blocks T2 and its fresh read sees no active Grant"

# This verifies actual private combined Writer behavior. Unmodified
# production Commerce/Grant paths may still bypass this advisory lock.
# S2: a new Birth revision must not make legacy Receipt issuance lock the
# obsolete official Reading for the same Subject/Product. The next initial
# purchase is not Reader-bound yet; verify the actual S1 lock identity.
b5_intent="12192300-0000-0000-0000-000000000005"
b5_receipt="12192000-0000-0000-0000-000000000005"
new_revision="12101100-0000-0000-0000-000000000002"
new_reading="12103100-0000-0000-0000-000000000005"
if ! p >"$tmpdir/revision-receipt-seed.out" 2>&1 <<SQL
begin;
insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,
  birth_time,time_known,is_leap_month,sex,input_hash,created_at
)
select '$new_revision'::uuid,birth_profile_id,subject_id,2,
       calendar_type,birth_date+1,birth_time,time_known,is_leap_month,
       sex,'sha256:test:official-reader-revision-two',clock_timestamp()
from public.birth_profile_revisions
where id='12101100-0000-0000-0000-000000000001'::uuid;
update public.birth_profiles
set current_revision_id='$new_revision'::uuid,updated_at=clock_timestamp()
where id='12101000-0000-0000-0000-000000000001'::uuid;
insert into public.purchase_intents(
  id,subject_id,product_offer_id,provider_account_link_id,
  idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
  status,created_at,updated_at,expected_amount_minor,expected_currency,
  charge_terms_version,capability_set_id,capability_snapshot_jsonb,
  capability_snapshot_hash
)
select '$b5_intent'::uuid,subject_id,product_offer_id,provider_account_link_id,
       'reader-b5-new-birth-revision','sha256:test:reader-b5-new-revision',
       offer_snapshot_jsonb,offer_snapshot_hash,'created',
       clock_timestamp(),clock_timestamp(),expected_amount_minor,
       expected_currency,charge_terms_version,capability_set_id,
       capability_snapshot_jsonb,capability_snapshot_hash
from public.purchase_intents
where id='11392300-0000-0000-0000-000000000001'::uuid;
insert into public.purchase_intent_reader_selections(
  purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
  selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select '$b5_intent'::uuid,product_id,reader_character_id,
       reader_content_bundle_id,selection_contract_version,
       selection_snapshot_jsonb,'sha256:test:reader-b5-selection',
       clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='11392300-0000-0000-0000-000000000001'::uuid;
-- Commerce attempt must predate the verified/terminal Purchase transition.
insert into public.commerce_payment_attempts(
  id,purchase_intent_id,subject_id,product_offer_id,attempt_no,
  provider,environment,idempotency_key,provider_request_id,
  provider_transaction_id,status,created_at,updated_at
)
select '12197000-0000-0000-0000-000000000005'::uuid,
  pi.id,pi.subject_id,pi.product_offer_id,1,
  'portone_v2','production',
  'synthetic-b5-no-grant-cancel-request',
  'synthetic-portone-b5-payment','tx-official-reader-b5-new-revision',
  'response_received',clock_timestamp(),clock_timestamp()
from public.purchase_intents pi where pi.id='$b5_intent'::uuid;
update public.purchase_intents
set status='verified',updated_at=clock_timestamp()
where id='$b5_intent'::uuid;
insert into public.commerce_receipts(
  id,subject_id,purchase_intent_id,product_offer_id,platform,provider,
  external_transaction_id,receipt_fingerprint,verification_status,
  verified_payload_jsonb,verified_at,created_at,environment,
  verifier_revision,verified_amount_minor,verified_currency
)
select '$b5_receipt'::uuid,subject_id,'$b5_intent'::uuid,product_offer_id,
       platform,provider,'tx-official-reader-b5-new-revision',
       'hmac-sha256:k1:6666666666666666666666666666666666666666666666666666666666666666',
       verification_status,verified_payload_jsonb,clock_timestamp(),
       clock_timestamp(),environment,verifier_revision,
       verified_amount_minor,verified_currency
from public.commerce_receipts
where id='12102000-0000-0000-0000-000000000001'::uuid;
commit;
SQL
then
  cat "$tmpdir/revision-receipt-seed.out" >&2
  fail "initial purchase after a new Birth revision seed failed"
fi
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings
  where subject_id='$subject'::uuid and product_id='11392000-0000-0000-0000-000000000001'::uuid;")" == 1 ]] ||
  fail "historical official Reading setup unexpectedly changed"

if ! p >"$tmpdir/new-revision-prelock.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select pg_catalog.set_config('myeongha.reader_pending_reading_id','$new_reading',true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid,'$new_reading'::uuid,'test-standard-reader'
);
select 'EXACT_NEW_REVISION_LOCK=ok'
from (select public.internal_assert_reader_receipt_scope_prelocked_v1(
  '$b5_receipt'::uuid)) guarded;
commit;
SQL
then
  cat "$tmpdir/new-revision-prelock.out" >&2
  fail "new initial Reading receipt did not accept exact current revision S1 lock"
fi
grep -qx 'EXACT_NEW_REVISION_LOCK=ok' "$tmpdir/new-revision-prelock.out" ||
  fail "Reader receipt prelock did not select the new Birth revision scope"

if p >"$tmpdir/obsolete-revision-prelock.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select pg_catalog.set_config('myeongha.reader_pending_reading_id','$new_reading',true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid,'$reading'::uuid,'test-standard-reader'
);
select public.internal_assert_reader_receipt_scope_prelocked_v1(
  '$b5_receipt'::uuid
);
rollback;
SQL
then
  fail "obsolete official Reading lock authorized a new-revision receipt"
fi
grep -q 'official_reader_s2_legacy_receipt_scope_lock_required\|cannot bypass the S1 scope lock' \
  "$tmpdir/obsolete-revision-prelock.out" ||
  fail "wrong lock rejected for unexpected reason"
pass "initial Reader receipt uses current Birth revision scope, not historical same-Product Reading"


# New Reading/Reader binding can outlive its paid Grant even after the
# post-lock check if the DB spends time creating the Reading/access row.
# Force the exact B5 insert to wait beyond a short synthetic Grant lifetime.
# No trigger/function survives this isolated integration scenario.
# The published Capability Item is unbounded. Its Receipt writer must keep
# refusing caller-supplied finite valid_until; only the disposable DB fixture
# rewrites the NEW synthetic Grant row after verified issuance validation.
p >"$tmpdir/expiring-insert-trigger.out" 2>&1 <<SQL || { cat "$tmpdir/expiring-insert-trigger.out" >&2; fail "unable to install isolated expiring-bind insert delay"; }
create function public.test_reader_s2_expiring_grant_insert_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public
as \$short_grant\$
begin
  new.valid_until:=pg_catalog.clock_timestamp()+interval '2 seconds';
  return new;
end;
\$short_grant\$;
create trigger test_reader_s2_expiring_grant_insert_v1
  before insert on public.entitlement_grants
  for each row
  when (new.source_receipt_id='$b5_receipt'::uuid)
  execute function public.test_reader_s2_expiring_grant_insert_v1();
create function public.test_reader_s2_expiring_insert_delay_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public
as \$slow_bind\$
begin
  perform pg_catalog.pg_sleep(3.5);
  return new;
end;
\$slow_bind\$;
create trigger test_reader_s2_expiring_insert_delay_v1
  before insert on public.standard_reading_reader_access_grants
  for each row
  when (new.purchase_intent_id='$b5_intent'::uuid)
  execute function public.test_reader_s2_expiring_insert_delay_v1();
SQL

if p >"$tmpdir/expiring-b5-writer.out" 2>&1 <<SQL
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_apply_verified_reader_purchase_under_scope_v1(
  '$subject'::uuid,'$new_reading'::uuid,'test-standard-reader',
  '$b5_receipt'::uuid,'$b5_intent'::uuid,
  array['test-reader-unit'],array[transaction_timestamp()],
  array[transaction_timestamp()],
  array[null]::timestamptz[],
  array[null]::text[],
  '12193000-0000-0000-0000-000000000005'::uuid,
  '$new_reading'::uuid,
  'sha256:v1:8888888888888888888888888888888888888888888888888888888888888888',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$b5_intent"}'::jsonb
);
commit;
SQL
then
  fail "new official Reader binding committed after its purchase Grant expired"
fi
grep -q 'Reader purchase Grant expired or was revoked before binding completed'   "$tmpdir/expiring-b5-writer.out" || {
    cat "$tmpdir/expiring-b5-writer.out" >&2
    fail "expiring Reader bind rejected for the wrong reason"
  }
p >"$tmpdir/expiring-trigger-cleanup.out" 2>&1 <<SQL || { cat "$tmpdir/expiring-trigger-cleanup.out" >&2; fail "isolated Reader insert delay cleanup failed"; }
drop trigger test_reader_s2_expiring_insert_delay_v1
  on public.standard_reading_reader_access_grants;
drop function public.test_reader_s2_expiring_insert_delay_v1();
drop trigger test_reader_s2_expiring_grant_insert_v1
  on public.entitlement_grants;
drop function public.test_reader_s2_expiring_grant_insert_v1();
SQL
remaining_b5="$(p -c "select
  (select count(*) from public.entitlement_grants where source_receipt_id='$b5_receipt'::uuid)::text
  || '|' || (select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='$b5_intent'::uuid)::text
  || '|' || (select count(*) from public.standard_reading_official_bindings where reading_id='$new_reading'::uuid)::text;")"
[[ "$remaining_b5" == '0|0|0' ]] ||
  fail "expired combined purchase failed to roll back its Grant, Reader access and official Reading: $remaining_b5"
pass "new Reader bind rolls back Receipt Grant and Reading after expiry during access INSERT"



# Actual PortOne verified cancellation BEFORE any Grant/access exists.
# The original B5 receipt has no purchase Grant (the expiry-path transaction
# rolled back). Its payment attempt was seeded before intent verification.
[[ "$(p -c "select count(*) from public.commerce_payment_attempts
  where purchase_intent_id='$b5_intent'::uuid
    and provider_request_id='synthetic-portone-b5-payment';")" == 1 ]] ||
  fail "no-Grant original verified payment attempt missing"
b5_amount="$(p -c "select verified_amount_minor from public.commerce_receipts where id='$b5_receipt'::uuid;")"
[[ "$b5_amount" =~ ^[1-9][0-9]*$ ]] || fail "no-Grant payment amount missing"
cancelled_at="$(p -c "select pg_catalog.to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
p >"$tmpdir/no-grant-cancel-holder.out" 2>&1 <<SQL &
set application_name='rr_s2_no_grant_cancel_holder';
set statement_timeout='20s';
begin;
set local role myeongha_commerce_internal_executor;
select 'NO_GRANT_CANCEL=' ||
  (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
    'synthetic-portone-b5-payment',
    'tx-official-reader-b5-new-revision',
    'synthetic-b5-no-grant-cancel',
    '$cancelled_at'::timestamptz,
    $b5_amount,'KRW','production',
    'hmac-sha256:k1:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    'synthetic-verified-no-grant-v1'
  )->'revoke'->>'disposition');
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "no-Grant verified cancellation holds purchase transaction" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_s2_no_grant_cancel_holder'
    and state='active' and wait_event_type='Timeout';
"
p >"$tmpdir/no-grant-issuance-loser.out" 2>&1 <<SQL &
set application_name='rr_s2_no_grant_issuance_loser';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_apply_verified_reader_purchase_under_scope_v1(
  '$subject'::uuid,'$new_reading'::uuid,'test-standard-reader',
  '$b5_receipt'::uuid,'$b5_intent'::uuid,
  array['test-reader-unit'],array[transaction_timestamp()],
  array[transaction_timestamp()],array[null]::timestamptz[],
  array[null]::text[],
  '12193000-0000-0000-0000-000000000005'::uuid,
  '$new_reading'::uuid,
  'sha256:v1:8888888888888888888888888888888888888888888888888888888888888888',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$b5_intent"}'::jsonb
);
commit;
SQL
writer_pid=$!
wait_for "unbound purchase issuance blocked behind verified no-Grant cancellation" "
  select count(distinct a.pid) from pg_catalog.pg_stat_activity a
  join pg_catalog.pg_locks l on l.pid=a.pid
  where a.application_name='rr_s2_no_grant_issuance_loser'
    and a.wait_event_type='Lock' and l.locktype='advisory' and not l.granted;
"
if ! wait "$holder_pid"; then
  cat "$tmpdir/no-grant-cancel-holder.out" >&2
  fail "verified unbound no-Grant cancellation failed"
fi
holder_pid=""
grep -qx 'NO_GRANT_CANCEL=cancelled_before_grant'   "$tmpdir/no-grant-cancel-holder.out" ||
  fail "verified cancellation did not commit no-Grant disposition"
if wait "$writer_pid"; then
  fail "Reader grant issuance incorrectly succeeded after completed cancellation"
fi
writer_pid=""
grep -q 'production verified Receipt authority is unavailable'   "$tmpdir/no-grant-issuance-loser.out" || {
    cat "$tmpdir/no-grant-issuance-loser.out" >&2
    fail "Reader issuance after cancel denied for unexpected reason"
  }
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$b5_receipt'::uuid;")" == revoked ]] ||
  fail "pre-Grant PortOne cancellation did not revoke canonical Receipt"
[[ "$(p -c "select count(*) from public.entitlement_grants
  where source_receipt_id='$b5_receipt'::uuid;")" == 0 ]] ||
  fail "cancelled no-Grant Receipt still issued purchase entitlement"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b5_intent'::uuid;")" == 0 ]] ||
  fail "cancelled no-Grant purchase created Reader access"
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings
  where reading_id='$new_reading'::uuid;")" == 0 ]] ||
  fail "cancelled no-Grant purchase created official Reading"
[[ "$(p -c "select count(*) from public.commerce_provider_events
  where external_event_id='myeongha:portone-v2:full-cancel:v1:synthetic-b5-no-grant-cancel'
    and resolved_receipt_id='$b5_receipt'::uuid;")" == 1 ]] ||
  fail "no-Grant cancelled provider evidence not stored exactly once"
p >"$tmpdir/no-grant-replay.out" 2>&1 <<SQL || { cat "$tmpdir/no-grant-replay.out" >&2; fail "verified no-Grant cancellation replay failed"; }
begin;
set local role myeongha_commerce_internal_executor;
select (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'synthetic-portone-b5-payment','tx-official-reader-b5-new-revision',
  'synthetic-b5-no-grant-cancel','$cancelled_at'::timestamptz,
  $b5_amount,'KRW','production',
  'hmac-sha256:k1:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'synthetic-verified-no-grant-v1'
)->'revoke'->>'disposition');
commit;
SQL
grep -qx 'cancelled_before_grant' "$tmpdir/no-grant-replay.out" ||
  fail "idempotent no-Grant PortOne cancellation replay changed disposition"
[[ "$(p -c "select count(*) from public.commerce_provider_events
  where external_event_id='myeongha:portone-v2:full-cancel:v1:synthetic-b5-no-grant-cancel';")" == 1 ]] ||
  fail "no-Grant cancellation replay duplicated provider event"
pass "verified cancellation before Grant serializes actual combined issuance, commits once and prevents Reader binding"



# The previous B5 cancellation had zero Grants. B6 exercises the previously
# HELD state: an original verified PortOne purchase with a committed unbound
# purchase-backed Grant, but no ReaderAccess/official Reading binding.
b6_intent="12192300-0000-0000-0000-000000000006"
b6_receipt="12192000-0000-0000-0000-000000000006"
p >"$tmpdir/b6-unbound-seed.out" 2>&1 <<SQL || { cat "$tmpdir/b6-unbound-seed.out" >&2; fail "B6 unbound issued-Grant fixture failed"; }
begin;
insert into public.purchase_intents(
  id,subject_id,product_offer_id,provider_account_link_id,
  idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
  status,created_at,updated_at,expected_amount_minor,expected_currency,
  charge_terms_version,capability_set_id,capability_snapshot_jsonb,
  capability_snapshot_hash
)
select '$b6_intent'::uuid,subject_id,product_offer_id,provider_account_link_id,
       'reader-b6-unbound-issued','sha256:test:reader-b6-unbound-issued',
       offer_snapshot_jsonb,offer_snapshot_hash,'created',
       clock_timestamp(),clock_timestamp(),expected_amount_minor,
       expected_currency,charge_terms_version,capability_set_id,
       capability_snapshot_jsonb,capability_snapshot_hash
from public.purchase_intents where id='$b5_intent'::uuid;
insert into public.purchase_intent_reader_selections(
  purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
  selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select '$b6_intent'::uuid,product_id,reader_character_id,
       reader_content_bundle_id,selection_contract_version,
       selection_snapshot_jsonb,'sha256:test:reader-b6-selection',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='$b5_intent'::uuid;
insert into public.commerce_payment_attempts(
  id,purchase_intent_id,subject_id,product_offer_id,attempt_no,
  provider,environment,idempotency_key,provider_request_id,
  provider_transaction_id,status,created_at,updated_at
)
select '12197000-0000-0000-0000-000000000006'::uuid,
       pi.id,pi.subject_id,pi.product_offer_id,1,
       'portone_v2','production','synthetic-b6-issued-request',
       'synthetic-portone-b6-payment','tx-official-reader-b6-unbound-issued',
       'response_received',clock_timestamp(),clock_timestamp()
from public.purchase_intents pi where pi.id='$b6_intent'::uuid;
update public.purchase_intents
set status='verified',updated_at=clock_timestamp()
where id='$b6_intent'::uuid;
insert into public.commerce_receipts(
  id,subject_id,purchase_intent_id,product_offer_id,platform,provider,
  external_transaction_id,receipt_fingerprint,verification_status,
  verified_payload_jsonb,verified_at,created_at,environment,
  verifier_revision,verified_amount_minor,verified_currency
)
select '$b6_receipt'::uuid,subject_id,'$b6_intent'::uuid,product_offer_id,
       platform,provider,'tx-official-reader-b6-unbound-issued',
       'hmac-sha256:k1:abababababababababababababababababababababababababababababababab',
       'verified',verified_payload_jsonb,clock_timestamp(),
       clock_timestamp(),environment,verifier_revision,
       verified_amount_minor,verified_currency
from public.commerce_receipts where id='$b5_receipt'::uuid;
commit;
SQL
p >"$tmpdir/b6-receipt-grant.out" 2>&1 <<SQL || { cat "$tmpdir/b6-receipt-grant.out" >&2; fail "direct S1-locked 1090 B6 issuance failed"; }
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select pg_catalog.set_config('myeongha.reader_pending_reading_id','$new_reading',true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid,'$new_reading'::uuid,'test-standard-reader'
);
select result_grant_id
from public.internal_apply_verified_receipt_capability_effects_v1(
  '$b6_receipt'::uuid,array['test-reader-unit'],
  array[transaction_timestamp()],array[transaction_timestamp()],
  array[null]::timestamptz[],array[null]::text[]
);
commit;
SQL
b6_grant="$(p -c "select eg.id from public.entitlement_grants eg
where eg.source_receipt_id='$b6_receipt'::uuid and eg.status='active'
  and eg.grant_source_type='purchase';")"
[[ "$b6_grant" =~ ^[0-9a-f-]{36}$ ]] ||
  fail "unbound B6 must have one committed active purchase Grant"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b6_intent'::uuid;")" == 0 ]] ||
  fail "B6 must be unbound before cancellation"

# Existing direct 1080 provider effects must NOT gain a new bypass simply
# because they target an unbound Grant. A held PURCHASE lock plus a matching
# verified-cancellation context is required by the forward 1880 guard.
if p >"$tmpdir/b6-direct-bypass.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_assert_reader_grant_scopes_prelocked_v1('$b6_grant'::uuid);
rollback;
SQL
then
  fail "direct unbound legacy Grant revoke bypassed purchase lock"
fi
grep -q 'Reader purchase Grant cannot be mutated without an official Reader access scope' \
  "$tmpdir/b6-direct-bypass.out" ||
  fail "unbound legacy Grant guard denied for wrong reason"
pass "unbound direct 1080 remains denied outside verified purchase-locked cancellation"

b6_amount="$(p -c "select verified_amount_minor from public.commerce_receipts where id='$b6_receipt'::uuid;")"
b6_cancel_at="$(p -c "select pg_catalog.to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
p >"$tmpdir/b6-cancel-first.out" 2>&1 <<SQL &
set application_name='rr_s2_issued_unbound_cancel_holder';
set statement_timeout='20s';
begin;
set local role myeongha_commerce_internal_executor;
select 'ISSUED_CANCEL=' ||
  (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
    'synthetic-portone-b6-payment',
    'tx-official-reader-b6-unbound-issued',
    'synthetic-b6-unbound-full-cancel',
    '$b6_cancel_at'::timestamptz,
    $b6_amount,'KRW','production',
    'hmac-sha256:k1:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
    'synthetic-verified-b6-v1'
  )->'revoke'->>'disposition');
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "unbound issued Grant revocation holds DB transaction" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_s2_issued_unbound_cancel_holder'
    and state='active' and wait_event_type='Timeout';
"
# The direct 1220 binder is NOT covered by the purchase lock. It must wait
# on the exact 1080 Grant FOR UPDATE row held by the live cancellation.
p >"$tmpdir/b6-direct-bind-loser.out" 2>&1 <<SQL &
set application_name='rr_s2_issued_unbound_bind_loser';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select replayed from public.cmd_bind_standard_reading_access_v2(
  '$subject'::uuid,'$b6_intent'::uuid,
  '12193000-0000-0000-0000-000000000006'::uuid,
  '$new_reading'::uuid,
  'sha256:v1:9999999999999999999999999999999999999999999999999999999999999999',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$b6_intent"}'::jsonb
);
commit;
SQL
writer_pid=$!
wait_for "direct 1220 bound access writer waits on unbound Grant revoke" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_s2_issued_unbound_bind_loser'
    and state='active' and wait_event_type='Lock';
"
if ! wait "$holder_pid"; then
  cat "$tmpdir/b6-cancel-first.out" >&2
  fail "issued-unbound verified PortOne cancellation failed"
fi
holder_pid=""
grep -qx 'ISSUED_CANCEL=cancelled_before_binding' \
  "$tmpdir/b6-cancel-first.out" ||
  fail "issued unbound cancellation returned wrong disposition"
if wait "$writer_pid"; then
  fail "direct Reader bind created new access after a revoked unbound purchase"
fi
writer_pid=""
grep -q 'Entitlement Grant' "$tmpdir/b6-direct-bind-loser.out" ||
  { cat "$tmpdir/b6-direct-bind-loser.out" >&2; fail "direct 1220 failed for unrelated reason"; }
[[ "$(p -c "select status from public.entitlement_grants where id='$b6_grant'::uuid;")" == revoked ]] ||
  fail "issued-unbound verified cancellation did not revoke real Grant"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$b6_receipt'::uuid;")" == revoked ]] ||
  fail "issued-unbound verified cancellation did not revoke Receipt"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b6_intent'::uuid;")" == 0 ]] ||
  fail "issued-unbound cancellation still allowed Reader Access"
b6_event_count="$(p -c "select count(*) from public.entitlement_events ee
  join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
  where ee.grant_id='$b6_grant'::uuid
    and pe.external_event_id='myeongha:portone-v2:full-cancel:v1:synthetic-b6-unbound-full-cancel'
    and ee.event_type='revoked';")"
[[ "$b6_event_count" == 1 ]] ||
  fail "issued-unbound cancellation did not use exactly one authoritative Entitlement Event"
# Replay the same proof without double-revoking or changing the grant revision.
b6_revision="$(p -c "select revision from public.entitlement_grants where id='$b6_grant'::uuid;")"
p >"$tmpdir/b6-replay.out" 2>&1 <<SQL || { cat "$tmpdir/b6-replay.out" >&2; fail "issued-unbound cancellation replay failed"; }
begin;
set local role myeongha_commerce_internal_executor;
select (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'synthetic-portone-b6-payment','tx-official-reader-b6-unbound-issued',
  'synthetic-b6-unbound-full-cancel','$b6_cancel_at'::timestamptz,
  $b6_amount,'KRW','production',
  'hmac-sha256:k1:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
  'synthetic-verified-b6-v1'
)->'revoke'->>'disposition');
commit;
SQL
grep -qx 'cancelled_before_binding' "$tmpdir/b6-replay.out" ||
  fail "issued-unbound cancellation replay did not preserve disposition"
[[ "$(p -c "select revision from public.entitlement_grants where id='$b6_grant'::uuid;")" == "$b6_revision" ]] ||
  fail "idempotent unbound cancellation changed Grant revision"
[[ "$(p -c "select count(*) from public.entitlement_events ee
  join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
  where ee.grant_id='$b6_grant'::uuid
    and pe.external_event_id='myeongha:portone-v2:full-cancel:v1:synthetic-b6-unbound-full-cancel'
    and ee.event_type='revoked';")" == 1 ]] ||
  fail "issued-unbound replay duplicated Entitlement Event"
pass "issued unbound Reader Grant cancels via existing Commerce effects, blocks direct bind and replays exactly once"



# Opposite interleaving: the direct 1220 binder owns the issued B7 Grant
# BEFORE the verified cancellation can lock it. The unbound cancel path
# MUST NOT take a late S1 scope lock after Receipt/Grant rows. It aborts,
# and a new verified cancellation retry follows the ordinary bound 1770 path.
b7_intent="12192300-0000-0000-0000-000000000007"
b7_receipt="12192000-0000-0000-0000-000000000007"
b7_reading="12103100-0000-0000-0000-000000000007"
p >"$tmpdir/b7-seed.out" 2>&1 <<SQL || { cat "$tmpdir/b7-seed.out" >&2; fail "B7 binder-first fixture failed"; }
begin;
insert into public.purchase_intents(
  id,subject_id,product_offer_id,provider_account_link_id,
  idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
  status,created_at,updated_at,expected_amount_minor,expected_currency,
  charge_terms_version,capability_set_id,capability_snapshot_jsonb,
  capability_snapshot_hash
)
select '$b7_intent'::uuid,subject_id,product_offer_id,provider_account_link_id,
       'reader-b7-bind-first','sha256:test:reader-b7-bind-first',
       offer_snapshot_jsonb,offer_snapshot_hash,'created',
       clock_timestamp(),clock_timestamp(),expected_amount_minor,
       expected_currency,charge_terms_version,capability_set_id,
       capability_snapshot_jsonb,capability_snapshot_hash
from public.purchase_intents where id='$b6_intent'::uuid;
insert into public.purchase_intent_reader_selections(
  purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
  selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select '$b7_intent'::uuid,product_id,reader_character_id,
       reader_content_bundle_id,selection_contract_version,
       selection_snapshot_jsonb,'sha256:test:reader-b7-selection',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='$b6_intent'::uuid;
insert into public.commerce_payment_attempts(
  id,purchase_intent_id,subject_id,product_offer_id,attempt_no,
  provider,environment,idempotency_key,provider_request_id,
  provider_transaction_id,status,created_at,updated_at
)
select '12197000-0000-0000-0000-000000000007'::uuid,
       pi.id,pi.subject_id,pi.product_offer_id,1,
       'portone_v2','production','synthetic-b7-bind-first-request',
       'synthetic-portone-b7-payment','tx-official-reader-b7-bind-first',
       'response_received',clock_timestamp(),clock_timestamp()
from public.purchase_intents pi where pi.id='$b7_intent'::uuid;
update public.purchase_intents
set status='verified',updated_at=clock_timestamp()
where id='$b7_intent'::uuid;
insert into public.commerce_receipts(
  id,subject_id,purchase_intent_id,product_offer_id,platform,provider,
  external_transaction_id,receipt_fingerprint,verification_status,
  verified_payload_jsonb,verified_at,created_at,environment,
  verifier_revision,verified_amount_minor,verified_currency
)
select '$b7_receipt'::uuid,subject_id,'$b7_intent'::uuid,product_offer_id,
       platform,provider,'tx-official-reader-b7-bind-first',
       'hmac-sha256:k1:bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc',
       'verified',verified_payload_jsonb,clock_timestamp(),
       clock_timestamp(),environment,verifier_revision,
       verified_amount_minor,verified_currency
from public.commerce_receipts where id='$b6_receipt'::uuid;
commit;
SQL
p >"$tmpdir/b7-issue.out" 2>&1 <<SQL || { cat "$tmpdir/b7-issue.out" >&2; fail "B7 pre-bind grant issuance failed"; }
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select pg_catalog.set_config('myeongha.reader_pending_reading_id','$b7_reading',true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid,'$b7_reading'::uuid,'test-standard-reader'
);
select result_grant_id
from public.internal_apply_verified_receipt_capability_effects_v1(
  '$b7_receipt'::uuid,array['test-reader-unit'],
  array[transaction_timestamp()],array[transaction_timestamp()],
  array[null]::timestamptz[],array[null]::text[]
);
commit;
SQL
b7_grant="$(p -c "select id from public.entitlement_grants
  where source_receipt_id='$b7_receipt'::uuid and status='active';")"
[[ "$b7_grant" =~ ^[0-9a-f-]{36}$ ]] ||
  fail "B7 direct binding initial Grant missing"
b7_amount="$(p -c "select verified_amount_minor from public.commerce_receipts where id='$b7_receipt'::uuid;")"
b7_cancel_at="$(p -c "select pg_catalog.to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
p >"$tmpdir/b7-bind-first.out" 2>&1 <<SQL &
set application_name='rr_s2_b7_bind_first';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select 'B7_BIND='||reading_id::text
from public.cmd_bind_standard_reading_access_v2(
  '$subject'::uuid,'$b7_intent'::uuid,
  '12193000-0000-0000-0000-000000000007'::uuid,
  '$b7_reading'::uuid,
  'sha256:v1:abababababababababababababababababababababababababababababababab',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$b7_intent"}'::jsonb
);
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "B7 direct Reader binder first holds the Grant row" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_s2_b7_bind_first'
    and state='active' and wait_event_type='Timeout';
"
p >"$tmpdir/b7-unbound-cancel-loser.out" 2>&1 <<SQL &
set application_name='rr_s2_b7_cancel_after_bind';
set statement_timeout='20s';
begin;
set local role myeongha_commerce_internal_executor;
select (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'synthetic-portone-b7-payment',
  'tx-official-reader-b7-bind-first',
  'synthetic-b7-bound-transition',
  '$b7_cancel_at'::timestamptz,
  $b7_amount,'KRW','production',
  'hmac-sha256:k1:dededededededededededededededededededededededededededededededede',
  'synthetic-verified-b7-v1'
)->'revoke'->>'disposition');
commit;
SQL
writer_pid=$!
wait_for "unbound refund waits for B7 direct 1220 Grant lock" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_s2_b7_cancel_after_bind'
    and state='active' and wait_event_type='Lock';
"
if ! wait "$holder_pid"; then
  cat "$tmpdir/b7-bind-first.out" >&2
  fail "B7 direct Reader binding first did not commit"
fi
holder_pid=""
grep -qx "B7_BIND=$b7_reading" "$tmpdir/b7-bind-first.out" ||
  fail "B7 direct Reader binding created wrong Reading"
if wait "$writer_pid"; then
  fail "unbound cancellation proceeded after concurrently committed Reader binding"
fi
writer_pid=""
grep -q 'Reader binding completed during cancellation lock wait' \
  "$tmpdir/b7-unbound-cancel-loser.out" ||
  { cat "$tmpdir/b7-unbound-cancel-loser.out" >&2; fail "B7 transitioned cancellation failed for wrong reason"; }
[[ "$(p -c "select status from public.entitlement_grants where id='$b7_grant'::uuid;")" == active ]] ||
  fail "aborted B7 cancellation mutated an already bound Grant"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$b7_receipt'::uuid;")" == verified ]] ||
  fail "aborted B7 cancellation revoked original Receipt"
# Verify the next legitimate full cancel switches to the bound S1 path.
p >"$tmpdir/b7-bound-retry.out" 2>&1 <<SQL || { cat "$tmpdir/b7-bound-retry.out" >&2; fail "B7 retry under committed bound S1 failed"; }
begin;
set local role myeongha_commerce_internal_executor;
select (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'synthetic-portone-b7-payment','tx-official-reader-b7-bind-first',
  'synthetic-b7-bound-transition','$b7_cancel_at'::timestamptz,
  $b7_amount,'KRW','production',
  'hmac-sha256:k1:dededededededededededededededededededededededededededededededede',
  'synthetic-verified-b7-v1'
)->'revoke'->>'contractVersion');
commit;
SQL
grep -qx 'official-reader-s2-revoke-dispatch-v1' "$tmpdir/b7-bound-retry.out" ||
  fail "B7 retry did not dispatch through bound Reader lifecycle"
[[ "$(p -c "select status from public.entitlement_grants where id='$b7_grant'::uuid;")" == revoked ]] ||
  fail "B7 retry did not revoke bound purchase Grant"
pass "Reader bind-first forces unbound refund rollback; verified retry uses bound S1 lifecycle"



# Multi-Receipt, same purchase intent: PortOne proof is per ORIGINAL payment
# attempt and Receipt, not per purchase. Receipt A refund MUST leave B's paid
# Grant untouched while a new C Receipt is issued in another DB session.
b8_intent="12192300-0000-0000-0000-000000000008"
# B7 already committed the current official Reading for this Birth revision.
# Additional Receipt effects MUST prelock that exact current Reading, not an
# arbitrary second proposed identity for the same Subject/Product revision.
b8_reading="$b7_reading"
b8_receipt_a="12192000-0000-0000-0000-000000000008"
b8_receipt_b="12192000-0000-0000-0000-000000000009"
b8_receipt_c="12192000-0000-0000-0000-000000000010"
p >"$tmpdir/b8-three-receipts.out" 2>&1 <<SQL || { cat "$tmpdir/b8-three-receipts.out" >&2; fail "same purchase multi-Receipt seed failed"; }
begin;
insert into public.purchase_intents(
  id,subject_id,product_offer_id,provider_account_link_id,
  idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
  status,created_at,updated_at,expected_amount_minor,expected_currency,
  charge_terms_version,capability_set_id,capability_snapshot_jsonb,
  capability_snapshot_hash
)
select '$b8_intent'::uuid,subject_id,product_offer_id,provider_account_link_id,
       'reader-b8-multi-receipt','sha256:test:reader-b8-multi-receipt',
       offer_snapshot_jsonb,offer_snapshot_hash,'created',
       clock_timestamp(),clock_timestamp(),expected_amount_minor,
       expected_currency,charge_terms_version,capability_set_id,
       capability_snapshot_jsonb,capability_snapshot_hash
from public.purchase_intents where id='$b7_intent'::uuid;
insert into public.purchase_intent_reader_selections(
  purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
  selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select '$b8_intent'::uuid,product_id,reader_character_id,
       reader_content_bundle_id,selection_contract_version,
       selection_snapshot_jsonb,'sha256:test:reader-b8-selection',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='$b7_intent'::uuid;
insert into public.commerce_payment_attempts(
  id,purchase_intent_id,subject_id,product_offer_id,attempt_no,
  provider,environment,idempotency_key,provider_request_id,
  provider_transaction_id,status,created_at,updated_at
)
select x.attempt_id::uuid,pi.id,pi.subject_id,pi.product_offer_id,x.attempt_no,
  'portone_v2','production',x.idempotency_key,x.payment_id,x.transaction_id,
  'response_received',clock_timestamp(),clock_timestamp()
from public.purchase_intents pi
cross join (values
  ('12197000-0000-0000-0000-000000000008',1,'reader-b8-attempt-a','b8-payment-a','tx-reader-b8-a'),
  ('12197000-0000-0000-0000-000000000009',2,'reader-b8-attempt-b','b8-payment-b','tx-reader-b8-b'),
  ('12197000-0000-0000-0000-000000000010',3,'reader-b8-attempt-c','b8-payment-c','tx-reader-b8-c'),
  ('12197000-0000-0000-0000-000000000011',4,'reader-b8-attempt-d','b8-payment-d','tx-reader-b8-d')
) as x(attempt_id,attempt_no,idempotency_key,payment_id,transaction_id)
where pi.id='$b8_intent'::uuid;
update public.purchase_intents
set status='verified',updated_at=clock_timestamp()
where id='$b8_intent'::uuid;
insert into public.commerce_receipts(
  id,subject_id,purchase_intent_id,product_offer_id,platform,provider,
  external_transaction_id,receipt_fingerprint,verification_status,
  verified_payload_jsonb,verified_at,created_at,environment,
  verifier_revision,verified_amount_minor,verified_currency
)
select x.receipt_id::uuid,cr.subject_id,'$b8_intent'::uuid,cr.product_offer_id,
       cr.platform,cr.provider,x.transaction_id,
       x.fingerprint,'verified',cr.verified_payload_jsonb,clock_timestamp(),
       clock_timestamp(),cr.environment,cr.verifier_revision,
       cr.verified_amount_minor,cr.verified_currency
from public.commerce_receipts cr
cross join (values
  ('$b8_receipt_a','tx-reader-b8-a','hmac-sha256:k1:8181818181818181818181818181818181818181818181818181818181818181'),
  ('$b8_receipt_b','tx-reader-b8-b','hmac-sha256:k1:8282828282828282828282828282828282828282828282828282828282828282'),
  ('$b8_receipt_c','tx-reader-b8-c','hmac-sha256:k1:8383838383838383838383838383838383838383838383838383838383838383'),
  ('12192000-0000-0000-0000-000000000011','tx-reader-b8-d','hmac-sha256:k1:8989898989898989898989898989898989898989898989898989898989898989')
) as x(receipt_id,transaction_id,fingerprint)
where cr.id='$b7_receipt'::uuid;
commit;
SQL
# Direct receipt issuer is allowed only after SAME S1 scope acquisition.
for receipt in "$b8_receipt_a" "$b8_receipt_b"; do
  p >"$tmpdir/b8-issued-$receipt.out" 2>&1 <<SQL || { cat "$tmpdir/b8-issued-$receipt.out" >&2; fail "multi-Receipt separate Grant issuance failed"; }
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select pg_catalog.set_config('myeongha.reader_pending_reading_id','$b8_reading',true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid,'$b8_reading'::uuid,'test-standard-reader'
);
select result_grant_id
from public.internal_apply_verified_receipt_capability_effects_v1(
  '$receipt'::uuid,array['test-reader-unit'],
  array[transaction_timestamp()],array[transaction_timestamp()],
  array[null]::timestamptz[],array[null]::text[]
);
commit;
SQL
done
b8_grant_a="$(p -c "select id from public.entitlement_grants
  where source_receipt_id='$b8_receipt_a'::uuid;")"
b8_grant_b="$(p -c "select id from public.entitlement_grants
  where source_receipt_id='$b8_receipt_b'::uuid;")"
[[ "$b8_grant_a" =~ ^[0-9a-f-]{36}$ && "$b8_grant_b" =~ ^[0-9a-f-]{36}$ &&
    "$b8_grant_a" != "$b8_grant_b" ]] ||
  fail "multi-Receipt synthetic purchase must have TWO separate Grant lineages"

# Set up a database-enforced synthetic B access binding to reproduce the
# same-purchase two-Receipt state. B's source Receipt is independent from A.
# The true direct-1220 bind/race path is exercised separately by B7 above.
p >"$tmpdir/b8-bind-sibling-b.out" 2>&1 <<SQL || { cat "$tmpdir/b8-bind-sibling-b.out" >&2; fail "independent sibling Receipt B binding fixture failed"; }
begin;
insert into public.standard_reading_reader_access_grants(
  purchase_intent_id,subject_id,official_reading_id,reader_character_id,
  reader_content_bundle_id,entitlement_grant_id,reader_selection_hash,
  access_role,access_contract_version,request_contract_version,
  request_hash,created_at
)
select s.purchase_intent_id,cr.subject_id,'$b8_reading'::uuid,
       s.reader_character_id,s.reader_content_bundle_id,'$b8_grant_b'::uuid,
       s.selection_hash,'additional_reader','standard-reading-reader-access-v1',
       'standard-reading-access-bind-v2',
       'sha256:v1:abababababababababababababababababababababababababababababababab',
       clock_timestamp()
from public.purchase_intent_reader_selections s
join public.commerce_receipts cr on cr.purchase_intent_id=s.purchase_intent_id
where s.purchase_intent_id='$b8_intent'::uuid
  and cr.id='$b8_receipt_b'::uuid;
commit;
SQL
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where entitlement_grant_id='$b8_grant_b'::uuid
    and purchase_intent_id='$b8_intent'::uuid;")" == 1 ]] ||
  fail "sibling B must have one DB-constrained Reader access binding"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
  where entitlement_grant_id='$b8_grant_a'::uuid;")" == 0 ]] ||
  fail "cancel target A must remain unbound while sibling B is bound"
pass "independent sibling Receipt B bound in synthetic DB state; exact target A unbound"

# A sibling payment request must NOT authorize cancelling receipt A.
b8_amount="$(p -c "select verified_amount_minor from public.commerce_receipts where id='$b8_receipt_a'::uuid;")"
b8_cancel_at="$(p -c "select pg_catalog.to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
if p >"$tmpdir/b8-wrong-attempt.out" 2>&1 <<SQL
begin;
set local role myeongha_commerce_internal_executor;
select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'b8-payment-b','tx-reader-b8-a',
  'b8-cross-attempt-forbidden','$b8_cancel_at'::timestamptz,
  $b8_amount,'KRW','production',
  'hmac-sha256:k1:8484848484848484848484848484848484848484848484848484848484848484',
  'synthetic-b8-cross-check-v1'
);
commit;
SQL
then
  fail "sibling PortOne attempt incorrectly authorized cancellation of original Receipt A"
fi
grep -q 'PortOne cancellation is not linked to an original verified Receipt' \
  "$tmpdir/b8-wrong-attempt.out" ||
  fail "cross-payment attempt rejected for unexpected reason"
[[ "$(p -c "select status from public.entitlement_grants where id='$b8_grant_a'::uuid;")" == active ]] ||
  fail "failed cross-payment cancellation still mutated exact Receipt A Grant"

# A full cancel of A runs while verified C's independent receipt issues a
# NEW Grant for the same purchase. Both retain separate receipt authority.
p >"$tmpdir/b8-cancel-a-holder.out" 2>&1 <<SQL &
set application_name='rr_s2_b8_cancel_exact_receipt';
set statement_timeout='20s';
begin;
set local role myeongha_commerce_internal_executor;
select 'B8_CANCEL=' ||
  (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
    'b8-payment-a','tx-reader-b8-a',
    'b8-cancel-exact-a','$b8_cancel_at'::timestamptz,
    $b8_amount,'KRW','production',
    'hmac-sha256:k1:8585858585858585858585858585858585858585858585858585858585858585',
    'synthetic-b8-exact-receipt-v1'
  )->'revoke'->>'disposition');
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "B8 exact Receipt A cancellation holds committed Grant effects" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_s2_b8_cancel_exact_receipt'
    and state='active' and wait_event_type='Timeout';
"
p >"$tmpdir/b8-issue-c.out" 2>&1 <<SQL &
set application_name='rr_s2_b8_issue_other_receipt';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select pg_catalog.set_config('myeongha.reader_pending_reading_id','$b8_reading',true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid,'$b8_reading'::uuid,'test-standard-reader'
);
select result_grant_id
from public.internal_apply_verified_receipt_capability_effects_v1(
  '$b8_receipt_c'::uuid,array['test-reader-unit'],
  array[transaction_timestamp()],array[transaction_timestamp()],
  array[null]::timestamptz[],array[null]::text[]
);
commit;
SQL
writer_pid=$!
if ! wait "$holder_pid"; then
  cat "$tmpdir/b8-cancel-a-holder.out" >&2
  fail "exact first Receipt cancellation failed with sibling Grants"
fi
holder_pid=""
grep -qx 'B8_CANCEL=cancelled_before_binding' \
  "$tmpdir/b8-cancel-a-holder.out" ||
  fail "multi-Receipt cancellation returned wrong disposition"
if ! wait "$writer_pid"; then
  cat "$tmpdir/b8-issue-c.out" >&2
  fail "concurrent sibling Receipt C issuance should retain independent rights"
fi
writer_pid=""
b8_grant_c="$(p -c "select id from public.entitlement_grants
  where source_receipt_id='$b8_receipt_c'::uuid;")"
[[ "$b8_grant_c" =~ ^[0-9a-f-]{36}$ ]] ||
  fail "sibling Receipt C did not retain new purchase Grant"
[[ "$(p -c "select status from public.entitlement_grants where id='$b8_grant_a'::uuid;")" == revoked ]] ||
  fail "Receipt A Grant was not revoked"
[[ "$(p -c "select status from public.entitlement_grants where id='$b8_grant_b'::uuid;")" == active ]] ||
  fail "independent Receipt B Grant incorrectly revoked"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants a
  join public.entitlement_grants eg on eg.id=a.entitlement_grant_id
  where eg.source_receipt_id='$b8_receipt_b'::uuid
    and a.entitlement_grant_id='$b8_grant_b'::uuid
    and eg.status='active';")" == 1 ]] ||
  fail "sibling B Reader binding/active Grant lost after cancelling A"
[[ "$(p -c "select status from public.entitlement_grants where id='$b8_grant_c'::uuid;")" == active ]] ||
  fail "independent newly issued Receipt C Grant incorrectly revoked"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$b8_receipt_a'::uuid;")" == revoked ]] ||
  fail "target Receipt A cancellation not persisted"
[[ "$(p -c "select count(*) from public.commerce_receipts where id in
  ('$b8_receipt_b'::uuid,'$b8_receipt_c'::uuid) and verification_status='verified';")" == 2 ]] ||
  fail "sibling Receipts were incorrectly cancelled"
[[ "$(p -c "select count(*) from public.entitlement_events ee
  join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
  where ee.grant_id='$b8_grant_a'::uuid
    and pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-exact-a'
    and ee.event_type='revoked';")" == 1 ]] ||
  fail "original Receipt A must record one authoritative revoked effect"
[[ "$(p -c "select count(*) from public.entitlement_events ee
  join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
  where ee.grant_id in ('$b8_grant_b'::uuid,'$b8_grant_c'::uuid)
    and pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-exact-a';")" == 0 ]] ||
  fail "original Receipt A event incorrectly changed sibling Grants"
pass "multi-Receipt verified PortOne cancel targets only exact payment/Receipt; sibling Grant issuance survives race"

# Same purchase B remains bound, A already cancelled, C independently active.
# The fourth original payment/Receipt D was seeded before the Purchase became
# verified; no prohibited late new payment attempt is created.
# Verify an additional Receipt D with ZERO issued Grants can be fully cancelled
# without choosing B's access scope or touching any of B/C's entitlements.
b8_receipt_d="12192000-0000-0000-0000-000000000011"
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='$b8_receipt_d'::uuid;")" == 0 ]] ||
  fail "B8 exact D must not have any Grant before full cancellation"
b8_d_at="$(p -c "select pg_catalog.to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
# Lock-timeout is a legitimate losing purchase/cancellation interleaving.
# Assert the timed-out attempt leaves no provider event or changed Receipt.
p >"$tmpdir/b8-d-purchase-holder.out" 2>&1 <<SQL &
set application_name='rr_s2_b8_d_purchase_holder';
set statement_timeout='20s';
begin;
select public.internal_acquire_official_reader_purchase_lock_v1(
 '$b8_intent'::uuid
);
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "B8 D purchase lock held independently" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_b8_d_purchase_holder'
 and state='active' and wait_event_type='Timeout';
"
if p >"$tmpdir/b8-d-timeout.out" 2>&1 <<SQL
set application_name='rr_s2_b8_d_cancel_timeout';
begin;
set local lock_timeout='150ms';
set local role myeongha_commerce_internal_executor;
select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'b8-payment-d','tx-reader-b8-d','b8-cancel-exact-zero-d',
 '$b8_d_at'::timestamptz,$b8_amount,'KRW','production',
 'hmac-sha256:k1:9090909090909090909090909090909090909090909090909090909090909090',
 'synthetic-b8-zero-grant-cancel-v1'
);
commit;
SQL
then
 fail "D cancellation bypassed conflicting purchase lock"
fi
grep -q 'canceling statement due to lock timeout' "$tmpdir/b8-d-timeout.out" || {
 cat "$tmpdir/b8-d-timeout.out" >&2
 fail "D cancellation rejected for reason other than purchase lock timeout"
}
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$b8_receipt_d'::uuid;")" == verified ]] ||
 fail "timed-out D cancellation modified original Receipt"
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-exact-zero-d';")" == 0 ]] ||
 fail "timed-out D cancellation committed a provider event"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id in ('$b8_grant_b'::uuid,'$b8_grant_c'::uuid)
 and status='active';")" == 2 ]] ||
 fail "timed-out D cancellation modified sibling B/C"
wait "$holder_pid" || {
 cat "$tmpdir/b8-d-purchase-holder.out" >&2
 fail "purchase holder failed"
}
holder_pid=""
pass "D timeout rolls back without Receipt, provider event or sibling Grant mutation"

for replay in 1 2; do
  outcome="$(p -c "begin; set local role myeongha_commerce_internal_executor;
    select (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
      'b8-payment-d','tx-reader-b8-d','b8-cancel-exact-zero-d',
      '$b8_d_at'::timestamptz,$b8_amount,'KRW','production',
      'hmac-sha256:k1:9090909090909090909090909090909090909090909090909090909090909090',
      'synthetic-b8-zero-grant-cancel-v1'
    )->'revoke'->>'disposition'); commit;")" ||
    fail "verified zero-Grant D cancellation failed with sibling Reader already bound"
  [[ "$(printf '%s\n' "$outcome" | grep -xc 'cancelled_before_grant' || true)" == 1 ]] ||
    fail "verified zero-Grant D cancellation returned wrong disposition: [$outcome]"
done
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$b8_receipt_d'::uuid;")" == revoked ]] ||
  fail "original zero-Grant D Receipt was not revoked"
[[ "$(p -c "select count(*) from public.commerce_provider_events where external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-exact-zero-d';")" == 1 ]] ||
  fail "zero-Grant D cancellation replay duplicated verified event"
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='$b8_receipt_d'::uuid;")" == 0 ]] ||
  fail "zero-Grant D cancellation unexpectedly created entitlement"
[[ "$(p -c "select count(*) from public.entitlement_grants
  where id in ('$b8_grant_b'::uuid,'$b8_grant_c'::uuid)
    and status='active';")" == 2 ]] ||
  fail "zero-Grant D cancellation affected B or C independent entitlements"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where entitlement_grant_id='$b8_grant_b'::uuid;")" == 1 ]] ||
  fail "zero-Grant D cancellation changed sibling B Reader binding"
pass "bound sibling B cannot block zero-Grant Receipt D verified refund/replay; C preserved"




# S2 lock-order cross-over: combined verified issuance / refund owns
# purchase advisory BEFORE scope; standalone direct binder owns scope BEFORE
# the purchase-intent ROW lock. The former MUST NOT lock a purchase ROW
# before obtaining scope or the two live operations could deadlock.
# This is a two-session primitive/row-lock order test, not T2 activation.
p >"$tmpdir/b8-lock-order-scope-row.out" 2>&1 <<SQL &
set application_name='rr_s2_b8_scope_then_purchase_row';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$b8_reading'::uuid,'test-standard-reader'
);
select pg_sleep(3);
select id from public.purchase_intents
 where id='$b8_intent'::uuid for update;
commit;
SQL
holder_pid=$!
wait_for "scope-first Writer holds S1 without purchase row lock" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_b8_scope_then_purchase_row'
 and state='active' and wait_event_type='Timeout';
"
p >"$tmpdir/b8-lock-order-purchase-scope.out" 2>&1 <<SQL &
set application_name='rr_s2_b8_purchase_then_scope';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_purchase_lock_v1(
 '$b8_intent'::uuid
);
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$b8_reading'::uuid,'test-standard-reader'
);
commit;
SQL
writer_pid=$!
wait_for "purchase-first Writer waits on S1 while owning purchase advisory only" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_b8_purchase_then_scope'
 and state='active' and wait_event_type='Lock'
 and wait_event='advisory';
"
wait "$holder_pid" || {
 cat "$tmpdir/b8-lock-order-scope-row.out" >&2
 fail "scope-first Writer unexpectedly deadlocked against purchase advisory"
}
holder_pid=""
wait "$writer_pid" || {
 cat "$tmpdir/b8-lock-order-purchase-scope.out" >&2
 fail "purchase-first Writer unexpectedly deadlocked against scope-first row writer"
}
writer_pid=""
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id in ('$b8_grant_b'::uuid,'$b8_grant_c'::uuid)
 and status='active';")" == 2 ]] ||
 fail "S2 lock order cross-over mutated independent sibling Grants"
pass "two-session purchase advisory->scope vs scope->purchase row finishes without deadlock"

# Independent Reader S1 scopes MUST NOT deadlock when the owner-driven
# list of affected Readers is discovered in opposite natural order: every
# holder locks them in canonical reader order BEFORE touching Grant rows.
# The synthetic second Reader ID is ONLY an advisory-lock key, not an
# actual character, purchased product, or executable paid scope authority.
p >"$tmpdir/b8-multiscope-holder.out" 2>&1 <<SQL &
set application_name='rr_s2_multiscope_order_holder';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$b8_reading'::uuid,'test-a-order-only'
);
select pg_sleep(3);
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$b8_reading'::uuid,'test-z-order-only'
);
commit;
SQL
holder_pid=$!
wait_for "multi-scope holder owns first Reader key" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_multiscope_order_holder'
 and state='active' and wait_event_type='Timeout';
"
# A separate scope must remain available even while the first is held.
if ! p >"$tmpdir/b8-multiscope-unrelated.out" 2>&1 <<SQL
set statement_timeout='20s';
begin;
set local lock_timeout='200ms';
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$b8_reading'::uuid,'test-independent-order-only'
);
commit;
SQL
then
 cat "$tmpdir/b8-multiscope-unrelated.out" >&2
 fail "an unrelated Reader scope waited for the occupied Reader S1"
fi
p >"$tmpdir/b8-multiscope-writer.out" 2>&1 <<SQL &
set application_name='rr_s2_multiscope_order_writer';
set statement_timeout='20s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
do \$ordered_readers\$
declare
 v_reader text;
begin
 -- Input enumeration deliberately Z,A; the acquisition is A,Z.
 for v_reader in
   select reader_character_id from (
     values ('test-z-order-only'),('test-a-order-only')
   ) selected(reader_character_id)
   order by reader_character_id
 loop
   perform public.internal_acquire_official_reader_scope_lock_v1(
     '$subject'::uuid,'$b8_reading'::uuid,v_reader
   );
 end loop;
end
\$ordered_readers\$;
commit;
SQL
writer_pid=$!
wait_for "second multi-scope Writer waits on canonical first Reader" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_multiscope_order_writer'
 and state='active' and wait_event_type='Lock'
 and wait_event='advisory';
"
wait "$holder_pid" || {
 cat "$tmpdir/b8-multiscope-holder.out" >&2
 fail "first multi-scope owner failed"
}
holder_pid=""
wait "$writer_pid" || {
 cat "$tmpdir/b8-multiscope-writer.out" >&2
 fail "sorted multi-scope Reader acquisition deadlocked"
}
writer_pid=""
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id in ('$b8_grant_b'::uuid,'$b8_grant_c'::uuid)
 and status='active';")" == 2 ]] ||
 fail "multi-scope advisory-only rehearsal unexpectedly changed paid Grants"
pass "opposite enumeration converges to globally sorted S1 keys; unrelated Reader S1 proceeds"

# Existing account-deletion finalizer serializes Subject → Job → Outbox
# before removing Reader access. Its account state/lease cannot be invoked
# for a paid-active fixture; hold the SAME Subject-first boundary plus the
# source Grant as a pessimistic finalizer-shaped competing connection.
# Execute the ACTUAL Commerce bound-Receipt cancellation concurrently.
# This checks blocking/atomicity, NOT an approved deletion Worker replay.
b8_b_cancel_at="$(p -c "select pg_catalog.to_char(
 clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
p >"$tmpdir/b8-delete-grant-holder.out" 2>&1 <<SQL &
set application_name='rr_s2_account_delete_subject_then_grant';
set statement_timeout='20s';
begin;
select id from public.subjects where id='$subject'::uuid for update;
select id from public.entitlement_grants
 where id='$b8_grant_b'::uuid for update;
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "account-deletion-shaped Subject→Grant holder active" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_account_delete_subject_then_grant'
 and state='active' and wait_event_type='Timeout';
"
p >"$tmpdir/b8-delete-versus-refund.out" 2>&1 <<SQL &
set application_name='rr_s2_refund_during_account_delete_grant';
set statement_timeout='20s';
begin;
set local role myeongha_commerce_internal_executor;
select 'B_REFUND='||
 (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'b8-payment-b','tx-reader-b8-b',
  'b8-cancel-bound-b-after-account-lock',
  '$b8_b_cancel_at'::timestamptz,$b8_amount,'KRW','production',
  'hmac-sha256:k1:9797979797979797979797979797979797979797979797979797979797979797',
  'synthetic-finalizer-lock-contention-v1'
 )->'revoke'->>'contractVersion');
commit;
SQL
writer_pid=$!
wait_for "verified B refund waits on deletion-shaped Grant lock" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_refund_during_account_delete_grant'
 and state='active' and wait_event_type='Lock';
"
wait "$holder_pid" || {
 cat "$tmpdir/b8-delete-grant-holder.out" >&2
 fail "account-deletion-shaped Subject→Grant holder failed"
}
holder_pid=""
wait "$writer_pid" || {
 cat "$tmpdir/b8-delete-versus-refund.out" >&2
 fail "real verified B refund deadlocked with deletion-shaped Subject→Grant holder"
}
writer_pid=""
grep -q 'B_REFUND=official-reader-s2-revoke-dispatch-v1' "$tmpdir/b8-delete-versus-refund.out" ||
 { cat "$tmpdir/b8-delete-versus-refund.out" >&2; fail "B refund did not use verified bound Reader revoke"; }
[[ "$(p -c "select verification_status from public.commerce_receipts
 where id='$b8_receipt_b'::uuid;")" == revoked ]] ||
 fail "account-deletion contention left B Receipt verified"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id='$b8_grant_b'::uuid and status='revoked';")" == 1 ]] ||
 fail "account-deletion contention failed to revoke exact B Grant"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id='$b8_grant_c'::uuid and status='active';")" == 1 ]] ||
 fail "account-deletion contention mutated independent C Grant"
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-bound-b-after-account-lock';")" == 1 ]] ||
 fail "bound B cancel provider event did not commit exactly once"
pass "live bound-Receipt refund waits for deletion-shaped Subject/Grant lock and preserves sibling rights"


# Exact SAME provider cancellation is concurrently replayed by two real
# DB writer sessions: one event and one EntitlementEvent may be committed.
c_cancel_at="$(p -c "select pg_catalog.to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$b8_receipt_c'::uuid;")" == verified ]] ||
 fail "concurrent same-event C seed is not verified"
p >"$tmpdir/b8-c-first.out" 2>&1 <<SQL &
set application_name='rr_s2_c_event_first';
set statement_timeout='25s';
begin;
set local role myeongha_commerce_internal_executor;
select 'C_FIRST='||(public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'b8-payment-c','tx-reader-b8-c','b8-cancel-concurrent-c',
 '$c_cancel_at'::timestamptz,$b8_amount,'KRW','production',
 'hmac-sha256:k1:9898989898989898989898989898989898989898989898989898989898989898',
 'synthetic-c-same-event-v1')->'revoke'->>'contractVersion');
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "first same-event C writer holds purchase transaction" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_c_event_first' and state='active'
 and wait_event_type='Timeout';
"
p >"$tmpdir/b8-c-replay.out" 2>&1 <<SQL &
set application_name='rr_s2_c_event_replay';
set statement_timeout='25s';
begin;
set local role myeongha_commerce_internal_executor;
select 'C_REPLAY='||(public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'b8-payment-c','tx-reader-b8-c','b8-cancel-concurrent-c',
 '$c_cancel_at'::timestamptz,$b8_amount,'KRW','production',
 'hmac-sha256:k1:9898989898989898989898989898989898989898989898989898989898989898',
 'synthetic-c-same-event-v1')->'revoke'->>'contractVersion');
commit;
SQL
writer_pid=$!
wait_for "same-event C replay waits for purchase advisory" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_c_event_replay' and state='active'
 and wait_event_type='Lock' and wait_event='advisory';
"
wait "$holder_pid" || { cat "$tmpdir/b8-c-first.out" >&2; fail "first C cancellation failed"; }
holder_pid=""
wait "$writer_pid" || { cat "$tmpdir/b8-c-replay.out" >&2; fail "same-event replay failed"; }
writer_pid=""
grep -q 'C_FIRST=official-reader-s2-unbound-grant-cancellation-v1' "$tmpdir/b8-c-first.out" ||
 fail "first C provider event missed unbound verified Grant route"
grep -q 'C_REPLAY=official-reader-s2-unbound-grant-cancellation-v1' "$tmpdir/b8-c-replay.out" ||
 { cat "$tmpdir/b8-c-replay.out" >&2; fail "replay missed unbound verified Grant route"; }
[[ "$(p -c "select count(*) from public.commerce_provider_events where external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c';")" == 1 ]] ||
 fail "duplicate verified event persisted twice"
[[ "$(p -c "select count(*) from public.entitlement_events ev
 join public.commerce_provider_events pe on pe.id=ev.source_provider_event_id
 where pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c'
 and ev.grant_id='$b8_grant_c'::uuid and ev.event_type='revoked';")" == 1 ]] ||
 fail "replay duplicated C Grant effect"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where (id='$b8_grant_c'::uuid or id='$b8_grant_b'::uuid) and status='revoked';")" == 2 ]] ||
 fail "same-event replay revived B or missed C"
[[ "$(p -c "select verification_status from public.commerce_receipts
 where id='$b8_receipt_c'::uuid;")" == revoked ]] ||
 fail "same-event C original Receipt was not revoked"
pass "two live verified C cancellations serialize; exactly one provider and Grant event"


# Distinct older cancellation arriving AFTER the newer C cancellation must
# fail even if it first waits behind a separate same-purchase Writer. The
# aborted provider event must not be persisted or change the revoked Grant.
c_stale_at="$(p -c "select pg_catalog.to_char(
 ('$c_cancel_at'::timestamptz-interval '1 second') at time zone 'UTC',
 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
p >"$tmpdir/b8-c-stale-holder.out" 2>&1 <<SQL &
set application_name='rr_s2_c_stale_purchase_holder';
set statement_timeout='20s';
begin;
select public.internal_acquire_official_reader_purchase_lock_v1('$b8_intent'::uuid);
select pg_sleep(3);
commit;
SQL
holder_pid=$!
wait_for "stale event meets independent purchase lock holder" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_c_stale_purchase_holder'
 and state='active' and wait_event_type='Timeout';
"
p >"$tmpdir/b8-c-stale-loser.out" 2>&1 <<SQL &
set application_name='rr_s2_c_stale_distinct_event';
set statement_timeout='20s';
begin;
set local role myeongha_commerce_internal_executor;
select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'b8-payment-c','tx-reader-b8-c','b8-cancel-older-distinct-c',
 '$c_stale_at'::timestamptz,$b8_amount,'KRW','production',
 'hmac-sha256:k1:9191919191919191919191919191919191919191919191919191919191919191',
 'synthetic-c-older-distinct-v1'
);
commit;
SQL
writer_pid=$!
wait_for "different older C event waits for purchase advisory" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_c_stale_distinct_event' and state='active'
 and wait_event_type='Lock' and wait_event='advisory';
"
wait "$holder_pid" || {
 cat "$tmpdir/b8-c-stale-holder.out" >&2
 fail "purchase holder for stale C event failed"
}
holder_pid=""
if wait "$writer_pid"; then fail "older distinct C cancellation was accepted"; fi
writer_pid=""
grep -q 'Unbound Reader cancellation is older than Grant lifecycle' "$tmpdir/b8-c-stale-loser.out" || {
 cat "$tmpdir/b8-c-stale-loser.out" >&2
 fail "different old C event was denied for unexpected reason"
}
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-older-distinct-c';")" == 0 ]] ||
 fail "stale different C event committed despite failed lifecycle ordering"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id='$b8_grant_c'::uuid and status='revoked'
 and last_effective_at='$c_cancel_at'::timestamptz;")" == 1 ]] ||
 fail "stale different event changed committed C Grant ordering"
pass "older distinct C cancellation waited then aborted without provider or Grant mutation"

# A re-used provider cancellation identity with CHANGED evidence is not a
# legitimate replay. It must fail before mutating the already revoked source.
if p >"$tmpdir/b8-c-replay-mismatch.out" 2>&1 <<SQL
begin;
set local role myeongha_commerce_internal_executor;
select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'b8-payment-c','tx-reader-b8-c','b8-cancel-concurrent-c',
 '$c_cancel_at'::timestamptz,$b8_amount,'KRW','production',
 'hmac-sha256:k1:9292929292929292929292929292929292929292929292929292929292929292',
 'synthetic-c-same-event-v1'
);
commit;
SQL
then
 fail "same cancellation identity was accepted with contradictory provider proof"
fi
grep -q 'PortOne full cancellation replay conflicts with persisted evidence' "$tmpdir/b8-c-replay-mismatch.out" || {
 cat "$tmpdir/b8-c-replay-mismatch.out" >&2
 fail "contradictory C evidence failed for unexpected reason"
}
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c';")" == 1 ]] ||
 fail "conflicting replay mutated canonical verified C event"
[[ "$(p -c "select count(*) from public.entitlement_events ee
 join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
 where pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c'
 and ee.grant_id='$b8_grant_c'::uuid and ee.event_type='revoked';")" == 1 ]] ||
 fail "conflicting proof duplicated the original C Grant effect"
pass "same cancellation ID with contradictory evidence fails without modifying prior event"


# Reusing the C provider cancellation ID with a DIFFERENT original verified
# Receipt B must fail, even though B and C belong to the same purchase.
# The event's receipt-bound identity is immutable after C was committed.
if p >"$tmpdir/b8-c-event-cross-receipt.out" 2>&1 <<SQL
begin;
set local role myeongha_commerce_internal_executor;
select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'b8-payment-b','tx-reader-b8-b','b8-cancel-concurrent-c',
 '$c_cancel_at'::timestamptz,$b8_amount,'KRW','production',
 'hmac-sha256:k1:9898989898989898989898989898989898989898989898989898989898989898',
 'synthetic-c-same-event-v1'
);
commit;
SQL
then
 fail "identical cancellation identity illegally redirected from C to sibling B"
fi
grep -q 'PortOne full cancellation replay conflicts with persisted evidence' "$tmpdir/b8-c-event-cross-receipt.out" || {
 cat "$tmpdir/b8-c-event-cross-receipt.out" >&2
 fail "cross-Receipt cancellation identity rejected for unexpected reason"
}
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c'
   and resolved_receipt_id='$b8_receipt_c'::uuid;")" == 1 ]] ||
 fail "reused cancellation identity changed its C source Receipt"
[[ "$(p -c "select count(*) from public.entitlement_events ee
 join public.commerce_provider_events pe on ee.source_provider_event_id=pe.id
 where pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c'
 and ee.grant_id='$b8_grant_b'::uuid;")" == 0 ]] ||
 fail "reused C cancellation identity mutated sibling B Grant"
[[ "$(p -c "select count(*) from public.entitlement_events ee
 join public.commerce_provider_events pe on ee.source_provider_event_id=pe.id
 where pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c'
 and ee.grant_id='$b8_grant_c'::uuid and ee.event_type='revoked';")" == 1 ]] ||
 fail "C cancellation lineage lost its single committed Grant revoke"
pass "same cancellation ID cannot be reused across sibling original Receipts"


# Two DIFFERENT committed cancellation events, B (bound scope) and C
# (unbound receipt), share a purchase but must retain distinct provenance.
# Replay their actual verified writers concurrently: B owns the purchase
# advisory until COMMIT; C waits and must replay its OWN Receipt/Grant.
p >"$tmpdir/b8-cross-event-b-holder.out" 2>&1 <<SQL &
set application_name='rr_s2_distinct_b_event_holder';
set statement_timeout='25s';
begin;
set local role myeongha_commerce_internal_executor;
select 'B_DISTINCT_REPLAY='||
 (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'b8-payment-b','tx-reader-b8-b','b8-cancel-bound-b-after-account-lock',
  '$b8_b_cancel_at'::timestamptz,$b8_amount,'KRW','production',
  'hmac-sha256:k1:9797979797979797979797979797979797979797979797979797979797979797',
  'synthetic-finalizer-lock-contention-v1'
 )->'revoke'->>'contractVersion');
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "distinct B provider replay holds shared purchase advisory" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_distinct_b_event_holder'
 and state='active' and wait_event_type='Timeout';
"
p >"$tmpdir/b8-cross-event-c-writer.out" 2>&1 <<SQL &
set application_name='rr_s2_distinct_c_event_waiter';
set statement_timeout='25s';
begin;
set local role myeongha_commerce_internal_executor;
select 'C_DISTINCT_REPLAY='||
 (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'b8-payment-c','tx-reader-b8-c','b8-cancel-concurrent-c',
  '$c_cancel_at'::timestamptz,$b8_amount,'KRW','production',
  'hmac-sha256:k1:9898989898989898989898989898989898989898989898989898989898989898',
  'synthetic-c-same-event-v1'
 )->'revoke'->>'contractVersion');
commit;
SQL
writer_pid=$!
wait_for "different C provider event waits for B purchase advisory" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_distinct_c_event_waiter'
 and state='active' and wait_event_type='Lock'
 and wait_event='advisory';
"
wait "$holder_pid" || {
 cat "$tmpdir/b8-cross-event-b-holder.out" >&2
 fail "B bound-event replay failed in cross-Receipt contention"
}
holder_pid=""
wait "$writer_pid" || {
 cat "$tmpdir/b8-cross-event-c-writer.out" >&2
 fail "C unbound-event replay deadlocked or failed after B release"
}
writer_pid=""
grep -q 'B_DISTINCT_REPLAY=official-reader-s2-revoke-dispatch-v1' "$tmpdir/b8-cross-event-b-holder.out" || {
 cat "$tmpdir/b8-cross-event-b-holder.out" >&2
 fail "B cross-event replay lost exact bound Reader scope"
}
grep -q 'C_DISTINCT_REPLAY=official-reader-s2-unbound-grant-cancellation-v1' "$tmpdir/b8-cross-event-c-writer.out" || {
 cat "$tmpdir/b8-cross-event-c-writer.out" >&2
 fail "C cross-event replay lost exact unbound Receipt scope"
}
[[ "$(p -c "select count(*) from public.commerce_provider_events pe
 where (pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-bound-b-after-account-lock'
        and pe.resolved_receipt_id='$b8_receipt_b'::uuid)
    or (pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c'
        and pe.resolved_receipt_id='$b8_receipt_c'::uuid);")" == 2 ]] ||
 fail "B/C cross-event replays changed Provider Event counts or original Receipt lineage"
[[ "$(p -c "select count(*) from public.entitlement_events ee
 join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
 where ((pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-bound-b-after-account-lock'
        and ee.grant_id='$b8_grant_b'::uuid)
    or (pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c'
        and ee.grant_id='$b8_grant_c'::uuid))
 and ee.event_type='revoked';")" == 2 ]] ||
 fail "B/C distinct replay did not preserve one revoke effect per exact Grant"
[[ "$(p -c "select count(*) from public.entitlement_events ee
 join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
 where (pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-bound-b-after-account-lock'
        and ee.grant_id='$b8_grant_c'::uuid)
    or (pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-concurrent-c'
        and ee.grant_id='$b8_grant_b'::uuid);")" == 0 ]] ||
 fail "distinct B/C cancellation events wrote cross-Receipt Grant effects"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id in ('$b8_grant_b'::uuid,'$b8_grant_c'::uuid) and status='revoked';")" == 2 ]] ||
 fail "B/C Grant lifecycle changed on cross-Receipt event replay"
pass "distinct B bound and C unbound verified events serialize and replay with no cross-Receipt effects"

# Complement the previous refund-FIRST races with a verified Grant
# ISSUANCE-FIRST race on an independent E Receipt of the separately verified E purchase.
# The legacy real Receipt/Grant writer is explicitly covered by shared
# purchase advisory -> Reader S1 before its first mutation; the verified
# PortOne cancellation must wait and then revoke only E.
b8_receipt_e='12192000-0000-0000-0000-000000000012'
b8_e_intent='12192300-0000-0000-0000-000000000013'
if ! p >"$tmpdir/b8-e-verified-receipt-seed.out" 2>&1 <<SQL
begin;
-- The DB correctly forbids attaching a new payment attempt to an already
-- verified/terminal Purchase. Clone a separate CREATED E purchase first,
-- preserving the SAME Subject/Reader S1 but not bypassing Commerce DDL.
insert into public.purchase_intents(
 id,subject_id,product_offer_id,provider_account_link_id,
 idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
 status,created_at,updated_at,expected_amount_minor,expected_currency,
 charge_terms_version,capability_set_id,capability_snapshot_jsonb,
 capability_snapshot_hash
)
select '$b8_e_intent'::uuid,subject_id,product_offer_id,provider_account_link_id,
 'reader-b8-e-issued-first','sha256:test:reader-b8-e-issued-first',
 offer_snapshot_jsonb,offer_snapshot_hash,'created',
 clock_timestamp(),clock_timestamp(),expected_amount_minor,expected_currency,
 charge_terms_version,capability_set_id,capability_snapshot_jsonb,
 capability_snapshot_hash
from public.purchase_intents where id='$b8_intent'::uuid;
insert into public.purchase_intent_reader_selections(
 purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
 selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select '$b8_e_intent'::uuid,product_id,reader_character_id,
 reader_content_bundle_id,selection_contract_version,
 selection_snapshot_jsonb,'sha256:test:reader-b8-e-selection',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='$b8_intent'::uuid;
insert into public.commerce_payment_attempts(
 id,purchase_intent_id,subject_id,product_offer_id,attempt_no,
 provider,environment,idempotency_key,provider_request_id,
 provider_transaction_id,status,created_at,updated_at
)
select '12197000-0000-0000-0000-000000000012'::uuid,
 pi.id,pi.subject_id,pi.product_offer_id,1,
 'portone_v2','production','reader-b8-attempt-e',
 'b8-payment-e','tx-reader-b8-e',
 'response_received',clock_timestamp(),clock_timestamp()
from public.purchase_intents pi where pi.id='$b8_e_intent'::uuid;
update public.purchase_intents
 set status='verified',updated_at=clock_timestamp()
 where id='$b8_e_intent'::uuid;
insert into public.commerce_receipts(
 id,subject_id,purchase_intent_id,product_offer_id,platform,provider,
 external_transaction_id,receipt_fingerprint,verification_status,
 verified_payload_jsonb,verified_at,created_at,environment,
 verifier_revision,verified_amount_minor,verified_currency
)
select '$b8_receipt_e'::uuid,subject_id,'$b8_e_intent'::uuid,product_offer_id,
 platform,provider,'tx-reader-b8-e',
 'hmac-sha256:k1:9393939393939393939393939393939393939393939393939393939393939393',
 'verified',verified_payload_jsonb,clock_timestamp(),clock_timestamp(),
 environment,verifier_revision,verified_amount_minor,verified_currency
from public.commerce_receipts where id='$b8_receipt_c'::uuid;
commit;
SQL
then
 cat "$tmpdir/b8-e-verified-receipt-seed.out" >&2
 fail "new verified sibling E Receipt seed failed"
fi
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$b8_receipt_e'::uuid;")" == 0 ]] ||
 fail "E verified receipt must be unissued before overlap"

p >"$tmpdir/b8-e-issue-first.out" 2>&1 <<SQL &
set application_name='rr_s2_e_issued_grant_holds_purchase';
set statement_timeout='25s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select pg_catalog.set_config('myeongha.reader_pending_reading_id','$b8_reading',true);
select public.internal_acquire_official_reader_purchase_lock_v1('$b8_e_intent'::uuid);
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$b8_reading'::uuid,'test-standard-reader'
);
select result_grant_id
from public.internal_apply_verified_receipt_capability_effects_v1(
 '$b8_receipt_e'::uuid,array['test-reader-unit'],
 array[transaction_timestamp()],array[transaction_timestamp()],
 array[null]::timestamptz[],array[null]::text[]
);
select pg_sleep(4);
commit;
SQL
holder_pid=$!
wait_for "actual E Grant issuance has executed while holding purchase and S1 locks" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_e_issued_grant_holds_purchase'
 and state='active' and wait_event_type='Timeout';
"
b8_e_cancel_at="$(p -c "select pg_catalog.to_char(
 clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
p >"$tmpdir/b8-e-cancel-waiter.out" 2>&1 <<SQL &
set application_name='rr_s2_e_cancel_after_issuance';
set statement_timeout='25s';
begin;
set local role myeongha_commerce_internal_executor;
select 'E_CANCEL='||
 (public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  'b8-payment-e','tx-reader-b8-e','b8-cancel-issued-first-e',
  '$b8_e_cancel_at'::timestamptz,$b8_amount,'KRW','production',
  'hmac-sha256:k1:9494949494949494949494949494949494949494949494949494949494949494',
  'synthetic-e-issuance-before-cancellation-v1'
 )->'revoke'->>'disposition');
commit;
SQL
writer_pid=$!
wait_for "E provider refund waits on E purchase behind in-flight Grant issuance" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_e_cancel_after_issuance'
 and state='active' and wait_event_type='Lock' and wait_event='advisory';
"
wait "$holder_pid" || {
 cat "$tmpdir/b8-e-issue-first.out" >&2
 fail "actual E Grant issuance failed in purchase-lock first race"
}
holder_pid=""
wait "$writer_pid" || {
 cat "$tmpdir/b8-e-cancel-waiter.out" >&2
 fail "verified E refund failed after same-Receipt Grant committed"
}
writer_pid=""
grep -q 'E_CANCEL=cancelled_before_binding' "$tmpdir/b8-e-cancel-waiter.out" || {
 cat "$tmpdir/b8-e-cancel-waiter.out" >&2
 fail "verified E cancellation lost its exact unbound source after issuance"
}
b8_grant_e="$(p -c "select id from public.entitlement_grants
 where source_receipt_id='$b8_receipt_e'::uuid;")"
[[ "$b8_grant_e" =~ ^[0-9a-f-]{36}$ ]] ||
 fail "verified E first issuance never created its Grant"
[[ "$(p -c "select status from public.entitlement_grants
 where id='$b8_grant_e'::uuid;")" == revoked ]] ||
 fail "verified E cancellation did not revoke newly issued E Grant"
[[ "$(p -c "select verification_status from public.commerce_receipts
 where id='$b8_receipt_e'::uuid;")" == revoked ]] ||
 fail "verified E original receipt was not revoked"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where entitlement_grant_id='$b8_grant_e'::uuid;")" == 0 ]] ||
 fail "E issued-first refund created unexpected Reader binding"
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-issued-first-e'
 and resolved_receipt_id='$b8_receipt_e'::uuid;")" == 1 ]] ||
 fail "verified E purchase cancellation event duplicated or changed source"
[[ "$(p -c "select count(*) from public.entitlement_events ee
 join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
 where pe.external_event_id='myeongha:portone-v2:full-cancel:v1:b8-cancel-issued-first-e'
 and ee.grant_id='$b8_grant_e'::uuid and ee.event_type='revoked';")" == 1 ]] ||
 fail "verified E cancellation did not record one exact Grant revoke"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id in ('$b8_grant_b'::uuid,'$b8_grant_c'::uuid) and status='revoked';")" == 2 ]] ||
 fail "independent B/C rights were revived by E issue-and-revoke race"
pass "verified E issuance-first Grant Writer and later cancellation serialize by purchase and preserve B/C"


# Three real DB sessions: combined verified F issuance+Reader bind owns BOTH
# purchase and Reader S1, direct legacy binder waits on S1 and PortOne full
# refund waits on F purchase advisory. Refund's prelock view is unbound,
# so after F becomes bound it MUST abort and retry via bound S1. No paid
# disclosure/operational activation is attempted by these synthetic writers.
f_intent='12192300-0000-0000-0000-000000000014'
f_receipt='12192000-0000-0000-0000-000000000014'
f_attempt='12197000-0000-0000-0000-000000000014'
f_session='12193000-0000-0000-0000-000000000014'
f_hash='sha256:v1:1414141414141414141414141414141414141414141414141414141414'
if ! p >"$tmpdir/f-threeway-seed.out" 2>&1 <<SQL
begin;
insert into public.purchase_intents(
 id,subject_id,product_offer_id,provider_account_link_id,
 idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
 status,created_at,updated_at,expected_amount_minor,expected_currency,
 charge_terms_version,capability_set_id,capability_snapshot_jsonb,
 capability_snapshot_hash
)
select '$f_intent'::uuid,subject_id,product_offer_id,provider_account_link_id,
 'reader-f-threeway','sha256:test:reader-f-threeway',
 offer_snapshot_jsonb,offer_snapshot_hash,'created',
 clock_timestamp(),clock_timestamp(),expected_amount_minor,expected_currency,
 charge_terms_version,capability_set_id,capability_snapshot_jsonb,
 capability_snapshot_hash
from public.purchase_intents where id='$b8_e_intent'::uuid;
insert into public.purchase_intent_reader_selections(
 purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
 selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select '$f_intent'::uuid,product_id,reader_character_id,
 reader_content_bundle_id,selection_contract_version,
 selection_snapshot_jsonb,'sha256:test:reader-f-selection',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='$b8_e_intent'::uuid;
insert into public.commerce_payment_attempts(
 id,purchase_intent_id,subject_id,product_offer_id,attempt_no,
 provider,environment,idempotency_key,provider_request_id,
 provider_transaction_id,status,created_at,updated_at
)
select '$f_attempt'::uuid,pi.id,pi.subject_id,pi.product_offer_id,1,
 'portone_v2','production','reader-f-threeway-attempt',
 'f-payment','tx-reader-f','response_received',clock_timestamp(),clock_timestamp()
from public.purchase_intents pi where pi.id='$f_intent'::uuid;
update public.purchase_intents set status='verified',updated_at=clock_timestamp()
 where id='$f_intent'::uuid;
insert into public.commerce_receipts(
 id,subject_id,purchase_intent_id,product_offer_id,platform,provider,
 external_transaction_id,receipt_fingerprint,verification_status,
 verified_payload_jsonb,verified_at,created_at,environment,
 verifier_revision,verified_amount_minor,verified_currency
)
select '$f_receipt'::uuid,subject_id,'$f_intent'::uuid,product_offer_id,
 platform,provider,'tx-reader-f',
 'hmac-sha256:k1:1515151515151515151515151515151515151515151515151515151515151515',
 'verified',verified_payload_jsonb,clock_timestamp(),clock_timestamp(),
 environment,verifier_revision,verified_amount_minor,verified_currency
from public.commerce_receipts where id='$b8_receipt_e'::uuid;
commit;
SQL
then
 cat "$tmpdir/f-threeway-seed.out" >&2
 fail "new verified F three-way purchase seed failed"
fi
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='$f_receipt'::uuid;")" == 0 ]] ||
 fail "three-way F must have no Grant or bind before real combined writer starts"
p >"$tmpdir/f-combined-writer.out" 2>&1 <<SQL &
set application_name='rr_s2_f_combined_issue_and_bind';
set statement_timeout='30s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select 'F_COMBINED=' || (public.internal_apply_verified_reader_purchase_under_scope_v1(
 '$subject'::uuid,'$b8_reading'::uuid,'test-standard-reader',
 '$f_receipt'::uuid,'$f_intent'::uuid,
 array['test-reader-unit'],array[transaction_timestamp()],
 array[transaction_timestamp()],array[null]::timestamptz[],
 array[null]::text[],
 '$f_session'::uuid,'$b8_reading'::uuid,
 '$f_hash','standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$f_intent"}'::jsonb
 )->>'contractVersion');
select pg_sleep(6);
commit;
SQL
holder_pid=$!
wait_for "three-way combined Grant issuer completed Reader bind but holds transaction" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_f_combined_issue_and_bind'
 and state='active' and wait_event_type='Timeout';
"
p >"$tmpdir/f-direct-binder.out" 2>&1 <<SQL &
set application_name='rr_s2_f_direct_bind_replay';
set statement_timeout='30s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select 'F_DIRECT_BIND='||reading_id::text
from public.cmd_bind_standard_reading_access_v2(
 '$subject'::uuid,'$f_intent'::uuid,
 '$f_session'::uuid,'$b8_reading'::uuid,
 '$f_hash','standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$f_intent"}'::jsonb
);
commit;
SQL
reader_pid=$!
wait_for "three-way direct Reader binder waits on combined issuer S1" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_f_direct_bind_replay'
 and state='active' and wait_event_type='Lock'
 and wait_event='advisory';
"
f_cancel_at="$(p -c "select pg_catalog.to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")"
p >"$tmpdir/f-cancel-transient.out" 2>&1 <<SQL &
set application_name='rr_s2_f_verified_refund_after_bind';
set statement_timeout='30s';
begin;
set local role myeongha_commerce_internal_executor;
select 'F_REFUND='||(public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'f-payment','tx-reader-f','f-cancel-exact-after-bind',
 '$f_cancel_at'::timestamptz,$b8_amount,'KRW','production',
 'hmac-sha256:k1:1616161616161616161616161616161616161616161616161616161616161616',
 'synthetic-f-refund-after-threeway-v1'
 )->'revoke'->>'contractVersion');
commit;
SQL
writer_pid=$!
wait_for "three-way verified refund waits behind issuance purchase advisory" "
 select count(*) from pg_catalog.pg_stat_activity
 where application_name='rr_s2_f_verified_refund_after_bind'
 and state='active' and wait_event_type='Lock'
 and wait_event='advisory';
"
wait "$holder_pid" || {
 cat "$tmpdir/f-combined-writer.out" >&2
 fail "three-way verified Grant+Reader bind was not atomic and successful"
}
holder_pid=""
grep -q 'F_COMBINED=official-reader-s2-atomic-receipt-bind-v1' "$tmpdir/f-combined-writer.out" ||
 { cat "$tmpdir/f-combined-writer.out" >&2; fail "three-way issuer did not bind through the real atomic writer"; }
wait "$reader_pid" || {
 cat "$tmpdir/f-direct-binder.out" >&2
 fail "three-way direct Reader bind retry deadlocked or failed"
}
reader_pid=""
grep -q "F_DIRECT_BIND=$b8_reading" "$tmpdir/f-direct-binder.out" ||
 { cat "$tmpdir/f-direct-binder.out" >&2; fail "three-way direct binder did not replay exact official Reading"; }
if wait "$writer_pid"; then
 fail "three-way initial unbound refund illegally completed after F became bound"
fi
writer_pid=""
grep -q 'Reader binding completed during cancellation lock wait; retry under its bound scope' "$tmpdir/f-cancel-transient.out" ||
 { cat "$tmpdir/f-cancel-transient.out" >&2; fail "three-way verified refund failed for unexpected reason"; }
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$f_receipt'::uuid;")" == verified ]] ||
 fail "failed first refund mutated bound F Receipt"
[[ "$(p -c "select count(*) from public.commerce_provider_events where external_event_id='myeongha:portone-v2:full-cancel:v1:f-cancel-exact-after-bind';")" == 0 ]] ||
 fail "failed first refund committed verified Provider Event"
f_grant="$(p -c "select g.id from public.entitlement_grants g where g.source_receipt_id='$f_receipt'::uuid;")"
[[ "$f_grant" =~ ^[0-9a-f-]{36}$ ]] || fail "F combined writer failed to persist Grant"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where entitlement_grant_id='$f_grant'::uuid and official_reading_id='$b8_reading'::uuid;")" == 1 ]] ||
 fail "F three-way lost immutable Reader access binding after retry"

# Retry re-discovers the stored Reader access and acquires the correct S1
# BEFORE existing Receipt/Grant row locks. Exactly one verified full cancellation.
p >"$tmpdir/f-bound-refund-retry.out" 2>&1 <<SQL || {
 cat "$tmpdir/f-bound-refund-retry.out" >&2
 fail "F bound Reader refund retry failed"
}
begin;
set local role myeongha_commerce_internal_executor;
select 'F_REFUND_RETRY='||(public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'f-payment','tx-reader-f','f-cancel-exact-after-bind',
 '$f_cancel_at'::timestamptz,$b8_amount,'KRW','production',
 'hmac-sha256:k1:1616161616161616161616161616161616161616161616161616161616161616',
 'synthetic-f-refund-after-threeway-v1'
 )->'revoke'->>'contractVersion');
commit;
SQL
grep -q 'F_REFUND_RETRY=official-reader-s2-revoke-dispatch-v1' "$tmpdir/f-bound-refund-retry.out" ||
 fail "F refund retry did not switch to bound S1 revoke"
[[ "$(p -c "select status from public.entitlement_grants where id='$f_grant'::uuid;")" == revoked ]] ||
 fail "F combined paid Grant remained active after verified refund"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$f_receipt'::uuid;")" == revoked ]] ||
 fail "F Receipt not revoked after bound retry"
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='myeongha:portone-v2:full-cancel:v1:f-cancel-exact-after-bind'
 and resolved_receipt_id='$f_receipt'::uuid;")" == 1 ]] ||
 fail "F provider cancellation duplicated or resolved wrong Receipt"
[[ "$(p -c "select count(*) from public.entitlement_events ee
 join public.commerce_provider_events pe on ee.source_provider_event_id=pe.id
 where pe.external_event_id='myeongha:portone-v2:full-cancel:v1:f-cancel-exact-after-bind'
 and ee.grant_id='$f_grant'::uuid and ee.event_type='revoked';")" == 1 ]] ||
 fail "F bound refund did not commit one authoritative revoke effect"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id in ('$b8_grant_b'::uuid,'$b8_grant_c'::uuid,'$b8_grant_e'::uuid)
 and status='revoked';")" == 3 ]] ||
 fail "F combined three-way race changed sibling B/C/E rights"
pass "three concurrent real issuance+bind, direct bind and verified refund serialize; retry revokes only F"

echo "PASS: S2 instrumented two-direction PostgreSQL race; production integration HOLD"
