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

set constraints all immediate;

insert into auth.users(id)
values ('00000000-0000-0000-0000-000000009011')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values (
  '90100000-0000-0000-0000-000000000001', 'member',
  '00000000-0000-0000-0000-000000009011', 'active', now(), now()
);

insert into public.products(id, product_key, product_type, enabled, created_at)
values (
  '90110000-0000-0000-0000-000000000001',
  'entitlement-effect-apply-test', 'reading', true, now()
);

insert into public.product_capability_sets(
  id, product_id, definition_version, definition_hash, created_at
) values (
  '90120000-0000-0000-0000-000000000001',
  '90110000-0000-0000-0000-000000000001',
  'entitlement-effect-test-v1', 'sha256:test-entitlement-effect-v1', now()
);

insert into public.product_capability_items(
  capability_set_id, item_key, entitlement_key,
  scope_mode, fixed_scope_key, validity_mode, duration_seconds
) values (
  '90120000-0000-0000-0000-000000000001',
  'reading-access', 'reading.entitlement.effect.test',
  'global', null, 'provider_expiry', null
);

insert into public.product_offers(
  id, product_id, platform, provider, external_product_id,
  currency, display_price_minor, enabled, created_at, capability_set_id
) values (
  '90130000-0000-0000-0000-000000000001',
  '90110000-0000-0000-0000-000000000001',
  'web', 'testpay', 'entitlement-effect-web', 'KRW', 4900, true, now(),
  '90120000-0000-0000-0000-000000000001'
);

insert into public.purchase_intents(
  id, subject_id, product_offer_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at,
  expected_amount_minor, expected_currency, charge_terms_version,
  capability_set_id, capability_snapshot_jsonb, capability_snapshot_hash
) values (
  '90140000-0000-0000-0000-000000000001',
  '90100000-0000-0000-0000-000000000001',
  '90130000-0000-0000-0000-000000000001',
  'entitlement-effect-test-1', 'sha256:v1:req-entitlement-effect-test-1',
  pg_catalog.jsonb_build_object(
    'productOfferId', '90130000-0000-0000-0000-000000000001',
    'productId', '90110000-0000-0000-0000-000000000001',
    'platform', 'web', 'provider', 'testpay',
    'externalProductId', 'entitlement-effect-web'
  ),
  'sha256:v1:offer-entitlement-effect-test-1',
  'verified', now(), now(), 4900, 'KRW', 'charge-terms-v1',
  '90120000-0000-0000-0000-000000000001',
  pg_catalog.jsonb_build_object(
    'capabilitySetId', '90120000-0000-0000-0000-000000000001',
    'definitionVersion', 'entitlement-effect-test-v1',
    'definitionHash', 'sha256:test-entitlement-effect-v1'
  ),
  'sha256:v1:capability-entitlement-effect-test-1'
);

insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb,
  verified_at, created_at, environment, verifier_revision,
  verified_amount_minor, verified_currency
) values (
  '90150000-0000-0000-0000-000000000001',
  '90100000-0000-0000-0000-000000000001',
  '90140000-0000-0000-0000-000000000001',
  '90130000-0000-0000-0000-000000000001',
  'web', 'testpay', 'tx-entitlement-effect-1',
  'hmac-sha256:k1:9015000000000000000000000000000000000000000000000000000000000001',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  '2026-09-01T00:00:00Z', now(), 'production', 'test-verifier-v1', 4900, 'KRW'
);

select pg_temp.assert_fails(
  'future-active initial receipt grant is denied',
  $$select * from public.internal_apply_entitlement_effect_v1(
    'receipt','90150000-0000-0000-0000-000000000001',null,'reading-access',
    null,null,'granted','2026-09-01T00:00:00Z','active',
    '2099-01-01T00:00:00Z','2099-02-01T00:00:00Z',null
  )$$,
  'internal_entitlement_effect_future_active_denied'
);

select * from public.internal_apply_entitlement_effect_v1(
  'receipt','90150000-0000-0000-0000-000000000001',null,'reading-access',
  null,null,'granted','2026-09-01T00:00:00Z','active',
  '2026-09-01T00:00:00Z','2099-01-01T00:00:00Z',null
);

do $$
declare
  v_grant public.entitlement_grants%rowtype;
  v_projection public.entitlements%rowtype;
  v_event_count integer;
  v_outbox_count integer;
begin
  select eg.* into strict v_grant
  from public.entitlement_grants eg
  where eg.subject_id = '90100000-0000-0000-0000-000000000001'
    and eg.entitlement_key = 'reading.entitlement.effect.test'
    and eg.scope_key_norm = '__GLOBAL__'
    and eg.grant_key = 'receipt:90150000-0000-0000-0000-000000000001';

  if v_grant.status is distinct from 'active'
     or v_grant.valid_from is distinct from '2026-09-01T00:00:00Z'::timestamptz
     or v_grant.valid_until is distinct from '2099-01-01T00:00:00Z'::timestamptz
     or v_grant.revision <> 0
     or v_grant.source_receipt_id is distinct from '90150000-0000-0000-0000-000000000001'::uuid then
    raise exception 'FAIL initial granted effect did not create exact authoritative Grant state';
  end if;

  select count(*)::integer into v_event_count
  from public.entitlement_events ee where ee.grant_id = v_grant.id;
  if v_event_count <> 1 then
    raise exception 'FAIL initial granted effect expected one Entitlement Event, got %', v_event_count;
  end if;

  select e.* into strict v_projection
  from public.entitlements e
  where e.subject_id = v_grant.subject_id
    and e.entitlement_key = v_grant.entitlement_key
    and e.scope_key_norm = v_grant.scope_key_norm;

  if v_projection.status is distinct from 'active'
     or v_projection.active_grant_count <> 1
     or v_projection.effective_valid_until is distinct from '2099-01-01T00:00:00Z'::timestamptz
     or v_projection.revision <> 0 then
    raise exception 'FAIL initial granted effect projection mismatch';
  end if;

  select count(*)::integer into v_outbox_count
  from public.outbox_events oe
  where oe.aggregate_type = 'entitlement'
    and oe.aggregate_id = v_projection.id::text
    and oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED';
  if v_outbox_count <> 1 then
    raise exception 'FAIL initial granted effect expected one rights-change outbox event, got %', v_outbox_count;
  end if;

  raise notice 'PASS initial verified Receipt + pinned Capability Item creates one Grant/Event/projection/outbox effect';
end;
$$;

-- Exact Receipt replay converges on the committed source result.
select * from public.internal_apply_entitlement_effect_v1(
  'receipt','90150000-0000-0000-0000-000000000001',null,'reading-access',
  null,null,'granted','2026-09-01T00:00:00Z','active',
  '2026-09-01T00:00:00Z','2099-01-01T00:00:00Z',null
);

do $$
declare
  v_grant_id uuid;
  v_event_count integer;
  v_outbox_count integer;
begin
  select eg.id into strict v_grant_id
  from public.entitlement_grants eg
  where eg.grant_key = 'receipt:90150000-0000-0000-0000-000000000001'
    and eg.entitlement_key = 'reading.entitlement.effect.test';
  select count(*)::integer into v_event_count
  from public.entitlement_events ee where ee.grant_id = v_grant_id;
  select count(*)::integer into v_outbox_count
  from public.outbox_events oe
  where oe.aggregate_type = 'entitlement'
    and oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED';
  if v_event_count <> 1 or v_outbox_count <> 1 then
    raise exception 'FAIL exact Receipt replay duplicated state: events=% outbox=%',
      v_event_count, v_outbox_count;
  end if;
  raise notice 'PASS exact Receipt replay is idempotent';
end;
$$;

select pg_temp.assert_fails(
  'same Receipt cannot be rebound to conflicting entitlement semantics',
  $$select * from public.internal_apply_entitlement_effect_v1(
    'receipt','90150000-0000-0000-0000-000000000001',null,'reading-access',
    null,null,'granted','2026-09-01T00:00:00Z','active',
    '2026-09-01T00:00:00Z','2099-03-01T00:00:00Z',null
  )$$,
  'internal_entitlement_effect_source_semantic_conflict'
);

insert into public.commerce_provider_events(
  id, provider, external_event_id, event_type, external_transaction_id,
  resolved_subject_id, resolution_source_type, resolved_receipt_id,
  payload_fingerprint, provider_occurred_at, provider_ordering_key,
  verified_payload_jsonb, status, received_at, environment, verifier_revision
) values (
  '90160000-0000-0000-0000-000000000001','testpay','evt-entitlement-renew-1','renewal',
  'tx-entitlement-effect-1','90100000-0000-0000-0000-000000000001','receipt',
  '90150000-0000-0000-0000-000000000001','sha256:v1:evt-entitlement-renew-1',
  '2026-09-02T00:00:00Z','order-2','{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  'verified',now(),'production','test-verifier-v1'
);

select * from public.internal_apply_entitlement_effect_v1(
  'provider_event','90160000-0000-0000-0000-000000000001',
  (select eg.id from public.entitlement_grants eg
   where eg.grant_key='receipt:90150000-0000-0000-0000-000000000001'
     and eg.entitlement_key='reading.entitlement.effect.test'),
  null,0,null,'renewed','2026-09-02T00:00:00Z','active',
  '2026-09-01T00:00:00Z','2099-02-01T00:00:00Z',null
);

do $$
declare
  v_grant public.entitlement_grants%rowtype;
  v_projection public.entitlements%rowtype;
  v_event_count integer;
  v_outbox_count integer;
begin
  select eg.* into strict v_grant
  from public.entitlement_grants eg
  where eg.grant_key='receipt:90150000-0000-0000-0000-000000000001'
    and eg.entitlement_key='reading.entitlement.effect.test';
  if v_grant.revision <> 1
     or v_grant.valid_from is distinct from '2026-09-01T00:00:00Z'::timestamptz
     or v_grant.valid_until is distinct from '2099-02-01T00:00:00Z'::timestamptz
     or v_grant.last_provider_ordering_key is distinct from 'order-2' then
    raise exception 'FAIL renewed effect did not preserve valid_from / replace valid_until / advance revision-order provenance';
  end if;
  select count(*)::integer into v_event_count
  from public.entitlement_events ee where ee.grant_id = v_grant.id;
  if v_event_count <> 2 then
    raise exception 'FAIL material renewal expected second Entitlement Event, got %', v_event_count;
  end if;
  select e.* into strict v_projection
  from public.entitlements e
  where e.subject_id=v_grant.subject_id and e.entitlement_key=v_grant.entitlement_key
    and e.scope_key_norm=v_grant.scope_key_norm;
  if v_projection.effective_valid_until is distinct from '2099-02-01T00:00:00Z'::timestamptz
     or v_projection.revision <> 1 then
    raise exception 'FAIL material renewal did not recompute Effective Entitlement projection';
  end if;
  select count(*)::integer into v_outbox_count
  from public.outbox_events oe
  where oe.aggregate_type='entitlement' and oe.aggregate_id=v_projection.id::text
    and oe.event_type='ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED';
  if v_outbox_count <> 2 then
    raise exception 'FAIL material renewal expected second rights-change outbox event, got %', v_outbox_count;
  end if;
  raise notice 'PASS material renewal atomically advances Grant/Event/projection/outbox';
end;
$$;

-- Material provider-event replay is recognized before stale CAS inputs can reject it.
select * from public.internal_apply_entitlement_effect_v1(
  'provider_event','90160000-0000-0000-0000-000000000001',
  (select eg.id from public.entitlement_grants eg
   where eg.grant_key='receipt:90150000-0000-0000-0000-000000000001'
     and eg.entitlement_key='reading.entitlement.effect.test'),
  null,0,null,'renewed','2026-09-02T00:00:00Z','active',
  '2026-09-01T00:00:00Z','2099-02-01T00:00:00Z',null
);

insert into public.commerce_provider_events(
  id, provider, external_event_id, event_type, external_transaction_id,
  resolved_subject_id, resolution_source_type, resolved_receipt_id,
  payload_fingerprint, provider_occurred_at, provider_ordering_key,
  verified_payload_jsonb, status, received_at, environment, verifier_revision
) values (
  '90160000-0000-0000-0000-000000000002','testpay','evt-entitlement-noop-1','renewal',
  'tx-entitlement-effect-1','90100000-0000-0000-0000-000000000001','receipt',
  '90150000-0000-0000-0000-000000000001','sha256:v1:evt-entitlement-noop-1',
  '2026-09-03T00:00:00Z','order-3','{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  'verified',now(),'production','test-verifier-v1'
);

select * from public.internal_apply_entitlement_effect_v1(
  'provider_event','90160000-0000-0000-0000-000000000002',
  (select eg.id from public.entitlement_grants eg
   where eg.grant_key='receipt:90150000-0000-0000-0000-000000000001'
     and eg.entitlement_key='reading.entitlement.effect.test'),
  null,1,'order-2','renewed','2026-09-03T00:00:00Z','active',
  '2026-09-01T00:00:00Z','2099-02-01T00:00:00Z',null
);

do $$
declare
  v_grant public.entitlement_grants%rowtype;
  v_event_count integer;
  v_outbox_count integer;
begin
  select eg.* into strict v_grant
  from public.entitlement_grants eg
  where eg.grant_key='receipt:90150000-0000-0000-0000-000000000001'
    and eg.entitlement_key='reading.entitlement.effect.test';
  select count(*)::integer into v_event_count
  from public.entitlement_events ee where ee.grant_id=v_grant.id;
  select count(*)::integer into v_outbox_count
  from public.outbox_events oe
  where oe.aggregate_type='entitlement'
    and oe.event_type='ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED';
  if v_grant.revision <> 1
     or v_grant.last_provider_ordering_key is distinct from 'order-3'
     or v_event_count <> 2 or v_outbox_count <> 2 then
    raise exception 'FAIL no-op reaffirmation mutated rights: revision=% order=% events=% outbox=%',
      v_grant.revision,v_grant.last_provider_ordering_key,v_event_count,v_outbox_count;
  end if;
  raise notice 'PASS no-material-change reaffirmation advances only order provenance';
end;
$$;

insert into public.commerce_provider_events(
  id, provider, external_event_id, event_type, external_transaction_id,
  resolved_subject_id, resolution_source_type, resolved_receipt_id,
  payload_fingerprint, provider_occurred_at, provider_ordering_key,
  verified_payload_jsonb, status, received_at, environment, verifier_revision
) values
(
  '90160000-0000-0000-0000-000000000003','testpay','evt-entitlement-cas-revision','renewal',
  'tx-entitlement-effect-1','90100000-0000-0000-0000-000000000001','receipt',
  '90150000-0000-0000-0000-000000000001','sha256:v1:evt-entitlement-cas-revision',
  '2026-09-04T00:00:00Z','order-4','{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  'verified',now(),'production','test-verifier-v1'
),
(
  '90160000-0000-0000-0000-000000000004','testpay','evt-entitlement-cas-order','renewal',
  'tx-entitlement-effect-1','90100000-0000-0000-0000-000000000001','receipt',
  '90150000-0000-0000-0000-000000000001','sha256:v1:evt-entitlement-cas-order',
  '2026-09-05T00:00:00Z','order-5','{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  'verified',now(),'production','test-verifier-v1'
),
(
  '90160000-0000-0000-0000-000000000005','testpay','evt-entitlement-valid-from','renewal',
  'tx-entitlement-effect-1','90100000-0000-0000-0000-000000000001','receipt',
  '90150000-0000-0000-0000-000000000001','sha256:v1:evt-entitlement-valid-from',
  '2026-09-06T00:00:00Z','order-6','{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  'verified',now(),'production','test-verifier-v1'
);

select pg_temp.assert_fails(
  'Grant revision CAS rejects stale comparator reads',
  $$select * from public.internal_apply_entitlement_effect_v1(
    'provider_event','90160000-0000-0000-0000-000000000003',
    (select eg.id from public.entitlement_grants eg where eg.grant_key='receipt:90150000-0000-0000-0000-000000000001' and eg.entitlement_key='reading.entitlement.effect.test'),
    null,0,'order-3','renewed','2026-09-04T00:00:00Z','active',
    '2026-09-01T00:00:00Z','2099-03-01T00:00:00Z',null
  )$$,
  'internal_entitlement_effect_cas_mismatch'
);

select pg_temp.assert_fails(
  'Grant ordering provenance CAS rejects stale comparator reads',
  $$select * from public.internal_apply_entitlement_effect_v1(
    'provider_event','90160000-0000-0000-0000-000000000004',
    (select eg.id from public.entitlement_grants eg where eg.grant_key='receipt:90150000-0000-0000-0000-000000000001' and eg.entitlement_key='reading.entitlement.effect.test'),
    null,1,'order-2','renewed','2026-09-05T00:00:00Z','active',
    '2026-09-01T00:00:00Z','2099-03-01T00:00:00Z',null
  )$$,
  'internal_entitlement_effect_cas_mismatch'
);

select pg_temp.assert_fails(
  'renewal cannot rewrite original Grant valid_from',
  $$select * from public.internal_apply_entitlement_effect_v1(
    'provider_event','90160000-0000-0000-0000-000000000005',
    (select eg.id from public.entitlement_grants eg where eg.grant_key='receipt:90150000-0000-0000-0000-000000000001' and eg.entitlement_key='reading.entitlement.effect.test'),
    null,1,'order-3','renewed','2026-09-06T00:00:00Z','active',
    '2026-09-02T00:00:00Z','2099-03-01T00:00:00Z',null
  )$$,
  'internal_entitlement_effect_valid_from_immutable'
);

do $$ begin
  raise notice 'PASS EntitlementEffectV1 atomic apply foundation';
end $$;

select 'entitlement effect apply v1 passed' as result;
