#!/usr/bin/env bash
set -euo pipefail
# Actual migrated 2240/2250 S7 evidence + 1900/1910 PortOne cancellation.
# S4 protected body and S7 ACK here are synthetic fixture rows ONLY.
# No authorized S5 commit, checkout notice, consumer delivery or refund decision.
# Preserve the original authority-core scratch target. CI PG15/17 matrix
# also uses a dedicated, per-case disposable database with no public network.
legacy_scratch=false
matrix_scratch=false
if [[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
      "${PGDATABASE:-}" == myeongha_reader_s7_original_delivery_ledger_test ]]; then
  legacy_scratch=true
fi
if [[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true &&
      "${PGHOST:-}" == localhost && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ &&
      ( "${DB_SUITE:-}" == content || "${DB_SUITE:-}" == postgres17 ) ]]; then
  matrix_scratch=true
fi
if [[ "$legacy_scratch" != true && "$matrix_scratch" != true ]]; then
  echo 'FAIL: isolated CI PostgreSQL is required' >&2
  exit 1
fi
p() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
p -f test/db/official_standard_reading_reader_interpretation.sql \
  >"$tmp/source.out" 2>"$tmp/source.err" ||
  { tail -70 "$tmp/source.err" >&2; fail "purchase-backed Reader source fixture"; }
p -f test/db/official_reader_s7_original_delivery_ledger_fixture.sql \
  >"$tmp/ledger.out" 2>"$tmp/ledger.err" ||
  { tail -70 "$tmp/ledger.err" >&2; fail "actual S4/S7 schema fixture"; }
p -f test/db/official_reader_s6_same_bundle_independent_purchase.sql \
  >"$tmp/b4.out" 2>"$tmp/b4.err" ||
  { tail -70 "$tmp/b4.err" >&2; fail "real B4 independent same-bundle purchase/Reader bind fixture"; }
subject='11390000-0000-0000-0000-000000000001'
intent='12192300-0000-0000-0000-000000000002'
receipt='12192000-0000-0000-0000-000000000002'
other_intent='12192300-0000-0000-0000-000000000003'
other_receipt='12192000-0000-0000-0000-000000000003'
same_bundle_receipt='f7150000-0000-4000-8000-000000000001'
body='f7080000-0000-4000-8000-000000000001'
grant="$(p -c "select id from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid and grant_source_type='purchase';")"
sibling="$(p -c "select id from public.entitlement_grants
 where source_receipt_id='$other_receipt'::uuid and grant_source_type='purchase';")"
same_bundle_grant="$(p -c "select id from public.entitlement_grants
 where source_receipt_id='$same_bundle_receipt'::uuid
 and grant_source_type='purchase';")"
[[ "$same_bundle_grant" =~ ^[a-f0-9-]{36}$ &&
 "$same_bundle_grant" != "$grant" && "$same_bundle_grant" != "$sibling" ]] ||
 fail "B4 must be a third distinct verified Receipt-backed Grant"
[[ "$grant" =~ ^[a-f0-9-]{36}$ && "$sibling" =~ ^[a-f0-9-]{36}$ &&
 "$grant" != "$sibling" ]] || fail "independent Receipt Grants missing"
read_evidence() {
  p <<SQL
begin;
set local myeongha.subject_id='$subject';
select original_receipt_status || '|' || delivery_attempt_count::text ||
  '|' || acknowledged_attempt_count::text || '|' || product_spec_version
from public.internal_qry_official_reader_withdrawal_delivery_state_v2(
  '$subject'::uuid,'$1'::uuid,'$2'::uuid,'$body'::uuid
);
commit;
SQL
}
# Actual S6 function must re-evaluate the Current Grant + exact Official Reading
# and Saju Proof after S1 lock. No ciphertext leaves this isolated DB; only
# count(*) is returned to the test harness. This is NOT a paid reveal test.
s6_count() {
  p <<SQL
begin;
set local myeongha.subject_id='$1';
select count(*) from public.internal_qry_official_reader_paid_answer_ciphertext_v1(
 '$1'::uuid,'$body'::uuid
);
commit;
SQL
}
# The existing Chat only stores an opaque safe marker. Exercise its actual
# 1980 selector, which delegates to the SAME current-Grant/Saju-proof S6 read.
# Query only count/body ID; neither plaintext nor ciphertext reaches CI logs.
s6_marker_count() {
  p <<SQL
begin;
set local myeongha.subject_id='$1';
select count(*) from public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(
 '$1'::uuid,'$2'::uuid,'$3'::uuid
);
commit;
SQL
}
s6_marker_body_id() {
  p <<SQL
begin;
set local myeongha.subject_id='$1';
select body_id::text from public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(
 '$1'::uuid,'$2'::uuid,'$3'::uuid
);
commit;
SQL
}
thread='f7010000-0000-4000-8000-000000000001'
safe_marker='f7050000-0000-4000-8000-000000000001'
spec="$(p -c "select product_spec_version
 from public.standard_reading_official_bindings
 where reading_id='12103100-0000-0000-0000-000000000001'::uuid
 and subject_id='$subject'::uuid;")"
[[ -n "$spec" ]] || fail "original Official Reading product version missing"
before="$(read_evidence "$intent" "$grant")"
[[ "$before" == "verified|2|1|$spec" ]] ||
 fail "real 2240/2250 pre-cancel proof incorrect: $before"
[[ -z "$(read_evidence "$other_intent" "$grant")" ]] ||
 fail "S7 substituted another Purchase Intent"
[[ -z "$(read_evidence "$intent" "$sibling")" ]] ||
 fail "S7 substituted another Grant"
echo 'PASS original verified Receipt/Grant and actual 2-prepared/1-ACK private S7 evidence'
# The existing purchase fixture has independently verified B2/B3 Grants.
# B3 is for a DIFFERENT published bundle: never arbitrarily choose B2 for
# a paid answer while both remain active.
[[ "$(s6_count "$subject")" == 0 ]] ||
  fail "S6 exposed paid ciphertext under ambiguous cross-bundle purchase rights"
[[ "$(s6_marker_count "$subject" "$thread" "$safe_marker")" == 0 ]] ||
  fail "S6 Chat marker bypassed conflicting current Reader Bundles"

# Isolated fixture-only Grant changes: retire B3 temporarily to leave
# exactly one current B2 Bundle, backed by TWO independent B2+B4 payments.
# Restore B3 before actual refund to re-exercise the bundle conflict.
p -c "update public.entitlement_grants set status='revoked',revision=revision+1,
 last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
 where id='$sibling'::uuid and status='active';" >/dev/null
[[ "$(s6_count "$subject")" == 1 ]] ||
  fail "S6 did not find exact B2 protected ciphertext with two same-bundle Grants"
[[ "$(s6_marker_count "$subject" "$thread" "$safe_marker")" == 1 &&
   "$(s6_marker_body_id "$subject" "$thread" "$safe_marker")" == "$body" ]] ||
  fail "S6 safe Chat marker did not resolve the exact B2 paid body under fresh current rights"
[[ "$(s6_marker_count "$subject" "$thread" 'f7050000-0000-4000-8000-000000000099')" == 0 ]] ||
  fail "S6 wrong marker resolved paid ciphertext"
[[ "$(s6_marker_count "$subject" 'f7010000-0000-4000-8000-000000000099' "$safe_marker")" == 0 ]] ||
  fail "S6 wrong Thread resolved a different paid answer"
[[ "$(s6_marker_count '11390000-0000-0000-0000-000000000099' "$thread" "$safe_marker")" == 0 ]] ||
  fail "S6 cross-Subject Chat marker retrieved protected answer"
echo 'PASS S6 real Chat safe-marker resolves only exact owner/Thread/message under same current Grant'
# Real migrated S7 prepare writer: a client may retry the SAME delivery
# request but cannot substitute another acknowledgement secret. Rollback
# leaves the original 2-prepared/1-ACK historical fixture unchanged.
prepared_lifecycle="$(p <<SQL
begin;
set local myeongha.subject_id='$subject';
select 'first:' || already_prepared::text
from public.internal_prepare_official_reader_paid_delivery_v1(
 '$subject'::uuid,'$body'::uuid,'$thread'::uuid,'$safe_marker'::uuid,
 'f70a0000-0000-4000-8000-000000000003'::uuid,
 'sha256:v1:3333333333333333333333333333333333333333333333333333333333333333'
);
select 'retry:' || already_prepared::text
from public.internal_prepare_official_reader_paid_delivery_v1(
 '$subject'::uuid,'$body'::uuid,'$thread'::uuid,'$safe_marker'::uuid,
 'f70a0000-0000-4000-8000-000000000003'::uuid,
 'sha256:v1:3333333333333333333333333333333333333333333333333333333333333333'
);
do \$s7_replay\$
declare denied boolean:=false;
begin
 begin
  perform 1 from public.internal_prepare_official_reader_paid_delivery_v1(
   '$subject'::uuid,'$body'::uuid,'$thread'::uuid,'$safe_marker'::uuid,
   'f70a0000-0000-4000-8000-000000000003'::uuid,
   'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444'
  );
 exception when check_violation then denied:=true;
 end;
 if not denied then
  raise exception 'S7 original delivery retry accepted a changed token';
 end if;
end \$s7_replay\$;
select 'stored:' || count(*)::text
from public.official_reader_paid_delivery_attempts_v1
where delivery_request_id='f70a0000-0000-4000-8000-000000000003'::uuid
 and subject_id='$subject'::uuid and client_acknowledged_at is null;
rollback;
SQL
)"
[[ "$prepared_lifecycle" == "$(printf 'first:false\nretry:true\nstored:1')" ]] ||
  fail "real S7 prepare/retry/forgery test failed: $prepared_lifecycle"
[[ "$(p -c "select count(*) from public.official_reader_paid_delivery_attempts_v1
 where delivery_request_id='f70a0000-0000-4000-8000-000000000003'::uuid;")" == 0 ]] ||
  fail "rolled-back S7 prepare contaminated the historical fixture"
echo 'PASS real S7 prepare original receipt, idempotent retry, forged token denial and rollback'
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id in ('$grant'::uuid,'$same_bundle_grant'::uuid)
 and status='active';")" == 2 ]] ||
 fail "S6 positive test did not hold two independent same-bundle Grants"

# A revoked Saju Source Owner receipt must deny protected re-read even with
# an intact B2 Grant. Transaction ROLLBACK is fixture-only; this is NEVER
# an approval for Production issuance.
source_revoke_only="$(p <<SQL
begin;
set local myeongha.subject_id='$subject';
update public.official_reader_s3_source_authority_receipts_v1
set revoked_at=clock_timestamp()
where source_attestation_ref='fixture:no-saju-authority'
 and subject_id='$subject'::uuid and revoked_at is null;
select count(*) from public.internal_qry_official_reader_paid_answer_ciphertext_v1(
 '$subject'::uuid,'$body'::uuid
);
rollback;
SQL
)"
[[ "$source_revoke_only" == 0 ]] ||
  fail "S6 returned paid ciphertext with withdrawn Saju source receipt"
# A fresh Chat-marker query must observe a currently withdrawn source too.
source_marker_revoke="$(p <<SQL
begin;
set local myeongha.subject_id='$subject';
update public.official_reader_s3_source_authority_receipts_v1
set revoked_at=clock_timestamp()
where source_attestation_ref='fixture:no-saju-authority'
 and subject_id='$subject'::uuid and revoked_at is null;
select count(*) from public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(
 '$subject'::uuid,'$thread'::uuid,'$safe_marker'::uuid
);
rollback;
SQL
)"
[[ "$source_marker_revoke" == 0 ]] ||
  fail "Chat marker bypassed withdrawn Saju source proof"
[[ "$(s6_count '11390000-0000-0000-0000-000000000099')" == 0 ]] ||
  fail "S6 returned protected ciphertext for a different member"

p -c "update public.entitlement_grants set status='active',revision=revision+1,
 last_effective_at=clock_timestamp()-interval '5 minutes',
 updated_at=clock_timestamp()
 where id='$sibling'::uuid and status='revoked';" >/dev/null
[[ "$(s6_count "$subject")" == 0 ]] ||
  fail "S6 incorrectly chose B2 after B3 cross-bundle reactivation"
[[ "$(s6_marker_count "$subject" "$thread" "$safe_marker")" == 0 ]] ||
  fail "S6 Chat marker ignored reactivated different-Bundle rights"
echo 'PASS S6 exact-current Grant/read source check, cross-bundle/owner denial and revoked-Saju-proof denial'


# Exact verified PortOne original payment: revoke B2, NOT independently paid B3.
cancel="$(p -c "select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'synthetic-portone-reader-b2-payment','tx-official-reader-b2',
 's7-real-ledger-full-cancel',clock_timestamp(),
 cr.verified_amount_minor,cr.verified_currency,'production',
 'hmac-sha256:k1:abababababababababababababababababababababababababababababababab',
 's7-real-ledger-fixture-v1')->'revoke'->>'grantCount'
 from public.commerce_receipts cr where cr.id='$receipt'::uuid;")"
[[ "$cancel" == 1 ]] || fail "verified original PortOne cancel did not process one Grant: $cancel"
after="$(read_evidence "$intent" "$grant")"
[[ "$(s6_count "$subject")" == 0 ]] ||
  fail "S6 retained paid ciphertext access after verified B2 refund with B3 different bundle"
[[ "$(s6_marker_count "$subject" "$thread" "$safe_marker")" == 0 ]] ||
  fail "S6 Chat marker bypassed post-refund different-Bundle current-scope denial"
echo 'PASS S6 denies post-refund re-read while a conflicting B3 Bundle stays active'
# B4 is an independent valid purchase of the ORIGINAL B2 Bundle. Its current
# entitlement permits the historical encrypted B2 body when no other Bundle
# conflicts, even though the original B2 Receipt/Grant was refunded.
p -c "update public.entitlement_grants
 set status='revoked',revision=revision+1,last_effective_at=clock_timestamp(),
 updated_at=clock_timestamp()
 where id='$sibling'::uuid and status='active';" >/dev/null
[[ "$(s6_count "$subject")" == 1 ]] ||
 fail "S6 denied historical B2 body despite independent current same-bundle B4 purchase"
[[ "$(s6_marker_count "$subject" "$thread" "$safe_marker")" == 1 ]] ||
 fail "S6 safe Chat marker denied surviving independent same-Bundle B4 access"
[[ "$(p -c "select status from public.entitlement_grants
 where id='$same_bundle_grant'::uuid;")" == active ]] ||
 fail "independent same-bundle B4 Grant no longer active"
[[ "$(p -c "select verification_status from public.commerce_receipts
 where id='$same_bundle_receipt'::uuid;")" == verified ]] ||
 fail "independent same-bundle B4 Receipt no longer verified"
p -c "update public.entitlement_grants
 set status='active',revision=revision+1,
 last_effective_at=clock_timestamp()-interval '5 minutes',
 updated_at=clock_timestamp()
 where id='$sibling'::uuid and status='revoked';" >/dev/null
[[ "$(s6_count "$subject")" == 0 ]] ||
 fail "S6 failed to re-deny after cross-bundle B3 restoration"
[[ "$(s6_marker_count "$subject" "$thread" "$safe_marker")" == 0 ]] ||
 fail "S6 Chat marker failed to re-deny after cross-bundle B3 restoration"
echo 'PASS S6 safe Chat marker shares current entitlement and source proof checks through refund and B4 survival'
echo 'PASS post-refund S6 permits independent same-bundle verified B4 only; conflicts remain denied'
[[ "$after" == "revoked|2|1|$spec" ]] ||
 fail "real S7 revoked-Receipt history lost/reclassified: $after"
[[ -z "$(read_evidence "$other_intent" "$grant")" ]] ||
 fail "post-refund S7 used sibling Purchase Intent"
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid;")" == revoked ]] ||
 fail "original Grant not revoked"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$receipt'::uuid;")" == revoked ]] ||
 fail "original Receipt not revoked"
[[ "$(p -c "select status from public.entitlement_grants where id='$sibling'::uuid;")" == active ]] ||
 fail "sibling Grant was revoked"
[[ "$(p -c "select verification_status from public.commerce_receipts where id='$other_receipt'::uuid;")" == verified ]] ||
 fail "sibling Receipt was revoked"
[[ "$(p -c "select count(*) from public.entitlement_events ee
 join public.commerce_provider_events pe on pe.id=ee.source_provider_event_id
 where ee.grant_id='$grant'::uuid and ee.event_type='revoked'
 and pe.event_type='Transaction.Cancelled'
 and pe.resolved_receipt_id='$receipt'::uuid;")" == 1 ]] ||
 fail "actual original provider Event lineage missing"
[[ "$(p -c "select count(*) from public.official_reader_paid_answer_bodies
 where id='$body'::uuid and originating_entitlement_grant_id='$grant'::uuid;")" == 1 ]] ||
 fail "historical protected answer was erased without S4 privacy ledger"
[[ "$(p -c "select count(*) from public.official_reader_paid_delivery_attempts_v1
 where body_id='$body'::uuid and client_acknowledged_at is not null;")" == 1 ]] ||
 fail "historical S7 ACK was lost"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles
 where rolname in ('anon','authenticated','service_role','myeongha_api_executor')
 and has_function_privilege(rolname,
 'public.internal_qry_official_reader_withdrawal_delivery_state_v2(uuid,uuid,uuid,uuid)',
 'EXECUTE');")" == 0 ]] ||
 fail "private S7 evidence leaked runtime EXECUTE"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles
 where rolname in ('anon','authenticated','service_role','myeongha_api_executor',
   'myeongha_system_executor','myeongha_seyeon_chat_runtime_owner')
 and has_function_privilege(rolname,
 'public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(uuid,uuid,uuid)',
 'EXECUTE');")" == 0 ]] ||
 fail "private Chat marker function gained runtime EXECUTE"
# Duplicate provider delivery must be a genuine 1900/1910 replay of the
# ORIGINAL Cancellation event (not a new cancellation ID, Receipt or Grant).
# The source timestamp comes from persisted verified Provider evidence:
# changing it or the HMAC on replay is a conflict, not a new refund.
cancel_id='s7-real-ledger-full-cancel'
event_key="myeongha:portone-v2:full-cancel:v1:$cancel_id"
event_id="$(p -c "select id from public.commerce_provider_events
 where provider='portone_v2' and external_event_id='$event_key';")"
[[ "$event_id" =~ ^[0-9a-f-]{36}$ ]] ||
  fail "exact originating PortOne cancellation Event not recorded"
replay="$(p -c "select
 public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'synthetic-portone-reader-b2-payment','tx-official-reader-b2',
 '$cancel_id',pe.provider_occurred_at,
 cr.verified_amount_minor,cr.verified_currency,'production',
 'hmac-sha256:k1:abababababababababababababababababababababababababababababababab',
 's7-real-ledger-fixture-v1')->'revoke'->>'grantCount'
 from public.commerce_receipts cr
 join public.commerce_provider_events pe on pe.resolved_receipt_id=cr.id
 where cr.id='$receipt'::uuid and pe.id='$event_id'::uuid;")"
[[ "$replay" == 1 ]] ||
  fail "verified PortOne redelivery was not idempotent: $replay"
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where provider='portone_v2' and external_event_id='$event_key';")" == 1 ]] ||
  fail "duplicate original PortOne Provider Event recorded"
[[ "$(p -c "select count(*) from public.entitlement_events
 where grant_id='$grant'::uuid
 and source_provider_event_id='$event_id'::uuid and event_type='revoked';")" == 1 ]] ||
  fail "duplicate original Grant revocation Event recorded"
[[ "$(read_evidence "$intent" "$grant")" == "$after" ]] ||
  fail "duplicated cancellation rewrote the original S7 delivery timeline"

# A re-delivered Cancellation ID with a forged new verifier fingerprint
# MUST be rejected without changing the original Receipt/Grant/ACK history.
set +e
conflict="$(p -c "select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
 'synthetic-portone-reader-b2-payment','tx-official-reader-b2',
 '$cancel_id',pe.provider_occurred_at,
 cr.verified_amount_minor,cr.verified_currency,'production',
 'hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
 's7-real-ledger-fixture-v1')
 from public.commerce_receipts cr
 join public.commerce_provider_events pe on pe.resolved_receipt_id=cr.id
 where cr.id='$receipt'::uuid and pe.id='$event_id'::uuid;" 2>&1)"
conflict_status=$?
set -e
[[ "$conflict_status" -ne 0 && "$conflict" == *'PortOne full cancellation replay conflicts with persisted evidence'* ]] ||
  fail "conflicting PortOne evidence must fail closed: $conflict"
[[ "$(read_evidence "$intent" "$grant")" == "$after" ]] ||
  fail "rejected provider replay changed S7 original history"

# Client retransmits the ORIGINAL acknowledgement after the provider refund.
# Actual 2140 ACK function must return only the previously persisted receipt,
# never create a second ACK, reveal ciphertext, or prove legal delivery.
delivery_id='f7090000-0000-4000-8000-000000000002'
request_id='f70a0000-0000-4000-8000-000000000002'
thread_id='f7010000-0000-4000-8000-000000000001'
marker_id='f7050000-0000-4000-8000-000000000001'
# Use the actual retained, S7-validated digest instead of duplicating
# the fixture's SHA-256 literal: the first retry accidentally supplied 58 hex
# characters after the fixture was corrected to 64.
ack_hash="$(p -c "select acknowledgement_token_hash
 from public.official_reader_paid_delivery_attempts_v1
 where id='$delivery_id'::uuid and body_id='$body'::uuid
 and subject_id='$subject'::uuid and thread_id='$thread_id'::uuid
 and safe_message_id='$marker_id'::uuid and delivery_request_id='$request_id'::uuid;")"
[[ "$ack_hash" =~ ^sha256:v1:[a-f0-9]{64}$ ]] ||
  fail "original retained ACK digest missing or malformed"
ack_before="$(p -c "select client_acknowledged_at
 from public.official_reader_paid_delivery_attempts_v1
 where id='$delivery_id'::uuid and body_id='$body'::uuid;")"
ack_replay="$(p <<SQL
begin;
set local myeongha.subject_id='$subject';
select replayed::text
from public.internal_ack_official_reader_paid_delivery_v1(
 '$subject'::uuid,'$thread_id'::uuid,'$marker_id'::uuid,
 '$delivery_id'::uuid,'$request_id'::uuid,'$ack_hash');
commit;
SQL
)"
[[ "$ack_replay" == 'true' ]] ||
  fail "verified historical client ACK replay not returned as replayed"
[[ "$(p -c "select client_acknowledged_at
 from public.official_reader_paid_delivery_attempts_v1
 where id='$delivery_id'::uuid;")" == "$ack_before" ]] ||
  fail "client acknowledgement was rewritten on replay"
[[ "$(read_evidence "$intent" "$grant")" == "$after" ]] ||
  fail "client ACK replay changed retained historical delivery evidence"
echo 'PASS duplicate verified PortOne cancellation and client ACK are replay-safe; forged cancellation rejected'

echo 'PASS real S2 verified PortOne full cancel retains historical S7 ACK ledger and sibling right'
echo 'PASS S7 evidence remains private, not proof of statutory delivery or refund authorization'
