\set ON_ERROR_STOP on

create or replace function pg_temp.assert_fails(
  label text,
  statement text,
  expected_fragment text
) returns void
language plpgsql
as $$
declare
  actual_message text;
  actual_constraint text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics
      actual_message = message_text,
      actual_constraint = constraint_name;
    if position(expected_fragment in coalesce(actual_message, '')) > 0
       or position(expected_fragment in coalesce(actual_constraint, '')) > 0 then
      raise notice 'PASS % -> %', label, expected_fragment;
      return;
    end if;
    raise exception 'FAIL %: wrong error: % / constraint=%', label, actual_message, actual_constraint;
  end;
  raise exception 'FAIL %: statement unexpectedly succeeded', label;
end;
$$;

set constraints all immediate;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000009301'),
  ('00000000-0000-0000-0000-000000009302')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('93000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-000000009301', 'active', now(), now()),
  ('93000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000009302', 'active', now(), now());

insert into public.products(id, product_key, product_type, enabled, created_at)
values ('93100000-0000-0000-0000-000000000001', 'payment-source-test', 'reading', true, now());

insert into public.product_offers(
  id, product_id, platform, provider, external_product_id,
  currency, display_price_minor, enabled, created_at
) values (
  '93200000-0000-0000-0000-000000000001',
  '93100000-0000-0000-0000-000000000001',
  'web', 'testpay', 'payment-source-web', 'KRW', 4900, true, now()
);

insert into public.purchase_intents(
  id, subject_id, product_offer_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at,
  expected_amount_minor, expected_currency, charge_terms_version
) values (
  '93300000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  '93200000-0000-0000-0000-000000000001',
  'payment-source-1', 'sha256:v1:req-payment-source-1', '{}', 'sha256:v1:snapshot-payment-source-1',
  'pending', now(), now(), 4900, 'KRW', 'charge-terms-v1'
);

select pg_temp.assert_fails(
  'pinned charge terms cannot be rewritten',
  $$update public.purchase_intents set expected_amount_minor=1 where id='93300000-0000-0000-0000-000000000001'$$,
  'tr_purchase_intent_charge_terms_immutable'
);

-- A provider source may exist before semantic verification; the exact money equality
-- becomes mandatory only when the receipt is promoted to verified authority.
insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, created_at,
  environment, verifier_revision
) values (
  '93400000-0000-0000-0000-000000000008',
  '93000000-0000-0000-0000-000000000001',
  '93300000-0000-0000-0000-000000000001',
  '93200000-0000-0000-0000-000000000001',
  'web', 'testpay', 'tx-pending-before-money',
  'hmac-sha256:k1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'pending', now(), 'sandbox', 'test-verifier-v1'
);

select pg_temp.assert_fails(
  'pending receipt cannot become verified without matching monetary facts',
  $$update public.commerce_receipts set verification_status='verified', verified_at=now() where id='93400000-0000-0000-0000-000000000008'$$,
  'ct_commerce_receipt_charge_terms_mismatch'
);

select pg_temp.assert_fails(
  'verified receipt amount must match purchase intent charge terms',
  $$insert into public.commerce_receipts(id,subject_id,purchase_intent_id,product_offer_id,platform,provider,external_transaction_id,receipt_fingerprint,verification_status,verified_at,created_at,environment,verifier_revision,verified_amount_minor,verified_currency) values ('93400000-0000-0000-0000-000000000009','93000000-0000-0000-0000-000000000001','93300000-0000-0000-0000-000000000001','93200000-0000-0000-0000-000000000001','web','testpay','tx-wrong-amount','hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','verified',now(),now(),'sandbox','test-verifier-v1',1,'KRW')$$,
  'ct_commerce_receipt_charge_terms_mismatch'
);

insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id, external_original_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb, verified_at, created_at,
  environment, verifier_revision, verified_amount_minor, verified_currency
) values (
  '93400000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  '93300000-0000-0000-0000-000000000001',
  '93200000-0000-0000-0000-000000000001',
  'web', 'testpay', 'tx-source-1', 'orig-source-1',
  'hmac-sha256:k1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'verified', '{"schemaVersion":"verified-receipt-v1"}', now(), now(),
  'sandbox', 'test-verifier-v1', 4900, 'KRW'
);

insert into public.commerce_receipts(
  id, subject_id, product_offer_id, platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, created_at
) values (
  '93400000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001',
  '93200000-0000-0000-0000-000000000001', 'web', 'testpay', 'tx-source-2',
  'hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'pending', now()
);

select pg_temp.assert_fails(
  'verified receipt payload cannot be rewritten',
  $$update public.commerce_receipts set verified_payload_jsonb='{"schemaVersion":"rewritten"}'::jsonb where id='93400000-0000-0000-0000-000000000001'$$,
  'tr_commerce_receipt_payload_immutable'
);

select pg_temp.assert_fails(
  'provider event cannot resolve to a different transaction receipt',
  $$insert into public.commerce_provider_events(id,provider,external_event_id,event_type,external_transaction_id,resolved_subject_id,resolution_source_type,resolved_receipt_id,payload_fingerprint,status,received_at,environment,verifier_revision) values ('93500000-0000-0000-0000-000000000009','testpay','evt-wrong-lineage','refund','tx-source-2','93000000-0000-0000-0000-000000000001','receipt','93400000-0000-0000-0000-000000000001','sha256:v1:evt-wrong-lineage','verified',now(),'sandbox','test-verifier-v1')$$,
  'ct_provider_event_transaction_lineage'
);

insert into public.commerce_provider_events(
  id, provider, external_event_id, event_type, external_transaction_id,
  resolved_subject_id, resolution_source_type, resolved_receipt_id,
  payload_fingerprint, verified_payload_jsonb, status, received_at,
  environment, verifier_revision
) values (
  '93500000-0000-0000-0000-000000000001',
  'testpay', 'evt-source-1', 'refund', 'tx-source-1',
  '93000000-0000-0000-0000-000000000001', 'receipt',
  '93400000-0000-0000-0000-000000000001',
  'sha256:v1:evt-source-1', '{"schemaVersion":"verified-event-v1"}',
  'verified', now(), 'sandbox', 'test-verifier-v1'
);

select pg_temp.assert_fails(
  'verified provider event resolution cannot be rewritten',
  $$update public.commerce_provider_events set resolved_receipt_id='93400000-0000-0000-0000-000000000002' where id='93500000-0000-0000-0000-000000000001'$$,
  'tr_provider_event_resolution_immutable'
);

select pg_temp.assert_fails(
  'verified provider event payload cannot be rewritten',
  $$update public.commerce_provider_events set verified_payload_jsonb='{"schemaVersion":"rewritten"}'::jsonb where id='93500000-0000-0000-0000-000000000001'$$,
  'tr_provider_event_payload_immutable'
);

insert into public.entitlement_grants(
  id, subject_id, entitlement_key, scope_key, grant_key, grant_source_type,
  status, valid_from, revision, created_at, updated_at, source_receipt_id
) values (
  '93600000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  'payment.source.test', null, 'receipt:93400000-0000-0000-0000-000000000001', 'purchase',
  'active', now(), 0, now(), now(), '93400000-0000-0000-0000-000000000001'
);

select pg_temp.assert_fails(
  'purchase grant source receipt must preserve owner lineage',
  $$insert into public.entitlement_grants(id,subject_id,entitlement_key,scope_key,grant_key,grant_source_type,status,valid_from,revision,created_at,updated_at,source_receipt_id) values ('93600000-0000-0000-0000-000000000009','93000000-0000-0000-0000-000000000002','payment.source.test',null,'bad-cross-owner','purchase','active',now(),0,now(),now(),'93400000-0000-0000-0000-000000000001')$$,
  'entitlement_grants_source_receipt_subject_fk'
);

select pg_temp.assert_fails(
  'entitlement event v2 requires rebuildable target effect fields',
  $$insert into public.entitlement_events(id,grant_id,subject_id,entitlement_key,scope_key_norm,source_type,source_actor_ref,event_type,event_schema_version,event_dedupe_key,effective_at,created_at) values ('93700000-0000-0000-0000-000000000009','93600000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','payment.source.test','__GLOBAL__','system','payment-source-test','adjusted','ent-event-v2','missing-target',now(),now())$$,
  'entitlement_events_v2_effect_shape_check'
);

insert into public.entitlement_events(
  id, grant_id, subject_id, entitlement_key, scope_key_norm,
  source_type, source_actor_ref, event_type, event_schema_version,
  event_dedupe_key, effective_at, created_at,
  target_status, target_valid_from, target_valid_until, reason_code
) values (
  '93700000-0000-0000-0000-000000000001',
  '93600000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  'payment.source.test', '__GLOBAL__',
  'system', 'payment-source-test', 'adjusted', 'ent-event-v2',
  'valid-v2-effect', now(), now(),
  'active', now(), null, 'TEST_REBUILDABLE_EFFECT'
);

do $$
begin
  raise notice 'PASS commerce payment source authority hardening';
end;
$$;

select 'commerce payment source authority hardening passed' as result;
