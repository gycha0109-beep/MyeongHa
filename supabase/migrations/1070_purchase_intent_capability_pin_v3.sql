-- Purchase Intent v3 immutable Product Capability provenance.
--
-- Additive only: v1/v2 historical rows remain valid with NULL capability provenance.
-- New v3 intents require the selected Offer to already pin a Product Capability Set,
-- validate the exact immutable set definition, and persist that provenance atomically
-- with the existing Offer snapshot and authoritative charge terms.
--
-- This migration seeds no Product, Offer, price, Capability Set, Capability Item,
-- Receipt, provider event, entitlement grant/event, or effective-entitlement state.

alter table public.purchase_intents
  add column capability_set_id uuid null,
  add column capability_snapshot_jsonb jsonb null,
  add column capability_snapshot_hash text null;

alter table public.purchase_intents
  add constraint purchase_intents_capability_set_fk
    foreign key (capability_set_id)
    references public.product_capability_sets(id),
  add constraint purchase_intents_capability_pin_shape
    check (
      (
        capability_set_id is null
        and capability_snapshot_jsonb is null
        and capability_snapshot_hash is null
      )
      or
      (
        capability_set_id is not null
        and capability_snapshot_jsonb is not null
        and capability_snapshot_hash is not null
        and btrim(capability_snapshot_hash) <> ''
      )
    );

comment on column public.purchase_intents.capability_set_id is
  'Immutable Product Capability Set identity pinned by Purchase Intent v3. Historical v1/v2 rows remain NULL.';
comment on column public.purchase_intents.capability_snapshot_jsonb is
  'Immutable v3 snapshot of Capability Set id, definition version, and definition hash.';
comment on column public.purchase_intents.capability_snapshot_hash is
  'Trusted-server canonical hash binding the immutable v3 capability snapshot; never client supplied.';

create or replace function public.ct_validate_purchase_intent_capability_pin()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_offer_product_id uuid;
  v_offer_capability_set_id uuid;
  v_capability_product_id uuid;
  v_definition_version text;
  v_definition_hash text;
  v_expected_snapshot jsonb;
begin
  -- Historical v1/v2 rows intentionally remain capability-unpinned.
  if new.capability_set_id is null then
    return new;
  end if;

  select po.product_id, po.capability_set_id
    into v_offer_product_id, v_offer_capability_set_id
  from public.product_offers po
  where po.id = new.product_offer_id;

  if not found
     or v_offer_capability_set_id is null
     or v_offer_capability_set_id is distinct from new.capability_set_id then
    raise exception using
      errcode = '23514',
      constraint = 'ct_purchase_intent_capability_offer_pin',
      message = 'purchase intent capability provenance must match the Capability Set pinned to its Offer';
  end if;

  select pcs.product_id, pcs.definition_version, pcs.definition_hash
    into v_capability_product_id, v_definition_version, v_definition_hash
  from public.product_capability_sets pcs
  where pcs.id = new.capability_set_id;

  if not found or v_capability_product_id is distinct from v_offer_product_id then
    raise exception using
      errcode = '23514',
      constraint = 'ct_purchase_intent_capability_product_parity',
      message = 'purchase intent capability provenance must belong to the same Product as its Offer';
  end if;

  if not exists (
    select 1
    from public.product_capability_items pci
    where pci.capability_set_id = new.capability_set_id
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'ct_purchase_intent_capability_nonempty',
      message = 'purchase intent capability provenance requires a non-empty Capability Set';
  end if;

  v_expected_snapshot := jsonb_build_object(
    'capabilitySetId', new.capability_set_id::text,
    'definitionVersion', v_definition_version,
    'definitionHash', v_definition_hash
  );

  if new.capability_snapshot_jsonb is distinct from v_expected_snapshot then
    raise exception using
      errcode = '23514',
      constraint = 'ct_purchase_intent_capability_snapshot',
      message = 'purchase intent capability snapshot must exactly match immutable Capability Set authority';
  end if;

  -- Capability Set retirement is deliberately not a rejection condition here.
  -- 0982 retirement prevents assigning that set to a new Offer. Once an Offer is
  -- pinned, retirement does not erase the Offer/Purchase historical rights meaning.
  return new;
end;
$$;

create constraint trigger ct_purchase_intent_capability_pin
  after insert or update of product_offer_id, capability_set_id,
    capability_snapshot_jsonb, capability_snapshot_hash
  on public.purchase_intents
  deferrable initially immediate
  for each row execute function public.ct_validate_purchase_intent_capability_pin();

-- Extend the existing immutable Purchase Intent request identity to capability
-- provenance. This also prevents a historical v1/v2 NULL row from being backfilled
-- later without a separately-authorized migration.
create or replace function public.tr_purchase_intent_identity_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if row(old.subject_id, old.product_offer_id, old.provider_account_link_id,
         old.idempotency_key, old.request_hash, old.offer_snapshot_jsonb, old.offer_snapshot_hash,
         old.capability_set_id, old.capability_snapshot_jsonb, old.capability_snapshot_hash)
     is distinct from
     row(new.subject_id, new.product_offer_id, new.provider_account_link_id,
         new.idempotency_key, new.request_hash, new.offer_snapshot_jsonb, new.offer_snapshot_hash,
         new.capability_set_id, new.capability_snapshot_jsonb, new.capability_snapshot_hash) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_purchase_intent_identity_immutable',
      message = 'purchase intent request and pinned Offer/Capability provenance are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.cmd_create_purchase_intent_v3(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_product_offer_id uuid,
  p_provider_account_link_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_offer_snapshot_jsonb jsonb,
  p_offer_snapshot_hash text,
  p_capability_snapshot_jsonb jsonb,
  p_capability_snapshot_hash text
)
returns table (
  purchase_intent_id uuid,
  product_offer_id uuid,
  provider_account_link_id uuid,
  status text,
  offer_snapshot_jsonb jsonb,
  offer_snapshot_hash text,
  expected_amount_minor bigint,
  expected_currency text,
  charge_terms_version text,
  capability_set_id uuid,
  capability_snapshot_jsonb jsonb,
  capability_snapshot_hash text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_existing_id uuid;
  v_existing_offer_id uuid;
  v_existing_account_link_id uuid;
  v_existing_request_hash text;
  v_existing_offer_snapshot jsonb;
  v_existing_offer_snapshot_hash text;
  v_existing_status text;
  v_existing_amount_minor bigint;
  v_existing_currency text;
  v_existing_terms_version text;
  v_existing_capability_set_id uuid;
  v_existing_capability_snapshot jsonb;
  v_existing_capability_snapshot_hash text;

  v_subject_kind text;
  v_subject_status text;
  v_subject_merged_into uuid;

  v_product_id uuid;
  v_platform text;
  v_provider text;
  v_external_product_id text;
  v_offer_enabled boolean;
  v_offer_retired_at timestamptz;
  v_product_enabled boolean;
  v_product_retired_at timestamptz;
  v_offer_capability_set_id uuid;
  v_expected_offer_snapshot jsonb;

  v_capability_product_id uuid;
  v_definition_version text;
  v_definition_hash text;
  v_expected_capability_snapshot jsonb;

  v_link_provider text;
  v_link_status text;

  v_amount_minor bigint;
  v_currency text;
  v_terms_version text;

  v_inserted_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_purchase_intent_id is null or p_product_offer_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_ids_required',
      message = 'subject, purchase intent id, and product offer id are required';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_idempotency_required',
      message = 'purchase intent idempotency key is required';
  end if;

  if p_request_hash is null or btrim(p_request_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_request_hash_required',
      message = 'canonical purchase request hash is required';
  end if;

  if p_offer_snapshot_jsonb is null
     or p_offer_snapshot_hash is null
     or btrim(p_offer_snapshot_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_offer_snapshot_required',
      message = 'Offer snapshot and version-prefixed snapshot hash are required';
  end if;

  if p_capability_snapshot_jsonb is null
     or p_capability_snapshot_hash is null
     or btrim(p_capability_snapshot_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_capability_snapshot_required',
      message = 'Capability snapshot and version-prefixed snapshot hash are required';
  end if;

  select pi.id,
         pi.product_offer_id,
         pi.provider_account_link_id,
         pi.request_hash,
         pi.offer_snapshot_jsonb,
         pi.offer_snapshot_hash,
         pi.status,
         pi.expected_amount_minor,
         pi.expected_currency,
         pi.charge_terms_version,
         pi.capability_set_id,
         pi.capability_snapshot_jsonb,
         pi.capability_snapshot_hash
    into v_existing_id,
         v_existing_offer_id,
         v_existing_account_link_id,
         v_existing_request_hash,
         v_existing_offer_snapshot,
         v_existing_offer_snapshot_hash,
         v_existing_status,
         v_existing_amount_minor,
         v_existing_currency,
         v_existing_terms_version,
         v_existing_capability_set_id,
         v_existing_capability_snapshot,
         v_existing_capability_snapshot_hash
  from public.purchase_intents pi
  where pi.subject_id = p_subject_id
    and pi.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_request_hash is distinct from p_request_hash then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_purchase_intent_v3_idempotency_conflict',
        message = 'purchase intent idempotency key already exists with a different canonical request hash';
    end if;

    if v_existing_offer_id is distinct from p_product_offer_id
       or v_existing_account_link_id is distinct from p_provider_account_link_id
       or v_existing_offer_snapshot is distinct from p_offer_snapshot_jsonb
       or v_existing_offer_snapshot_hash is distinct from p_offer_snapshot_hash then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_purchase_intent_v3_replay_shape_conflict',
        message = 'purchase intent replay arguments do not match the stored canonical Offer request';
    end if;

    if v_existing_amount_minor is null
       or v_existing_currency is null
       or v_existing_terms_version is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_purchase_intent_v3_replay_charge_terms_missing',
        message = 'purchase intent v3 replay requires previously pinned authoritative charge terms';
    end if;

    if v_existing_capability_set_id is null
       or v_existing_capability_snapshot is null
       or v_existing_capability_snapshot_hash is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_purchase_intent_v3_replay_capability_missing',
        message = 'purchase intent v3 replay requires previously pinned Capability provenance';
    end if;

    if v_existing_capability_snapshot is distinct from p_capability_snapshot_jsonb
       or v_existing_capability_snapshot_hash is distinct from p_capability_snapshot_hash then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_purchase_intent_v3_replay_capability_conflict',
        message = 'purchase intent replay Capability arguments do not match stored historical provenance';
    end if;

    return query
      select v_existing_id,
             v_existing_offer_id,
             v_existing_account_link_id,
             v_existing_status,
             v_existing_offer_snapshot,
             v_existing_offer_snapshot_hash,
             v_existing_amount_minor,
             v_existing_currency,
             v_existing_terms_version,
             v_existing_capability_set_id,
             v_existing_capability_snapshot,
             v_existing_capability_snapshot_hash,
             true;
    return;
  end if;

  select s.kind, s.status, s.merged_into_subject_id
    into v_subject_kind, v_subject_status, v_subject_merged_into
  from public.subjects s
  where s.id = p_subject_id
  for share;

  if not found
     or v_subject_kind not in ('guest', 'member')
     or v_subject_status is distinct from 'active'
     or v_subject_merged_into is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_subject_ineligible',
      message = 'purchase intent v3 requires an active canonical Guest or Member subject';
  end if;

  select po.product_id,
         po.platform,
         po.provider,
         po.external_product_id,
         po.enabled,
         po.retired_at,
         po.capability_set_id,
         p.enabled,
         p.retired_at
    into v_product_id,
         v_platform,
         v_provider,
         v_external_product_id,
         v_offer_enabled,
         v_offer_retired_at,
         v_offer_capability_set_id,
         v_product_enabled,
         v_product_retired_at
  from public.product_offers po
  join public.products p on p.id = po.product_id
  where po.id = p_product_offer_id
  for share of po, p;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_purchase_intent_v3_offer_not_found',
      message = 'selected product offer was not found';
  end if;

  if v_offer_enabled is distinct from true
     or v_offer_retired_at is not null
     or v_product_enabled is distinct from true
     or v_product_retired_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_offer_unavailable',
      message = 'selected product and offer must be enabled and non-retired';
  end if;

  v_expected_offer_snapshot := jsonb_build_object(
    'productOfferId', p_product_offer_id::text,
    'productId', v_product_id::text,
    'platform', v_platform,
    'provider', v_provider,
    'externalProductId', v_external_product_id
  );

  if p_offer_snapshot_jsonb is distinct from v_expected_offer_snapshot then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_offer_snapshot_mismatch',
      message = 'Offer snapshot must exactly match authoritative immutable Offer mapping';
  end if;

  if v_offer_capability_set_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_purchase_intent_v3_capability_unavailable',
      message = 'selected product offer has no pinned Product Capability Set';
  end if;

  select pcs.product_id, pcs.definition_version, pcs.definition_hash
    into v_capability_product_id, v_definition_version, v_definition_hash
  from public.product_capability_sets pcs
  where pcs.id = v_offer_capability_set_id
  for share;

  if not found or v_capability_product_id is distinct from v_product_id then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_capability_authority_mismatch',
      message = 'Offer Capability Set authority does not belong to the selected Product';
  end if;

  if not exists (
    select 1
    from public.product_capability_items pci
    where pci.capability_set_id = v_offer_capability_set_id
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_capability_nonempty',
      message = 'Offer Capability Set must contain at least one immutable Capability Item';
  end if;

  v_expected_capability_snapshot := jsonb_build_object(
    'capabilitySetId', v_offer_capability_set_id::text,
    'definitionVersion', v_definition_version,
    'definitionHash', v_definition_hash
  );

  if p_capability_snapshot_jsonb is distinct from v_expected_capability_snapshot then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_capability_snapshot_mismatch',
      message = 'Capability snapshot must exactly match authoritative immutable Capability Set mapping';
  end if;

  if p_provider_account_link_id is not null then
    select cal.provider, cal.status
      into v_link_provider, v_link_status
    from public.commerce_account_links cal
    where cal.id = p_provider_account_link_id
      and cal.subject_id = p_subject_id
    for share;

    if not found
       or v_link_provider is distinct from v_provider
       or v_link_status is distinct from 'active' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_purchase_intent_v3_provider_link',
        message = 'purchase intent provider account link must be active, owner-matched, and match Offer provider';
    end if;
  end if;

  select pct.amount_minor, pct.currency, pct.terms_version
    into v_amount_minor, v_currency, v_terms_version
  from public.product_offer_charge_terms pct
  where pct.product_offer_id = p_product_offer_id
    and pct.retired_at is null
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_purchase_intent_v3_charge_terms_unavailable',
      message = 'selected product offer has no current authoritative charge terms';
  end if;

  insert into public.purchase_intents(
    id,
    subject_id,
    product_offer_id,
    provider_account_link_id,
    idempotency_key,
    request_hash,
    offer_snapshot_jsonb,
    offer_snapshot_hash,
    expected_amount_minor,
    expected_currency,
    charge_terms_version,
    capability_set_id,
    capability_snapshot_jsonb,
    capability_snapshot_hash,
    status,
    created_at,
    updated_at
  ) values (
    p_purchase_intent_id,
    p_subject_id,
    p_product_offer_id,
    p_provider_account_link_id,
    p_idempotency_key,
    p_request_hash,
    p_offer_snapshot_jsonb,
    p_offer_snapshot_hash,
    v_amount_minor,
    v_currency,
    v_terms_version,
    v_offer_capability_set_id,
    p_capability_snapshot_jsonb,
    p_capability_snapshot_hash,
    'created',
    v_now,
    v_now
  )
  on conflict (subject_id, idempotency_key) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    return query
      select p_purchase_intent_id,
             p_product_offer_id,
             p_provider_account_link_id,
             'created'::text,
             p_offer_snapshot_jsonb,
             p_offer_snapshot_hash,
             v_amount_minor,
             v_currency,
             v_terms_version,
             v_offer_capability_set_id,
             p_capability_snapshot_jsonb,
             p_capability_snapshot_hash,
             false;
    return;
  end if;

  select pi.id,
         pi.product_offer_id,
         pi.provider_account_link_id,
         pi.request_hash,
         pi.offer_snapshot_jsonb,
         pi.offer_snapshot_hash,
         pi.status,
         pi.expected_amount_minor,
         pi.expected_currency,
         pi.charge_terms_version,
         pi.capability_set_id,
         pi.capability_snapshot_jsonb,
         pi.capability_snapshot_hash
    into v_existing_id,
         v_existing_offer_id,
         v_existing_account_link_id,
         v_existing_request_hash,
         v_existing_offer_snapshot,
         v_existing_offer_snapshot_hash,
         v_existing_status,
         v_existing_amount_minor,
         v_existing_currency,
         v_existing_terms_version,
         v_existing_capability_set_id,
         v_existing_capability_snapshot,
         v_existing_capability_snapshot_hash
  from public.purchase_intents pi
  where pi.subject_id = p_subject_id
    and pi.idempotency_key = p_idempotency_key;

  if not found then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_purchase_intent_v3_concurrent_replay_missing',
      message = 'purchase intent concurrent replay winner could not be resolved';
  end if;

  if v_existing_request_hash is distinct from p_request_hash then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_purchase_intent_v3_idempotency_conflict',
      message = 'purchase intent idempotency key already exists with a different canonical request hash';
  end if;

  if v_existing_offer_id is distinct from p_product_offer_id
     or v_existing_account_link_id is distinct from p_provider_account_link_id
     or v_existing_offer_snapshot is distinct from p_offer_snapshot_jsonb
     or v_existing_offer_snapshot_hash is distinct from p_offer_snapshot_hash then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_replay_shape_conflict',
      message = 'purchase intent replay arguments do not match the stored canonical Offer request';
  end if;

  if v_existing_amount_minor is null
     or v_existing_currency is null
     or v_existing_terms_version is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_replay_charge_terms_missing',
      message = 'purchase intent v3 replay requires previously pinned authoritative charge terms';
  end if;

  if v_existing_capability_set_id is null
     or v_existing_capability_snapshot is null
     or v_existing_capability_snapshot_hash is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_replay_capability_missing',
      message = 'purchase intent v3 replay requires previously pinned Capability provenance';
  end if;

  if v_existing_capability_snapshot is distinct from p_capability_snapshot_jsonb
     or v_existing_capability_snapshot_hash is distinct from p_capability_snapshot_hash then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v3_replay_capability_conflict',
      message = 'purchase intent replay Capability arguments do not match stored historical provenance';
  end if;

  return query
    select v_existing_id,
           v_existing_offer_id,
           v_existing_account_link_id,
           v_existing_status,
           v_existing_offer_snapshot,
           v_existing_offer_snapshot_hash,
           v_existing_amount_minor,
           v_existing_currency,
           v_existing_terms_version,
           v_existing_capability_set_id,
           v_existing_capability_snapshot,
           v_existing_capability_snapshot_hash,
           true;
end;
$$;

revoke all on function public.cmd_create_purchase_intent_v3(
  uuid, uuid, uuid, uuid, text, text, jsonb, text, jsonb, text
) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_create_purchase_intent_v3(uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_create_purchase_intent_v3(
  uuid, uuid, uuid, uuid, text, text, jsonb, text, jsonb, text
) to myeongha_api_executor;
