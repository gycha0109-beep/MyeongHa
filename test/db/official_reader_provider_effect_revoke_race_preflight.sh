#!/usr/bin/env bash
set -euo pipefail

# DB-C3 provider-neutral Commerce Writer preflight (isolated synthetic PostgreSQL).
# Tests the existing provider_event -> internal_apply_entitlement_effect_v1
# Grant FOR UPDATE path against a Reader-like FOR SHARE. This is NOT an actual
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
   'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','race-order-1'),
  ('12196000-0000-0000-0000-000000000002'::uuid,'synthetic-reader-revoke-race-2',
   'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','race-order-2')
) as x(id,event_id,fingerprint,ordering_key)
where cr.id='$receipt'::uuid and cr.subject_id='$subject'::uuid
  and cr.verification_status='verified' and cr.environment='production';
SQL
[[ "$(p -c "select count(*) from public.commerce_provider_events
  where id in ('12196000-0000-0000-0000-000000000001'::uuid,
               '12196000-0000-0000-0000-000000000002'::uuid);")" == 2 ]] ||
  fail "both synthetic receipt-lineage events must exist"

activate_b2() {
  p -c "update public.entitlement_grants set status='active', revision=revision+1,
    last_effective_at=clock_timestamp(), updated_at=clock_timestamp()
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
select result_grant_id from public.internal_apply_entitlement_effect_v1(
  'provider_event','$event_id'::uuid,'$b2'::uuid,null,
  (select revision from public.entitlement_grants where id='$b2'::uuid),
  (select last_provider_ordering_key from public.entitlement_grants where id='$b2'::uuid),
  'revoked',clock_timestamp(),'revoked',
  (select valid_from from public.entitlement_grants where id='$b2'::uuid),
  (select valid_until from public.entitlement_grants where id='$b2'::uuid),
  'synthetic_reader_race_revoke'
);
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

# CASE 1: Commerce effect owns the Grant row before Reader reads.
# Reader must actually wait on PostgreSQL Lock and subsequently see DENY.
activate_b2
{
  echo "set application_name='m3b2b_effect_writer_first';"
  echo "set statement_timeout='12s';"
  echo "begin;"
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
finish "$reader_pid" "$tmpdir/reader-after.out"; reader_pid=""
grep -qx DENY "$tmpdir/reader-after.out" ||
  { cat "$tmpdir/reader-after.out" >&2; fail "post-effect Reader-like locked read must DENY"; }
assert_committed_revoke '12196000-0000-0000-0000-000000000001'
pass "DB-C3 Commerce Writer-first: provider-event Grant FOR UPDATE blocks Reader FOR SHARE, then DENY"

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
  apply_effect_sql '12196000-0000-0000-0000-000000000002'
  echo "commit;"
} | p >"$tmpdir/writer-after.out" 2>&1 &
writer_pid=$!
wait_backend m3b2b_effect_writer_after Lock
finish "$reader_pid" "$tmpdir/reader-first.out"; reader_pid=""
finish "$writer_pid" "$tmpdir/writer-after.out"; writer_pid=""
grep -qx ALLOW "$tmpdir/reader-first.out" ||
  { cat "$tmpdir/reader-first.out" >&2; fail "Reader-first synthetic lock read changed"; }
assert_committed_revoke '12196000-0000-0000-0000-000000000002'
pass "DB-C3 Reader-first: FOR SHARE forces provider-event Entitlement Effect writer to wait"

echo "PASS: isolated provider_event -> Commerce EntitlementEffect Grant lock ordering; no PortOne live refund, approved T2, or public Reader reveal"
