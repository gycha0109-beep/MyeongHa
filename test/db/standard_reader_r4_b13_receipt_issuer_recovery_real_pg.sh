#!/usr/bin/env bash
set -euo pipefail
if [[ "$(printenv MYEONGHA_R4_PG17_CI || true)" == 1 ]]; then
  [[ "$CI" == true && "$PGHOST" == localhost &&
     "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || exit 1
  pg_version="$(psql -X -Atqc 'show server_version_num')"
  [[ "$pg_version" -ge 170000 && "$pg_version" -lt 180000 ]] || exit 1
else
  [[ "$CI" == true && "$PGHOST" == localhost &&
     "$PGDATABASE" == myeongha_b2_r4_b13_receipt_issuer_recovery ]] || exit 1
fi
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-13/receipt_issuer_recovery $*" >&2; exit 1; }
tmp="$(mktemp -d)"; failed_writer=''; retry_writer=''
cleanup(){
 for pid in "$failed_writer" "$retry_writer"; do
  [[ -z "$pid" ]] || { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
 done
 rm -rf "$tmp"
}
trap cleanup EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
# Deterministic receipt source and entitlement effect identity; different
# timestamps on retry would be a SEMANTIC CONFLICT, not an idempotent replay.
effect_at=2026-10-14T00:00:00Z

# Only purchase + verified Intent + Reader selection, NOT the source Receipt.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^insert into public.commerce_receipts\(/ {exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
awk '
 /^insert into public.commerce_receipts\(/ {copy=1}
 /^-- Verified initial issuance acquires SAME/ {if(copy) exit}
 copy {print}
 END {if(!copy) exit 3}
' test/db/standard_reader_initial_policy_locked_positive.sql >"$tmp/receipt.sql" ||
 fail 'source Receipt INSERT extraction'
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 60 "$tmp/setup.err" >&2; fail 'verified initial purchase/Reader fixture'; }
[[ "$(p -c "select count(*) from public.purchase_intents
 where id='$intent'::uuid and status='verified'")" == 1 ]] ||
 fail 'verified Intent missing'
[[ "$(p -c "select count(*) from public.commerce_receipts where id='$receipt'::uuid")" == 0 ]] ||
 fail 'unexpected pre-existing Receipt'

cat >"$tmp/failed.sql" <<SQL
set application_name='r4_b13_composite_failed_writer';
begin;
select set_config('myeongha.subject_id','$subject',true);
\\i $tmp/receipt.sql
select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array['$effect_at'::timestamptz],array['$effect_at'::timestamptz],
 array[null]::timestamptz[],array[null]::text[]);
\\! touch "$tmp/first_issued_uncommitted"
select pg_sleep(2.8);
-- Deliberate test-only crash AFTER Receipt+Grant+Event+projection writes.
select 1/0;
commit;
SQL
cat >"$tmp/retry.sql" <<SQL
set application_name='r4_b13_composite_retry_writer';
begin;
select set_config('myeongha.subject_id','$subject',true);
\\i $tmp/receipt.sql
select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array['$effect_at'::timestamptz],array['$effect_at'::timestamptz],
 array[null]::timestamptz[],array[null]::text[]);
commit;
SQL
p -f "$tmp/failed.sql" >"$tmp/failed.out" 2>"$tmp/failed.err" & failed_writer=$!
for _ in $(seq 1 100); do
 [[ -e "$tmp/first_issued_uncommitted" ]] && break
 sleep 0.05
done
[[ -e "$tmp/first_issued_uncommitted" ]] ||
 { cat "$tmp/failed.err" >&2; fail 'first writer never reached post-issuance pre-crash stage'; }
# No uncommitted Receipt OR Grant OR Event may leak to an independent DB session.
[[ "$(p -c "select count(*) from public.commerce_receipts where id='$receipt'::uuid")" == 0 ]] ||
 fail 'uncommitted Receipt visible outside first transaction'
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'uncommitted Grant visible outside first transaction'
[[ "$(p -c "select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'uncommitted entitlement Event visible outside first transaction'

p -f "$tmp/retry.sql" >"$tmp/retry.out" 2>"$tmp/retry.err" & retry_writer=$!
observed=0
for _ in $(seq 1 100); do
 if [[ "$(p -c "select count(*) from pg_stat_activity
   where application_name='r4_b13_composite_retry_writer'
   and state='active' and wait_event_type='Lock'")" == 1 ]]; then
  observed=1; break
 fi
 sleep 0.05
done
[[ "$observed" == 1 ]] ||
 { cat "$tmp/retry.err" >&2; fail 'second writer did not wait on same Receipt identity'; }
if wait "$failed_writer"; then
 failed_writer=''
 fail 'deliberately crashing first writer unexpectedly committed'
fi
failed_writer=''
grep -Fq 'division by zero' "$tmp/failed.err" ||
 { cat "$tmp/failed.err" >&2; fail 'first attempt failed for unrelated reason'; }
wait "$retry_writer" ||
 { cat "$tmp/retry.err" >&2; fail 'second writer could not recover after first rollback'; }
retry_writer=''

[[ "$(p -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and purchase_intent_id='$intent'::uuid
 and environment='production' and verification_status='verified'")" == 1 ]] ||
 fail 'exactly one verified synthetic Receipt did not survive'
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid and status='active'")" == 1 ]] ||
 fail 'exactly one Grant did not survive'
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_receipt_id='$receipt'::uuid and event_type='granted'")" == 1 ]] ||
 fail 'exactly one Grant Event did not survive'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] ||
 fail 'unrequested paid Reading created by receipt recovery'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] ||
 fail 'unrequested Reader Access created by receipt recovery'

before="$(p -c "select
 (select count(*) from public.commerce_receipts where id='$receipt'::uuid),
 (select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid),
 (select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid),
 (select count(*) from public.outbox_events where event_type='ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'),
 (select count(*) from public.entitlements)" | tr -d '[:space:]')"
grant_id="$(p -c "select id from public.entitlement_grants where source_receipt_id='$receipt'::uuid")"
event_id="$(p -c "select id from public.entitlement_events where source_receipt_id='$receipt'::uuid")"
cat >"$tmp/replay.sql" <<SQL
begin;
select set_config('myeongha.subject_id','$subject',true);
select bool_and(result_replayed)::text from public.internal_apply_initial_official_reader_receipt_locked_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array['$effect_at'::timestamptz],array['$effect_at'::timestamptz],
 array[null]::timestamptz[],array[null]::text[]);
commit;
SQL
p -f "$tmp/replay.sql" >"$tmp/replay.out" 2>"$tmp/replay.err" ||
 { cat "$tmp/replay.err" >&2; fail 'identical response-loss issuer replay failed'; }
grep -Fxq true "$tmp/replay.out" || fail 'identical issuer replay not marked replayed'

cat >"$tmp/conflict.sql" <<SQL
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
 '$receipt'::uuid,array['test-reader-unit'],
 array[('$effect_at'::timestamptz-interval '1 second')],
 array['$effect_at'::timestamptz],array[null]::timestamptz[],array[null]::text[]);
commit;
SQL
if p -f "$tmp/conflict.sql" >"$tmp/conflict.out" 2>"$tmp/conflict.err"; then
 fail 'semantically different source replay was accepted'
fi
grep -Fq 'authoritative source is already bound to conflicting Entitlement Effect semantics' "$tmp/conflict.err" ||
 { cat "$tmp/conflict.err" >&2; fail 'conflicting replay denied for unrelated reason'; }
after="$(p -c "select
 (select count(*) from public.commerce_receipts where id='$receipt'::uuid),
 (select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid),
 (select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid),
 (select count(*) from public.outbox_events where event_type='ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'),
 (select count(*) from public.entitlements)" | tr -d '[:space:]')"
[[ "$after" == "$before" ]] || fail "replay/conflict mutated durable effect counts: $before -> $after"
[[ "$(p -c "select id from public.entitlement_grants where source_receipt_id='$receipt'::uuid")" == "$grant_id" ]] ||
 fail 'identical replay rewrote Grant identity'
[[ "$(p -c "select id from public.entitlement_events where source_receipt_id='$receipt'::uuid")" == "$event_id" ]] ||
 fail 'identical replay rewrote Event identity'
echo 'PASS R4/BIND-13 test-only atomic Receipt+issuer 2-session failed-first-writer rollback, concurrent recovery, exact idempotent replay, conflicting replay DENY; one Receipt/Grant/Event'
