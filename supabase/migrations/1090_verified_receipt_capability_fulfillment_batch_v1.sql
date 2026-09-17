-- Internal all-or-neither verified Receipt -> Product Capability fulfillment batch foundation.
--
-- This migration composes the single-effect primitive introduced by 1080 across the
-- complete immutable Capability Set pinned by Purchase Intent v3. It intentionally
-- does NOT derive the initial validity anchor, interpret provider-native opaque time
-- tokens, activate a saleable catalog/rail, or expose a public/API mutation surface.

create or replace function public.internal_apply_verified_receipt_capability_effects_v1(
  p_receipt_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[]
)
returns table (
  result_item_key text,
  result_grant_id uuid,
  result_entitlement_event_id uuid,
  result_projection_id uuid,
  result_grant_revision bigint,
  result_projection_revision bigint,
  result_projection_changed boolean,
  result_outbox_event_id uuid,
  result_replayed boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_as_of timestamptz := transaction_timestamp();
  v_receipt public.commerce_receipts%rowtype;
  v_capability_set_id uuid;
  v_capability_snapshot jsonb;
  v_capability_snapshot_hash text;
  v_definition_version text;
  v_definition_hash text;
  v_offer_product_id uuid;
  v_capability_product_id uuid;
  v_input_count integer;
  v_distinct_count integer;
  v_set_count integer;
  v_match_count integer;
  v_idx integer;
  v_item record;
  v_apply record;
begin
  if p_receipt_id is null then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_batch_receipt_required',
      message = 'verified Receipt identity is required';
  end if;

  if p_capability_item_keys is null
     or p_effective_ats is null
     or p_target_valid_froms is null
     or p_target_valid_untils is null
     or p_reason_codes is null then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_batch_arrays_required',
      message = 'complete typed entitlement-effect arrays are required';
  end if;

  if coalesce(array_ndims(p_capability_item_keys), 0) <> 1
     or coalesce(array_ndims(p_effective_ats), 0) <> 1
     or coalesce(array_ndims(p_target_valid_froms), 0) <> 1
     or coalesce(array_ndims(p_target_valid_untils), 0) <> 1
     or coalesce(array_ndims(p_reason_codes), 0) <> 1
     or coalesce(array_lower(p_capability_item_keys, 1), 0) <> 1
     or coalesce(array_lower(p_effective_ats, 1), 0) <> 1
     or coalesce(array_lower(p_target_valid_froms, 1), 0) <> 1
     or coalesce(array_lower(p_target_valid_untils, 1), 0) <> 1
     or coalesce(array_lower(p_reason_codes, 1), 0) <> 1 then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_batch_array_shape_invalid',
      message = 'entitlement-effect inputs must be one-dimensional one-based arrays';
  end if;

  v_input_count := cardinality(p_capability_item_keys);
  if v_input_count <= 0
     or cardinality(p_effective_ats) <> v_input_count
     or cardinality(p_target_valid_froms) <> v_input_count
     or cardinality(p_target_valid_untils) <> v_input_count
     or cardinality(p_reason_codes) <> v_input_count then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_batch_array_cardinality_invalid',
      message = 'entitlement-effect arrays must be non-empty and have identical cardinality';
  end if;

  if array_position(p_capability_item_keys, null) is not null
     or array_position(p_effective_ats, null) is not null
     or array_position(p_target_valid_froms, null) is not null then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_batch_required_value_missing',
      message = 'item key, effective time, and target valid-from are required for every effect';
  end if;

  if exists (
    select 1
    from unnest(p_capability_item_keys) as supplied(item_key)
    where btrim(supplied.item_key) = ''
  ) then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_batch_item_key_invalid',
      message = 'Capability Item keys must be non-empty';
  end if;

  select count(distinct supplied.item_key)::integer
    into v_distinct_count
  from unnest(p_capability_item_keys) as supplied(item_key);

  if v_distinct_count <> v_input_count then
    raise exception using errcode = '23505',
      constraint = 'internal_entitlement_batch_item_key_duplicate',
      message = 'Capability Item keys must be unique within one fulfillment batch';
  end if;

  select cr.* into v_receipt
  from public.commerce_receipts cr
  where cr.id = p_receipt_id
  for update;

  if not found
     or v_receipt.verification_status is distinct from 'verified'
     or v_receipt.environment is distinct from 'production'
     or v_receipt.purchase_intent_id is null
     or v_receipt.product_offer_id is null then
    raise exception using errcode = 'P0001',
      constraint = 'internal_entitlement_batch_receipt_unavailable',
      message = 'production verified Receipt authority is unavailable';
  end if;

  select pi.capability_set_id,
         pi.capability_snapshot_jsonb,
         pi.capability_snapshot_hash,
         po.product_id,
         pcs.product_id,
         pcs.definition_version,
         pcs.definition_hash
    into v_capability_set_id,
         v_capability_snapshot,
         v_capability_snapshot_hash,
         v_offer_product_id,
         v_capability_product_id,
         v_definition_version,
         v_definition_hash
  from public.purchase_intents pi
  join public.product_offers po on po.id = pi.product_offer_id
  join public.product_capability_sets pcs
    on pcs.id = pi.capability_set_id
   and pcs.product_id = po.product_id
  where pi.id = v_receipt.purchase_intent_id
    and pi.subject_id = v_receipt.subject_id
    and pi.product_offer_id = v_receipt.product_offer_id
    and pi.status = 'verified';

  if not found
     or v_capability_set_id is null
     or v_capability_snapshot_hash is null
     or btrim(v_capability_snapshot_hash) = ''
     or v_capability_product_id is distinct from v_offer_product_id
     or v_capability_snapshot is distinct from pg_catalog.jsonb_build_object(
       'capabilitySetId', v_capability_set_id::text,
       'definitionVersion', v_definition_version,
       'definitionHash', v_definition_hash
     ) then
    raise exception using errcode = 'P0001',
      constraint = 'internal_entitlement_batch_capability_authority_unavailable',
      message = 'pinned Purchase Intent v3 Product Capability authority is unavailable or inconsistent';
  end if;

  select count(*)::integer into v_set_count
  from public.product_capability_items pci
  where pci.capability_set_id = v_capability_set_id;

  select count(*)::integer into v_match_count
  from public.product_capability_items pci
  where pci.capability_set_id = v_capability_set_id
    and pci.item_key = any(p_capability_item_keys);

  if v_set_count <= 0
     or v_set_count <> v_input_count
     or v_match_count <> v_set_count then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_batch_capability_set_mismatch',
      message = 'fulfillment batch must contain exactly the complete pinned Capability Item set';
  end if;

  -- Validate the entire batch before the first mutation. This is defense in depth on
  -- top of PostgreSQL statement atomicity and ensures shape/policy failures are found
  -- before calling the single-effect mutation primitive.
  for v_item in
    select pci.item_key, pci.validity_mode, pci.duration_seconds
    from public.product_capability_items pci
    where pci.capability_set_id = v_capability_set_id
    order by pci.item_key
  loop
    v_idx := array_position(p_capability_item_keys, v_item.item_key);
    if v_idx is null then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_batch_capability_set_mismatch',
        message = 'fulfillment batch is missing a pinned Capability Item';
    end if;

    if p_target_valid_untils[v_idx] is not null
       and p_target_valid_untils[v_idx] < p_target_valid_froms[v_idx] then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_batch_validity_interval_invalid',
        message = 'Capability effect validity interval is invalid';
    end if;

    if p_target_valid_froms[v_idx] > v_as_of then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_batch_future_active_denied',
        message = 'future-active entitlement effects are not allowed by MVP authority';
    end if;

    if p_reason_codes[v_idx] is not null and btrim(p_reason_codes[v_idx]) = '' then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_batch_reason_invalid',
        message = 'entitlement effect reason code cannot be blank';
    end if;

    if v_item.validity_mode = 'unbounded' then
      if p_target_valid_untils[v_idx] is not null then
        raise exception using errcode = '23514',
          constraint = 'internal_entitlement_batch_unbounded_validity_invalid',
          message = 'unbounded Capability Item must not receive a finite valid-until';
      end if;
    elsif v_item.validity_mode = 'fixed_duration' then
      if p_target_valid_untils[v_idx] is null
         or pg_catalog.date_part(
           'epoch', p_target_valid_untils[v_idx] - p_target_valid_froms[v_idx]
         ) is distinct from v_item.duration_seconds::double precision then
        raise exception using errcode = '23514',
          constraint = 'internal_entitlement_batch_fixed_duration_invalid',
          message = 'fixed-duration Capability effect must exactly match immutable duration_seconds';
      end if;
    elsif v_item.validity_mode = 'provider_expiry' then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_batch_provider_expiry_unresolved',
        message = 'provider-expiry Capability requires provider-specific typed expiry normalization authority';
    else
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_batch_validity_mode_invalid',
        message = 'Capability Item validity mode is unsupported';
    end if;
  end loop;

  -- Deterministic processing order is owned by immutable item_key, not caller array order.
  -- Any exception from one nested apply aborts the outer statement, rolling back every
  -- earlier Grant/Event/projection/outbox mutation from this batch.
  for v_item in
    select pci.item_key
    from public.product_capability_items pci
    where pci.capability_set_id = v_capability_set_id
    order by pci.item_key
  loop
    v_idx := array_position(p_capability_item_keys, v_item.item_key);

    select * into strict v_apply
    from public.internal_apply_entitlement_effect_v1(
      'receipt',
      p_receipt_id,
      null,
      v_item.item_key,
      null,
      null,
      'granted',
      p_effective_ats[v_idx],
      'active',
      p_target_valid_froms[v_idx],
      p_target_valid_untils[v_idx],
      p_reason_codes[v_idx]
    );

    result_item_key := v_item.item_key;
    result_grant_id := v_apply.result_grant_id;
    result_entitlement_event_id := v_apply.result_entitlement_event_id;
    result_projection_id := v_apply.result_projection_id;
    result_grant_revision := v_apply.result_grant_revision;
    result_projection_revision := v_apply.result_projection_revision;
    result_projection_changed := v_apply.result_projection_changed;
    result_outbox_event_id := v_apply.result_outbox_event_id;
    result_replayed := v_apply.result_replayed;
    return next;
  end loop;
end;
$$;

revoke all on function public.internal_apply_verified_receipt_capability_effects_v1(
  uuid, text[], timestamptz[], timestamptz[], timestamptz[], text[]
) from public, anon, authenticated, service_role, myeongha_api_executor;
