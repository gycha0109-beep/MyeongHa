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

-- Historical candidate remains queryable provenance, but is no longer current/saleable.
select pg_temp.assert_true(
  'stale General Natal Product is forward-retired',
  (
    select p.enabled = false and p.retired_at is not null
    from public.products p
    where p.id = '11200000-0000-0000-0000-000000000001'
      and p.product_key = 'saju.general_natal.deep.v1'
  )
);

select pg_temp.assert_true(
  'stale General Natal Offer is forward-retired',
  (
    select po.enabled = false and po.retired_at is not null
    from public.product_offers po
    where po.id = '11202000-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_true(
  'stale General Natal Capability Set is forward-retired',
  (
    select pcs.retired_at is not null
    from public.product_capability_sets pcs
    where pcs.id = '11201000-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_true(
  'stale General Natal charge terms are forward-retired',
  (
    select pct.retired_at is not null
    from public.product_offer_charge_terms pct
    where pct.id = '11203000-0000-0000-0000-000000000001'
  )
);

-- Current first Standard Product authority.
select pg_temp.assert_true(
  'Love Relationship Product is one inactive Topic SKU',
  (
    select p.product_type = 'reading'
       and p.enabled = false
       and p.retired_at is null
       and p.metadata_jsonb->>'schemaVersion' = 'standard-reading-product-v1'
       and p.metadata_jsonb->>'displayName' = '연애·관계'
       and p.metadata_jsonb->>'topicKey' = 'love_relationship'
       and p.metadata_jsonb->>'readerSelectionMode' = 'required'
       and p.metadata_jsonb->>'priceAuthority' = 'unresolved_working_candidate_only'
    from public.products p
    where p.id = '11300000-0000-0000-0000-000000000001'
      and p.product_key = 'standard.love_relationship'
  )
);

select pg_temp.assert_true(
  'Product Reader separation has no per-character Love SKU rows',
  (
    select count(*) = 1
    from public.products p
    where p.product_key = 'standard.love_relationship'
       or p.product_key like 'standard.love_relationship.%'
       or p.product_key like 'love.%'
  )
);

select pg_temp.assert_true(
  'Love Relationship Product has no saleable Offer or price authority',
  not exists (
    select 1
    from public.product_offers po
    where po.product_id = '11300000-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_true(
  'Love Relationship Product pins a reader-bound purchase-unit Capability Set',
  (
    select pcs.definition_version = 'v1'
       and pcs.definition_hash = 'sha256:2ac901096369a6ea38cd180dff9fcd078efdfccbfca17117d6c282d116f76524'
       and pcs.retired_at is null
       and pci.item_key = 'love-relationship-reader-reading-unit'
       and pci.entitlement_key = 'reading.standard.love_relationship.unit.v1'
       and pci.scope_mode = 'global'
       and pci.validity_mode = 'unbounded'
    from public.product_capability_sets pcs
    join public.product_capability_items pci
      on pci.capability_set_id = pcs.id
    where pcs.id = '11301000-0000-0000-0000-000000000001'
      and pcs.product_id = '11300000-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_true(
  'Love Relationship Standard Reading spec maps to relationship natal general and requires Reader',
  (
    select srps.spec_version = 'v1'
       and srps.topic_key = 'love_relationship'
       and srps.saju_domain = 'relationship'
       and srps.reading_period = 'natal'
       and srps.reading_variant = 'general'
       and srps.reader_selection_mode = 'required'
       and srps.purchase_unit_mode = 'topic_reader_reading'
       and srps.capability_set_id = '11301000-0000-0000-0000-000000000001'::uuid
       and srps.retired_at is null
    from public.standard_reading_product_specs srps
    where srps.product_id = '11300000-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_fails(
  'Standard Reading Product semantic identity is immutable',
  $$update public.standard_reading_product_specs
    set topic_key = 'mutated'
    where product_id = '11300000-0000-0000-0000-000000000001'$$,
  'tr_standard_reading_product_spec_semantics_immutable'
);

-- Build an isolated enabled fixture to exercise sparse Reader selection authority.
insert into public.subjects(
  id, kind, auth_user_id, status, merged_into_subject_id, created_at, updated_at
) values (
  '11390000-0000-0000-0000-000000000001',
  'guest', null, 'active', null, now(), now()
);

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values (
  '11391000-0000-0000-0000-000000000001',
  'test-commerce-v2-reader-bundle',
  'sha256:test:commerce-v2-reader-bundle',
  'test://commerce-v2-reader-bundle',
  'test-v1',
  'test-client-v1',
  'sha256:test:assets',
  'test-cue-v1',
  '{}'::jsonb,
  now() - interval '1 day'
);

insert into public.characters(character_id, created_at)
values
  ('test-standard-reader', now()),
  ('test-coming-soon-reader', now());

insert into public.character_runtime_catalog(
  character_id, content_bundle_id, availability, enabled,
  release_at, retire_at, published_at
) values
  (
    'test-standard-reader',
    '11391000-0000-0000-0000-000000000001',
    'available',
    true,
    now() - interval '1 day',
    null,
    now() - interval '1 day'
  ),
  (
    'test-coming-soon-reader',
    '11391000-0000-0000-0000-000000000001',
    'coming_soon',
    true,
    now() + interval '1 day',
    null,
    now() - interval '1 day'
  );

insert into public.products(
  id, product_key, product_type, enabled, metadata_jsonb, created_at
) values (
  '11392000-0000-0000-0000-000000000001',
  'test.standard.reader-product',
  'reading',
  true,
  '{}'::jsonb,
  now()
);

insert into public.product_capability_sets(
  id, product_id, definition_version, definition_hash, created_at
) values (
  '11392100-0000-0000-0000-000000000001',
  '11392000-0000-0000-0000-000000000001',
  'v1',
  'sha256:test:reader-capability',
  now()
);

insert into public.product_capability_items(
  capability_set_id, item_key, entitlement_key, scope_mode,
  fixed_scope_key, validity_mode, duration_seconds
) values (
  '11392100-0000-0000-0000-000000000001',
  'test-reader-unit',
  'reading.test.reader.unit.v1',
  'global',
  null,
  'unbounded',
  null
);

insert into public.standard_reading_product_specs(
  product_id, capability_set_id, spec_version, topic_key, saju_domain,
  reading_period, reading_variant, reader_selection_mode,
  purchase_unit_mode, created_at
) values (
  '11392000-0000-0000-0000-000000000001',
  '11392100-0000-0000-0000-000000000001',
  'v1',
  'test_reader_topic',
  'relationship',
  'natal',
  'general',
  'required',
  'topic_reader_reading',
  now()
);

insert into public.product_offers(
  id, product_id, platform, provider, external_product_id,
  currency, display_price_minor, enabled, created_at, capability_set_id
) values (
  '11392200-0000-0000-0000-000000000001',
  '11392000-0000-0000-0000-000000000001',
  'web',
  'portone_v2',
  'test-standard-reader-product-v1',
  'KRW',
  1,
  true,
  now(),
  '11392100-0000-0000-0000-000000000001'
);

insert into public.purchase_intents(
  id, subject_id, product_offer_id, provider_account_link_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at,
  expected_amount_minor, expected_currency, charge_terms_version,
  capability_set_id, capability_snapshot_jsonb, capability_snapshot_hash
) values
  (
    '11392300-0000-0000-0000-000000000001',
    '11390000-0000-0000-0000-000000000001',
    '11392200-0000-0000-0000-000000000001',
    null,
    'reader-selection-1',
    'sha256:test:reader-request-1',
    '{}'::jsonb,
    'sha256:test:reader-offer-1',
    'created',
    now(),
    now(),
    1,
    'KRW',
    'test-v1',
    '11392100-0000-0000-0000-000000000001',
    '{"capabilitySetId":"11392100-0000-0000-0000-000000000001","definitionVersion":"v1","definitionHash":"sha256:test:reader-capability"}'::jsonb,
    'sha256:test:reader-capability-snapshot-1'
  ),
  (
    '11392300-0000-0000-0000-000000000002',
    '11390000-0000-0000-0000-000000000001',
    '11392200-0000-0000-0000-000000000001',
    null,
    'reader-selection-2',
    'sha256:test:reader-request-2',
    '{}'::jsonb,
    'sha256:test:reader-offer-2',
    'created',
    now(),
    now(),
    1,
    'KRW',
    'test-v1',
    '11392100-0000-0000-0000-000000000001',
    '{"capabilitySetId":"11392100-0000-0000-0000-000000000001","definitionVersion":"v1","definitionHash":"sha256:test:reader-capability"}'::jsonb,
    'sha256:test:reader-capability-snapshot-2'
  ),
  (
    '11392300-0000-0000-0000-000000000003',
    '11390000-0000-0000-0000-000000000001',
    '11392200-0000-0000-0000-000000000001',
    null,
    'reader-selection-3',
    'sha256:test:reader-request-3',
    '{}'::jsonb,
    'sha256:test:reader-offer-3',
    'created',
    now(),
    now(),
    1,
    'KRW',
    'test-v1',
    '11392100-0000-0000-0000-000000000001',
    '{"capabilitySetId":"11392100-0000-0000-0000-000000000001","definitionVersion":"v1","definitionHash":"sha256:test:reader-capability"}'::jsonb,
    'sha256:test:reader-capability-snapshot-3'
  );

insert into public.purchase_intent_reader_selections(
  purchase_intent_id,
  product_id,
  reader_character_id,
  reader_content_bundle_id,
  selection_contract_version,
  selection_snapshot_jsonb,
  selection_hash,
  created_at
) values (
  '11392300-0000-0000-0000-000000000001',
  '11392000-0000-0000-0000-000000000001',
  'test-standard-reader',
  '11391000-0000-0000-0000-000000000001',
  'standard-reading-reader-selection-v1',
  '{"schemaVersion":"standard-reading-reader-selection-v1","productId":"11392000-0000-0000-0000-000000000001","topicKey":"test_reader_topic","specVersion":"v1","readerCharacterId":"test-standard-reader","readerContentBundleId":"11391000-0000-0000-0000-000000000001"}'::jsonb,
  'sha256:test:reader-selection-1',
  now()
);

select pg_temp.assert_true(
  'one Purchase Intent pins exactly one sparse Reader selection',
  (
    select pirs.reader_character_id = 'test-standard-reader'
       and pirs.product_id = '11392000-0000-0000-0000-000000000001'::uuid
    from public.purchase_intent_reader_selections pirs
    where pirs.purchase_intent_id = '11392300-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_fails(
  'Reader selection cannot claim a different Product than Purchase Intent',
  $$insert into public.purchase_intent_reader_selections(
      purchase_intent_id, product_id,
      reader_character_id, reader_content_bundle_id,
      selection_contract_version, selection_snapshot_jsonb, selection_hash, created_at
    ) values (
      '11392300-0000-0000-0000-000000000002',
      '11300000-0000-0000-0000-000000000001',
      'test-standard-reader',
      '11391000-0000-0000-0000-000000000001',
      'standard-reading-reader-selection-v1',
      '{}'::jsonb,
      'sha256:test:cross-product',
      now()
    )$$,
  'ct_reader_selection_purchase_product'
);

select pg_temp.assert_fails(
  'coming-soon Reader cannot be selected for a new purchase',
  $$insert into public.purchase_intent_reader_selections(
      purchase_intent_id, product_id,
      reader_character_id, reader_content_bundle_id,
      selection_contract_version, selection_snapshot_jsonb, selection_hash, created_at
    ) values (
      '11392300-0000-0000-0000-000000000002',
      '11392000-0000-0000-0000-000000000001',
      'test-coming-soon-reader',
      '11391000-0000-0000-0000-000000000001',
      'standard-reading-reader-selection-v1',
      '{"schemaVersion":"standard-reading-reader-selection-v1","productId":"11392000-0000-0000-0000-000000000001","topicKey":"test_reader_topic","specVersion":"v1","readerCharacterId":"test-coming-soon-reader","readerContentBundleId":"11391000-0000-0000-0000-000000000001"}'::jsonb,
      'sha256:test:coming-soon',
      now()
    )$$,
  'ct_reader_selection_reader_unavailable'
);

select pg_temp.assert_fails(
  'Reader selection snapshot cannot omit Product/Reader authority',
  $$insert into public.purchase_intent_reader_selections(
      purchase_intent_id, product_id,
      reader_character_id, reader_content_bundle_id,
      selection_contract_version, selection_snapshot_jsonb, selection_hash, created_at
    ) values (
      '11392300-0000-0000-0000-000000000003',
      '11392000-0000-0000-0000-000000000001',
      'test-standard-reader',
      '11391000-0000-0000-0000-000000000001',
      'standard-reading-reader-selection-v1',
      '{}'::jsonb,
      'sha256:test:bad-snapshot',
      now()
    )$$,
  'ct_reader_selection_snapshot_mismatch'
);

select pg_temp.assert_fails(
  'Reader selection provenance cannot mutate',
  $$update public.purchase_intent_reader_selections
    set reader_character_id = 'test-coming-soon-reader'
    where purchase_intent_id = '11392300-0000-0000-0000-000000000001'$$,
  'tr_purchase_intent_reader_selection_append_only'
);

select pg_temp.assert_fails(
  'Reader selection provenance cannot be deleted',
  $$delete from public.purchase_intent_reader_selections
    where purchase_intent_id = '11392300-0000-0000-0000-000000000001'$$,
  'tr_purchase_intent_reader_selection_append_only'
);

select pg_temp.assert_true(
  'ordinary API executor has no direct Reader-selection insert authority',
  not pg_catalog.has_table_privilege(
    'myeongha_api_executor',
    'public.purchase_intent_reader_selections',
    'INSERT'
  )
);

select pg_temp.assert_true(
  'inactive Love Relationship catalog creates no purchase/payment/entitlement side effects',
  not exists (
    select 1
    from public.purchase_intents pi
    join public.product_offers po on po.id = pi.product_offer_id
    where po.product_id = '11300000-0000-0000-0000-000000000001'
  )
  and not exists (
    select 1
    from public.commerce_receipts cr
    join public.product_offers po on po.id = cr.product_offer_id
    where po.product_id = '11300000-0000-0000-0000-000000000001'
  )
  and not exists (
    select 1
    from public.entitlement_events ee
    where ee.product_id = '11300000-0000-0000-0000-000000000001'
  )
);

select 'Standard Love/Relationship × Reader authority passed' as result;
