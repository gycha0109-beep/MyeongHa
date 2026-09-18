-- P0-CM-03 first paid Product candidate authority.
--
-- Defines the immutable first Product / Capability / Web PortOne Offer / Price tuple
-- without activating saleability. Current Saju production interpretation authority
-- remains BLOCKED, so both Product and Offer are deliberately disabled.
--
-- Product: saju.general_natal.deep.v1
-- Price:   KRW 9,900 one-off
-- Right:   reading.saju.general_natal.deep.v1, global, unbounded
--
-- No Purchase Intent, Receipt, Entitlement, checkout route, provider SDK invocation,
-- or Production payment activation is created by this migration.

insert into public.products(
  id,
  product_key,
  product_type,
  enabled,
  metadata_jsonb,
  created_at
) values (
  '11200000-0000-0000-0000-000000000001',
  'saju.general_natal.deep.v1',
  'reading',
  false,
  pg_catalog.jsonb_build_object(
    'schemaVersion', 'paid-product-catalog-v1',
    'displayName', '명하 정밀 원국 리포트',
    'productVersion', 'v1',
    'readingIntent', pg_catalog.jsonb_build_object(
      'domain', 'general',
      'period', 'natal'
    ),
    'purchaseType', 'one_off',
    'activationState', 'hold_saju_interpretation'
  ),
  now()
);

insert into public.product_capability_sets(
  id,
  product_id,
  definition_version,
  definition_hash,
  created_at
) values (
  '11201000-0000-0000-0000-000000000001',
  '11200000-0000-0000-0000-000000000001',
  'v1',
  'sha256:f2843708cb1d42e1e1e08d9cad0a4117ac6438f01c62a11f193e0fb79ea3fcf4',
  now()
);

insert into public.product_capability_items(
  capability_set_id,
  item_key,
  entitlement_key,
  scope_mode,
  fixed_scope_key,
  validity_mode,
  duration_seconds
) values (
  '11201000-0000-0000-0000-000000000001',
  'general-natal-deep-access',
  'reading.saju.general_natal.deep.v1',
  'global',
  null,
  'unbounded',
  null
);

insert into public.product_offers(
  id,
  product_id,
  platform,
  provider,
  external_product_id,
  currency,
  display_price_minor,
  enabled,
  created_at,
  capability_set_id
) values (
  '11202000-0000-0000-0000-000000000001',
  '11200000-0000-0000-0000-000000000001',
  'web',
  'portone_v2',
  'myeongha-saju-general-natal-deep-v1',
  'KRW',
  9900,
  false,
  now(),
  '11201000-0000-0000-0000-000000000001'
);

insert into public.product_offer_charge_terms(
  id,
  product_offer_id,
  terms_version,
  amount_minor,
  currency
) values (
  '11203000-0000-0000-0000-000000000001',
  '11202000-0000-0000-0000-000000000001',
  'krw-9900-v1',
  9900,
  'KRW'
);
