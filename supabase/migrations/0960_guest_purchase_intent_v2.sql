-- Guest/Member Purchase Intent v2 + authoritative versioned charge terms.
--
-- P0-CM-04 authorizes active Guest purchase ownership, but the legacy v1 command
-- remains historical Member-only behavior. V2 is additive and pins charge terms
-- from a server-owned immutable/versioned authority, never from the mutable
-- product_offers display-price cache and never from client input.
--
-- This migration creates no charge-term rows and therefore activates no saleable
-- paid catalog. It calls no provider, verifies no payment, creates no Receipt,
-- and mutates no Entitlement/Grant/Event authority.

create table public.product_offer_charge_terms (
  id uuid primary key,
  product_offer_id uuid not null references public.product_offers(id),
  terms_version text not null,
  amount_minor bigint not null,
  currency text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz null,
  constraint product_offer_charge_terms_version_nonempty
    check (btrim(terms_version) <> ''),
  constraint product_offer_charge_terms_amount_positive
    check (amount_minor > 0),
  constraint product_offer_charge_terms_currency_canonical
    check (currency ~ '^[A-Z]{3}$'),
  constraint product_offer_charge_terms_retirement_order
    check (retired_at is null or retired_at >= created_at),
  constraint uq_product_offer_charge_terms_version
    unique (product_offer_id, terms_version)
);

-- At most one currently selectable charge authority may exist per Offer.
create unique index uq_product_offer_charge_terms_current
  on public.product_offer_charge_terms(product_offer_id)
  where retired_at is null;

create index product_offer_charge_terms_offer_history_idx
  on public.product_offer_charge_terms(product_offer_id, created_at desc);

comment on table public.product_offer_charge_terms is
  'Server-owned versioned payment charge authority. product_offers display_price_minor/currency remain non-authoritative display cache fields.';
comment on column public.product_offer_charge_terms.amount_minor is
  'Positive authoritative charge amount in minor currency units; immutable for this terms version.';
comment on column public.product_offer_charge_terms.currency is
  'Canonical three-uppercase-letter authoritative charge currency; immutable for this terms version.';
comment on column public.product_offer_charge_terms.retired_at is
  'One-way retirement marker. A retired charge-term version cannot become current again.';

create or replace function public.tr_product_offer_charge_term_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_offer_charge_term_no_delete',
      message = 'product offer charge-term history cannot be deleted';
  end if;

  if row(old.id, old.product_offer_id, old.terms_version,
         old.amount_minor, old.currency, old.created_at)
     is distinct from
     row(new.id, new.product_offer_id, new.terms_version,
         new.amount_minor, new.currency, new.created_at) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_offer_charge_term_identity_immutable',
      message = 'product offer charge-term monetary identity is immutable';
  end if;

  if old.retired_at is not null
     and new.retired_at is distinct from old.retired_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_product_offer_charge_term_no_reactivate',
      message = 'retired product offer charge terms cannot be reactivated or rewritten';
  end if;

  return new;
end;
$$;

create trigger tr_product_offer_charge_term_immutable
  before update or delete on public.product_offer_charge_terms
  for each row execute function public.tr_product_offer_charge_term_immutable();

-- Broaden only the shared row-level invariant to the P0-CM-04 canonical owner set.
-- cmd_create_purchase_intent_v1 retains its own explicit active-Member check, so
-- historical v1 semantics remain unchanged.
create or replace function public.ct_validate_purchase_intent_authority()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  owner_kind text;
  owner_status text;
  owner_merged_into uuid;
  offer_provider text;
  link_provider text;
  link_status text;
begin
  select s.kind, s.status, s.merged_into_subject_id
    into owner_kind, owner_status, owner_merged_into
  from public.subjects s
  where s.id = new.subject_id;

  if owner_kind not in ('guest', 'member')
     or owner_status is distinct from 'active'
     or owner_merged_into is not null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_purchase_intent_active_canonical_subject',
      message = 'purchase intent requires an active canonical Guest or Member subject';
  end if;

  if new.provider_account_link_id is not null then
    select po.provider into offer_provider
    from public.product_offers po where po.id = new.product_offer_id;

    select cal.provider, cal.status into link_provider, link_status
    from public.commerce_account_links cal
    where cal.id = new.provider_account_link_id and cal.subject_id = new.subject_id;

    if link_provider is distinct from offer_provider or link_status is distinct from 'active' then
      raise exception using
        errcode = '23514',
        constraint = 'ct_purchase_intent_provider_link',
        message = 'purchase intent provider account link must be active and match offer provider';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.cmd_create_purchase_intent_v2(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_product_offer_id uuid,
  p_provider_account_link_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_offer_snapshot_jsonb jsonb,
  p_offer_snapshot_hash text
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
  v_existing_snapshot jsonb;
  v_existing_snapshot_hash text;
  v_existing_status text;
  v_existing_amount_minor bigint;
  v_existing_currency text;
  v_existing_terms_version text;

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
  v_expected_snapshot jsonb;

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
      constraint = 'cmd_purchase_intent_v2_ids_required',
      message = 'subject, purchase intent id, and product offer id are required';
  end if;

  -- Ordinary runtime callers must not be able to supply/override an owner that is
  -- different from the server-established transaction subject context.
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v2_idempotency_required',
      message = 'purchase intent idempotency key is required';
  end if;

  if p_request_hash is null or btrim(p_request_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v2_request_hash_required',
      message = 'canonical purchase request hash is required';
  end if;

  if p_offer_snapshot_jsonb is null
     or p_offer_snapshot_hash is null
     or btrim(p_offer_snapshot_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v2_snapshot_required',
      message = 'offer snapshot and version-prefixed snapshot hash are required';
  end if;

  -- Replay resolves the already-pinned logical Purchase Intent before consulting
  -- current Offer availability or current charge terms. A later catalog/price
  -- change therefore cannot rewrite the original monetary authority.
  select pi.id,
         pi.product_offer_id,
         pi.provider_account_link_id,
         pi.request_hash,
         pi.offer_snapshot_jsonb,
         pi.offer_snapshot_hash,
         pi.status,
         pi.expected_amount_minor,
         pi.expected_currency,
         pi.charge_terms_version
    into v_existing_id,
         v_existing_offer_id,
         v_existing_account_link_id,
         v_existing_request_hash,
         v_existing_snapshot,
         v_existing_snapshot_hash,
         v_existing_status,
         v_existing_amount_minor,
         v_existing_currency,
         v_existing_terms_version
  from public.purchase_intents pi
  where pi.subject_id = p_subject_id
    and pi.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_request_hash is distinct from p_request_hash then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_purchase_intent_v2_idempotency_conflict',
        message = 'purchase intent idempotency key already exists with a different canonical request hash';
    end if;

    if v_existing_offer_id is distinct from p_product_offer_id
       or v_existing_account_link_id is distinct from p_provider_account_link_id
       or v_existing_snapshot is distinct from p_offer_snapshot_jsonb
       or v_existing_snapshot_hash is distinct from p_offer_snapshot_hash then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_purchase_intent_v2_replay_shape_conflict',
        message = 'purchase intent replay arguments do not match the stored canonical request';
    end if;

    if v_existing_amount_minor is null
       or v_existing_currency is null
       or v_existing_terms_version is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_purchase_intent_v2_replay_charge_terms_missing',
        message = 'purchase intent v2 replay requires previously pinned authoritative charge terms';
    end if;

    return query
      select v_existing_id,
             v_existing_offer_id,
             v_existing_account_link_id,
             v_existing_status,
             v_existing_snapshot,
             v_existing_snapshot_hash,
             v_existing_amount_minor,
             v_existing_currency,
             v_existing_terms_version,
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
      constraint = 'cmd_purchase_intent_v2_subject_ineligible',
      message = 'purchase intent v2 requires an active canonical Guest or Member subject';
  end if;

  select po.product_id,
         po.platform,
         po.provider,
         po.external_product_id,
         po.enabled,
         po.retired_at,
         p.enabled,
         p.retired_at
    into v_product_id,
         v_platform,
         v_provider,
         v_external_product_id,
         v_offer_enabled,
         v_offer_retired_at,
         v_product_enabled,
         v_product_retired_at
  from public.product_offers po
  join public.products p on p.id = po.product_id
  where po.id = p_product_offer_id
  for share of po, p;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_purchase_intent_v2_offer_not_found',
      message = 'selected product offer was not found';
  end if;

  if v_offer_enabled is distinct from true
     or v_offer_retired_at is not null
     or v_product_enabled is distinct from true
     or v_product_retired_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v2_offer_unavailable',
      message = 'selected product and offer must be enabled and non-retired';
  end if;

  v_expected_snapshot := jsonb_build_object(
    'productOfferId', p_product_offer_id::text,
    'productId', v_product_id::text,
    'platform', v_platform,
    'provider', v_provider,
    'externalProductId', v_external_product_id
  );

  if p_offer_snapshot_jsonb is distinct from v_expected_snapshot then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v2_offer_snapshot_mismatch',
      message = 'offer snapshot must exactly match the authoritative immutable offer mapping';
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
        constraint = 'cmd_purchase_intent_v2_provider_link',
        message = 'purchase intent provider account link must be active, owner-matched, and match offer provider';
    end if;
  end if;

  -- Only this independent server-owned table is monetary authority. The mutable
  -- product_offers display cache is intentionally not read here.
  select pct.amount_minor, pct.currency, pct.terms_version
    into v_amount_minor, v_currency, v_terms_version
  from public.product_offer_charge_terms pct
  where pct.product_offer_id = p_product_offer_id
    and pct.retired_at is null
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_purchase_intent_v2_charge_terms_unavailable',
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
             false;
    return;
  end if;

  -- A concurrent retry won the logical key. Never use the currently selected charge
  -- term to interpret that winner; re-read the winner's already-pinned terms.
  select pi.id,
         pi.product_offer_id,
         pi.provider_account_link_id,
         pi.request_hash,
         pi.offer_snapshot_jsonb,
         pi.offer_snapshot_hash,
         pi.status,
         pi.expected_amount_minor,
         pi.expected_currency,
         pi.charge_terms_version
    into v_existing_id,
         v_existing_offer_id,
         v_existing_account_link_id,
         v_existing_request_hash,
         v_existing_snapshot,
         v_existing_snapshot_hash,
         v_existing_status,
         v_existing_amount_minor,
         v_existing_currency,
         v_existing_terms_version
  from public.purchase_intents pi
  where pi.subject_id = p_subject_id
    and pi.idempotency_key = p_idempotency_key;

  if not found then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_purchase_intent_v2_concurrent_replay_missing',
      message = 'purchase intent concurrent replay winner could not be resolved';
  end if;

  if v_existing_request_hash is distinct from p_request_hash then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_purchase_intent_v2_idempotency_conflict',
      message = 'purchase intent idempotency key already exists with a different canonical request hash';
  end if;

  if v_existing_offer_id is distinct from p_product_offer_id
     or v_existing_account_link_id is distinct from p_provider_account_link_id
     or v_existing_snapshot is distinct from p_offer_snapshot_jsonb
     or v_existing_snapshot_hash is distinct from p_offer_snapshot_hash then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v2_replay_shape_conflict',
      message = 'purchase intent replay arguments do not match the stored canonical request';
  end if;

  if v_existing_amount_minor is null
     or v_existing_currency is null
     or v_existing_terms_version is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_v2_replay_charge_terms_missing',
      message = 'purchase intent v2 replay requires previously pinned authoritative charge terms';
  end if;

  return query
    select v_existing_id,
           v_existing_offer_id,
           v_existing_account_link_id,
           v_existing_status,
           v_existing_snapshot,
           v_existing_snapshot_hash,
           v_existing_amount_minor,
           v_existing_currency,
           v_existing_terms_version,
           true;
end;
$$;

-- This is a server runtime command, not a public Supabase RPC surface.
revoke all on table public.product_offer_charge_terms from public;
revoke all on function public.cmd_create_purchase_intent_v2(
  uuid, uuid, uuid, uuid, text, text, jsonb, text
) from public;

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
      'revoke all on table public.product_offer_charge_terms from %I',
      v_role
    );
  END LOOP;

  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_create_purchase_intent_v2(uuid,uuid,uuid,uuid,text,text,jsonb,text) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_create_purchase_intent_v2(
  uuid, uuid, uuid, uuid, text, text, jsonb, text
) to myeongha_api_executor;
