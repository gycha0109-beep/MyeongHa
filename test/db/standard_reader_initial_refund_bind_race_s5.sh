#!/usr/bin/env bash
set -euo pipefail
# S5 two independent PG connections, actual PRIVATE issuer/binder/revoke.
# Both orders must use the same purchase-time first-Reading advisory scope.
case "${S5_ORDER:-}" in
 refund_first) db=myeongha_standard_s5_refund_first_race ;;
 bind_first) db=myeongha_standard_s5_bind_first_race ;;
 *) echo 'FAIL S5_ORDER' >&2; exit 1 ;;
esac
[[ "${CI:-}" == "true" && "${PGHOST:-}" == "localhost" &&
    "${PGDATABASE:-}" == "$db" ]] || { echo 'FAIL S5 isolated DB' >&2; exit 1; }
tmp=$(mktemp -d)
worker=""
cleanup(){ [[ -z "$worker" ]] || { kill "$worker" 2>/dev/null || :; wait "$worker" 2>/dev/null || :; }; rm -rf "$tmp"; }
trap cleanup EXIT
p(){ psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
fail(){ echo "FAIL S5 $*" >&2; exit 1; }

awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
  test/db/official_standard_reading_reader_interpretation.sql > "$tmp/fixture.sql"
awk '/^create temp table _s4_initial_result as/{exit} {print}' \
  test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/fixture.sql"
p -f "$tmp/fixture.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
  { cat "$tmp/setup.err" >&2; fail setup; }

subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
grant=$(p -c "select id from public.entitlement_grants where source_receipt_id='$receipt'::uuid and grant_source_type='purchase';")
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail 'exact initial Grant not found'
p -c "insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select 'b4260000-0000-4000-8000-000000000001'::uuid,cr.provider,
 's5-actual-race-cancel','payment.cancelled',cr.external_transaction_id,
 cr.subject_id,'receipt',cr.id,
 'sha256:v1:5555555555555555555555555555555555555555555555555555555555555555',
 clock_timestamp(),'s5-actual-race-order-1',
 '{\"schemaVersion\":\"commerce-evidence-v2\"}'::jsonb,
 'verified',clock_timestamp(),'production','s5-test-only'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;" >/dev/null

binder_sql="select purchase_intent_id from public.internal_cmd_bind_standard_reader_initial_policy_locked_v1(
 '$subject'::uuid,'$intent'::uuid,
 'b4240000-0000-4000-8000-000000000001'::uuid,
 'b4250000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444',
 'standard-reading-access-bind-v2',
 '{\"schemaVersion\":\"standard-reading-access-bind-v2\",\"purchaseIntentId\":\"$intent\"}'::jsonb
);"
revoke_sql="select result_grant_id from public.internal_execute_standard_reader_initial_verified_revoke_v1(
 'b4260000-0000-4000-8000-000000000001'::uuid,'$grant'::uuid,
 (select revision from public.entitlement_grants where id='$grant'::uuid),
 (select last_provider_ordering_key from public.entitlement_grants where id='$grant'::uuid),
 clock_timestamp(),
 (select valid_from from public.entitlement_grants where id='$grant'::uuid),
 (select valid_until from public.entitlement_grants where id='$grant'::uuid),
 's5_actual_race_revoke'
);"

if [[ "$S5_ORDER" == refund_first ]]; then
  first="$revoke_sql"; second="$binder_sql"
else
  first="$binder_sql"; second="$revoke_sql"
fi
cat >"$tmp/holder.sql" <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$first
\! touch "$tmp/locked"
select pg_sleep(3);
commit;
SQL
p -f "$tmp/holder.sql" >"$tmp/holder.out" 2>"$tmp/holder.err" &
worker=$!
for _ in $(seq 1 80); do [[ -f "$tmp/locked" ]] && break; sleep 0.05; done
[[ -f "$tmp/locked" ]] || { cat "$tmp/holder.err"; fail 'first Writer did not acquire lock'; }
if p >"$tmp/blocked.out" 2>&1 <<SQL
begin;
set local lock_timeout='650ms';
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$second
commit;
SQL
then fail "$S5_ORDER opposite Writer bypassed same initial purchase scope"; fi
grep -qi 'lock timeout' "$tmp/blocked.out" ||
 { cat "$tmp/blocked.out"; fail "$S5_ORDER opposite Writer did not block on lock"; }
wait "$worker" || { cat "$tmp/holder.err"; fail "$S5_ORDER holder failed"; }
worker=""

if [[ "$S5_ORDER" == bind_first ]]; then
  p >"$tmp/revoke-after.out" 2>&1 <<SQL ||
  { cat "$tmp/revoke-after.out"; fail 'post-bind refund did not succeed'; }
begin;
$revoke_sql
commit;
SQL
else
  if p >"$tmp/bind-after.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
$binder_sql
commit;
SQL
  then fail 'refunded first Grant unexpectedly created initial Reading'; fi
  grep -q 'active purchase-backed Entitlement Grant' "$tmp/bind-after.out" ||
   { cat "$tmp/bind-after.out"; fail 'post-refund Binder denied for wrong reason'; }
fi
[[ "$(p -c "select status from public.entitlement_grants where id='$grant'::uuid")" == revoked ]] ||
 fail 'actual Commerce Grant CAS revoke not committed'
[[ "$(p -c "select count(*) from public.entitlement_events where source_provider_event_id='b4260000-0000-4000-8000-000000000001'::uuid and event_type='revoked'")" == 1 ]] ||
 fail 'exact immutable Provider revoke ledger not committed'
if [[ "$S5_ORDER" == refund_first ]]; then
 [[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] ||
  fail 'refund-first still created Reading'
else
 [[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 1 ]] ||
  fail 'bind-first lost immutable Reading history'
fi
echo "PASS S5 true two-session first-Reading $S5_ORDER with original Commerce CAS"
