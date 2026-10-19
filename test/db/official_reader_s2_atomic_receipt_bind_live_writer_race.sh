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
  ('12197000-0000-0000-0000-000000000010',3,'reader-b8-attempt-c','b8-payment-c','tx-reader-b8-c')
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
  ('$b8_receipt_b','tx-reader-b8-b','hmac-sha256:k1:8282828282828282828282828282828282828282828282828282828282'),
  ('$b8_receipt_c','tx-reader-b8-c','hmac-sha256:k1:8383838383838383838383838383838383838383838383838383838383')
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
    'hmac-sha256:k1:8585858585858585858585858585858585858585858585858585858585',
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


echo "PASS: S2 instrumented two-direction PostgreSQL race; production integration HOLD"
