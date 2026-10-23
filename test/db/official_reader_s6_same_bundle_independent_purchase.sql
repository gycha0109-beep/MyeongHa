\set ON_ERROR_STOP on
-- B4: independently paid, verified same Reader + SAME bundle as original B2.
-- Synthetic isolated PostgreSQL data, not a checkout or public S5 release.
begin;
insert into public.purchase_intents(
 id,subject_id,product_offer_id,provider_account_link_id,
 idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
 status,created_at,updated_at,expected_amount_minor,expected_currency,
 charge_terms_version,capability_set_id,capability_snapshot_jsonb,
 capability_snapshot_hash
)
select 'f7140000-0000-4000-8000-000000000001'::uuid,pi.subject_id,
 pi.product_offer_id,pi.provider_account_link_id,'s6-b4-same-bundle-independent',
 'sha256:v1:7777777777777777777777777777777777777777777777777777777777777777',
 pi.offer_snapshot_jsonb,pi.offer_snapshot_hash,'created',clock_timestamp(),
 clock_timestamp(),pi.expected_amount_minor,pi.expected_currency,
 pi.charge_terms_version,pi.capability_set_id,pi.capability_snapshot_jsonb,
 pi.capability_snapshot_hash
from public.purchase_intents pi
where pi.id='12192300-0000-0000-0000-000000000002'::uuid;

insert into public.purchase_intent_reader_selections(
 purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
 selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select 'f7140000-0000-4000-8000-000000000001'::uuid,sel.product_id,
 sel.reader_character_id,sel.reader_content_bundle_id,
 sel.selection_contract_version,sel.selection_snapshot_jsonb,
 'sha256:v1:8888888888888888888888888888888888888888888888888888888888888888',
 clock_timestamp()
from public.purchase_intent_reader_selections sel
where sel.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;

insert into public.commerce_payment_attempts(
 id,purchase_intent_id,subject_id,product_offer_id,attempt_no,provider,
 environment,idempotency_key,provider_request_id,provider_transaction_id,
 status,created_at,updated_at
)
select 'f7160000-0000-4000-8000-000000000001'::uuid,
 'f7140000-0000-4000-8000-000000000001'::uuid,att.subject_id,
 att.product_offer_id,1,att.provider,att.environment,'s6-b4-attempt-one',
 'synthetic-portone-reader-b4-payment','tx-official-reader-b4',
 'response_received',clock_timestamp(),clock_timestamp()
from public.commerce_payment_attempts att
where att.id='12197000-0000-0000-0000-000000000001'::uuid;

update public.purchase_intents
set status='verified',updated_at=clock_timestamp()
where id='f7140000-0000-4000-8000-000000000001'::uuid;

insert into public.commerce_receipts(
 id,subject_id,purchase_intent_id,product_offer_id,platform,provider,
 external_transaction_id,receipt_fingerprint,verification_status,
 verified_payload_jsonb,verified_at,created_at,environment,verifier_revision,
 verified_amount_minor,verified_currency
)
select 'f7150000-0000-4000-8000-000000000001'::uuid,cr.subject_id,
 'f7140000-0000-4000-8000-000000000001'::uuid,cr.product_offer_id,
 cr.platform,cr.provider,'tx-official-reader-b4',
 'hmac-sha256:k1:9999999999999999999999999999999999999999999999999999999999999999',
 cr.verification_status,cr.verified_payload_jsonb,clock_timestamp(),
 clock_timestamp(),cr.environment,cr.verifier_revision,
 cr.verified_amount_minor,cr.verified_currency
from public.commerce_receipts cr
where cr.id='12192000-0000-0000-0000-000000000002'::uuid;

set local myeongha.subject_id='11390000-0000-0000-0000-000000000001';
select public.internal_acquire_official_reader_scope_lock_v1(
 '11390000-0000-0000-0000-000000000001'::uuid,
 '12103100-0000-0000-0000-000000000001'::uuid,'test-unlockable-reader'
);
select * from public.internal_apply_verified_receipt_capability_effects_v1(
 'f7150000-0000-4000-8000-000000000001'::uuid,
 array['test-reader-unit'],array[transaction_timestamp()],
 array[transaction_timestamp()],array[null]::timestamptz[],array[null]::text[]
);
select * from public.cmd_bind_standard_reading_access_v2(
 '11390000-0000-0000-0000-000000000001'::uuid,
 'f7140000-0000-4000-8000-000000000001'::uuid,
 'f7170000-0000-4000-8000-000000000001'::uuid,
 'f7180000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"f7140000-0000-4000-8000-000000000001"}'::jsonb
);
do $s6_same_bundle$
begin
 if (select count(*) from public.entitlement_grants eg
   join public.commerce_receipts cr on cr.id=eg.source_receipt_id
   join public.standard_reading_reader_access_grants a
     on a.entitlement_grant_id=eg.id and a.subject_id=eg.subject_id
   where cr.id='f7150000-0000-4000-8000-000000000001'::uuid
     and cr.verification_status='verified'
     and eg.subject_id='11390000-0000-0000-0000-000000000001'::uuid
     and eg.grant_source_type='purchase' and eg.status='active'
     and a.official_reading_id='12103100-0000-0000-0000-000000000001'::uuid
     and a.reader_character_id='test-unlockable-reader'
     and a.reader_content_bundle_id='11391000-0000-0000-0000-000000000001'::uuid
 )<>1 then
   raise exception 'Independent B4 exact same-bundle Receipt→Grant→Reader bind unavailable';
 end if;
end
$s6_same_bundle$;
commit;
