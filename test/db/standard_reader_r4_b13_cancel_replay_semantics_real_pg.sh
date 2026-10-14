#!/usr/bin/env bash
set -euo pipefail
if [[ "$(printenv MYEONGHA_R4_PG17_CI || true)" == 1 ]]; then
 [[ "$CI" == true && "$PGHOST" == localhost &&
    "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || exit 1
 pgver="$(psql -X -Atqc 'show server_version_num')"
 [[ "$pgver" -ge 170000 && "$pgver" -lt 180000 ]] || exit 1
else
 [[ "$CI" == true && "$PGHOST" == localhost &&
    "$PGDATABASE" == myeongha_b2_r4_b13_cancel_replay ]] || exit 1
fi
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-13/cancel_replay $*" >&2; exit 1; }
tmp="$(mktemp -d)"
first_pid=''
stale_pid=''
cleanup(){
 for pid in "$first_pid" "$stale_pid"; do
  [[ -z "$pid" ]] || { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
 done
 rm -rf "$tmp"
}
trap cleanup EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
event=b4c20000-0000-4000-8000-000000000001
# R1 immutable pin + test-only verified Receipt and original 1830 Grant.
# This is not a Provider-signed webhook nor an operational refund.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^update public.purchase_intents$/{exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
cat >>"$tmp/setup.sql" <<SQL
select * from public.internal_capture_b2_r1_initial_checkout_scope_pin_v1(
 '$subject'::uuid,'$intent'::uuid);
SQL
awk '/^update public.purchase_intents$/{on=1}
 /^create temp table _s4_initial_result as/{exit}
 on {print}' test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 65 "$tmp/setup.err" >&2; fail 'initial pinned verified Receipt/Grant'; }
grant="$(p -c "select id from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid and grant_source_type='purchase' and status='active'")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail 'active source Grant missing'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] ||
 fail 'Reader Access already bound'
effect_at="$(p -c "select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')")"
original_rev="$(p -c "select revision from public.entitlement_grants where id='$grant'::uuid")"
[[ "$original_rev" =~ ^[0-9]+$ ]] || fail 'invalid original Grant revision'
original_order="$(p -c "select coalesce(last_provider_ordering_key,'') from public.entitlement_grants where id='$grant'::uuid")"
if [[ -z "$original_order" ]]; then
 expected_order='null::text'
else
 expected_order="'$original_order'::text"
fi
if ! p >"$tmp/event.out" 2>"$tmp/event.err" <<SQL
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision)
select '$event'::uuid,cr.provider,'synthetic-b13-replay-one',
 'payment.cancelled',cr.external_transaction_id,cr.subject_id,'receipt',cr.id,
 'sha256:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
 clock_timestamp(),'b13-replay-order-1',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','b13-replay-test-verifier'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
SQL
then
 cat "$tmp/event.err" >&2
 fail 'verified-flag synthetic cancellation Event insert'
fi
effect(){
 local reason="$1"
 cat <<SQL
select result_replayed::text || '|' || result_entitlement_event_id::text
from public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(
 '$event'::uuid,'$grant'::uuid,
 $original_rev,$expected_order,
 '$effect_at'::timestamptz,
 (select valid_from from public.entitlement_grants where id='$grant'::uuid),
 (select valid_until from public.entitlement_grants where id='$grant'::uuid),
 '$reason');
SQL
}
reason=synthetic_b13_exact_verified_cancellation
# Two DIFFERENT synthetic verified cancellations target the same purchase.
# Session A's PRIVATE 1850 acquires actual S3 and keeps its CAS uncommitted.
# Session B cooperates with the scope-first ingress rule, waits on that S3,
# then uses the ORIGINAL pre-revocation CAS inputs. It must reject/roll back
# its own event row rather than invent an ordering-key freshness policy.
{
 echo "set application_name='b13_distinct_event_first';"
 echo 'begin;'
 effect "$reason"
 printf '\\! touch %s/held\n' "$tmp"
 echo 'select pg_sleep(3);'
 echo 'commit;'
} >"$tmp/first.sql"
cat >"$tmp/stale.sql" <<SQL
set application_name='b13_distinct_event_stale_waiter';
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
select 'b4c20000-0000-4000-8000-000000000003'::uuid,cr.provider,
 'synthetic-b13-distinct-stale','payment.cancelled',cr.external_transaction_id,
 cr.subject_id,'receipt',cr.id,
 'sha256:v1:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
 clock_timestamp(),'b13-replay-order-0',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','b13-test-only-verifier'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
select * from public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(
 'b4c20000-0000-4000-8000-000000000003'::uuid,'$grant'::uuid,
 $original_rev,$expected_order,
 '$effect_at'::timestamptz,
 (select valid_from from public.entitlement_grants where id='$grant'::uuid),
 (select valid_until from public.entitlement_grants where id='$grant'::uuid),
 'synthetic_b13_distinct_stale_cancellation');
commit;
SQL
p -f "$tmp/first.sql" >"$tmp/first.out" 2>"$tmp/first.err" & first_pid=$!
for _ in $(seq 1 100); do [[ -f "$tmp/held" ]] && break; sleep 0.05; done
[[ -f "$tmp/held" ]] || {
 cat "$tmp/first.err" >&2
 fail 'first cancellation did not hold actual S3 scope lock'
}
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == active ]] ||
 fail 'uncommitted first revoke was visible'
p -f "$tmp/stale.sql" >"$tmp/stale.out" 2>"$tmp/stale.err" & stale_pid=$!
observed=0
for _ in $(seq 1 100); do
 if [[ "$(p -c "select count(*) from pg_stat_activity
   where application_name='b13_distinct_event_stale_waiter'
   and state='active' and wait_event_type='Lock'")" == 1 ]]; then
  observed=1; break
 fi
 sleep 0.05
done
[[ "$observed" == 1 ]] || {
 cat "$tmp/stale.err" >&2
 fail 'distinct cancellation did not wait on real S3'
}
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='synthetic-b13-distinct-stale'")" == 0 ]] ||
 fail 'distinct event became visible before shared lock released'
wait "$first_pid" || { cat "$tmp/first.err" >&2; fail 'first revoke failed'; }
first_pid=''
if wait "$stale_pid"; then fail 'stale second cancellation CAS unexpectedly committed'; fi
stale_pid=''
grep -Fq 'Grant revision/order provenance changed; caller must re-read and re-compare provider ordering' "$tmp/stale.err" || {
 cat "$tmp/stale.err" >&2
 fail 'stale distinct event denied for unrelated reason'
}
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='synthetic-b13-distinct-stale'")" == 0 ]] ||
 fail 'stale distinct event survived failed in-transaction CAS'
[[ "$(p -c "select count(*) from public.entitlement_events
 where grant_id='$grant'::uuid and source_provider_event_id=
 'b4c20000-0000-4000-8000-000000000003'::uuid")" == 0 ]] ||
 fail 'stale distinct event wrote a revocation ledger entry'
# This is stale-input CAS isolation, NOT semantic ordering between different
# events. A caller that re-reads and supplies fresh CAS still needs Owner
# policy for older provider ordering keys; do not claim chronology convergence.
first="$(grep -E '^(false|true)\|[0-9a-f-]{36}$' "$tmp/first.out" | tail -1)"
[[ "$first" =~ ^false\|[0-9a-f-]{36}$ ]] ||
 { cat "$tmp/first.out" >&2; fail 'first effect not a fresh cancellation'; }
effect_id="$(printf '%s\n' "$first" | cut -d'|' -f2)"
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == revoked ]] ||
 fail 'exact Grant not revoked'
[[ "$(p -c "select count(*) from public.entitlement_events where
 grant_id='$grant'::uuid and id='$effect_id'::uuid
 and source_provider_event_id='$event'::uuid and event_type='revoked'")" == 1 ]] ||
 fail 'revoke ledger not attached to exact verified Provider source'
snapshot(){
 p -c "select
 (select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid),
 (select count(*) from public.entitlement_events where grant_id='$grant'::uuid),
 (select count(*) from public.outbox_events where event_type='ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'),
 (select revision from public.entitlement_grants where id='$grant'::uuid),
 (select coalesce(last_provider_ordering_key,'') from public.entitlement_grants where id='$grant'::uuid)" | tr -d '[:space:]'
}
before="$(snapshot)"
# Same authoritative event/cause/effective time. The existing 1080 source
# semantic replay returns before re-checking historical (now stale) CAS input.
if ! { echo 'begin;'; effect "$reason"; echo 'commit;'; } |
 p >"$tmp/replay.out" 2>"$tmp/replay.err"; then
 cat "$tmp/replay.err" >&2; fail 'identical cancellation replay'
fi
again="$(grep -E '^(false|true)\|[0-9a-f-]{36}$' "$tmp/replay.out" | tail -1)"
[[ "$again" == "true|$effect_id" ]] ||
 { cat "$tmp/replay.out" >&2; fail 'replay ledger ID or flag mismatch'; }
[[ "$(snapshot)" == "$before" ]] ||
 fail 'exact replay duplicated or mutated persistent Commerce effects'
# Divergent same-source semantics must not mutate already-revoked Grant.
if { echo 'begin;'; effect synthetic_b13_different_reason; echo 'commit;'; } |
 p >"$tmp/conflict.out" 2>"$tmp/conflict.err"; then
 fail 'same event ID with divergent reason accepted'
fi
grep -Fq 'authoritative source is already bound to conflicting Entitlement Effect semantics' "$tmp/conflict.err" ||
 { cat "$tmp/conflict.err" >&2; fail 'wrong divergent cancellation denial'; }
[[ "$(snapshot)" == "$before" ]] || fail 'semantic conflict changed original Grant/ledger/outbox'
# Duplicate (provider, external_event_id) is rejected at database unique index.
if p >"$tmp/duplicate.out" 2>"$tmp/duplicate.err" <<SQL
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision)
select 'b4c20000-0000-4000-8000-000000000002'::uuid,cr.provider,
 'synthetic-b13-replay-one','payment.cancelled',cr.external_transaction_id,
 cr.subject_id,'receipt',cr.id,
 'sha256:v1:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
 clock_timestamp(),'b13-replay-order-2',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','b13-replay-test-verifier'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
SQL
then fail 'duplicate provider external_event_id admitted'; fi
grep -Fq 'commerce_provider_events_provider_external_unique' "$tmp/duplicate.err" ||
 { cat "$tmp/duplicate.err" >&2; fail 'duplicate event denied for unrelated cause'; }
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where external_event_id='synthetic-b13-replay-one'")" == 1 ]] ||
 fail 'duplicate Provider event identity persisted'
[[ "$(snapshot)" == "$before" ]] ||
 fail 'duplicate Provider event changed Commerce state'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] ||
 fail 'revoked initial purchase gained Reader Access'
echo 'PASS R4/BIND-13 two-session distinct synthetic Provider cancellations S3 WAIT and stale CAS rollback; exact replay same Event ID/ledger, semantic conflict, duplicate external ID DENY, Grant/Outbox/Reader unchanged'
