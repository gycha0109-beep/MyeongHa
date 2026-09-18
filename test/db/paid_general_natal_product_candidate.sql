\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(label text, condition boolean)
returns void
language plpgsql
as $assert_true$
begin
  if condition is not true then
    raise exception 'FAIL %', label;
  end if;
  raise notice 'PASS %', label;
end;
$assert_true$;

create or replace function pg_temp.assert_fails(
  label text,
  statement text,
  expected_fragment text
) returns void
language plpgsql
as $assert_fails$
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
    raise exception 'FAIL %: wrong error: % / constraint=%',
      label, actual_message, actual_constraint;
  end;
  raise exception 'FAIL %: statement unexpectedly succeeded', label;
end;
$assert_fails$;

select pg_temp.assert_true(
  'Historical General Natal Deep V1 Product remains but is disabled and retired',
  (
    select p.product_key = 'saju.general_natal.deep.v1'
       and p.product_type = 'reading'
       and p.enabled = false
       and p.retired_at is not null
    from public.products p
    where p.id = '11200000-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_true(
  'Product metadata pins general+natal v1 activation HOLD',
  (
    select p.metadata_jsonb->>'schemaVersion' = 'paid-product-catalog-v1'
       and p.metadata_jsonb->>'displayName' = '명하 정밀 원국 리포트'
       and p.metadata_jsonb->>'productVersion' = 'v1'
       and p.metadata_jsonb->>'purchaseType' = 'one_off'
       and p.metadata_jsonb->>'activationState' = 'hold_saju_interpretation'
       and p.metadata_jsonb->'readingIntent'->>'domain' = 'general'
       and p.metadata_jsonb->'readingIntent'->>'period' = 'natal'
    from public.products p
    where p.id = '11200000-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_true(
  'Historical Capability Set V1 preserves meaning and is retired',
  (
    select pcs.product_id = '11200000-0000-0000-0000-000000000001'::uuid
       and pcs.definition_version = 'v1'
       and pcs.definition_hash = 'sha256:f2843708cb1d42e1e1e08d9cad0a4117ac6438f01c62a11f193e0fb79ea3fcf4'
       and pcs.retired_at is not null
    from public.product_capability_sets pcs
    where pcs.id = '11201000-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_true(
  'Capability is global unbounded General Natal Deep V1 access',
  (
    select pci.item_key = 'general-natal-deep-access'
       and pci.entitlement_key = 'reading.saju.general_natal.deep.v1'
       and pci.scope_mode = 'global'
       and pci.fixed_scope_key is null
       and pci.validity_mode = 'unbounded'
       and pci.duration_seconds is null
    from public.product_capability_items pci
    where pci.capability_set_id = '11201000-0000-0000-0000-000000000001'
      and pci.item_key = 'general-natal-deep-access'
  )
);

select pg_temp.assert_true(
  'Historical Web PortOne V2 Offer remains pinned, disabled, and retired',
  (
    select po.product_id = '11200000-0000-0000-0000-000000000001'::uuid
       and po.platform = 'web'
       and po.provider = 'portone_v2'
       and po.external_product_id = 'myeongha-saju-general-natal-deep-v1'
       and po.capability_set_id = '11201000-0000-0000-0000-000000000001'::uuid
       and po.enabled = false
       and po.retired_at is not null
       and po.currency = 'KRW'
       and po.display_price_minor = 9900
    from public.product_offers po
    where po.id = '11202000-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_true(
  'Historical charge terms preserve KRW 9,900 V1 and are retired',
  (
    select pct.terms_version = 'krw-9900-v1'
       and pct.amount_minor = 9900
       and pct.currency = 'KRW'
       and pct.retired_at is not null
    from public.product_offer_charge_terms pct
    where pct.id = '11203000-0000-0000-0000-000000000001'
      and pct.product_offer_id = '11202000-0000-0000-0000-000000000001'
  )
);

insert into public.subjects(
  id, kind, auth_user_id, status, merged_into_subject_id, created_at, updated_at
) values (
  '11204000-0000-0000-0000-000000000001',
  'guest',
  null,
  'active',
  null,
  now(),
  now()
);

select pg_catalog.set_config(
  'myeongha.subject_id',
  '11204000-0000-0000-0000-000000000001',
  false
);

select pg_temp.assert_fails(
  'Disabled paid Product/Offer cannot create Purchase Intent v3',
  $statement$select *
    from public.cmd_create_purchase_intent_v3(
      '11204000-0000-0000-0000-000000000001',
      '11205000-0000-0000-0000-000000000001',
      '11202000-0000-0000-0000-000000000001',
      null,
      'inactive-general-natal-v1',
      'sha256:test:inactive-request',
      '{"productOfferId":"11202000-0000-0000-0000-000000000001","productId":"11200000-0000-0000-0000-000000000001","platform":"web","provider":"portone_v2","externalProductId":"myeongha-saju-general-natal-deep-v1"}'::jsonb,
      'sha256:test:inactive-offer',
      '{"capabilitySetId":"11201000-0000-0000-0000-000000000001","definitionVersion":"v1","definitionHash":"sha256:f2843708cb1d42e1e1e08d9cad0a4117ac6438f01c62a11f193e0fb79ea3fcf4"}'::jsonb,
      'sha256:test:inactive-capability'
    )$statement$,
  'cmd_purchase_intent_v3_offer_unavailable'
);

select pg_temp.assert_true(
  'Retired historical catalog creates no Purchase Intent',
  (select count(*) = 0 from public.purchase_intents)
);

select pg_temp.assert_true(
  'Retired historical catalog creates no Receipt',
  (select count(*) = 0 from public.commerce_receipts)
);

select pg_temp.assert_true(
  'Retired historical catalog creates no Entitlement Grant',
  (select count(*) = 0 from public.entitlement_grants)
);

select pg_temp.assert_true(
  'Retired historical catalog creates no Entitlement Event',
  (select count(*) = 0 from public.entitlement_events)
);

select pg_temp.assert_true(
  'Retired historical catalog creates no Effective Entitlement',
  (select count(*) = 0 from public.entitlements)
);

select 'historical General Natal Product retirement authority passed' as result;
