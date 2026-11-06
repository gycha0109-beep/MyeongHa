#!/usr/bin/env bash
set -euo pipefail

# Proof-only helper used from the existing full account-deletion DB finalizer
# test in a disposable PostgreSQL 17 database. This is not a customer API.
mode="${1:?mode required}"
subject_id="${2:?exact target Subject required}"
other_subject_id="${3:?unrelated Subject required}"
job_id="${4:?account deletion job required}"
lock_owner="${5:?worker lease owner required}"
p() { psql -X -v ON_ERROR_STOP=1 "$@"; }
fail() { echo "FAIL PRIVATE_CLAIM_FINALIZER_PG17 $*" >&2; exit 1; }

case "$mode" in
 seed)
  p <<SQL
insert into public.products(id,product_key,product_type,enabled,created_at)
values ('fb700000-0000-0000-0000-000000000001','private-claim-pg17-delete-fixture','reading',true,clock_timestamp());
insert into public.product_offers(
 id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at
) values (
 'fb710000-0000-0000-0000-000000000001',
 'fb700000-0000-0000-0000-000000000001',
 'web','test-provider','private-claim-pg17-delete-offer','KRW',1000,true,clock_timestamp()
);
insert into public.purchase_intents(
 id,subject_id,product_offer_id,provider_account_link_id,idempotency_key,
 request_hash,offer_snapshot_jsonb,offer_snapshot_hash,status,created_at,updated_at
) values
 ('fb720000-0000-0000-0000-000000000001','$subject_id',
  'fb710000-0000-0000-0000-000000000001',null,'private-claim-delete-target',
  'sha256:v1:private-claim-target','{}'::jsonb,'sha256:v1:private-claim-offer',
  'created',clock_timestamp(),clock_timestamp()),
 ('fb720000-0000-0000-0000-000000000002','$other_subject_id',
  'fb710000-0000-0000-0000-000000000001',null,'private-claim-delete-other',
  'sha256:v1:private-claim-other','{}'::jsonb,'sha256:v1:private-claim-offer',
  'created',clock_timestamp(),clock_timestamp());
-- One private Saju Record + pending Intent proves account deletion removes
-- the personal Record/Origin mapping while retaining the Commerce Intent evidence.
insert into public.products(id,product_key,product_type,enabled,created_at)
values ('fb750000-0000-0000-0000-000000000001',
        'standard.love_relationship','reading',false,clock_timestamp())
on conflict (product_key) do nothing;
do $saju_delete_seed$
declare
 v_product uuid;
 v_birth_revision uuid;
 v_capability_set uuid:='fb750000-0000-0000-0000-000000000002'::uuid;
 v_offer uuid:='fb750000-0000-0000-0000-000000000003'::uuid;
 v_record uuid:='fb750000-0000-0000-0000-000000000004'::uuid;
 v_intent uuid:='fb750000-0000-0000-0000-000000000005'::uuid;
begin
 select id into strict v_product from public.products
 where product_key='standard.love_relationship';
 select id into strict v_birth_revision from public.birth_profile_revisions
 where subject_id='$subject_id'::uuid order by revision_no desc limit 1;
 insert into public.product_capability_sets(
  id,product_id,definition_version,definition_hash,created_at
 ) values(v_capability_set,v_product,'saju-delete-test-v1',
          'sha256:saju-delete-test-v1',clock_timestamp());
 insert into public.product_capability_items(
  capability_set_id,item_key,entitlement_key,scope_mode,fixed_scope_key,
  validity_mode,duration_seconds
 ) values(v_capability_set,'relationship','saju.relationship',
          'saju_record',null,'unbounded',null);
 insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,
  display_price_minor,enabled,created_at,capability_set_id
 ) values(v_offer,v_product,'web','test-provider',
          'private-claim-saju-delete-offer','KRW',9900,false,
          clock_timestamp(),v_capability_set);
 insert into public.purchase_intents(
  id,subject_id,product_offer_id,provider_account_link_id,
  idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
  expected_amount_minor,expected_currency,charge_terms_version,
  capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash,
  status,created_at,updated_at
 ) values(
  v_intent,'$subject_id'::uuid,v_offer,null,'private-claim-saju-delete-intent',
  'sha256:private-claim-saju-delete-intent',
  pg_catalog.jsonb_build_object(
   'productOfferId',v_offer::text,'productId',v_product::text,
   'platform','web','provider','test-provider',
   'externalProductId','private-claim-saju-delete-offer'),
  'sha256:private-claim-saju-delete-offer',9900,'KRW',
  'saju-delete-test-charge-v1',v_capability_set,
  pg_catalog.jsonb_build_object(
   'capabilitySetId',v_capability_set::text,
   'definitionVersion','saju-delete-test-v1',
   'definitionHash','sha256:saju-delete-test-v1'),
  'sha256:private-claim-saju-delete-capability','pending',
  clock_timestamp(),clock_timestamp()
 );
 insert into public.commerce_saju_records_v1(id,subject_id,birth_revision_id)
 values(v_record,'$subject_id'::uuid,v_birth_revision);
 insert into public.commerce_saju_purchase_origins_v1(
  purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind
 ) values(v_intent,'$subject_id'::uuid,v_record,v_birth_revision,'original');
end;
$saju_delete_seed$;

insert into public.digital_reading_withdrawal_claims_private_v1(
 id,subject_id,purchase_intent_id,unit_id,reason_code,idempotency_hmac,request_hash
) values
 ('fb730000-0000-0000-0000-000000000001','$subject_id',
  'fb720000-0000-0000-0000-000000000001',
  'fb740000-0000-0000-0000-000000000001','delivery_failed',
  'hmac-sha256:k1:'||repeat('a',64),'sha256:v1:'||repeat('b',64)),
 ('fb730000-0000-0000-0000-000000000002','$other_subject_id',
  'fb720000-0000-0000-0000-000000000002',
  'fb740000-0000-0000-0000-000000000002','not_provided',
  'hmac-sha256:k1:'||repeat('c',64),'sha256:v1:'||repeat('d',64));
SQL
  if p -c "delete from public.digital_reading_withdrawal_claims_private_v1 where subject_id='$subject_id'::uuid;" >/dev/null 2>&1; then
   fail 'ordinary DELETE unexpectedly accepted'
  fi
  echo 'PASS PRIVATE_CLAIM_FINALIZER_PG17 seed: exact and unrelated claims are immutable'
  ;;
 after-rollback)
  result="$(p -Atc "select
   (select count(*) from public.digital_reading_withdrawal_claims_private_v1 where subject_id='$subject_id'::uuid)::text
   ||'|'||
   (select count(*) from public.digital_reading_withdrawal_claims_private_v1 where subject_id='$other_subject_id'::uuid)::text;")"
  [[ "$result" == '1|1' ]] || fail "failed finalization partially deleted claims: $result"
  saju_state="$(p -Atc "select
    (select count(*) from public.commerce_saju_records_v1 where subject_id='$subject_id'::uuid)::text
    ||'|'||
    (select count(*) from public.commerce_saju_purchase_origins_v1 where subject_id='$subject_id'::uuid)::text
    ||'|'||
    (select count(*) from public.purchase_intents where id='fb750000-0000-0000-0000-000000000005'::uuid)::text;")"
  [[ "$saju_state" == '1|1|1' ]] || fail "failed finalization partially deleted Saju Record/Origin or Purchase Intent: $saju_state"
  echo 'PASS PRIVATE_CLAIM_FINALIZER_PG17 FK failure rolled back exact personal claim DELETE and Saju Record graph'
  ;;
 after-finalization)
  result="$(p -Atc "select
   (select count(*) from public.digital_reading_withdrawal_claims_private_v1 where subject_id='$subject_id'::uuid)::text
   ||'|'||
   (select count(*) from public.digital_reading_withdrawal_claims_private_v1 where subject_id='$other_subject_id'::uuid)::text
   ||'|'||
   (select count(*) from public.purchase_intents where id in (
       'fb720000-0000-0000-0000-000000000001'::uuid,
       'fb720000-0000-0000-0000-000000000002'::uuid))::text;")"
  [[ "$result" == '0|1|2' ]] ||
    fail "exact deletion / other account / retained Purchase Intent mismatch: $result"
  saju_state="$(p -Atc "select
    (select count(*) from public.commerce_saju_records_v1 where subject_id='$subject_id'::uuid)::text
    ||'|'||
    (select count(*) from public.commerce_saju_purchase_origins_v1 where subject_id='$subject_id'::uuid)::text
    ||'|'||
    (select count(*) from public.purchase_intents where id='fb750000-0000-0000-0000-000000000005'::uuid)::text
    ||'|'||
    (select count(*) from public.commerce_saju_verified_refund_effects_v1 where subject_id='$subject_id'::uuid)::text;")"
  [[ "$saju_state" == '0|0|1|0' ]] || fail "account deletion did not erase only personal Saju mapping and retain Intent: $saju_state"

  # Restored/synthetic residue after the already-deleted replay boundary must
  # NOT be treated as successful idempotent finalization. Keep it in a
  # transaction that is ALWAYS rolled back, even when the expected SQL errors.
  log="$(mktemp)"
  set +e
  p >"$log" 2>&1 <<SQL
begin;
insert into public.digital_reading_withdrawal_claims_private_v1(
 id,subject_id,purchase_intent_id,unit_id,reason_code,idempotency_hmac,request_hash
) values (
 'fb730000-0000-0000-0000-000000000003','$subject_id',
 'fb720000-0000-0000-0000-000000000001',
 'fb740000-0000-0000-0000-000000000003','delivery_failed',
 'hmac-sha256:k1:'||repeat('e',64),'sha256:v1:'||repeat('f',64)
);
select * from public.internal_finalize_account_deletion_db_v1(
 '$subject_id'::uuid,'$job_id'::uuid,'$lock_owner'
);
rollback;
SQL
  rc=$?
  set -e
  if [[ "$rc" == 0 ]] ||
      ! grep -Eq '(Withdrawal claim resurrected after account deletion|Withdrawal claim remains after account finalization)' "$log"; then
    cat "$log" >&2
    rm -f "$log"
    fail 'deleted Subject with resurrected Claim was not rejected by finalizer replay'
  fi
  rm -f "$log"
  result="$(p -Atc "select
     (select count(*) from public.digital_reading_withdrawal_claims_private_v1 where subject_id='$subject_id'::uuid)::text
     ||'|'||
     (select count(*) from public.digital_reading_withdrawal_claims_private_v1 where subject_id='$other_subject_id'::uuid)::text;")"
  [[ "$result" == '0|1' ]] || fail "replay proof leaked synthetic residual data: $result"
  echo 'PASS PRIVATE_CLAIM_FINALIZER_PG17 exact DELETE, other Subject preserved, P5Y retained, forbidden residue replay'
  ;;
 *) fail "unknown mode: $mode" ;;
esac
