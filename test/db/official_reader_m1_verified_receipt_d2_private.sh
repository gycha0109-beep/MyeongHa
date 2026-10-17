#!/usr/bin/env bash
set -euo pipefail
# Run after the existing official_standard_reading_reader_interpretation.sql fixture.
# This verifies real 1050 evidence -> private 1820 issuance/bind, not runtime cutover.
p() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL M1-02: $*" >&2; exit 1; }
pass() { echo "PASS M1-02: $*"; }

subject='11390000-0000-0000-0000-000000000001'
source_intent='12192300-0000-0000-0000-000000000002'
intent='d2031000-0000-0000-0000-000000000001'
attempt='d2032000-0000-0000-0000-000000000001'
session='d2033000-0000-0000-0000-000000000001'
proposal='d2034000-0000-0000-0000-000000000001'
official='12103100-0000-0000-0000-000000000001'
fingerprint="hmac-sha256:k1:$(printf 'e%.0s' {1..64})"
verified_at='2026-10-16T00:00:00.000Z'
tx='m1-02-private-provider-verified-transaction'

# Reuse an existing fixture Product, Capability and Reader selection. This
# independent Purchase Intent uses the canonical five-key 1050 offer snapshot.
p <<SQL >/dev/null
insert into public.purchase_intents(
 id,subject_id,product_offer_id,provider_account_link_id,
 idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
 status,created_at,updated_at,expected_amount_minor,expected_currency,
 charge_terms_version,capability_set_id,capability_snapshot_jsonb,
 capability_snapshot_hash
)
select '$intent'::uuid,pi.subject_id,pi.product_offer_id,pi.provider_account_link_id,
 'm1-02-independent-additional-intent','sha256:test:m1-02-request',
 pg_catalog.jsonb_build_object(
  'productOfferId',po.id::text,'productId',po.product_id::text,
  'platform',po.platform,'provider',po.provider,
  'externalProductId',po.external_product_id
 ),'sha256:test:m1-02-offer','created',clock_timestamp(),clock_timestamp(),
 pi.expected_amount_minor,pi.expected_currency,pi.charge_terms_version,
 pi.capability_set_id,pi.capability_snapshot_jsonb,pi.capability_snapshot_hash
from public.purchase_intents pi join public.product_offers po on po.id=pi.product_offer_id
where pi.id='$source_intent'::uuid;
insert into public.purchase_intent_reader_selections(
 purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
 selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select '$intent'::uuid,product_id,reader_character_id,reader_content_bundle_id,
 selection_contract_version,selection_snapshot_jsonb,
 'sha256:test:m1-02-reader-selection',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='$source_intent'::uuid;
SQL

[[ "$(p -c "select count(*) from public.purchase_intents
 where id='$intent'::uuid and status='created' and subject_id='$subject'::uuid")" == 1 ]] ||
 fail "fresh additional Purchase Intent missing"
p <<SQL >/dev/null
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select payment_attempt_id from public.cmd_create_payment_attempt_v1(
 '$subject'::uuid,'$attempt'::uuid,'$intent'::uuid,
 'production','m1-02-attempt','m1-02-private-merchant-request');
select payment_attempt_id from public.cmd_transition_payment_attempt_v1(
 '$subject'::uuid,'$attempt'::uuid,'handed_off',null,null);
commit;
SQL
expected="$(p -c "select pi.expected_amount_minor || '|' || pi.expected_currency ||
 '|' || po.external_product_id from public.purchase_intents pi
 join public.product_offers po on po.id=pi.product_offer_id
 where pi.id='$intent'::uuid")"
IFS='|' read -r amount currency external_product <<<"$expected"
[[ "$amount" == 1 && "$currency" == 'KRW' && -n "$external_product" ]] ||
 fail "pinned expected charge/Product fixture missing"

persist() {
 p -c "begin; set local role myeongha_commerce_internal_executor;
 select receipt_id,provider_event_id,replayed
 from public.cmd_persist_verified_payment_evidence_v1(
 '$attempt'::uuid,'$intent'::uuid,'portone_v2','web','production',
 '$tx',null,null,'$external_product','active','$fingerprint',
 'm1-02-synthetic-verifier',$amount,'$currency','$verified_at',
 null,null,null); commit;"
}

first="$(persist)"
IFS='|' read -r receipt event replay <<<"$first"
[[ -n "$receipt" && -n "$event" && "$replay" == f ]] ||
 fail "1050 persistence failed: $first"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail "1050 unexpectedly minted a Grant"
pass "real 1050 role-scoped Receipt/Event persistence, zero Grant"

# M1-10: no visible committed D2 effects after verified Receipt is never
# proof that a lost COMMIT failed; automatic reissue must remain HOLD.
bash test/db/official_reader_m1_10_unknown_commit_source.sh \
 "$receipt" "$subject" "$intent" preissue none none

# M1-17: approved *function-only* API EXECUTE detects source with zero rights.
# No direct ledger SELECT and no public/payment Writer grants.
bash test/db/official_reader_m1_17_minimal_read_execute.sh \
 "$receipt" "$subject" "$intent" preissue

# M1-18: DB catalog must fail closed if someone opens source SELECT,
# public read EXECUTE, or private Writer EXECUTE. CI probes always ROLLBACK.
bash test/db/official_reader_m1_18_live_cutover_readonly_gate.sh
node --test scripts/commerce/m1-18-migration-parity-gate.test.mjs

for signature in \
 'public.internal_apply_official_reader_unified_receipt_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])' \
 'public.internal_cmd_bind_official_reader_unified_v1(uuid,uuid,uuid,uuid,text,text,jsonb)'; do
 [[ "$(p -c "select has_function_privilege(
 'myeongha_commerce_internal_executor','$signature','EXECUTE')")" == f ]] ||
 fail "runtime executor unexpectedly has D2 EXECUTE"
done
pass "runtime Commerce executor remains denied both private D2 functions"

# M1-04: assert actual SET LOCAL ROLE invocation denial against the newly
# persisted 1050 evidence, before the fixture owner issues any purchased Grant.
bash test/db/official_reader_m1_04_provider_role_execute_deny.sh "$receipt" "$subject" "$intent"

# M1-05: disposable only. Prove that granting one D2 EXECUTE to a new
# NOLOGIN role does not give SECURITY INVOKER's transitive data authority.
bash test/db/official_reader_m1_05_invoker_execute_only_probe.sh "$receipt" "$subject" "$intent"

# M1-08: a top-level D2 EXECUTE grant to an otherwise isolated synthetic
# issuer MUST NOT enable a real runtime session_user to assume that role.
bash test/db/official_reader_m1_08_private_issuer_session_assumption.sh "$receipt" "$subject" "$intent"

# M1-09: simulate a real database statement timeout AFTER uncommitted D2
# issuance and BEFORE bind/COMMIT; verify no orphan grant and fresh recovery.
bash test/db/official_reader_m1_09_issuer_timeout_recovery.sh "$receipt" "$subject" "$intent"

# M1-13: keep a real first issue+bind uncommitted in one PostgreSQL session.
# A separate M1-10 read-only snapshot must see zero committed rights and
# HOLD auto-retry; a competing issuer must fail at the actual D1/D2 lock.
# Roll back before existing M1-03 and M1-12 first-issue proofs.
node test/db/official_reader_m1_13_inflight_first_issue_mvcc_probe.mjs \
 "$receipt" "$subject" "$intent" "$session" "$proposal" "$official"

# M1-15: isolated PG15 pool reuses a deliberately dirty RR lease and verifies
# explicit RESET -> READ COMMITTED READ ONLY -> API ROLE -> COMMIT, plus
# ROLLBACK/role reset after a real SQL error. No production credentials.
node test/db/official_reader_m1_15_readonly_pool_lifecycle.mjs

# M1-03: The existing verified Receipt MUST survive a downstream bind
# error while ALL issuance writes from the same transaction are rolled back.
# Use the isolated DB fixture owner, NOT an API or Commerce runtime account.
tmp_error="$(mktemp)"
trap 'rm -f "$tmp_error"' EXIT
if p <<SQL > /dev/null 2>"$tmp_error"; then
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select result_grant_id
from public.internal_apply_official_reader_unified_receipt_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array[transaction_timestamp()],array[transaction_timestamp()],
 array[null]::timestamptz[],array[null]::text[]);
-- Deliberately invalid *bind* request hash; after successful issue above.
select reading_id from public.internal_cmd_bind_official_reader_unified_v1(
 '$subject'::uuid,'$intent'::uuid,'$session'::uuid,'$proposal'::uuid,
 'not-a-request-hash','standard-reading-access-bind-v2',
 pg_catalog.jsonb_build_object('schemaVersion','standard-reading-access-bind-v2',
 'purchaseIntentId','$intent'));
commit;
SQL
 fail "invalid Reader bind unexpectedly committed after D2 issuance"
fi
grep -q 'cmd_standard_reading_access_v2_request_hash\|request hash is invalid' "$tmp_error" ||
 { cat "$tmp_error" >&2; fail "D2 failure was not the intended downstream bind error"; }

[[ "$(p -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and verification_status='verified'")" == 1 ]] ||
 fail "downstream failure lost already-committed canonical Receipt"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail "failed bind left a phantom purchased Grant"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
 fail "failed bind left immutable Reader access"
pass "failed bind rolls back same-transaction issuance; verified Receipt remains"

# M1-14: hold an OLD repeatable-read snapshot across the M1-12 real TCP
# FIRST issuance commit. The old reader must stay stale, a new READ COMMITTED
# observer must see one committed Grant/Event/Reader, and the refreshed old
# session must converge before the existing M1-03 fixture continues.
# M1-12: first issuance is now the REAL TCP lost-COMMIT-ACK path, not
# just a successful psql-owned transaction. The fixture-owner D2 issue+bind
# still commits atomically; the test client sees the connection drop after
# the PostgreSQL backend emitted CommandComplete(COMMIT), but before delivery.
# Its output includes only independently re-read authoritative identities.
atomic="$(node test/db/official_reader_m1_14_stale_snapshot_first_issue.mjs \
 "$receipt" "$subject" "$intent" "$session" "$proposal" "$official")"
issue_line="$(printf '%s\n' "$atomic" | grep '^ISSUE|')"
bind_line="$(printf '%s\n' "$atomic" | grep '^BIND|')"
IFS='|' read -r issue_marker grant issue_replay <<<"$issue_line"
IFS='|' read -r bind_marker bound_reading bound_grant role created <<<"$bind_line"
[[ "$issue_marker" == ISSUE && "$bind_marker" == BIND &&
 -n "$grant" && "$issue_replay" == f &&
 "$bound_reading" == "$official" && "$bound_grant" == "$grant" &&
 "$role" == additional_reader && "$created" == f ]] ||
 fail "atomic D2 issuance/bind mismatch: $atomic"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where id='$grant'::uuid and source_receipt_id='$receipt'::uuid
 and subject_id='$subject'::uuid and status='active'")" == 1 ]] ||
 fail "atomic Grant does not match exact 1050 Receipt"
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid and entitlement_grant_id='$grant'::uuid
 and official_reading_id='$official'::uuid")" == 1 ]] ||
 fail "atomic bind did not persist exact purchase-backed Reader access"
pass "verified Receipt retry atomically issues Grant and binds existing Official Reading"

second="$(persist)"
IFS='|' read -r receipt2 event2 replay2 <<<"$second"
[[ "$receipt2" == "$receipt" && "$event2" == "$event" && "$replay2" == t ]] ||
 fail "1050 replay failed to return identical Receipt/Event"
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 1 ]] ||
 fail "replay created a duplicate Grant"
pass "verified evidence replay converges without duplicate Grant"

# M1-06: re-run D2 issue + binder against this same REAL 1050 Receipt,
# proving that only the authoritative original effect timestamps can replay.
bash test/db/official_reader_m1_06_verified_receipt_semantic_replay.sh \
 "$receipt" "$subject" "$intent" "$session" "$proposal" "$grant" "$official"

# M1-07: run the EXACT TypeScript private-recovery SQL in PostgreSQL after
# the already-committed verified Receipt and same-Grant/Reading replay.
bash test/db/official_reader_m1_07_private_replay_source_sql.sh \
 "$receipt" "$subject" "$intent" "$grant" "$official"

# M1-10: model lost caller COMMIT acknowledgement after the existing
# successful private owner commit, then inspect exact DB lineage, READ ONLY.
bash test/db/official_reader_m1_10_unknown_commit_source.sh \
 "$receipt" "$subject" "$intent" committed "$grant" "$official"

# M1-16: prove the *actual* app session cannot read the committed private
# Receipt/Grant/Event/Reader/Outbox tables, columns or literal M1-10 SQL.
# A successful owner-fixture read must NEVER imply production app READ access.
bash test/db/official_reader_m1_16_runtime_recovery_read_acl_rls.sh \
 "$receipt" "$subject" "$intent" "$grant" "$official"

# M1-17: after atomic issue+bind, the SAME minimal enum confirms one
# committed candidate but never promotes paid T2 / automatic retry.
bash test/db/official_reader_m1_17_minimal_read_execute.sh \
 "$receipt" "$subject" "$intent" committed

# M1-11: a loopback TCP proxy suppresses the real PostgreSQL COMMIT
# CommandComplete frame after the DB has committed a private D2 replay.
# The psql client sees a broken connection; a fresh direct read MUST agree.
node test/db/official_reader_m1_11_commit_ack_drop_proxy.mjs \
 "$receipt" "$subject" "$intent" "$session" "$proposal" "$grant" "$official"

# The original typed reconciliation SELECT still classifies the committed
# receipt without trusting the intentionally lost acknowledgement.
bash test/db/official_reader_m1_10_unknown_commit_source.sh \
 "$receipt" "$subject" "$intent" committed "$grant" "$official"

echo "PASS M1-02: isolated PG receipt-to-D2 only; runtime authorization/T2 remain HOLD"
