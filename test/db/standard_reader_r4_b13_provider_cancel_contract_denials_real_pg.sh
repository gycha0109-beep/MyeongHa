#!/usr/bin/env bash
set -euo pipefail
if [[ "$(printenv MYEONGHA_R4_PG17_CI || true)" == 1 ]]; then
 [[ "$CI" == true && "$PGHOST" == localhost && "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || exit 1
 pgver="$(psql -X -Atqc 'show server_version_num')"
 [[ "$pgver" -ge 170000 && "$pgver" -lt 180000 ]] || exit 1
else
 [[ "$CI" == true && "$PGHOST" == localhost && "$PGDATABASE" == myeongha_b2_r4_b13_cancel_denials ]] || exit 1
fi
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-13/cancel_contract $*" >&2; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
# Actual R1 immutable pin + verified-flag Receipt and PRIVATE 1830 Grant,
# no Reader Access. Test-only schema records, NOT verified Provider webhooks.
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
 { tail -n 60 "$tmp/setup.err" >&2; fail 'R1 pinned synthetic purchased Grant fixture'; }
grant="$(p -c "select id from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid and grant_source_type='purchase' and status='active'")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail 'exact active Grant missing'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] || fail 'Reader pre-bound'
snapshot(){
 p -c "select
 (select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid),
 (select count(*) from public.entitlement_events where grant_id='$grant'::uuid),
 (select count(*) from public.outbox_events where event_type='ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'),
 (select revision from public.entitlement_grants where id='$grant'::uuid)" | tr -d '[:space:]'
}
before="$(snapshot)"
seed(){
 local id="$1" status="$2" env="$3" kind="$4" resolution="$5" tx="$6"
 p >"$tmp/seed-$id.out" 2>"$tmp/seed-$id.err" <<SQL ||
 { cat "$tmp/seed-$id.err" >&2; fail 'valid event-table fixture rejected'; }
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select '$id'::uuid,cr.provider,'synthetic-contract-$id',
 '$kind','$tx',cr.subject_id,'$resolution',
 case when '$resolution'='receipt' then cr.id else null::uuid end,
 'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 clock_timestamp(),'synthetic-contract-order-$id',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 '$status',clock_timestamp(),'$env','b13-test-only-verifier'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
SQL
}
cancel_sql(){
 local id="$1" offset="$2" target="$3"
 cat <<SQL
select result_grant_id,result_replayed from
 public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(
 '$id'::uuid,'$target'::uuid,
 (select revision from public.entitlement_grants where id='$grant'::uuid)+$offset,
 (select last_provider_ordering_key from public.entitlement_grants where id='$grant'::uuid),
 clock_timestamp(),
 (select valid_from from public.entitlement_grants where id='$grant'::uuid),
 (select valid_until from public.entitlement_grants where id='$grant'::uuid),
 'synthetic_b13_contract_revoke');
SQL
}
deny(){
 local label="$1" id="$2" expected="$3" offset="$4" target="$5"
 if { echo 'begin;'; cancel_sql "$id" "$offset" "$target"; echo 'commit;'; } |
   p >"$tmp/$label.out" 2>"$tmp/$label.err"; then
  fail "$label unexpectedly accepted"
 fi
 grep -Fq "$expected" "$tmp/$label.err" ||
  { cat "$tmp/$label.err" >&2; fail "$label wrong-denial reason"; }
 [[ "$(snapshot)" == "$before" ]] || fail "$label changed Commerce ledger/Grant/projection counts"
 [[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == active ]] ||
  fail "$label revoked current Grant"
}
# Database FK/shape valid events that do NOT qualify for verified cancellation
# authority. Distinct status, environment, type, resolution and transaction.
seed b4c10000-0000-4000-8000-000000000001 received production payment.cancelled receipt tx-s4-initial-seyeon
seed b4c10000-0000-4000-8000-000000000002 verified sandbox payment.cancelled receipt tx-s4-initial-seyeon
seed b4c10000-0000-4000-8000-000000000003 verified production payment.refunded receipt tx-s4-initial-seyeon
seed b4c10000-0000-4000-8000-000000000004 verified production payment.cancelled manual tx-s4-initial-seyeon
seed b4c10000-0000-4000-8000-000000000005 verified production payment.cancelled receipt wrong-provider-transaction
seed b4c10000-0000-4000-8000-000000000006 verified production payment.cancelled receipt tx-s4-initial-seyeon
reason='Exact verified initial cancellation purchase lineage is required'
deny unverified b4c10000-0000-4000-8000-000000000001 "$reason" 0 "$grant"
deny sandbox b4c10000-0000-4000-8000-000000000002 "$reason" 0 "$grant"
deny wrong_type b4c10000-0000-4000-8000-000000000003 "$reason" 0 "$grant"
deny wrong_resolution b4c10000-0000-4000-8000-000000000004 "$reason" 0 "$grant"
deny wrong_transaction b4c10000-0000-4000-8000-000000000005 "$reason" 0 "$grant"
deny foreign_grant b4c10000-0000-4000-8000-000000000006 "$reason" 0 ffffffff-ffff-ffff-ffff-ffffffffffff
deny stale_cas b4c10000-0000-4000-8000-000000000006 'Grant revision/order provenance changed' 99 "$grant"

if {
 echo 'begin;'
 echo "select set_config('myeongha.subject_id','ffffffff-ffff-ffff-ffff-ffffffffffff',true);"
 cancel_sql b4c10000-0000-4000-8000-000000000006 0 "$grant"
 echo 'commit;'
} | p >"$tmp/context.out" 2>"$tmp/context.err"; then fail 'foreign Subject context accepted'; fi
grep -Fq 'Cancellation cannot override a different canonical Subject' "$tmp/context.err" ||
 { cat "$tmp/context.err" >&2; fail 'Subject context denied for unrelated reason'; }
if { echo 'begin isolation level repeatable read;'
 cancel_sql b4c10000-0000-4000-8000-000000000006 0 "$grant"
 echo 'commit;'; } | p >"$tmp/isolation.out" 2>"$tmp/isolation.err"; then
 fail 'stale-snapshot cancellation accepted'
fi
grep -Fq 'Initial cancellation requires READ COMMITTED' "$tmp/isolation.err" ||
 { cat "$tmp/isolation.err" >&2; fail 'wrong isolation denial'; }

# Compose event INSERT + original PRIVATE 1850 CAS in ONE test-only
# transaction. Stale revision must roll back the verified event as well.
if {
 echo 'begin;'
 echo "insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
 ) select 'b4c10000-0000-4000-8000-000000000007'::uuid,cr.provider,
 'synthetic-b13-atomic-fail','payment.cancelled',cr.external_transaction_id,
 cr.subject_id,'receipt',cr.id,
 'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 clock_timestamp(),'synthetic-atomic-fail-order',
 '{\"schemaVersion\":\"commerce-evidence-v2\"}'::jsonb,
 'verified',clock_timestamp(),'production','b13-test-only-verifier'
 from public.commerce_receipts cr where cr.id='$receipt'::uuid;"
 cancel_sql b4c10000-0000-4000-8000-000000000007 99 "$grant"
 echo 'commit;'
} | p >"$tmp/atomic.out" 2>"$tmp/atomic.err"; then fail 'invalid CAS committed verified event'; fi
grep -Fq 'Grant revision/order provenance changed' "$tmp/atomic.err" ||
 { cat "$tmp/atomic.err" >&2; fail 'atomic rollback unrelated error'; }
[[ "$(p -c "select count(*) from public.commerce_provider_events
 where id='b4c10000-0000-4000-8000-000000000007'::uuid")" == 0 ]] ||
 fail 'verified Provider event persisted despite failed in-transaction CAS'
[[ "$(snapshot)" == "$before" ]] || fail 'failed in-transaction CAS altered effect counts'
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == active ]] ||
 fail 'failed in-transaction CAS revoked Grant'

p <<SQL >"$tmp/acl.out" 2>"$tmp/acl.err" ||
 { cat "$tmp/acl.err" >&2; fail 'private cancellation ACL check'; }
do \$acl\$
declare r text;
begin
 if has_function_privilege('public',
 'public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)','EXECUTE') then
  raise exception 'private cancellation publicly callable';
 end if;
 for r in select rolname from pg_roles where rolname in
 ('anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner') loop
  if has_function_privilege(r,
   'public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)','EXECUTE') then
   raise exception 'private cancellation callable by %',r;
  end if;
 end loop;
end
\$acl\$;
SQL
echo 'PASS R4/BIND-13 original R2 private cancel DENY invalid status/environment/type/resolution/transaction/Grant, stale CAS, Subject, isolation; atomic bad-CAS event rollback, private ACL'
