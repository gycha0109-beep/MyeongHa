-- Commerce v2 first Standard Reading Product authority.
--
-- Supersedes the inactive historical General Natal candidate without rewriting
-- migration 1120. Establishes Product != Reader and a sparse Purchase Intent
-- reader-selection authority. No Offer/price/checkout/entitlement fulfillment is
-- activated for the new Product.
--
-- Current Saju Production Interpretation Authority remains BLOCKED.

-- Retire the stale inactive General Natal candidate forward-only.
update public.product_offer_charge_terms
set retired_at = coalesce(retired_at, clock_timestamp())
where product_offer_id = '11202000-0000-0000-0000-000000000001'
  and retired_at is null;

update public.product_offers
set enabled = false,
    retired_at = coalesce(retired_at, clock_timestamp())
where id = '11202000-0000-0000-0000-000000000001';

update public.product_capability_sets
set retired_at = coalesce(retired_at, clock_timestamp())
where id = '11201000-0000-0000-0000-000000000001';

update public.products
set enabled = false,
    retired_at = coalesce(retired_at, clock_timestamp())
where id = '11200000-0000-0000-0000-000000000001';

-- Standard Reading semantics are relational authority rather than free-form Product
-- metadata. This maps one Product to one governed Saju request shape and declares how
-- Reader selection participates in the purchase unit.
create table public.standard_reading_product_specs (
  product_id uuid primary key,
  capability_set_id uuid not null,
  spec_version text not null,
  topic_key text not null,
  saju_domain text not null,
  reading_period text not null,
  reading_variant text not null,
  reader_selection_mode text not null,
  purchase_unit_mode text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz null,
  constraint standard_reading_product_specs_product_fk
    foreign key (product_id) references public.products(id),
  constraint standard_reading_product_specs_capability_product_fk
    foreign key (capability_set_id, product_id)
    references public.product_capability_sets(id, product_id),
  constraint standard_reading_product_specs_domain_fk
    foreign key (saju_domain) references public.saju_domains(saju_domain),
  constraint standard_reading_product_specs_topic_version_unique
    unique (topic_key, spec_version),
  constraint standard_reading_product_specs_spec_version_nonempty
    check (btrim(spec_version) <> ''),
  constraint standard_reading_product_specs_topic_nonempty
    check (btrim(topic_key) <> ''),
  constraint standard_reading_product_specs_period_nonempty
    check (btrim(reading_period) <> ''),
  constraint standard_reading_product_specs_variant_nonempty
    check (btrim(reading_variant) <> ''),
  constraint standard_reading_product_specs_reader_mode_check
    check (reader_selection_mode in ('required', 'none')),
  constraint standard_reading_product_specs_purchase_unit_check
    check (purchase_unit_mode in ('topic_reader_reading', 'account_access')),
  constraint standard_reading_product_specs_retirement_order
    check (retired_at is null or retired_at >= created_at)
);

create or replace function public.tr_standard_reading_product_spec_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_product_type text;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_standard_reading_product_spec_no_delete',
      message = 'standard Reading Product spec history cannot be deleted';
  end if;

  select p.product_type
    into v_product_type
  from public.products p
  where p.id = new.product_id;

  if v_product_type is distinct from 'reading' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_standard_reading_product_spec_reading_only',
      message = 'standard Reading Product spec requires a reading Product';
  end if;

  if tg_op = 'UPDATE' then
    if row(
      old.product_id,
      old.capability_set_id,
      old.spec_version,
      old.topic_key,
      old.saju_domain,
      old.reading_period,
      old.reading_variant,
      old.reader_selection_mode,
      old.purchase_unit_mode,
      old.created_at
    ) is distinct from row(
      new.product_id,
      new.capability_set_id,
      new.spec_version,
      new.topic_key,
      new.saju_domain,
      new.reading_period,
      new.reading_variant,
      new.reader_selection_mode,
      new.purchase_unit_mode,
      new.created_at
    ) then
      raise exception using
        errcode = '23514',
        constraint = 'tr_standard_reading_product_spec_semantics_immutable',
        message = 'standard Reading Product semantic identity is immutable';
    end if;

    if old.retired_at is not null and new.retired_at is distinct from old.retired_at then
      raise exception using
        errcode = '23514',
        constraint = 'tr_standard_reading_product_spec_no_reactivate',
        message = 'retired standard Reading Product spec cannot be reactivated or rewritten';
    end if;
  end if;

  return new;
end;
$$;

create trigger tr_standard_reading_product_spec_immutable
  before insert or update or delete on public.standard_reading_product_specs
  for each row execute function public.tr_standard_reading_product_spec_immutable();

-- One future Purchase Intent may pin exactly one Reader for a Standard Reading.
-- The Product remains the Topic SKU; Reader identity is a sparse selection row, not
-- a Product/Offer/Capability matrix.
create table public.purchase_intent_reader_selections (
  purchase_intent_id uuid primary key,
  subject_id uuid not null,
  product_id uuid not null,
  reader_character_id text not null,
  reader_content_bundle_id uuid not null,
  selection_contract_version text not null,
  selection_snapshot_jsonb jsonb not null,
  selection_hash text not null,
  created_at timestamptz not null default now(),
  constraint purchase_intent_reader_selections_intent_subject_fk
    foreign key (purchase_intent_id, subject_id)
    references public.purchase_intents(id, subject_id),
  constraint purchase_intent_reader_selections_product_spec_fk
    foreign key (product_id)
    references public.standard_reading_product_specs(product_id),
  constraint purchase_intent_reader_selections_reader_bundle_fk
    foreign key (reader_character_id, reader_content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint purchase_intent_reader_selections_identity_unique
    unique (
      purchase_intent_id,
      subject_id,
      product_id,
      reader_character_id,
      reader_content_bundle_id
    ),
  constraint purchase_intent_reader_selections_contract_nonempty
    check (btrim(selection_contract_version) <> ''),
  constraint purchase_intent_reader_selections_hash_nonempty
    check (btrim(selection_hash) <> '')
);

create or replace function public.ct_validate_purchase_intent_reader_selection()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_purchase_product_id uuid;
  v_purchase_capability_set_id uuid;
  v_spec_capability_set_id uuid;
  v_spec_version text;
  v_topic_key text;
  v_reader_mode text;
  v_purchase_unit_mode text;
  v_reader_enabled boolean;
  v_reader_availability text;
  v_reader_release_at timestamptz;
  v_reader_retire_at timestamptz;
  v_character_retired_at timestamptz;
  v_expected_snapshot jsonb;
begin
  select po.product_id, pi.capability_set_id
    into v_purchase_product_id, v_purchase_capability_set_id
  from public.purchase_intents pi
  join public.product_offers po on po.id = pi.product_offer_id
  where pi.id = new.purchase_intent_id
    and pi.subject_id = new.subject_id;

  if not found or v_purchase_product_id is distinct from new.product_id then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reader_selection_purchase_product',
      message = 'Reader selection Product must equal the Product purchased by the Purchase Intent';
  end if;

  select srps.capability_set_id,
         srps.spec_version,
         srps.topic_key,
         srps.reader_selection_mode,
         srps.purchase_unit_mode
    into v_spec_capability_set_id,
         v_spec_version,
         v_topic_key,
         v_reader_mode,
         v_purchase_unit_mode
  from public.standard_reading_product_specs srps
  where srps.product_id = new.product_id
    and srps.retired_at is null;

  if not found
     or v_reader_mode is distinct from 'required'
     or v_purchase_unit_mode is distinct from 'topic_reader_reading' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reader_selection_product_contract',
      message = 'Reader selection requires an active reader-bound Standard Reading Product spec';
  end if;

  if v_purchase_capability_set_id is null
     or v_purchase_capability_set_id is distinct from v_spec_capability_set_id then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reader_selection_capability_pin',
      message = 'Reader selection requires the Purchase Intent to pin the Product Capability Set';
  end if;

  select crc.enabled,
         crc.availability,
         crc.release_at,
         crc.retire_at,
         c.retired_at
    into v_reader_enabled,
         v_reader_availability,
         v_reader_release_at,
         v_reader_retire_at,
         v_character_retired_at
  from public.character_runtime_catalog crc
  join public.characters c on c.character_id = crc.character_id
  where crc.character_id = new.reader_character_id
    and crc.content_bundle_id = new.reader_content_bundle_id;

  if not found
     or v_reader_enabled is distinct from true
     or v_reader_availability not in ('available', 'unlockable')
     or (v_reader_release_at is not null and v_reader_release_at > new.created_at)
     or (v_reader_retire_at is not null and v_reader_retire_at <= new.created_at)
     or v_character_retired_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reader_selection_reader_unavailable',
      message = 'selected Reader is not catalog-eligible for a new Standard Reading purchase';
  end if;

  -- User-specific unlock/access remains a server-command responsibility. This table
  -- is deliberately not writable by the ordinary API executor.
  v_expected_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', new.selection_contract_version,
    'productId', new.product_id::text,
    'topicKey', v_topic_key,
    'specVersion', v_spec_version,
    'readerCharacterId', new.reader_character_id,
    'readerContentBundleId', new.reader_content_bundle_id::text
  );

  if new.selection_snapshot_jsonb is distinct from v_expected_snapshot then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reader_selection_snapshot_mismatch',
      message = 'Reader selection snapshot must exactly match server-owned Product and Reader authority';
  end if;

  return new;
end;
$$;

create constraint trigger ct_purchase_intent_reader_selection
  after insert on public.purchase_intent_reader_selections
  deferrable initially immediate
  for each row execute function public.ct_validate_purchase_intent_reader_selection();

create or replace function public.tr_purchase_intent_reader_selection_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_purchase_intent_reader_selection_append_only',
    message = 'Purchase Intent Reader selection is immutable purchase provenance';
end;
$$;

create trigger tr_purchase_intent_reader_selection_append_only
  before update or delete on public.purchase_intent_reader_selections
  for each row execute function public.tr_purchase_intent_reader_selection_append_only();

create index purchase_intent_reader_selections_subject_created_idx
  on public.purchase_intent_reader_selections(subject_id, created_at desc);

-- New first Standard Product: Topic is the SKU, Reader is selected later.
insert into public.products(
  id,
  product_key,
  product_type,
  enabled,
  metadata_jsonb,
  created_at
) values (
  '11300000-0000-0000-0000-000000000001',
  'standard.love_relationship',
  'reading',
  false,
  pg_catalog.jsonb_build_object(
    'schemaVersion', 'standard-reading-product-v1',
    'displayName', '연애·관계',
    'productVersion', 'v1',
    'topicKey', 'love_relationship',
    'purchaseType', 'one_off',
    'readerSelectionMode', 'required',
    'activationState', 'hold_saju_interpretation',
    'priceAuthority', 'unresolved_working_candidate_only'
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
  '11301000-0000-0000-0000-000000000001',
  '11300000-0000-0000-0000-000000000001',
  'v1',
  'sha256:v1:pending-canonical-recompute-standard-love-relationship-reader-unit-v1',
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
  '11301000-0000-0000-0000-000000000001',
  'love-relationship-reader-reading-unit',
  'reading.standard.love_relationship.unit.v1',
  'global',
  null,
  'unbounded',
  null
);

insert into public.standard_reading_product_specs(
  product_id,
  capability_set_id,
  spec_version,
  topic_key,
  saju_domain,
  reading_period,
  reading_variant,
  reader_selection_mode,
  purchase_unit_mode,
  created_at
) values (
  '11300000-0000-0000-0000-000000000001',
  '11301000-0000-0000-0000-000000000001',
  'v1',
  'love_relationship',
  'relationship',
  'natal',
  'general',
  'required',
  'topic_reader_reading',
  now()
);

-- Fail closed: current product authority defines no saleable Offer/price and grants
-- no rights merely by existing in the catalog.
revoke all on table public.standard_reading_product_specs from public;
revoke all on table public.purchase_intent_reader_selections from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on table public.standard_reading_product_specs from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on table public.purchase_intent_reader_selections from %I',
      v_role
    );
  END LOOP;
END
$$;
