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

create or replace function pg_temp.assert_true(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'FAIL %', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

insert into public.products(id, product_key, product_type, enabled, created_at)
values
  ('98200000-0000-0000-0000-000000000001', 'capability-product-a', 'reading', true, now()),
  ('98200000-0000-0000-0000-000000000002', 'capability-product-b', 'bundle', true, now());

insert into public.product_capability_sets(
  id, product_id, definition_version, definition_hash, created_at
) values
  ('98210000-0000-0000-0000-000000000001', '98200000-0000-0000-0000-000000000001', 'v1', 'sha256:test-capability-a-v1', now()),
  ('98210000-0000-0000-0000-000000000002', '98200000-0000-0000-0000-000000000002', 'v1', 'sha256:test-capability-b-v1', now()),
  ('98210000-0000-0000-0000-000000000003', '98200000-0000-0000-0000-000000000001', 'v2', 'sha256:test-capability-a-v2', now());

insert into public.product_capability_items(
  capability_set_id, item_key, entitlement_key,
  scope_mode, fixed_scope_key, validity_mode, duration_seconds
) values
  ('98210000-0000-0000-0000-000000000001', 'reading-access', 'reading.full', 'global', null, 'unbounded', null),
  ('98210000-0000-0000-0000-000000000002', 'bundle-fixed', 'bundle.content', 'fixed', 'content:fixture-b', 'fixed_duration', 86400),
  ('98210000-0000-0000-0000-000000000003', 'reading-access-v2', 'reading.full.v2', 'global', null, 'provider_expiry', null);

select pg_temp.assert_fails(
  'blank Capability Set version denied',
  $$insert into public.product_capability_sets(id,product_id,definition_version,definition_hash,created_at) values ('98210000-0000-0000-0000-000000000010','98200000-0000-0000-0000-000000000001',' ','sha256:x',now())$$,
  'product_capability_sets_definition_version_check'
);

select pg_temp.assert_fails(
  'global scope cannot carry a fixed scope key',
  $$insert into public.product_capability_items(capability_set_id,item_key,entitlement_key,scope_mode,fixed_scope_key,validity_mode,duration_seconds) values ('98210000-0000-0000-0000-000000000003','bad-global','reading.bad','global','client-derived','unbounded',null)$$,
  'product_capability_items_scope_shape_check'
);

select pg_temp.assert_fails(
  'fixed scope requires a non-empty fixed scope key',
  $$insert into public.product_capability_items(capability_set_id,item_key,entitlement_key,scope_mode,fixed_scope_key,validity_mode,duration_seconds) values ('98210000-0000-0000-0000-000000000003','bad-fixed','reading.bad','fixed',null,'unbounded',null)$$,
  'product_capability_items_scope_shape_check'
);

select pg_temp.assert_fails(
  'fixed duration requires positive seconds',
  $$insert into public.product_capability_items(capability_set_id,item_key,entitlement_key,scope_mode,fixed_scope_key,validity_mode,duration_seconds) values ('98210000-0000-0000-0000-000000000003','bad-duration','reading.bad','global',null,'fixed_duration',0)$$,
  'product_capability_items_validity_shape_check'
);

-- Existing Offer rows may remain unpinned in the nullable expand phase.
insert into public.product_offers(
  id, product_id, platform, provider, external_product_id,
  currency, display_price_minor, enabled, created_at
) values (
  '98220000-0000-0000-0000-000000000001',
  '98200000-0000-0000-0000-000000000001',
  'web', 'fixturepay', 'capability-unpinned-a', 'KRW', 1000, true, now()
);

select pg_temp.assert_true(
  'nullable expand preserves unpinned Offer',
  (select capability_set_id is null from public.product_offers where id='98220000-0000-0000-0000-000000000001')
);

-- A valid active/non-empty same-Product set can be pinned exactly once.
update public.product_offers
set capability_set_id = '98210000-0000-0000-0000-000000000001'
where id = '98220000-0000-0000-0000-000000000001';

select pg_temp.assert_true(
  'Offer pins exact Capability Set',
  (select capability_set_id = '98210000-0000-0000-0000-000000000001'::uuid
   from public.product_offers where id='98220000-0000-0000-0000-000000000001')
);

select pg_temp.assert_fails(
  'pinned Offer cannot repoint rights meaning',
  $$update public.product_offers set capability_set_id='98210000-0000-0000-0000-000000000003' where id='98220000-0000-0000-0000-000000000001'$$,
  'tr_product_offer_capability_pin_immutable'
);

select pg_temp.assert_fails(
  'pinned Offer cannot clear rights meaning',
  $$update public.product_offers set capability_set_id=null where id='98220000-0000-0000-0000-000000000001'$$,
  'tr_product_offer_capability_pin_immutable'
);

select pg_temp.assert_fails(
  'pinned Capability Set cannot receive a new item',
  $$insert into public.product_capability_items(capability_set_id,item_key,entitlement_key,scope_mode,fixed_scope_key,validity_mode,duration_seconds) values ('98210000-0000-0000-0000-000000000001','late-item','reading.late','global',null,'unbounded',null)$$,
  'tr_product_capability_item_pinned_set'
);

select pg_temp.assert_fails(
  'Capability Item semantics cannot be rewritten',
  $$update public.product_capability_items set entitlement_key='reading.rewritten' where capability_set_id='98210000-0000-0000-0000-000000000001' and item_key='reading-access'$$,
  'tr_product_capability_item_semantics_immutable'
);

select pg_temp.assert_fails(
  'Capability Item history cannot be deleted',
  $$delete from public.product_capability_items where capability_set_id='98210000-0000-0000-0000-000000000001' and item_key='reading-access'$$,
  'tr_product_capability_item_semantics_immutable'
);

select pg_temp.assert_fails(
  'Capability Set semantic identity cannot be rewritten',
  $$update public.product_capability_sets set definition_hash='sha256:rewritten' where id='98210000-0000-0000-0000-000000000001'$$,
  'tr_product_capability_set_semantics_immutable'
);

select pg_temp.assert_fails(
  'Capability Set history cannot be deleted',
  $$delete from public.product_capability_sets where id='98210000-0000-0000-0000-000000000003'$$,
  'tr_product_capability_set_no_delete'
);

-- Retirement is monotonic and prevents new Offer assignments while preserving old pins.
update public.product_capability_sets
set retired_at = now()
where id = '98210000-0000-0000-0000-000000000002';

select pg_temp.assert_fails(
  'Capability Set retirement cannot be cleared',
  $$update public.product_capability_sets set retired_at=null where id='98210000-0000-0000-0000-000000000002'$$,
  'tr_product_capability_set_retirement_monotonic'
);

select pg_temp.assert_fails(
  'retired Capability Set cannot receive new Offer pin',
  $$insert into public.product_offers(id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,capability_set_id) values ('98220000-0000-0000-0000-000000000002','98200000-0000-0000-0000-000000000002','web','fixturepay','capability-retired-b','KRW',2000,true,now(),'98210000-0000-0000-0000-000000000002')$$,
  'tr_product_offer_capability_set_active'
);

select pg_temp.assert_fails(
  'Product and Capability Set mismatch denied',
  $$insert into public.product_offers(id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,capability_set_id) values ('98220000-0000-0000-0000-000000000003','98200000-0000-0000-0000-000000000002','web','fixturepay','capability-mismatch','KRW',2000,true,now(),'98210000-0000-0000-0000-000000000003')$$,
  'product_offers_capability_set_product_fk'
);

insert into public.product_capability_sets(
  id, product_id, definition_version, definition_hash, created_at
) values (
  '98210000-0000-0000-0000-000000000004',
  '98200000-0000-0000-0000-000000000001',
  'v-empty', 'sha256:test-empty', now()
);

select pg_temp.assert_fails(
  'empty Capability Set cannot receive Offer pin',
  $$insert into public.product_offers(id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,capability_set_id) values ('98220000-0000-0000-0000-000000000004','98200000-0000-0000-0000-000000000001','web','fixturepay','capability-empty','KRW',2000,true,now(),'98210000-0000-0000-0000-000000000004')$$,
  'tr_product_offer_capability_set_nonempty'
);

select pg_temp.assert_true(
  'API executor has no direct Capability Set mutation authority',
  not pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_capability_sets', 'INSERT,UPDATE,DELETE')
);

select pg_temp.assert_true(
  'API executor has no direct Capability Item mutation authority',
  not pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_capability_items', 'INSERT,UPDATE,DELETE')
);

select pg_temp.assert_true(
  'API executor has no direct Offer repoint authority',
  not pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_offers', 'UPDATE')
);

select pg_temp.assert_true(
  'Capability foundation creates no receipt side effects',
  (select count(*) = 0 from public.commerce_receipts)
);

select pg_temp.assert_true(
  'Capability foundation creates no entitlement grant side effects',
  (select count(*) = 0 from public.entitlement_grants)
);

select pg_temp.assert_true(
  'Capability foundation creates no entitlement event side effects',
  (select count(*) = 0 from public.entitlement_events)
);

select pg_temp.assert_true(
  'Capability foundation creates no entitlement projection side effects',
  (select count(*) = 0 from public.entitlements)
);

select 'commerce Product Capability authority passed' as result;