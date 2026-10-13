#!/usr/bin/env bash
set -euo pipefail
mode="${1:-}"
# This is real PostgreSQL, not an in-memory/mock concurrency test.
[[ "${CI:-}" == "true" && "${PGHOST:-}" == "localhost" &&
   "${PGDATABASE:-}" == "myeongha_standard_b2_r2_${mode}_test" &&
   ( "$mode" == "refund_first" || "$mode" == "bind_first" ) ]] || {
  echo 'FAIL R2: disposable PostgreSQL mode/database guard' >&2; exit 1;
}
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL R2/$mode: $*" >&2; exit 1; }
tmp="$(mktemp -d)"; writer=''; reader=''
cleanup() {
 for pid in "$writer" "$reader"; do
  [[ -z "$pid" ]] || { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
 done
 rm -rf "$tmp"
}
trap cleanup EXIT
subject='11390000-0000-0000-0000-000000000001'
intent='b4220000-0000-4000-8000-000000000001'
receipt='b4230000-0000-4000-8000-000000000001'
event='b4270000-0000-4000-8000-000000000002'
# S4 proven real fixture, cut BEFORE first bind so R2 can prove both orders.
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
 /^create temp table _s4_initial_result as/{exit}
 on {print}
' test/db/standard_reader_initial_policy_locked_positive.sql >> "$tmp/setup.sql"
p -f "$tmp/setup.sql" > "$tmp/setup.out" 2> "$tmp/setup.err" || {
 tail -n 80 "$tmp/setup.err" >&2; fail "valid verified purchase, unbound Grant & immutable pin fixture";
}
grant="$(p -c "select g.id from public.entitlement_grants g
where g.source_receipt_id='$receipt'::uuid and g.grant_source_type='purchase'")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail 'exact independent Grant missing'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
 fail 'fixture already bound'
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == active ]] ||
 fail 'fixture Grant not active'
# Verify direct execution remains prohibited to all normal roles.
p <<SQL >"$tmp/acl.out" 2>&1 || { cat "$tmp/acl.out"; fail 'private ACL check'; }
do \$r2_acl\$
declare r text;
begin
 if has_function_privilege('public',
   'public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)','EXECUTE')
 then raise exception 'R2 publicly callable'; end if;
 for r in select rolname from pg_roles where rolname in
   ('anon','authenticated','service_role','myeongha_api_executor',
    'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 loop
  if has_function_privilege(r,
   'public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)','EXECUTE')
  then raise exception 'R2 callable by %',r; end if;
 end loop;
end
\$r2_acl\$;
SQL
seed_event() {
 p >"$tmp/event.out" 2>&1 <<SQL || { cat "$tmp/event.out" >&2; fail 'verified cancellation seed'; }
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select '$event'::uuid,cr.provider,'synthetic-r2-$mode',
 'payment.cancelled',cr.external_transaction_id,
 cr.subject_id,'receipt',cr.id,
 'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 clock_timestamp(),'r2-order-$mode',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','r2-test-verifier-v1'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
SQL
}
effect_sql() {
 cat <<SQL
select result_grant_id,result_replayed from
 public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1(
 '$event'::uuid,'$grant'::uuid,
 (select revision from public.entitlement_grants where id='$grant'::uuid),
 (select last_provider_ordering_key from public.entitlement_grants where id='$grant'::uuid),
 clock_timestamp(),
 (select valid_from from public.entitlement_grants where id='$grant'::uuid),
 (select valid_until from public.entitlement_grants where id='$grant'::uuid),
 'synthetic_b2_r2_refund'
 );
SQL
}
bind_sql() {
cat <<SQL
select * from public.internal_cmd_bind_standard_reader_initial_policy_locked_v1(
 '$subject'::uuid, '$intent'::uuid,
 'b4240000-0000-4000-8000-000000000001'::uuid,
 'b4250000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$intent"}'::jsonb
);
SQL
}
wait_for_lock() {
 local app="$1"
 for _ in $(seq 1 100); do
  if [[ "$(p -c "select count(*) from pg_stat_activity where application_name='$app'
     and state='active' and wait_event_type='Lock'")" == 1 ]]; then return 0; fi
  sleep 0.05
 done
 fail "No observed independent PostgreSQL lock wait: $app"
}
wait_for_file() {
 for _ in $(seq 1 100); do [[ -f "$tmp/held" ]] && return 0; sleep 0.05; done
 fail 'first writer did not signal lock hold'
}
if [[ "$mode" == refund_first ]]; then
 seed_event
 # Connection A: actual refund effect commits only after holding initial scope.
 {
  echo "set application_name='b2_r2_refund_first_a';"
  echo 'begin;'
  effect_sql
  echo "\\! touch $tmp/held"
  echo 'select pg_sleep(2.5);'
  echo 'commit;'
 } | p >"$tmp/refund.out" 2>&1 &
 writer=$!
 wait_for_file
 # Connection B: first bind MUST wait, then reject the revoked exact Grant.
 {
  echo "set application_name='b2_r2_refund_first_b';"
  echo 'begin;'
  echo "select set_config('myeongha.subject_id','$subject',true);"
  bind_sql
  echo 'commit;'
 } | p >"$tmp/bind.out" 2>&1 &
 reader=$!
 wait_for_lock b2_r2_refund_first_b
 wait "$writer" || { cat "$tmp/refund.out"; fail 'refund-first effect failed'; }
 writer=''
 if wait "$reader"; then fail 'first bind succeeded after committed cancellation'; fi
 reader=''
 grep -Eqi '(active|Grant|revoked|current|entitlement)' "$tmp/bind.out" ||
  { cat "$tmp/bind.out"; fail 'first bind failed for unrelated cause'; }
else
 # Connection A: actual first 1820 bind commits after holding initial scope.
 {
  echo "set application_name='b2_r2_bind_first_a';"
  echo 'begin;'
  echo "select set_config('myeongha.subject_id','$subject',true);"
  bind_sql
  echo "\\! touch $tmp/held"
  echo 'select pg_sleep(2.5);'
  echo 'commit;'
 } | p >"$tmp/bind.out" 2>&1 &
 writer=$!
 wait_for_file
 # Verified provider event may arrive while binder's transaction is open;
 # it is NOT itself the entitlement effect.
 seed_event
 {
  echo "set application_name='b2_r2_bind_first_b';"
  echo 'begin;'
  effect_sql
  echo 'commit;'
 } | p >"$tmp/refund.out" 2>&1 &
 reader=$!
 wait_for_lock b2_r2_bind_first_b
 wait "$writer" || { cat "$tmp/bind.out"; fail 'binder-first mutation failed'; }
 writer=''
 wait "$reader" || { cat "$tmp/refund.out"; fail 'binder-first refund failed'; }
 reader=''
fi
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == revoked ]] ||
 fail 'exact Grant not revoked by original Commerce CAS'
[[ "$(p -c "select count(*) from public.entitlement_events where grant_id='$grant'::uuid
and source_provider_event_id='$event'::uuid and event_type='revoked'")" == 1 ]] ||
 fail 'exact cancellation ledger not committed atomically'
if [[ "$mode" == refund_first ]]; then
 [[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
  fail 'cancel-first left orphan initial Reader access'
else
 [[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='$intent'::uuid")" == 1 ]] ||
  fail 'bind-first lost immutable Reader audit'
 [[ "$(p -c "begin;select set_config('myeongha.subject_id','$subject',true);
 select count(*) from public.qry_character_standard_reading_access_runtime_v2(
 '$subject'::uuid,'seyeon',clock_timestamp());commit;" | grep -E '^[0-9]+$' | tail -1)" == 0 ]] ||
  fail 'revoked Reader retained current runtime access'
fi
echo "PASS B2-R2/$mode verified original Commerce revoke and two-connection initial lock ordering"
