\set ON_ERROR_STOP on
-- Disposable PostgreSQL-only synthetic Checkout ledger. No S5 body, S7 ACK,
-- owner notice store, public checkout or refund action is created here.
-- The real S7 authorization function is tested elsewhere; this fixture
-- exercises only immutable Purchase/Receipt/Grant/Item/Attempt relationships.
insert into auth.users(id)
values ('f7710000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values (
  'f7720000-0000-4000-8000-000000000001','member',
  'f7710000-0000-4000-8000-000000000001','active',null,
  '2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'
);

insert into public.products(id,product_key,product_type,enabled,created_at)
values (
  'f7730000-0000-4000-8000-000000000001',
  'test-only-immutable-reader-checkout-unit','reading',true,
  '2026-09-01T00:00:00Z'
);

insert into public.product_capability_sets(
  id,product_id,definition_version,definition_hash,created_at
) values (
  'f7740000-0000-4000-8000-000000000001',
  'f7730000-0000-4000-8000-000000000001',
  'test-only-capability-v1','sha256:test-only-reader-checkout-unit',
  '2026-09-01T00:00:00Z'
);

insert into public.product_capability_items(
  capability_set_id,item_key,entitlement_key,scope_mode,fixed_scope_key,
  validity_mode,duration_seconds
) values (
  'f7740000-0000-4000-8000-000000000001',
  'original-reader-item','reader.test.checkout.unit',
  'global',null,'provider_expiry',null
);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,
  display_price_minor,enabled,created_at,capability_set_id
) values (
  'f7750000-0000-4000-8000-000000000001',
  'f7730000-0000-4000-8000-000000000001',
  'web','portone_v2','original-reader-item-test-only','KRW',
  1500,true,'2026-09-01T00:00:00Z',
  'f7740000-0000-4000-8000-000000000001'
);

insert into public.purchase_intents(
  id,subject_id,product_offer_id,idempotency_key,request_hash,
  offer_snapshot_jsonb,offer_snapshot_hash,status,created_at,updated_at,
  expected_amount_minor,expected_currency,charge_terms_version,
  capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
) values (
  'f7760000-0000-4000-8000-000000000001',
  'f7720000-0000-4000-8000-000000000001',
  'f7750000-0000-4000-8000-000000000001',
  'original-reader-unit-test','sha256:original-reader-unit-intent',
  pg_catalog.jsonb_build_object(
    'productOfferId','f7750000-0000-4000-8000-000000000001',
    'productId','f7730000-0000-4000-8000-000000000001',
    'platform','web','provider','portone_v2',
    'externalProductId','original-reader-item-test-only'
  ),
  'sha256:original-reader-unit-offer','created',
  '2026-09-01T00:01:00Z','2026-09-01T00:01:00Z',
  1500,'KRW','test-charge-terms-v1',
  'f7740000-0000-4000-8000-000000000001',
  pg_catalog.jsonb_build_object(
    'capabilitySetId','f7740000-0000-4000-8000-000000000001',
    'definitionVersion','test-only-capability-v1',
    'definitionHash','sha256:test-only-reader-checkout-unit'
  ),
  'sha256:original-reader-unit-capability'
);

-- The original attempt precedes Purchase verification and any Grant issuance.
insert into public.commerce_payment_attempts(
  id,purchase_intent_id,subject_id,product_offer_id,attempt_no,
  provider,environment,idempotency_key,provider_request_id,
  status,created_at,updated_at
) values (
  'f7770000-0000-4000-8000-000000000001',
  'f7760000-0000-4000-8000-000000000001',
  'f7720000-0000-4000-8000-000000000001',
  'f7750000-0000-4000-8000-000000000001',
  1,'portone_v2','production','original-reader-attempt-1',
  'test-only-portone-original-reader-attempt-1','created',
  '2026-09-01T00:02:00Z','2026-09-01T00:02:00Z'
);

-- The same original Purchase Intent may have a second, independently
-- allocated payment attempt. Notice acknowledgement must PRECEDE attempt 1,
-- never borrow the later retry's timestamp as the original checkout boundary.
insert into public.commerce_payment_attempts(
  id,purchase_intent_id,subject_id,product_offer_id,attempt_no,
  provider,environment,idempotency_key,provider_request_id,
  status,created_at,updated_at
) values (
  'f7770000-0000-4000-8000-000000000002',
  'f7760000-0000-4000-8000-000000000001',
  'f7720000-0000-4000-8000-000000000001',
  'f7750000-0000-4000-8000-000000000001',
  2,'portone_v2','production','original-reader-attempt-2',
  'test-only-portone-original-reader-attempt-2','created',
  '2026-09-01T00:02:30Z','2026-09-01T00:02:30Z'
);

-- Distinct legitimate purchase by the SAME member for the SAME pinned
-- product/capability. Two Grants must remain independent despite sharing
-- Subject, offer, entitlement, scope and item_key.
insert into public.purchase_intents(
  id,subject_id,product_offer_id,idempotency_key,request_hash,
  offer_snapshot_jsonb,offer_snapshot_hash,status,created_at,updated_at,
  expected_amount_minor,expected_currency,charge_terms_version,
  capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
)
select 'f7760000-0000-4000-8000-000000000002'::uuid,
  subject_id,product_offer_id,'sibling-reader-unit-test',
  'sha256:sibling-reader-unit-intent',
  offer_snapshot_jsonb,offer_snapshot_hash,'created',
  '2026-09-01T00:01:30Z'::timestamptz,
  '2026-09-01T00:01:30Z'::timestamptz,
  expected_amount_minor,expected_currency,charge_terms_version,
  capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
from public.purchase_intents
where id='f7760000-0000-4000-8000-000000000001'::uuid;

insert into public.commerce_payment_attempts(
  id,purchase_intent_id,subject_id,product_offer_id,attempt_no,
  provider,environment,idempotency_key,provider_request_id,
  status,created_at,updated_at
) values (
  'f7770000-0000-4000-8000-000000000003',
  'f7760000-0000-4000-8000-000000000002',
  'f7720000-0000-4000-8000-000000000001',
  'f7750000-0000-4000-8000-000000000001',
  1,'portone_v2','production','sibling-reader-attempt-1',
  'test-only-portone-sibling-reader-attempt','created',
  '2026-09-01T00:02:45Z','2026-09-01T00:02:45Z'
);
update public.purchase_intents
set status='verified',updated_at='2026-09-01T00:04:00Z'
where id='f7760000-0000-4000-8000-000000000002';

update public.purchase_intents
set status='verified',updated_at='2026-09-01T00:04:00Z'
where id='f7760000-0000-4000-8000-000000000001';

insert into public.commerce_receipts(
  id,subject_id,purchase_intent_id,product_offer_id,
  platform,provider,external_transaction_id,receipt_fingerprint,
  verification_status,verified_payload_jsonb,verified_at,created_at,
  environment,verifier_revision,verified_amount_minor,verified_currency
) values (
  'f7780000-0000-4000-8000-000000000001',
  'f7720000-0000-4000-8000-000000000001',
  'f7760000-0000-4000-8000-000000000001',
  'f7750000-0000-4000-8000-000000000001',
  'web','portone_v2','test-only-portone-original-reader-transaction-1',
  'hmac-sha256:k1:9015000000000000000000000000000000000000000000000000000000000001',
  'verified','{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  '2026-09-01T00:03:00Z','2026-09-01T00:03:00Z',
  'production','test-only-verifier-v1',1500,'KRW'
);

select * from public.internal_apply_entitlement_effect_v1(
  'receipt','f7780000-0000-4000-8000-000000000001'::uuid,
  null,'original-reader-item',
  null,null,'granted','2026-09-01T00:03:00Z','active',
  '2026-09-01T00:03:00Z','2099-01-01T00:00:00Z',null
);

-- The sibling is verified independently. Neither Receipt nor Grant may
-- be substituted for the original checkout notice or delivery evidence.
insert into public.commerce_receipts(
  id,subject_id,purchase_intent_id,product_offer_id,
  platform,provider,external_transaction_id,receipt_fingerprint,
  verification_status,verified_payload_jsonb,verified_at,created_at,
  environment,verifier_revision,verified_amount_minor,verified_currency
)
select
  'f7780000-0000-4000-8000-000000000002'::uuid,
  subject_id,'f7760000-0000-4000-8000-000000000002'::uuid,
  product_offer_id,platform,provider,
  'test-only-portone-sibling-reader-transaction',
  'hmac-sha256:k1:9015000000000000000000000000000000000000000000000000000000000002',
  'verified',verified_payload_jsonb,
  '2026-09-01T00:03:30Z'::timestamptz,
  '2026-09-01T00:03:30Z'::timestamptz,
  environment,verifier_revision,verified_amount_minor,verified_currency
from public.commerce_receipts
where id='f7780000-0000-4000-8000-000000000001'::uuid;

select * from public.internal_apply_entitlement_effect_v1(
  'receipt','f7780000-0000-4000-8000-000000000002'::uuid,
  null,'original-reader-item',
  null,null,'granted','2026-09-01T00:03:30Z','active',
  '2026-09-01T00:03:30Z','2099-01-01T00:00:00Z',null
);

do $fixture_check$
begin
  if not exists (
    select 1 from public.entitlement_grants g
    join public.commerce_receipts r on r.id=g.source_receipt_id
    where r.purchase_intent_id='f7760000-0000-4000-8000-000000000001'::uuid
      and g.grant_key='receipt:' || r.id::text
      and g.entitlement_key='reader.test.checkout.unit'
      and g.scope_key_norm='__GLOBAL__'
  ) then
    raise exception 'Original checkout ledger fixture failed to issue the real Receipt-backed Grant';
  end if;
end
$fixture_check$;
