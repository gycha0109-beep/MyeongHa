#!/usr/bin/env bash
set -euo pipefail
# D3b PRIVATE: source-derived complete verified provider impact lock inventory.
# Does NOT apply a refund, perform a partial restore or turn on any provider ingress.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3b: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
pids=()
cleanup() { for id in "${pids[@]}"; do kill "$id" >/dev/null 2>&1 || true; wait "$id" >/dev/null 2>&1 || true; done; rm -rf "$tmp"; }
trap cleanup EXIT

p -f test/db/official_standard_reading_reader_interpretation.sql >"$tmp/fixture.out" 2>"$tmp/fixture.err" ||
  { tail -n 70 "$tmp/fixture.err" >&2; fail "original official Reader fixture failed"; }

subject='11390000-0000-0000-0000-000000000001'
product='11392000-0000-0000-0000-000000000001'
grants=()
for intent in 12192300-0000-0000-0000-000000000002 12192300-0000-0000-0000-000000000003; do
  id="$(p -c "select a.entitlement_grant_id
  from public.standard_reading_reader_access_grants a
  where a.purchase_intent_id='$intent'::uuid and a.subject_id='$subject'::uuid")"
  [[ "$id" =~ ^[0-9a-f-]{36}$ ]] || fail "exact independent Grant not found: $intent"
  grants+=("$id")
done
events=('d3b20000-0000-0000-0000-000000000001' 'd3b20000-0000-0000-0000-000000000002')

p >"$tmp/events.out" 2>&1 <<SQL || fail "verified events not seedable"
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select src.event_id::uuid,cr.provider,'d3b-verified-event-'||src.seq::text,
 'payment.cancelled',cr.external_transaction_id,cr.subject_id,'receipt',cr.id,
 'sha256:v1:'||repeat(src.hexchar,64),clock_timestamp(),
 'd3b-order-'||src.seq::text,
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','d3b-isolated-verifier-v1'
from (values
  ('${events[0]}','${grants[0]}',1,'a'),
  ('${events[1]}','${grants[1]}',2,'b')
) as src(event_id,grant_id,seq,hexchar)
join public.entitlement_grants g on g.id=src.grant_id::uuid
join public.commerce_receipts cr on cr.id=g.source_receipt_id;
SQL
[[ "$(p -c "select count(*) from public.commerce_provider_events
where id in ('${events[0]}'::uuid,'${events[1]}'::uuid)")" == 2 ]] ||
 fail "two verified Provider events missing"

impact_call() {
 local reverse="$1"
 local es gs
 if [[ "$reverse" == reverse ]]; then
   es="'${events[1]}'::uuid,'${events[0]}'::uuid"
   gs="'${grants[1]}'::uuid,'${grants[0]}'::uuid"
 else
   es="'${events[0]}'::uuid,'${events[1]}'::uuid"
   gs="'${grants[0]}'::uuid,'${grants[1]}'::uuid"
 fi
 cat <<SQL
select cardinality(affected_products)::text||':'||
       cardinality(affected_grants)::text||':'||
       cardinality(affected_readings)::text||':'||
       unbound_grants::text
from public.internal_acquire_official_reader_verified_cancel_impact_lockset_v1(
 '$subject'::uuid,array[$es],array[$gs]);
SQL
}
scope="$(p <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$(impact_call normal)
commit;
SQL
)"
grep -qx '1:2:2:0' <<<"$scope" || fail "source-owned two independent bound Grants impact mismatch: $scope"
echo "PASS D3b: verified event-to-Receipt-to-two Grants, two bound Reader scopes; no effect"

# Exact source pairing and authorized executor checks.
for signature in \
 'public.internal_qry_official_reader_verified_cancel_impact_v1(uuid,uuid[],uuid[])' \
 'public.internal_acquire_official_reader_verified_cancel_impact_lockset_v1(uuid,uuid[],uuid[])'; do
 n="$(p -c "select count(*) from pg_catalog.pg_proc
 where oid='$signature'::regprocedure and not prosecdef and provolatile='v'")"
 [[ "$n" == 1 ]] || fail "missing PRIVATE security-invoker resolver"
 n="$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 and has_function_privilege(r.rolname,'$signature','EXECUTE')")"
 [[ "$n" == 0 ]] || fail "runtime can call private impact resolver"
done

for invalid in swap duplicate incomplete; do
 case "$invalid" in
 swap)
  es="'${events[0]}'::uuid,'${events[1]}'::uuid"
  gs="'${grants[1]}'::uuid,'${grants[0]}'::uuid";;
 duplicate)
  es="'${events[0]}'::uuid,'${events[0]}'::uuid"
  gs="'${grants[0]}'::uuid,'${grants[0]}'::uuid";;
 incomplete)
  es="'${events[0]}'::uuid,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid"
  gs="'${grants[0]}'::uuid,'${grants[1]}'::uuid";;
 esac
 if p >"$tmp/$invalid.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select * from public.internal_acquire_official_reader_verified_cancel_impact_lockset_v1(
 '$subject'::uuid,array[$es],array[$gs]);
commit;
SQL
 then fail "invalid verified effect set was accepted: $invalid"; fi
done
if p >"$tmp/wrong-user.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id',
 'ffffffff-ffff-ffff-ffff-ffffffffffff',true);
$(impact_call normal)
commit;
SQL
then fail "wrong Subject admitted to impact resolver"; fi
if p >"$tmp/stale.out" 2>&1 <<SQL
begin isolation level repeatable read;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$(impact_call normal)
commit;
SQL
then fail "stale-snapshot impact accepted"; fi
echo "PASS D3b: provider mismatch, duplicate/incomplete set, ACL, Subject and isolation denied"

# Three actual PG sessions A/B/C: input order must not change L0 selection.
p >"$tmp/holder.out" 2>&1 <<SQL &
set application_name='d3b_impact_holder';
set statement_timeout='25s';
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_product_scope_lock_v1(
 '$subject'::uuid,'$product'::uuid);
select pg_sleep(6);
commit;
SQL
pids+=("$!")
for _ in $(seq 1 130); do
 [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
 where application_name='d3b_impact_holder' and wait_event_type='Timeout'")" == 1 ]] && break
 sleep .07
done
[[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
where application_name='d3b_impact_holder' and wait_event_type='Timeout'")" == 1 ]] ||
 fail "product holder never acquired L0"
for label in normal reverse; do
 {
   echo "set application_name='d3b_${label}_waiter';"
   echo "set statement_timeout='25s';"
   echo 'begin;'
   echo "select pg_catalog.set_config('myeongha.subject_id','$subject',true);"
   impact_call "$label"
   echo 'commit;'
 } | p >"$tmp/$label.out" 2>&1 &
 pids+=("$!")
done
for label in normal reverse; do
 wait_observed=0
 for _ in $(seq 1 125); do
   [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity a
     join pg_catalog.pg_locks l on l.pid=a.pid
     where a.application_name='d3b_${label}_waiter'
       and a.wait_event_type='Lock'
       and l.locktype='advisory' and not l.granted")" == 1 ]] &&
       { wait_observed=1; break; }
   sleep .06
 done
 [[ "$wait_observed" == 1 ]] || { cat "$tmp/$label.out" >&2; fail "missing PG advisory wait: $label"; }
done
for id in "${pids[@]}"; do wait "$id" || {
 cat "$tmp/holder.out" "$tmp/normal.out" "$tmp/reverse.out" >&2
 fail "concurrent impact scope failed"; }; done
pids=()
for label in normal reverse; do
 grep -qx '1:2:2:0' "$tmp/$label.out" ||
   { cat "$tmp/$label.out" >&2; fail "scope drift after L0 wait"; }
done
[[ "$(p -c "select count(*) from public.entitlement_grants
where id in ('${grants[0]}'::uuid,'${grants[1]}'::uuid)
and status='active'")" == 2 ]] ||
 fail "lock-only operation mutated Grant status"
echo "PASS D3b: three PostgreSQL sessions, reverse verified pair order, L0 wait and no Grant mutation"
