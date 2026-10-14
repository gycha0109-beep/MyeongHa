#!/usr/bin/env bash
set -euo pipefail
if [[ "$(printenv MYEONGHA_R4_PG17_CI || true)" == 1 ]]; then
 [[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
    "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || exit 1
 pgver="$(psql -X -Atqc 'show server_version_num')"
 [[ "$pgver" -ge 170000 && "$pgver" -lt 180000 ]] || exit 1
else
 [[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
    "${PGDATABASE:-}" == myeongha_b2_r4_b19_same_bundle ]] || exit 1
fi
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-19 $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
subject=11390000-0000-0000-0000-000000000001
first=b2020000-0000-4000-8000-000000000001
second=b2120000-0000-4000-8000-000000000001
# Immutable official Saju Source, first independent additional Receipt/Grant
# and positive Baekheon Standard Binder; NOT the legacy v2 replay shortcut.
awk '/^create temp table _v2_additional_result as/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^select pg_temp.assert_v2_fails\(/ {exit} {print}' \
 test/db/standard_reader_additional_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 45 "$tmp/setup.err" >&2; fail 'first Baekheon purchased access'; }
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='$first'::uuid and reader_character_id='baekheon'")" == 1 ]] ||
 fail 'first independent Baekheon purchase not bound'
# A SECOND verified purchase for the SAME Reader and SAME immutable bundle.
# Reuse only the seed's legal Commerce Purchase/Receipt/Grant construction.
awk '/^insert into public.purchase_intents\(/ {copy=1}
     /^select pg_temp.assert_v2_true\(/ {if(copy) exit}
     copy {print}' test/db/standard_reader_additional_policy_locked_positive.sql |
 sed -e 's/b2020000-0000-4000-8000-000000000001/b2120000-0000-4000-8000-000000000001/g' \
     -e 's/b2030000-0000-4000-8000-000000000001/b2130000-0000-4000-8000-000000000001/g' \
     -e 's/b2-additional-baekheon/b2-independent-baekheon/g' \
     -e 's/tx-b2-test-baekheon/tx-b2-independent-baekheon/g' \
     -e 's/hmac-sha256:k1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc/g' \
     >"$tmp/second.sql"
grep -Fq "$second" "$tmp/second.sql" || fail 'second purchase missing'
p -f "$tmp/second.sql" >"$tmp/second.out" 2>"$tmp/second.err" ||
 { tail -n 45 "$tmp/second.err" >&2; fail 'second independent verified Grant'; }
p >"$tmp/bind.out" 2>"$tmp/bind.err" <<SQL ||
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
 '$subject'::uuid,'$second'::uuid,
 'b2140000-0000-4000-8000-000000000001'::uuid,
 'b2150000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$second"}'::jsonb);
commit;
SQL
{ cat "$tmp/bind.err" >&2; fail 'second legitimate private Binder'; }
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where reader_character_id='baekheon' and reader_content_bundle_id='11391000-0000-0000-0000-000000000001'::uuid")" == 2 ]] ||
 fail 'two distinct purchase-backed Baekheon Access rows required'
[[ "$(p -c "select count(*) from public.standard_reading_reader_interpretations where reader_character_id='baekheon'")" == 1 ]] ||
 fail 'single logical Interpretation expected'
current_count(){
 p -c "select set_config('myeongha.subject_id','$subject',false);
 select count(*) from public.internal_qry_character_standard_reading_access_v2(
 '$subject'::uuid,'baekheon',clock_timestamp())" | tail -n 1
}
[[ "$(current_count)" == 1 ]] || fail 'two same-bundle Grants did not deduplicate'
first_grant="$(p -c "select entitlement_grant_id from public.standard_reading_reader_access_grants where purchase_intent_id='$first'::uuid")"
second_grant="$(p -c "select entitlement_grant_id from public.standard_reading_reader_access_grants where purchase_intent_id='$second'::uuid")"
[[ "$first_grant" != "$second_grant" ]] || fail 'not independent Commerce Grants'
# Refund + repurchase ISOLATION: a verified-flag synthetic cancellation event
# for the first Receipt must never revoke the second independent Receipt/Grant.
# Use the original 1080 provider-event CAS, not a direct fixture UPDATE.
# This is disposable test-only Provider evidence; NOT a signed PortOne webhook,
# an operational refund Writer, or an ordering/freshness policy.
first_receipt=b2030000-0000-4000-8000-000000000001
second_receipt=b2130000-0000-4000-8000-000000000001
old_event=b4c30000-0000-4000-8000-000000000001
[[ "$(p -c "select source_receipt_id from public.entitlement_grants where id='$first_grant'::uuid")" == "$first_receipt" ]] ||
 fail 'first Receipt/Grant lineage differs'
[[ "$(p -c "select source_receipt_id from public.entitlement_grants where id='$second_grant'::uuid")" == "$second_receipt" ]] ||
 fail 'repurchased Receipt/Grant lineage differs'
second_before="$(p -c "select revision::text || '|' || status || '|' ||
 coalesce(last_provider_ordering_key,'') from public.entitlement_grants
 where id='$second_grant'::uuid")"
first_event_before="$(p -c "select count(*) from public.entitlement_events where grant_id='$first_grant'::uuid")"
second_event_before="$(p -c "select count(*) from public.entitlement_events where grant_id='$second_grant'::uuid")"
if ! p >"$tmp/event.out" 2>"$tmp/event.err" <<SQL
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select '$old_event'::uuid,cr.provider,'synthetic-b19-old-receipt-cancel',
 'payment.cancelled',cr.external_transaction_id,cr.subject_id,'receipt',cr.id,
 'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 clock_timestamp(),'synthetic-b19-old-receipt-order',
 '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','b19-test-only-verifier'
from public.commerce_receipts cr where cr.id='$first_receipt'::uuid;
SQL
then
 cat "$tmp/event.err" >&2
 fail 'old Receipt synthetic verified cancellation insert'
fi
# Wrong-target attempt must be DENIED by the original Receipt/Grant lineage
# check BEFORE any status, revision, event, projection or Reader mutation.
if p >"$tmp/wrong.out" 2>"$tmp/wrong.err" <<SQL
begin;
select * from public.internal_apply_entitlement_effect_v1(
 'provider_event','$old_event'::uuid,'$second_grant'::uuid,null,
 (select revision from public.entitlement_grants where id='$second_grant'::uuid),
 (select last_provider_ordering_key from public.entitlement_grants where id='$second_grant'::uuid),
 'revoked',clock_timestamp(),'revoked',
 (select valid_from from public.entitlement_grants where id='$second_grant'::uuid),
 (select valid_until from public.entitlement_grants where id='$second_grant'::uuid),
 'synthetic_b19_wrong_target_must_deny');
commit;
SQL
then fail 'old cancellation incorrectly targeted repurchased Grant'; fi
grep -Fq 'provider event does not resolve to the target purchase Grant lineage' "$tmp/wrong.err" ||
 { cat "$tmp/wrong.err" >&2; fail 'wrong-receipt denial did not use original lineage guard'; }
[[ "$(p -c "select revision::text || '|' || status || '|' ||
 coalesce(last_provider_ordering_key,'') from public.entitlement_grants
 where id='$second_grant'::uuid")" == "$second_before" ]] ||
 fail 'wrong-target attempt changed repurchased Grant'
[[ "$(p -c "select count(*) from public.entitlement_events where grant_id='$second_grant'::uuid")" == "$second_event_before" ]] ||
 fail 'wrong-target attempt changed repurchased ledger'
[[ "$(current_count)" == 1 ]] || fail 'wrong-target denial altered current Reader access'
# Apply the very same cancellation to its correct, original Grant through the
# real Commerce 1080 CAS/projection/outbox function in one transaction.
if ! p >"$tmp/cancel.out" 2>"$tmp/cancel.err" <<SQL
begin;
select result_grant_id,result_entitlement_event_id,result_replayed
from public.internal_apply_entitlement_effect_v1(
 'provider_event','$old_event'::uuid,'$first_grant'::uuid,null,
 (select revision from public.entitlement_grants where id='$first_grant'::uuid),
 (select last_provider_ordering_key from public.entitlement_grants where id='$first_grant'::uuid),
 'revoked',clock_timestamp(),'revoked',
 (select valid_from from public.entitlement_grants where id='$first_grant'::uuid),
 (select valid_until from public.entitlement_grants where id='$first_grant'::uuid),
 'synthetic_b19_old_purchase_cancel');
commit;
SQL
then
 cat "$tmp/cancel.err" >&2
 fail 'old Receipt original CAS cancellation'
fi
[[ "$(p -c "select count(*) from public.entitlement_events
 where grant_id='$first_grant'::uuid and source_provider_event_id='$old_event'::uuid
 and event_type='revoked'")" == 1 ]] || fail 'old cancellation effect ledger missing'
[[ "$(p -c "select count(*) from public.entitlement_events where grant_id='$first_grant'::uuid")" == "$((first_event_before + 1))" ]] || fail 'old Grant unexpected effect count'
[[ "$(p -c "select count(*) from public.entitlement_events where grant_id='$second_grant'::uuid")" == "$second_event_before" ]] ||
 fail 'repurchased Grant ledger changed by old cancellation'
[[ "$(p -c "select status from public.entitlement_grants where id='$first_grant'::uuid")" == revoked ]] ||
 fail 'first Grant did not revoke'
[[ "$(p -c "select status from public.entitlement_grants where id='$second_grant'::uuid")" == active ]] ||
 fail 'independent Grant was revoked'
[[ "$(p -c "select revision::text || '|' || status || '|' ||
 coalesce(last_provider_ordering_key,'') from public.entitlement_grants
 where id='$second_grant'::uuid")" == "$second_before" ]] ||
 fail 'old cancellation changed repurchased Grant provenance'
[[ "$(current_count)" == 1 ]] || fail 'revoke of one Grant removed independent same-bundle entitlement'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 1 ]] ||
 fail 'independent Reading changed'
[[ "$(p -c "select count(*) from public.standard_reading_reader_interpretations where reader_character_id='baekheon'")" == 1 ]] ||
 fail 'logical Reader Interpretation changed'
# Old purchase must not become a fresh access ticket by replaying its Binder.
if p >"$tmp/replay.out" 2>"$tmp/replay.err" <<SQL
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
 '$subject'::uuid,'$first'::uuid,
 'b2040000-0000-4000-8000-000000000001'::uuid,
 'b2050000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$first"}'::jsonb);
commit;
SQL
then fail 'historical first Purchase replay became fresh authority'; fi
grep -Fq 'Historical Standard Reading replay cannot authorize current access' "$tmp/replay.err" ||
 { cat "$tmp/replay.err" >&2; fail 'replay denied for unrelated reason'; }
echo 'PASS R4/BIND-19 same-bundle two Receipts/Grants, old synthetic verified cancellation original 1080 CAS, wrong new Grant lineage DENY, new access survives, old replay DENY'
