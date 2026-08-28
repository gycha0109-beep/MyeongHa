-- MyeongHa Purchase Intent create persistence authority.
--
-- UC-26 requires a Purchase Intent before provider/store payment execution and keeps
-- server-verified receipt/entitlement authority separate from client payment UI.
-- ERD v0.6 defines purchase_intents as an idempotent member-owned request whose
-- selected product_offer mapping is pinned in an immutable minimal snapshot.
--
-- This command implements only that persistence boundary:
-- - active member owner
-- - selected enabled/non-retired product + offer
-- - optional active same-provider verified account link
-- - exact immutable provider/platform/product mapping snapshot validation
-- - same subject + idempotency key + same canonical request => replay
-- - same idempotency key + different canonical request => conflict
--
-- It does NOT call a payment provider, verify a receipt, create a receipt/provider
-- event, or grant/recompute any entitlement.
--
-- request_hash / offer_snapshot_hash are service-generated version-prefixed digests.
-- The DB validates the snapshot body against authoritative offer mapping; hash
-- canonicalization remains outside this function because the source does not define
-- a PostgreSQL hash serialization contract.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.cmd_create_purchase_intent_v1(
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
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
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

  v_subject_kind text;
  v_subject_status text;

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

  v_inserted_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_purchase_intent_id is null or p_product_offer_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_ids_required',
      message = 'subject, purchase intent id, and product offer id are required';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_idempotency_required',
      message = 'purchase intent idempotency key is required';
  end if;

  if p_request_hash is null or btrim(p_request_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_request_hash_required',
      message = 'canonical purchase request hash is required';
  end if;

  if p_offer_snapshot_jsonb is null
     or p_offer_snapshot_hash is null
     or btrim(p_offer_snapshot_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_snapshot_required',
      message = 'offer snapshot and version-prefixed snapshot hash are required';
  end if;

  -- Idempotent replay must survive later offer disable/retirement. Resolve an existing
  -- logical request before re-validating current operational catalog state.
  select pi.id,
         pi.product_offer_id,
         pi.provider_account_link_id,
         pi.request_hash,
         pi.offer_snapshot_jsonb,
         pi.offer_snapshot_hash,
         pi.status
    into v_existing_id,
         v_existing_offer_id,
         v_existing_account_link_id,
         v_existing_request_hash,
         v_existing_snapshot,
         v_existing_snapshot_hash,
         v_existing_status
  from public.purchase_intents pi
  where pi.subject_id = p_subject_id
    and pi.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_request_hash is distinct from p_request_hash then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_purchase_intent_idempotency_conflict',
        message = 'purchase intent idempotency key already exists with a different canonical request hash';
    end if;

    if v_existing_offer_id is distinct from p_product_offer_id
       or v_existing_account_link_id is distinct from p_provider_account_link_id
       or v_existing_snapshot is distinct from p_offer_snapshot_jsonb
       or v_existing_snapshot_hash is distinct from p_offer_snapshot_hash then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_purchase_intent_replay_shape_conflict',
        message = 'purchase intent replay arguments do not match the stored canonical request';
    end if;

    return query
      select v_existing_id,
             v_existing_offer_id,
             v_existing_account_link_id,
             v_existing_status,
             v_existing_snapshot,
             v_existing_snapshot_hash,
             true;
    return;
  end if;

  select s.kind, s.status
    into v_subject_kind, v_subject_status
  from public.subjects s
  where s.id = p_subject_id
  for share;

  if not found
     or v_subject_kind is distinct from 'member'
     or v_subject_status is distinct from 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_member_only',
      message = 'purchase intent requires an active member subject';
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
      constraint = 'cmd_purchase_intent_offer_not_found',
      message = 'selected product offer was not found';
  end if;

  if v_offer_enabled is distinct from true
     or v_offer_retired_at is not null
     or v_product_enabled is distinct from true
     or v_product_retired_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_offer_unavailable',
      message = 'selected product and offer must be enabled and non-retired';
  end if;

  -- ERD 12.2 defines exactly this immutable provider/store product mapping. Display
  -- currency/price are mutable cache fields and therefore are intentionally excluded.
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
      constraint = 'cmd_purchase_intent_offer_snapshot_mismatch',
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
        constraint = 'cmd_purchase_intent_provider_link',
        message = 'purchase intent provider account link must be active, owner-matched, and match offer provider';
    end if;
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
             false;
    return;
  end if;

  -- Concurrent retry won the unique key. Read the winner and apply the same replay
  -- contract as a retry arriving after commit.
  select pi.id,
         pi.product_offer_id,
         pi.provider_account_link_id,
         pi.request_hash,
         pi.offer_snapshot_jsonb,
         pi.offer_snapshot_hash,
         pi.status
    into v_existing_id,
         v_existing_offer_id,
         v_existing_account_link_id,
         v_existing_request_hash,
         v_existing_snapshot,
         v_existing_snapshot_hash,
         v_existing_status
  from public.purchase_intents pi
  where pi.subject_id = p_subject_id
    and pi.idempotency_key = p_idempotency_key;

  if not found then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_purchase_intent_concurrent_replay_missing',
      message = 'purchase intent concurrent replay winner could not be resolved';
  end if;

  if v_existing_request_hash is distinct from p_request_hash then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_purchase_intent_idempotency_conflict',
      message = 'purchase intent idempotency key already exists with a different canonical request hash';
  end if;

  if v_existing_offer_id is distinct from p_product_offer_id
     or v_existing_account_link_id is distinct from p_provider_account_link_id
     or v_existing_snapshot is distinct from p_offer_snapshot_jsonb
     or v_existing_snapshot_hash is distinct from p_offer_snapshot_hash then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_purchase_intent_replay_shape_conflict',
      message = 'purchase intent replay arguments do not match the stored canonical request';
  end if;

  return query
    select v_existing_id,
           v_existing_offer_id,
           v_existing_account_link_id,
           v_existing_status,
           v_existing_snapshot,
           v_existing_snapshot_hash,
           true;
end;
$$;

revoke execute on function public.cmd_create_purchase_intent_v1(
  uuid, uuid, uuid, uuid, text, text, jsonb, text
) from public;
