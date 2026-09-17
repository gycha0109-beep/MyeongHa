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

create or replace function pg_temp.assert_receipt_has_no_entitlement_mutation(
  label text,
  receipt_id uuid
) returns void
language plpgsql
as $$
declare
  v_grants integer;
  v_events integer;
  v_outbox integer;
begin
  select count(*)::integer into v_grants
  from public.entitlement_grants eg
  where eg.source_receipt_id = receipt_id;

  select count(*)::integer into v_events
  from public.entitlement_events ee
  where ee.source_receipt_id = receipt_id;

  select count(*)::integer into v_outbox
  from public.outbox_events oe
  where oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
    and exists (
      select 1
      from public.entitlements e
      join public.entitlement_grants eg
        on eg.subject_id = e.subject_id
       and eg.entitlement_key = e.entitlement_key
       and eg.scope_key_norm = e.scope_key_norm
      where eg.source_receipt_id = receipt_id
        and oe.aggregate_type = 'entitlement'
        and oe.aggregate_id = e.id::text
    );

  if v_grants <> 0 or v_events <> 0 or v_outbox <> 0 then
    raise exception 'FAIL %: grants=% events=% outbox=%', label, v_grants, v_events, v_outbox;
  end if;
  raise notice 'PASS % -> no entitlement mutation survived', label;
end;
$$;

set constraints all immediate;

insert into auth.users(id)
values ('00000000-0000-0000-0000-000000009091')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values (
  '90900000-0000-0000-0000-000000000001', 'member',
  '00000000-0000-0000-0000-000000009091', 'active', now(), now()
);

-- Successful two-item authority: one unbounded right plus one exact fixed-duration right.
insert into public.products(id, product_key, product_type, enabled, created_at)
values (
  '90910000-0000-0000-0000-000000000001',
  'entitlement-batch-test', 'reading', true, now()
);

insert into public.product_capability_sets(
  id, product_id, definition_version, definition_hash, created_at
) values (
  '90920000-0000-0000-0000-000000000001',
  '90910000-0000-0000-0000-000000000001',
  'entitlement-batch-test-v1', 'sha256:test-entitlement-batch-v1', now()
);

insert into public.product_capability_items(
  capability_set_id, item_key, entitlement_key,
  scope_mode, fixed_scope_key, validity_mode, duration_seconds
) values
(
  '90920000-0000-0000-0000-000000000001',
  'fixed-report', 'reading.entitlement.batch.fixed',
  'fixed', 'report', 'fixed_duration', 3600
),
(
  '90920000-0000-0000-0000-000000000001',
  'unbounded-access', 'reading.entitlement.batch.unbounded',
  'global', null, 'unbounded', null
);

insert into public.product_offers(
  id, product_id, platform, provider, external_product_id,
  currency, display_price_minor, enabled, created_at, capability_set_id
) values (
  '90930000-0000-0000-0000-000000000001',
  '90910000-0000-0000-0000-000000000001',
  'web', 'testpay', 'entitlement-batch-web', 'KRW', 7900, true, now(),
  '90920000-0000-0000-0000-000000000001'
);

insert into public.purchase_intents(
  id, subject_id, product_offer_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at,
  expected_amount_minor, expected_currency, charge_terms_version,
  capability_set_id, capability_snapshot_jsonb, capability_snapshot_hash
) values
(
  '90940000-0000-0000-0000-000000000001',
  '90900000-0000-0000-0000-000000000001',
  '90930000-0000-0000-0000-000000000001',
  'entitlement-batch-test-success', 'sha256:v1:req-entitlement-batch-success',
  pg_catalog.jsonb_build_object(
    'productOfferId', '90930000-0000-0000-0000-000000000001',
    'productId', '90910000-0000-0000-0000-000000000001',
    'platform', 'web', 'provider', 'testpay',
    'externalProductId', 'entitlement-batch-web'
  ),
  'sha256:v1:offer-entitlement-batch-success',
  'verified', now(), now(), 7900, 'KRW', 'charge-terms-v1',
  '90920000-0000-0000-0000-000000000001',
  pg_catalog.jsonb_build_object(
    'capabilitySetId', '90920000-0000-0000-0000-000000000001',
    'definitionVersion', 'entitlement-batch-test-v1',
    'definitionHash', 'sha256:test-entitlement-batch-v1'
  ),
  'sha256:v1:capability-entitlement-batch-success'
),
(
  '90940000-0000-0000-0000-000000000002',
  '90900000-0000-0000-0000-000000000001',
  '90930000-0000-0000-0000-000000000001',
  'entitlement-batch-test-negative', 'sha256:v1:req-entitlement-batch-negative',
  pg_catalog.jsonb_build_object(
    'productOfferId', '90930000-0000-0000-0000-000000000001',
    'productId', '90910000-0000-0000-0000-000000000001',
    'platform', 'web', 'provider', 'testpay',
    'externalProductId', 'entitlement-batch-web'
  ),
  'sha256:v1:offer-entitlement-batch-negative',
  'verified', now(), now(), 7900, 'KRW', 'charge-terms-v1',
  '90920000-0000-0000-0000-000000000001',
  pg_catalog.jsonb_build_object(
    'capabilitySetId', '90920000-0000-0000-0000-000000000001',
    'definitionVersion', 'entitlement-batch-test-v1',
    'definitionHash', 'sha256:test-entitlement-batch-v1'
  ),
  'sha256:v1:capability-entitlement-batch-negative'
);

insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb,
  verified_at, created_at, environment, verifier_revision,
  verified_amount_minor, verified_currency
) values
(
  '90950000-0000-0000-0000-000000000001',
  '90900000-0000-0000-0000-000000000001',
  '90940000-0000-0000-0000-000000000001',
  '90930000-0000-0000-0000-000000000001',
  'web', 'testpay', 'tx-entitlement-batch-success',
  'hmac-sha256:k1:9095000000000000000000000000000000000000000000000000000000000001',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  '2026-09-01T00:00:00Z', now(), 'production', 'test-verifier-v1', 7900, 'KRW'
),
(
  '90950000-0000-0000-0000-000000000002',
  '90900000-0000-0000-0000-000000000001',
  '90940000-0000-0000-0000-000000000002',
  '90930000-0000-0000-0000-000000000001',
  'web', 'testpay', 'tx-entitlement-batch-negative',
  'hmac-sha256:k1:9095000000000000000000000000000000000000000000000000000000000002',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  '2026-09-01T00:00:00Z', now(), 'production', 'test-verifier-v1', 7900, 'KRW'
);

select pg_temp.assert_fails(
  'duplicate Capability Item key is rejected before mutation',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000002',
    array['fixed-report','fixed-report'],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T01:00:00Z'::timestamptz,'2026-09-01T01:00:00Z'::timestamptz],
    array[null,null]::text[]
  )$$,
  'internal_entitlement_batch_item_key_duplicate'
);
select pg_temp.assert_receipt_has_no_entitlement_mutation(
  'duplicate item rejection', '90950000-0000-0000-0000-000000000002'
);

select pg_temp.assert_fails(
  'missing Capability Item is rejected before mutation',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000002',
    array['fixed-report'],
    array['2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T01:00:00Z'::timestamptz],
    array[null]::text[]
  )$$,
  'internal_entitlement_batch_capability_set_mismatch'
);

select pg_temp.assert_fails(
  'unknown extra Capability Item is rejected before mutation',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000002',
    array['fixed-report','not-authoritative'],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T01:00:00Z'::timestamptz,null]::timestamptz[],
    array[null,null]::text[]
  )$$,
  'internal_entitlement_batch_capability_set_mismatch'
);

select pg_temp.assert_fails(
  'wrong fixed duration fails the complete batch atomically',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000002',
    array['unbounded-access','fixed-report'],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array[null,'2026-09-01T00:59:59Z'::timestamptz]::timestamptz[],
    array[null,null]::text[]
  )$$,
  'internal_entitlement_batch_fixed_duration_invalid'
);
select pg_temp.assert_receipt_has_no_entitlement_mutation(
  'invalid later batch item rollback', '90950000-0000-0000-0000-000000000002'
);

select pg_temp.assert_fails(
  'unbounded Capability rejects finite expiry',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000002',
    array['fixed-report','unbounded-access'],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T01:00:00Z'::timestamptz,'2026-09-02T00:00:00Z'::timestamptz],
    array[null,null]::text[]
  )$$,
  'internal_entitlement_batch_unbounded_validity_invalid'
);

-- Caller supplies reverse item order. The DB owns deterministic item_key order.
do $$
declare
  v_result_order text[];
  v_grants integer;
  v_events integer;
  v_projections integer;
  v_outbox integer;
begin
  select array_agg(x.result_item_key)
    into v_result_order
  from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000001',
    array['unbounded-access','fixed-report'],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array[null,'2026-09-01T01:00:00Z'::timestamptz]::timestamptz[],
    array[null,null]::text[]
  ) as x;

  if v_result_order is distinct from array['fixed-report','unbounded-access'] then
    raise exception 'FAIL deterministic batch order mismatch: %', v_result_order;
  end if;

  select count(*)::integer into v_grants
  from public.entitlement_grants eg
  where eg.source_receipt_id = '90950000-0000-0000-0000-000000000001';

  select count(*)::integer into v_events
  from public.entitlement_events ee
  where ee.source_receipt_id = '90950000-0000-0000-0000-000000000001';

  select count(*)::integer into v_projections
  from public.entitlements e
  where e.subject_id = '90900000-0000-0000-0000-000000000001'
    and e.entitlement_key in (
      'reading.entitlement.batch.fixed',
      'reading.entitlement.batch.unbounded'
    );

  select count(*)::integer into v_outbox
  from public.outbox_events oe
  where oe.aggregate_type = 'entitlement'
    and oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
    and exists (
      select 1
      from public.entitlements e
      where e.id::text = oe.aggregate_id
        and e.subject_id = '90900000-0000-0000-0000-000000000001'
        and e.entitlement_key in (
          'reading.entitlement.batch.fixed',
          'reading.entitlement.batch.unbounded'
        )
    );

  if v_grants <> 2 or v_events <> 2 or v_projections <> 2 or v_outbox <> 2 then
    raise exception 'FAIL complete batch state mismatch: grants=% events=% projections=% outbox=%',
      v_grants, v_events, v_projections, v_outbox;
  end if;

  raise notice 'PASS complete multi-item batch applies all pinned Capability Items in deterministic order';
end;
$$;

-- Exact full-batch replay must converge without duplicate durable state.
select * from public.internal_apply_verified_receipt_capability_effects_v1(
  '90950000-0000-0000-0000-000000000001',
  array['fixed-report','unbounded-access'],
  array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
  array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
  array['2026-09-01T01:00:00Z'::timestamptz,null]::timestamptz[],
  array[null,null]::text[]
);

do $$
declare
  v_grants integer;
  v_events integer;
  v_outbox integer;
begin
  select count(*)::integer into v_grants
  from public.entitlement_grants eg
  where eg.source_receipt_id = '90950000-0000-0000-0000-000000000001';
  select count(*)::integer into v_events
  from public.entitlement_events ee
  where ee.source_receipt_id = '90950000-0000-0000-0000-000000000001';
  select count(*)::integer into v_outbox
  from public.outbox_events oe
  where oe.aggregate_type = 'entitlement'
    and oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
    and exists (
      select 1
      from public.entitlements e
      where e.id::text = oe.aggregate_id
        and e.subject_id = '90900000-0000-0000-0000-000000000001'
        and e.entitlement_key in (
          'reading.entitlement.batch.fixed',
          'reading.entitlement.batch.unbounded'
        )
    );
  if v_grants <> 2 or v_events <> 2 or v_outbox <> 2 then
    raise exception 'FAIL batch replay duplicated durable state: grants=% events=% outbox=%',
      v_grants, v_events, v_outbox;
  end if;
  raise notice 'PASS exact complete batch replay is idempotent';
end;
$$;

-- Provider-expiry is intentionally not interpreted by this provider-neutral DB primitive.
insert into public.products(id, product_key, product_type, enabled, created_at)
values (
  '90910000-0000-0000-0000-000000000002',
  'entitlement-batch-provider-expiry-test', 'reading', true, now()
);
insert into public.product_capability_sets(
  id, product_id, definition_version, definition_hash, created_at
) values (
  '90920000-0000-0000-0000-000000000002',
  '90910000-0000-0000-0000-000000000002',
  'entitlement-batch-provider-expiry-v1', 'sha256:test-provider-expiry-v1', now()
);
insert into public.product_capability_items(
  capability_set_id, item_key, entitlement_key,
  scope_mode, fixed_scope_key, validity_mode, duration_seconds
) values (
  '90920000-0000-0000-0000-000000000002',
  'provider-expiry-access', 'reading.entitlement.batch.provider-expiry',
  'global', null, 'provider_expiry', null
);
insert into public.product_offers(
  id, product_id, platform, provider, external_product_id,
  currency, display_price_minor, enabled, created_at, capability_set_id
) values (
  '90930000-0000-0000-0000-000000000002',
  '90910000-0000-0000-0000-000000000002',
  'web', 'testpay', 'provider-expiry-web', 'KRW', 8900, true, now(),
  '90920000-0000-0000-0000-000000000002'
);
insert into public.purchase_intents(
  id, subject_id, product_offer_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at,
  expected_amount_minor, expected_currency, charge_terms_version,
  capability_set_id, capability_snapshot_jsonb, capability_snapshot_hash
) values (
  '90940000-0000-0000-0000-000000000004',
  '90900000-0000-0000-0000-000000000001',
  '90930000-0000-0000-0000-000000000002',
  'entitlement-batch-provider-expiry', 'sha256:v1:req-provider-expiry',
  pg_catalog.jsonb_build_object(
    'productOfferId', '90930000-0000-0000-0000-000000000002',
    'productId', '90910000-0000-0000-0000-000000000002',
    'platform', 'web', 'provider', 'testpay', 'externalProductId', 'provider-expiry-web'
  ),
  'sha256:v1:offer-provider-expiry',
  'verified', now(), now(), 8900, 'KRW', 'charge-terms-v1',
  '90920000-0000-0000-0000-000000000002',
  pg_catalog.jsonb_build_object(
    'capabilitySetId', '90920000-0000-0000-0000-000000000002',
    'definitionVersion', 'entitlement-batch-provider-expiry-v1',
    'definitionHash', 'sha256:test-provider-expiry-v1'
  ),
  'sha256:v1:capability-provider-expiry'
);
insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb,
  verified_at, created_at, environment, verifier_revision,
  verified_amount_minor, verified_currency
) values (
  '90950000-0000-0000-0000-000000000004',
  '90900000-0000-0000-0000-000000000001',
  '90940000-0000-0000-0000-000000000004',
  '90930000-0000-0000-0000-000000000002',
  'web', 'testpay', 'tx-provider-expiry',
  'hmac-sha256:k1:9095000000000000000000000000000000000000000000000000000000000004',
  'verified', '{"schemaVersion":"commerce-evidence-v2","providerValidUntil":"opaque-provider-token"}'::jsonb,
  '2026-09-01T00:00:00Z', now(), 'production', 'test-verifier-v1', 8900, 'KRW'
);
select pg_temp.assert_fails(
  'provider-expiry remains fail-closed without provider-specific typed normalization authority',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000004',
    array['provider-expiry-access'],
    array['2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz],
    array['2026-10-01T00:00:00Z'::timestamptz],
    array[null]::text[]
  )$$,
  'internal_entitlement_batch_provider_expiry_unresolved'
);
select pg_temp.assert_receipt_has_no_entitlement_mutation(
  'provider-expiry fail-closed', '90950000-0000-0000-0000-000000000004'
);

-- Historical Purchase Intent without v3 Capability provenance cannot be fulfilled.
insert into public.purchase_intents(
  id, subject_id, product_offer_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at,
  expected_amount_minor, expected_currency, charge_terms_version
) values (
  '90940000-0000-0000-0000-000000000003',
  '90900000-0000-0000-0000-000000000001',
  '90930000-0000-0000-0000-000000000001',
  'entitlement-batch-historical', 'sha256:v1:req-entitlement-batch-historical',
  pg_catalog.jsonb_build_object(
    'productOfferId', '90930000-0000-0000-0000-000000000001',
    'productId', '90910000-0000-0000-0000-000000000001',
    'platform', 'web', 'provider', 'testpay',
    'externalProductId', 'entitlement-batch-web'
  ),
  'sha256:v1:offer-entitlement-batch-historical',
  'verified', now(), now(), 7900, 'KRW', 'charge-terms-v1'
);
insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb,
  verified_at, created_at, environment, verifier_revision,
  verified_amount_minor, verified_currency
) values (
  '90950000-0000-0000-0000-000000000003',
  '90900000-0000-0000-0000-000000000001',
  '90940000-0000-0000-0000-000000000003',
  '90930000-0000-0000-0000-000000000001',
  'web', 'testpay', 'tx-entitlement-batch-historical',
  'hmac-sha256:k1:9095000000000000000000000000000000000000000000000000000000000003',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  '2026-09-01T00:00:00Z', now(), 'production', 'test-verifier-v1', 7900, 'KRW'
);
select pg_temp.assert_fails(
  'historical Purchase Intent without v3 capability provenance is rejected',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000003',
    array['fixed-report','unbounded-access'],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T01:00:00Z'::timestamptz,null]::timestamptz[],
    array[null,null]::text[]
  )$$,
  'internal_entitlement_batch_capability_authority_unavailable'
);

-- A verified sandbox Receipt still cannot create production rights.
insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb,
  verified_at, created_at, environment, verifier_revision,
  verified_amount_minor, verified_currency
) values (
  '90950000-0000-0000-0000-000000000005',
  '90900000-0000-0000-0000-000000000001',
  '90940000-0000-0000-0000-000000000002',
  '90930000-0000-0000-0000-000000000001',
  'web', 'testpay', 'tx-entitlement-batch-sandbox',
  'hmac-sha256:k1:9095000000000000000000000000000000000000000000000000000000000005',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  '2026-09-01T00:00:00Z', now(), 'sandbox', 'test-verifier-v1', 7900, 'KRW'
);
select pg_temp.assert_fails(
  'sandbox Receipt cannot enter entitlement fulfillment',
  $$select * from public.internal_apply_verified_receipt_capability_effects_v1(
    '90950000-0000-0000-0000-000000000005',
    array['fixed-report','unbounded-access'],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz],
    array['2026-09-01T01:00:00Z'::timestamptz,null]::timestamptz[],
    array[null,null]::text[]
  )$$,
  'internal_entitlement_batch_receipt_unavailable'
);

select 'verified Receipt Capability batch fulfillment foundation passed' as result;
