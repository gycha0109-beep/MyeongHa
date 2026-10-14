#!/usr/bin/env bash
set -euo pipefail
if [[ "$(printenv MYEONGHA_R4_PG17_CI || true)" == 1 ]]; then
 [[ "$CI" == true && "$PGHOST" == localhost && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || exit 1
 pg_version="$(psql -X -Atqc 'show server_version_num')"
 [[ "$pg_version" -ge 170000 && "$pg_version" -lt 180000 ]] || exit 1
else
 [[ "$CI" == true && "$PGHOST" == localhost && "$PGDATABASE" == myeongha_b2_r4_b13_issuer_before_cancel ]] || exit 1
fi
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-13/issuer_before_cancel: $*" >&2; exit 1; }
tmp="$(mktemp -d)"; issuer=''; canceller=''
cleanup(){
 for pid in "$issuer" "$canceller"; do
  [[ -z "$pid" ]] || { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
 done
 rm -rf "$tmp"
}
trap cleanup EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
event=b4270000-0000-4000-8000-000000000013
# R1 immutable purchase pin + test verified Receipt, but zero initial Grants.
# This synthetic event verifier intentionally ADOPTS shared scope lock;
# current operational Provider verification/Writer has NOT been cut over.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^update public.purchase_intents$/{exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
cat >>"$tmp/setup.sql" <<SQL
select * from public.internal_capture_b2_r1_initial_checkout_scope_pin_v1(
 '$subject'::uuid,'$intent'::uuid);
SQL
awk '/^update public.purchase_intents$/{on=1}
 /^-- Verified initial issuance acquires SAME/{exit}
 on {print}' test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 60 "$tmp/setup.err" >&2; fail 'R1 verified pinned Receipt fixture'; }
[[ "$(p -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and verification_status='verified' and environment='production'")" == 1 ]] ||
 fail 'verified Receipt missing'
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] || fail 'Grant pre-exists'
[[ "$(p -c "select count(*) from public.standard_reader_initial_purchase_scope_pins_v1
 where purchase_intent_id='$intent'::uuid and scope_identity is not null")" == 1 ]] ||
 fail 'immutable R1 initial scope missing'

# Session A: real staged R2 guarded issuer owns S3 until COMMIT.
cat >"$tmp/issuer.sql" <<SQL
set application_name='b13_issuer_first';
begin;
select * from public.internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1(
 '$receipt'::uuid,
 array['test-reader-unit'],array[transaction_timestamp()],
 array[transaction_timestamp()],array[null]::timestamptz[],array[null]::text[]);
\\! touch "$tmp/held"
select pg_sleep(2.7);
commit;
SQL
# Session B: synthetic cooperating Provider event verifier obtains SAME S3
# BEFORE verified event INSERT; then original PRIVATE R2 1850 CAS is called
# inside the same test transaction, after session A commits its Grant.
cat >"$tmp/cancel.sql" <<SQL
set application_name='b13_cancel_waiter';
begin;
select pg_advisory_xact_lock(hashtextextended(
 (select scope_identity from public.standard_reader_initial_purchase_scope_pins_v1
 where purchase_intent_id='$intent'::uuid),1830::bigint));
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select '$event'::uuid,cr.provider,'synthetic-b13-issuer-before-cancel',
 'payment.cancelled',cr.external_transaction_id,
 cr.subject_id,'receipt',cr.id,
 'sha256:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
 clock_timestamp(),'b13-cancel-order-1',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','b13-test-only-verifier-v1'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
select * from public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(
 '$event'::uuid,
 (select id from public.entitlement_grants where source_receipt_id='$receipt'::uuid
  and grant_source_type='purchase'),
 (select revision from public.entitlement_grants where source_receipt_id='$receipt'::uuid
  and grant_source_type='purchase'),
 (select last_provider_ordering_key from public.entitlement_grants
  where source_receipt_id='$receipt'::uuid and grant_source_type='purchase'),
 clock_timestamp(),
 (select valid_from from public.entitlement_grants where source_receipt_id='$receipt'::uuid
  and grant_source_type='purchase'),
 (select valid_until from public.entitlement_grants where source_receipt_id='$receipt'::uuid
  and grant_source_type='purchase'),
 'synthetic_b13_cancel_after_receipt_issuance'
);
commit;
SQL
p -f "$tmp/issuer.sql" >"$tmp/issuer.out" 2>"$tmp/issuer.err" & issuer=$!
for _ in $(seq 1 100); do [[ -f "$tmp/held" ]] && break; sleep 0.05; done
[[ -f "$tmp/held" ]] || { cat "$tmp/issuer.err" >&2; fail 'issuer never held S3'; }
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'dirty Grant visible before issuer COMMIT'
p -f "$tmp/cancel.sql" >"$tmp/cancel.out" 2>"$tmp/cancel.err" & canceller=$!
observed=0
for _ in $(seq 1 100); do
 if [[ "$(p -c "select count(*) from pg_stat_activity
  where application_name='b13_cancel_waiter' and state='active'
  and wait_event_type='Lock'")" == 1 ]]; then observed=1; break; fi
 sleep 0.05
done
[[ "$observed" == 1 ]] || { cat "$tmp/cancel.err" >&2; fail 'no real shared S3 wait'; }
[[ "$(p -c "select count(*) from public.commerce_provider_events where id='$event'::uuid")" == 0 ]] ||
 fail 'event verified before issuer S3 COMMIT'
wait "$issuer" || { cat "$tmp/issuer.err" >&2; fail 'guarded issuer failed'; }; issuer=''
wait "$canceller" || { cat "$tmp/cancel.err" >&2; fail 'verified cancellation/CAS failed'; }; canceller=''

grant="$(p -c "select id from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid and grant_source_type='purchase'")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail 'exact Grant absent'
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == revoked ]] ||
 fail 'Commerce CAS did not revoke exact Grant'
[[ "$(p -c "select count(*) from public.commerce_provider_events where id='$event'::uuid
 and status='verified' and resolved_receipt_id='$receipt'::uuid")" == 1 ]] ||
 fail 'cancellation event missing'
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_receipt_id='$receipt'::uuid and event_type='granted'")" == 1 ]] ||
 fail 'initial granted event mismatch'
[[ "$(p -c "select count(*) from public.entitlement_events
 where grant_id='$grant'::uuid and source_provider_event_id='$event'::uuid
 and event_type='revoked' and target_status='revoked'")" == 1 ]] ||
 fail 'cancellation event ledger mismatch'
[[ "$(p -c "select count(*) from public.entitlement_events where grant_id='$grant'::uuid")" == 2 ]] ||
 fail 'extra Entitlement Event'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] ||
 fail 'unexpected Official Reading'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] ||
 fail 'revoked purchase unexpectedly minted Reader Access'
if p >"$tmp/again.out" 2>"$tmp/again.err" <<SQL
begin;
select * from public.internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1(
 '$receipt'::uuid,array['test-reader-unit'],array[transaction_timestamp()],
 array[transaction_timestamp()],array[null]::timestamptz[],array[null]::text[]);
commit;
SQL
then fail 'guarded issuer reissued a verified cancelled purchase'; fi
grep -Fq 'Verified cancelled initial purchase cannot issue a new Grant' "$tmp/again.err" ||
 { cat "$tmp/again.err" >&2; fail 'wrong reissue denial'; }
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == revoked ]] ||
 fail 'reissue resurrected Grant'
[[ "$(p -c "select count(*) from public.entitlement_events where grant_id='$grant'::uuid")" == 2 ]] ||
 fail 'reissue modified ledger'
echo 'PASS R4/BIND-13 staged issuer FIRST vs synthetic cooperating verified cancellation on real 2-session S3 lock; original Commerce CAS revoked Grant, no Reader Access/reissue'
