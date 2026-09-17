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
    get stacked diagnostics actual_message = message_text, actual_constraint = constraint_name;
    if position(expected_fragment in coalesce(actual_message, '')) > 0
       or position(expected_fragment in coalesce(actual_constraint, '')) > 0 then
      raise notice 'PASS % -> %', label, expected_fragment;
      return;
    end if;
    raise exception 'FAIL %: wrong error: % / constraint=%',
      label, actual_message, actual_constraint;
  end;
  raise exception 'FAIL %: statement unexpectedly succeeded', label;
end;
$$;

-- Explicitly prove a non-verified Receipt cannot enter initial fulfillment.
insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb,
  verified_at, created_at, environment, verifier_revision,
  verified_amount_minor, verified_currency
) values (
  '90950000-0000-0000-0000-000000000007',
  '90900000-0000-0000-0000-000000000001',
  '90940000-0000-0000-0000-000000000002',
  '90930000-0000-0000-0000-000000000001',
  'web', 'testpay', 'tx-entitlement-batch-revoked',
  'hmac-sha256:k1:9095000000000000000000000000000000000000000000000000000000000007',
  'revoked', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  '2026-09-01T00:00:00Z', now(), 'production', 'test-verifier-v1', 7900, 'KRW'
);

select pg_temp.assert_fails(
  'non-verified Receipt cannot enter entitlement fulfillment',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000007',
    array['fixed-report','unbounded-access'],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T01:00:00Z'::timestamptz,null]::timestamptz[],
    array[null,null]::text[]
  )$$,
  'internal_entitlement_batch_receipt_unavailable'
);

do $$
declare
  v_grants integer;
  v_events integer;
begin
  select count(*)::integer into v_grants
  from public.entitlement_grants eg
  where eg.source_receipt_id = '90950000-0000-0000-0000-000000000007';

  select count(*)::integer into v_events
  from public.entitlement_events ee
  where ee.source_receipt_id = '90950000-0000-0000-0000-000000000007';

  if v_grants <> 0 or v_events <> 0 then
    raise exception 'FAIL non-verified Receipt mutated entitlement state: grants=% events=%',
      v_grants, v_events;
  end if;
  raise notice 'PASS non-verified Receipt leaves entitlement state untouched';
end;
$$;

-- Prove PostgreSQL statement atomicity across nested #901 calls, not merely prevalidation.
-- Seed only the lexically second item (unbounded-access) for this Receipt. The batch then
-- applies fixed-report first, reaches the pre-existing second item, and fails on a
-- conflicting replay. The first nested mutation must be rolled back while the pre-seeded
-- second-item state remains unchanged.
insert into public.purchase_intents(
  id, subject_id, product_offer_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at,
  expected_amount_minor, expected_currency, charge_terms_version,
  capability_set_id, capability_snapshot_jsonb, capability_snapshot_hash
) values (
  '90940000-0000-0000-0000-000000000006',
  '90900000-0000-0000-0000-000000000001',
  '90930000-0000-0000-0000-000000000001',
  'entitlement-batch-nested-rollback', 'sha256:v1:req-entitlement-batch-nested-rollback',
  pg_catalog.jsonb_build_object(
    'productOfferId', '90930000-0000-0000-0000-000000000001',
    'productId', '90910000-0000-0000-0000-000000000001',
    'platform', 'web', 'provider', 'testpay',
    'externalProductId', 'entitlement-batch-web'
  ),
  'sha256:v1:offer-entitlement-batch-nested-rollback',
  'verified', now(), now(), 7900, 'KRW', 'charge-terms-v1',
  '90920000-0000-0000-0000-000000000001',
  pg_catalog.jsonb_build_object(
    'capabilitySetId', '90920000-0000-0000-0000-000000000001',
    'definitionVersion', 'entitlement-batch-test-v1',
    'definitionHash', 'sha256:test-entitlement-batch-v1'
  ),
  'sha256:v1:capability-entitlement-batch-nested-rollback'
);

insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb,
  verified_at, created_at, environment, verifier_revision,
  verified_amount_minor, verified_currency
) values (
  '90950000-0000-0000-0000-000000000006',
  '90900000-0000-0000-0000-000000000001',
  '90940000-0000-0000-0000-000000000006',
  '90930000-0000-0000-0000-000000000001',
  'web', 'testpay', 'tx-entitlement-batch-nested-rollback',
  'hmac-sha256:k1:9095000000000000000000000000000000000000000000000000000000000006',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  '2026-09-01T00:00:00Z', now(), 'production', 'test-verifier-v1', 7900, 'KRW'
);

select * from public.internal_apply_entitlement_effect_v1(
  'receipt', '90950000-0000-0000-0000-000000000006', null, 'unbounded-access',
  null, null, 'granted', '2026-09-01T00:00:00Z', 'active',
  '2026-09-01T00:00:00Z', null, null
);

select pg_temp.assert_fails(
  'later nested apply conflict rolls back earlier item mutation',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000006',
    array['fixed-report','unbounded-access'],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-08-31T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-08-31T00:00:00Z'::timestamptz],
    array['2026-09-01T01:00:00Z'::timestamptz,null]::timestamptz[],
    array[null,null]::text[]
  )$$,
  'internal_entitlement_effect_source_semantic_conflict'
);

do $$
declare
  v_grants integer;
  v_events integer;
  v_fixed_grants integer;
  v_receipt_outbox integer;
begin
  select count(*)::integer into v_grants
  from public.entitlement_grants eg
  where eg.source_receipt_id = '90950000-0000-0000-0000-000000000006';

  select count(*)::integer into v_events
  from public.entitlement_events ee
  where ee.source_receipt_id = '90950000-0000-0000-0000-000000000006';

  select count(*)::integer into v_fixed_grants
  from public.entitlement_grants eg
  where eg.source_receipt_id = '90950000-0000-0000-0000-000000000006'
    and eg.entitlement_key = 'reading.entitlement.batch.fixed';

  select count(*)::integer into v_receipt_outbox
  from public.outbox_events oe
  where oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
    and oe.dedupe_key like '%receipt:90950000-0000-0000-0000-000000000006%';

  if v_grants <> 1 or v_events <> 1 or v_fixed_grants <> 0 or v_receipt_outbox <> 1 then
    raise exception
      'FAIL nested batch rollback leaked state: grants=% events=% fixed_grants=% receipt_outbox=%',
      v_grants, v_events, v_fixed_grants, v_receipt_outbox;
  end if;

  raise notice 'PASS later nested failure rolls back every earlier mutation in the batch statement';
end;
$$;

select 'verified Receipt Capability batch hardening passed' as result;
