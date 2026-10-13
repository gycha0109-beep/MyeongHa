#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == "true" && "${PGHOST:-}" == "localhost" &&
   "${PGDATABASE:-}" == "myeongha_standard_b2_r2_no_grant_test" ]] || {
 echo 'FAIL R2: disposable PostgreSQL no-Grant test guard' >&2; exit 1;
}
p() { psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL R2 no-Grant: $*" >&2; exit 1; }
tmp="$(mktemp -d)"; holder=''; issuer=''
cleanup() {
 for pid in "$holder" "$issuer"; do
  [[ -z "$pid" ]] || { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
 done
 rm -rf "$tmp"
}
trap cleanup EXIT
subject='11390000-0000-0000-0000-000000000001'
intent='b4220000-0000-4000-8000-000000000001'
receipt='b4230000-0000-4000-8000-000000000001'
event='b4270000-0000-4000-8000-000000000003'
# Same first purchase but cut BEFORE 1830 creates any Grant.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql > "$tmp/setup.sql"
awk '/^update public.purchase_intents$/{exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql >> "$tmp/setup.sql"
cat >> "$tmp/setup.sql" <<SQL
select * from public.internal_capture_b2_r1_initial_checkout_scope_pin_v1(
 '$subject'::uuid,'$intent'::uuid);
SQL
awk '
 /^update public.purchase_intents$/{on=1}
 /^-- Verified initial issuance acquires SAME/{exit}
 on {print}
' test/db/standard_reader_initial_policy_locked_positive.sql >> "$tmp/setup.sql"
p -f "$tmp/setup.sql" > "$tmp/setup.out" 2> "$tmp/setup.err" || {
 tail -n 90 "$tmp/setup.err" >&2; fail 'pinned verified initial purchase with zero Grants';
}
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'no-Grant fixture incorrectly issued a Grant'
# Connection A simulates a verified Provider ingress which follows the
# proposed same-scope lock *inside one transaction* before event commit.
cat > "$tmp/holder.sql" <<SQL
set application_name='b2_r2_no_grant_event_a';
begin;
select pg_advisory_xact_lock(hashtextextended(
 (select scope_identity from public.standard_reader_initial_purchase_scope_pins_v1
 where purchase_intent_id='$intent'::uuid), 1830::bigint));
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select '$event'::uuid,cr.provider,'synthetic-r2-no-grant',
 'payment.cancelled',cr.external_transaction_id,
 cr.subject_id,'receipt',cr.id,
 'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 clock_timestamp(),'r2-no-grant-cancel',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','r2-test-verifier-v1'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
\! touch "$tmp/held"
select pg_sleep(2.5);
commit;
SQL
p -f "$tmp/holder.sql" > "$tmp/holder.out" 2> "$tmp/holder.err" &
holder=$!
for _ in $(seq 1 100); do [[ -f "$tmp/held" ]] && break; sleep 0.05; done
[[ -f "$tmp/held" ]] || { cat "$tmp/holder.err"; fail 'provider event holder failed'; }
# Connection B: guarded issuer waits; then sees the newly committed verified
# event and rejects the original 1830 issuance (no Grant produced).
cat > "$tmp/issuer.sql" <<SQL
set application_name='b2_r2_no_grant_issuer_b';
begin;
select * from public.internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1(
 '$receipt'::uuid,
 array['test-reader-unit'],array[transaction_timestamp()],
 array[transaction_timestamp()],array[null]::timestamptz[],
 array[null]::text[]
);
commit;
SQL
p -f "$tmp/issuer.sql" > "$tmp/issuer.out" 2> "$tmp/issuer.err" &
issuer=$!
seen=0
for _ in $(seq 1 100); do
 if [[ "$(p -c "select count(*) from pg_stat_activity
 where application_name='b2_r2_no_grant_issuer_b'
 and state='active' and wait_event_type='Lock'")" == 1 ]]; then seen=1;break;fi
 sleep 0.05
done
[[ "$seen" == 1 ]] || fail 'two-connection provider-to-issuer lock wait not observed'
wait "$holder" || { cat "$tmp/holder.err"; fail 'event commit failed'; }
holder=''
if wait "$issuer"; then fail 'guarded issuer accepted verified cancellation'; fi
issuer=''
grep -q 'Verified cancelled initial purchase cannot issue a new Grant' "$tmp/issuer.err" ||
 { cat "$tmp/issuer.err"; fail 'issuer failed for unrelated cause'; }
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'event-first cancellation left an active or orphan Grant'
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'cancel-first leaked an entitlement ledger grant'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
 fail 'cancel-first leaked Reader access'
[[ "$(p -c "select count(*) from pg_roles r where r.rolname in
 ('anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 and has_function_privilege(r.rolname,
 'public.internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])',
 'EXECUTE')")" == 0 ]] || fail 'runtime can execute no-Grant gate'
echo 'PASS B2-R2 zero-Grant event-first 2-session race: no Grant/Reader access'
