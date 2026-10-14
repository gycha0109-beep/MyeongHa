#!/usr/bin/env bash
set -euo pipefail
if [[ "$(printenv MYEONGHA_R4_PG17_CI || true)" == 1 ]]; then
  [[ "$CI" == true && "$PGHOST" == localhost &&
     "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || exit 1
  pg_version="$(psql -X -Atqc 'show server_version_num')"
  [[ "$pg_version" -ge 170000 && "$pg_version" -lt 180000 ]] || exit 1
else
  [[ "$CI" == true && "$PGHOST" == localhost &&
     "$PGDATABASE" == myeongha_b2_r4_b13_receipt_bind_race ]] || exit 1
fi
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-13/issuer_vs_binder $*" >&2; exit 1; }
tmp="$(mktemp -d)"; holder=''; waiter=''
cleanup(){
  for pid in "$holder" "$waiter"; do
    [[ -z "$pid" ]] || { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
  done
  rm -rf "$tmp"
}
trap cleanup EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
# Test-only "verified" Receipt fixture, never an actual Provider webhook.
# Deliberately STOP before initial entitlement issuance. All commands below
# are existing PRIVATE DB authorities under a disposable PostgreSQL instance.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
  test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^-- Verified initial issuance acquires SAME/{exit} {print}' \
  test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 55 "$tmp/setup.err" >&2; fail 'unissued verified Reader Receipt fixture'; }
[[ "$(p -c "select count(*) from public.commerce_receipts cr
 join public.purchase_intents pi on pi.id=cr.purchase_intent_id
 and cr.product_offer_id=pi.product_offer_id
 where cr.id='$receipt'::uuid and cr.environment='production'
 and cr.verification_status='verified' and pi.status='verified'")" == 1 ]] ||
 fail 'verified Receipt/Intent/Offer provenance absent'
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'Grant pre-exists before real issuer'
# Before issuer commits, initial Reader is NEVER entitled to open the
# verified-only Receipt as paid access.
if p -f test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/pre.out" 2>"$tmp/pre.err"; then
 fail 'initial Binder accepted Receipt with zero Grants'
fi
grep -Fq 'active purchase-backed Entitlement Grant for this Standard Reading purchase is unavailable' "$tmp/pre.err" ||
 { cat "$tmp/pre.err" >&2; fail 'zero-Grant Binder denied for unrelated reason'; }
cat >"$tmp/issuer.sql" <<SQL
set application_name='b13_real_issuer_session';
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
 '$receipt'::uuid, array['test-reader-unit'],
 array[transaction_timestamp()],array[transaction_timestamp()],
 array[null]::timestamptz[],array[null]::text[]);
\\! touch "$tmp/issued"
select pg_sleep(2.7);
commit;
SQL
cat >"$tmp/binder.sql" <<SQL
set application_name='b13_waiting_reader_binder';
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_standard_reader_initial_policy_locked_v1(
 '$subject'::uuid,'$intent'::uuid,
 'b4240000-0000-4000-8000-000000000001'::uuid,
 'b4250000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$intent"}'::jsonb);
commit;
SQL
p -f "$tmp/issuer.sql" >"$tmp/issuer.out" 2>"$tmp/issuer.err" & holder=$!
for _ in $(seq 1 100); do [[ -e "$tmp/issued" ]] && break; sleep 0.05; done
[[ -e "$tmp/issued" ]] || { cat "$tmp/issuer.err" >&2; fail 'verified Receipt issuer never reached pre-commit lock hold'; }
# No dirty read of the newly minted Grant before issuer COMMIT.
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'Reader Grant became visible before issuer commit'
p -f "$tmp/binder.sql" >"$tmp/binder.out" 2>"$tmp/binder.err" & waiter=$!
observed=0
for _ in $(seq 1 100); do
 if [[ "$(p -c "select count(*) from pg_stat_activity
  where application_name='b13_waiting_reader_binder' and state='active'
  and wait_event_type='Lock'")" == 1 ]]; then observed=1; break; fi
 sleep 0.05
done
[[ "$observed" == 1 ]] ||
 { cat "$tmp/binder.err" >&2; fail 'real 2-session S3 lock wait not observed'; }
wait "$holder" || { cat "$tmp/issuer.err" >&2; fail 'private verified Receipt issuance failed'; }
holder=''
wait "$waiter" || { cat "$tmp/binder.err" >&2; fail 'Binder rejected fresh post-commit exact Grant'; }
waiter=''
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid and grant_source_type='purchase'
 and status='active' and valid_from<=clock_timestamp()
 and (valid_until is null or clock_timestamp()<valid_until)")" == 1 ]] ||
 fail 'Receipt did not generate exactly one current purchase Grant'
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_receipt_id='$receipt'::uuid and event_type='granted'")" == 1 ]] ||
 fail 'verified issuance ledger missing or duplicate'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings
 where generation_purchase_intent_id='$intent'::uuid and subject_id='$subject'::uuid")" == 1 ]] ||
 fail 'Binder created no unique Official Reading'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants a
 join public.entitlement_grants eg on eg.id=a.entitlement_grant_id
 where a.purchase_intent_id='$intent'::uuid and a.subject_id='$subject'::uuid
 and a.reader_character_id='seyeon' and a.access_role='initial_reader'
 and eg.source_receipt_id='$receipt'::uuid")" == 1 ]] ||
 fail 'Reader Access not pinned to exact newly committed Receipt Grant'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 1 ]] ||
 fail 'multiple Official Reading records'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 1 ]] ||
 fail 'multiple Reader access rows'
echo 'PASS R4/BIND-13 real PG two-session PRIVATE verified Receipt issuer vs initial Binder S3 wait; zero-Grant pre-commit DENY, post-commit exact Grant creates one Reading/Access'
