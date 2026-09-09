-- Product Capability Set authority foundation.
--
-- Source-backed by:
--   docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md
--   docs/source-authority-gaps/SRC-18_COMMERCE_PRODUCT_ENTITLEMENT_MAPPING.md
--
-- This additive migration implements only immutable Product -> Capability meaning and
-- nullable-first Offer pinning. It does NOT select a PSP, activate payment execution,
-- backfill historical mappings, seed launch SKUs, or apply verified receipts to grants.

create table public.product_capability_sets (
  id uuid primary key,
  product_id uuid not null,
  definition_version text not null,
  definition_hash text not null,
  created_at timestamptz not null,
  retired_at timestamptz null,
  constraint product_capability_sets_product_version_unique
    unique (product_id, definition_version),
  constraint product_capability_sets_id_product_unique
    unique (id, product_id),
  constraint product_capability_sets_product_fk
    foreign key (product_id) references public.products(id),
  constraint product_capability_sets_definition_version_check
    check (btrim(definition_version) <> ''),
  constraint product_capability_sets_definition_hash_check
    check (btrim(definition_hash) <> '')
);

create table public.product_capability_items (
  capability_set_id uuid not null,
  item_key text not null,
  entitlement_key text not null,
  scope_mode text not null,
  fixed_scope_key text null,
  validity_mode text not null,
  duration_seconds bigint null,
  constraint product_capability_items_pk
    primary key (capability_set_id, item_key),
  constraint product_capability_items_set_fk
    foreign key (capability_set_id) references public.product_capability_sets(id),
  constraint product_capability_items_item_key_check
    check (btrim(item_key) <> ''),
  constraint product_capability_items_entitlement_key_check
    check (btrim(entitlement_key) <> ''),
  constraint product_capability_items_scope_mode_check
    check (scope_mode in ('global', 'fixed')),
  constraint product_capability_items_scope_shape_check
    check (
      (scope_mode = 'global' and fixed_scope_key is null)
      or
      (scope_mode = 'fixed' and fixed_scope_key is not null and btrim(fixed_scope_key) <> '')
    ),
  constraint product_capability_items_validity_mode_check
    check (validity_mode in ('unbounded', 'fixed_duration', 'provider_expiry')),
  constraint product_capability_items_validity_shape_check
    check (
      (validity_mode in ('unbounded', 'provider_expiry') and duration_seconds is null)
      or
      (validity_mode = 'fixed_duration' and duration_seconds is not null and duration_seconds > 0)
    )
);

alter table public.product_offers
  add column capability_set_id uuid null;

alter table public.product_offers
  add constraint product_offers_capability_set_product_fk
    foreign key (capability_set_id, product_id)
    references public.product_capability_sets(id, product_id);

-- A Capability Set's semantic identity is immutable after creation. Retirement is the
-- only in-place operational change and is one-way NULL -> timestamp.
create or replace function public.tr_product_capability_set_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_capability_set_no_delete',
      message = 'product capability set history cannot be deleted';
  end if;

  if row(old.id, old.product_id, old.definition_version, old.definition_hash, old.created_at)
     is distinct from
     row(new.id, new.product_id, new.definition_version, new.definition_hash, new.created_at) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_capability_set_semantics_immutable',
      message = 'product capability set semantic identity is immutable';
  end if;

  if old.retired_at is not null and new.retired_at is distinct from old.retired_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_capability_set_retirement_monotonic',
      message = 'product capability set retirement is one-way';
  end if;

  return new;
end;
$$;

create trigger tr_product_capability_set_immutable
  before update or delete on public.product_capability_sets
  for each row execute function public.tr_product_capability_set_immutable();

-- Capability Item semantic rows are immutable. A set may be assembled only before it
-- is retired or pinned by any Offer; once it can carry historical commerce meaning,
-- additional items would reinterpret that meaning and are therefore denied.
create or replace function public.tr_product_capability_item_immutable()
returns trigger
language plpgsql
as $$
declare
  v_retired_at timestamptz;
  v_is_pinned boolean;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_capability_item_semantics_immutable',
      message = 'product capability item semantic identity is immutable';
  end if;

  select pcs.retired_at,
         exists (
           select 1
           from public.product_offers po
           where po.capability_set_id = new.capability_set_id
         )
    into v_retired_at, v_is_pinned
  from public.product_capability_sets pcs
  where pcs.id = new.capability_set_id;

  if not found then
    return new;
  end if;

  if v_retired_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_capability_item_retired_set',
      message = 'retired product capability set cannot receive new items';
  end if;

  if v_is_pinned then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_capability_item_pinned_set',
      message = 'offer-pinned product capability set cannot receive new items';
  end if;

  return new;
end;
$$;

create trigger tr_product_capability_item_immutable
  before insert or update or delete on public.product_capability_items
  for each row execute function public.tr_product_capability_item_immutable();

-- Existing Offers remain nullable during the expand phase. A newly assigned pin must
-- match the Offer Product, reference an active set with at least one item, and can never
-- be cleared or repointed afterward.
create or replace function public.tr_product_offer_capability_pin_authority()
returns trigger
language plpgsql
as $$
declare
  v_product_id uuid;
  v_retired_at timestamptz;
  v_has_items boolean;
begin
  if tg_op = 'UPDATE'
     and old.capability_set_id is not null
     and new.capability_set_id is distinct from old.capability_set_id then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_offer_capability_pin_immutable',
      message = 'product offer capability set pin is immutable once assigned';
  end if;

  if new.capability_set_id is null then
    return new;
  end if;

  select pcs.product_id,
         pcs.retired_at,
         exists (
           select 1
           from public.product_capability_items pci
           where pci.capability_set_id = pcs.id
         )
    into v_product_id, v_retired_at, v_has_items
  from public.product_capability_sets pcs
  where pcs.id = new.capability_set_id;

  if not found then
    return new;
  end if;

  if v_product_id is distinct from new.product_id then
    raise exception using
      errcode = '23514',
      constraint = 'product_offers_capability_set_product_fk',
      message = 'product offer and capability set must belong to the same product';
  end if;

  if (tg_op = 'INSERT' or old.capability_set_id is null) and v_retired_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_offer_capability_set_active',
      message = 'retired product capability set cannot receive a new offer pin';
  end if;

  if not v_has_items then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_offer_capability_set_nonempty',
      message = 'product offer capability set must contain at least one capability item';
  end if;

  return new;
end;
$$;

create trigger tr_product_offer_capability_pin_authority
  before insert or update of capability_set_id, product_id on public.product_offers
  for each row execute function public.tr_product_offer_capability_pin_authority();

-- Preserve the already-established provider/platform/Product mapping immutability and
-- additionally make the Capability Set part of the historical Offer identity once set.
create or replace function public.tr_product_offer_mapping_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.product_id, old.platform, old.provider, old.external_product_id)
     is distinct from
     row(new.product_id, new.platform, new.provider, new.external_product_id) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_offer_mapping_immutable',
      message = 'product offer provider/platform/product mapping is immutable';
  end if;

  if old.capability_set_id is not null
     and new.capability_set_id is distinct from old.capability_set_id then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_offer_capability_pin_immutable',
      message = 'product offer capability set pin is immutable once assigned';
  end if;

  return new;
end;
$$;

-- The API executor must not gain direct catalog/pin mutation authority from this
-- migration. Future commerce commands require an explicit narrow owner/grant contract.
DO $$
BEGIN
  IF pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_capability_sets', 'INSERT')
     OR pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_capability_sets', 'UPDATE')
     OR pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_capability_sets', 'DELETE')
     OR pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_capability_items', 'INSERT')
     OR pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_capability_items', 'UPDATE')
     OR pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_capability_items', 'DELETE')
     OR pg_catalog.has_table_privilege('myeongha_api_executor', 'public.product_offers', 'UPDATE') THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly gained direct Product Capability mutation authority';
  END IF;
END
$$;