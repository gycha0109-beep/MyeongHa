-- Internal provider-neutral EntitlementEffectV1 apply foundation.
--
-- This migration intentionally does NOT call a provider, compare provider ordering
-- keys, derive Capability validity windows, activate catalog/rails, or expose a
-- client/API mutation surface. It applies one already-authoritative normalized effect
-- and keeps Grant/Event/projection/outbox state atomic.

create or replace function public.internal_apply_entitlement_effect_v1(
  p_source_type text,
  p_source_id uuid,
  p_grant_id uuid,
  p_capability_item_key text,
  p_expected_revision bigint,
  p_expected_last_provider_ordering_key text,
  p_event_type text,
  p_effective_at timestamptz,
  p_target_status text,
  p_target_valid_from timestamptz,
  p_target_valid_until timestamptz,
  p_reason_code text
)
returns table (
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
  v_provider_event public.commerce_provider_events%rowtype;
  v_grant public.entitlement_grants%rowtype;
  v_existing_event public.entitlement_events%rowtype;
  v_product_id uuid;
  v_entitlement_key text;
  v_scope_key text;
  v_scope_key_norm text;
  v_grant_key text;
  v_next_ordering_key text;
  v_capability_set_id uuid;
  v_capability_snapshot jsonb;
  v_capability_snapshot_hash text;
  v_capability_definition_version text;
  v_capability_definition_hash text;
  v_capability_product_id uuid;
  v_offer_product_id uuid;
  v_item_match_count integer;
  v_source_event_count integer;
  v_event_id uuid;
  v_event_dedupe_key text;
  v_effect_payload jsonb;
  v_material_grant_change boolean;
  v_grant_inserted boolean := false;
  v_projection_id uuid;
  v_projection_status text;
  v_projection_active_grant_count integer;
  v_projection_effective_valid_until timestamptz;
  v_projection_revision bigint;
  v_projection_changed boolean := false;
  v_outbox_event_id uuid;
begin
  if p_source_type not in ('receipt', 'provider_event') then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_source_type_invalid',
      message = 'entitlement effect source type must be receipt or provider_event';
  end if;
  if p_source_id is null then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_source_required',
      message = 'entitlement effect source identity is required';
  end if;
  if p_event_type not in ('granted', 'renewed', 'expired', 'revoked', 'restored') then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_event_type_invalid',
      message = 'commerce entitlement effect event type is invalid';
  end if;
  if p_effective_at is null or p_target_status is null or p_target_valid_from is null then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_target_required',
      message = 'entitlement effect time and target state are required';
  end if;
  if p_target_valid_until is not null and p_target_valid_until < p_target_valid_from then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_validity_invalid',
      message = 'entitlement effect target validity interval is invalid';
  end if;
  if p_reason_code is not null and btrim(p_reason_code) = '' then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_reason_invalid',
      message = 'entitlement effect reason code cannot be blank';
  end if;
  if (p_event_type in ('granted', 'renewed', 'restored') and p_target_status is distinct from 'active')
     or (p_event_type = 'expired' and p_target_status is distinct from 'expired')
     or (p_event_type = 'revoked' and p_target_status is distinct from 'revoked') then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_transition_invalid',
      message = 'entitlement effect event type and target status are inconsistent';
  end if;
  if p_target_status = 'active' and p_target_valid_from > v_as_of then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_future_active_denied',
      message = 'future-active entitlement grants are not allowed by MVP authority';
  end if;
  if p_expected_revision is not null and p_expected_revision < 0 then
    raise exception using errcode = '23514',
      constraint = 'internal_entitlement_effect_expected_revision_invalid',
      message = 'expected Grant revision must be non-negative';
  end if;

  if p_source_type = 'receipt' then
    if p_event_type is distinct from 'granted'
       or p_grant_id is not null
       or p_capability_item_key is null or btrim(p_capability_item_key) = ''
       or p_expected_revision is not null
       or p_expected_last_provider_ordering_key is not null then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_effect_receipt_shape_invalid',
        message = 'receipt source is only valid for initial pinned-Capability granted effects';
    end if;

    select cr.* into v_receipt
    from public.commerce_receipts cr
    where cr.id = p_source_id
    for update;

    if not found
       or v_receipt.verification_status is distinct from 'verified'
       or v_receipt.environment is distinct from 'production'
       or v_receipt.purchase_intent_id is null
       or v_receipt.product_offer_id is null then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_receipt_unavailable',
        message = 'production verified receipt authority is unavailable';
    end if;

    select pi.capability_set_id, pi.capability_snapshot_jsonb, pi.capability_snapshot_hash,
           po.product_id, pcs.product_id, pcs.definition_version, pcs.definition_hash,
           pci.entitlement_key,
           case when pci.scope_mode = 'global' then null else pci.fixed_scope_key end
      into v_capability_set_id, v_capability_snapshot, v_capability_snapshot_hash,
           v_offer_product_id, v_capability_product_id,
           v_capability_definition_version, v_capability_definition_hash,
           v_entitlement_key, v_scope_key
    from public.purchase_intents pi
    join public.product_offers po on po.id = pi.product_offer_id
    join public.product_capability_sets pcs
      on pcs.id = pi.capability_set_id and pcs.product_id = po.product_id
    join public.product_capability_items pci
      on pci.capability_set_id = pi.capability_set_id
     and pci.item_key = p_capability_item_key
    where pi.id = v_receipt.purchase_intent_id
      and pi.subject_id = v_receipt.subject_id
      and pi.product_offer_id = v_receipt.product_offer_id
      and pi.status = 'verified';

    if not found
       or v_capability_set_id is null
       or v_capability_snapshot_hash is null or btrim(v_capability_snapshot_hash) = ''
       or v_capability_product_id is distinct from v_offer_product_id
       or v_capability_snapshot is distinct from pg_catalog.jsonb_build_object(
         'capabilitySetId', v_capability_set_id::text,
         'definitionVersion', v_capability_definition_version,
         'definitionHash', v_capability_definition_hash
       ) then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_capability_authority_unavailable',
        message = 'pinned Product Capability authority is unavailable or inconsistent';
    end if;

    v_product_id := v_offer_product_id;
    v_scope_key_norm := coalesce(v_scope_key, '__GLOBAL__');
    v_grant_key := 'receipt:' || v_receipt.id::text;
    v_next_ordering_key := null;

    select count(*)::integer into v_item_match_count
    from public.product_capability_items pci
    where pci.capability_set_id = v_capability_set_id
      and pci.entitlement_key = v_entitlement_key
      and ((v_scope_key is null and pci.scope_mode = 'global')
        or (v_scope_key is not null and pci.scope_mode = 'fixed' and pci.fixed_scope_key = v_scope_key));

    if v_item_match_count <> 1 then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_capability_target_ambiguous',
        message = 'pinned Capability Items do not resolve to one representable logical Grant target';
    end if;

    select eg.* into v_grant
    from public.entitlement_grants eg
    where eg.subject_id = v_receipt.subject_id
      and eg.entitlement_key = v_entitlement_key
      and eg.scope_key_norm = v_scope_key_norm
      and eg.grant_key = v_grant_key
    for update;

    if not found then
      insert into public.entitlement_grants (
        id, subject_id, entitlement_key, scope_key, grant_key, grant_source_type,
        status, valid_from, valid_until, revision, last_effective_at,
        last_provider_ordering_key, created_at, updated_at, source_receipt_id
      ) values (
        gen_random_uuid(), v_receipt.subject_id, v_entitlement_key, v_scope_key,
        v_grant_key, 'purchase', p_target_status, p_target_valid_from,
        p_target_valid_until, 0, p_effective_at, null, v_as_of, v_as_of, v_receipt.id
      )
      on conflict on constraint entitlement_grants_logical_source_unique do nothing
      returning * into v_grant;
      if found then
        v_grant_inserted := true;
      else
        select eg.* into v_grant
        from public.entitlement_grants eg
        where eg.subject_id = v_receipt.subject_id
          and eg.entitlement_key = v_entitlement_key
          and eg.scope_key_norm = v_scope_key_norm
          and eg.grant_key = v_grant_key
        for update;
      end if;
    end if;

    if v_grant.id is null
       or v_grant.grant_source_type is distinct from 'purchase'
       or v_grant.source_receipt_id is distinct from v_receipt.id
       or v_grant.subject_id is distinct from v_receipt.subject_id
       or v_grant.entitlement_key is distinct from v_entitlement_key
       or v_grant.scope_key_norm is distinct from v_scope_key_norm then
      raise exception using errcode = '23505',
        constraint = 'internal_entitlement_effect_grant_identity_conflict',
        message = 'receipt source is already bound to conflicting Grant authority';
    end if;
  else
    if p_grant_id is null or p_capability_item_key is not null
       or p_expected_revision is null or p_event_type = 'granted' then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_effect_provider_event_shape_invalid',
        message = 'provider event source requires an existing Grant and expected CAS provenance';
    end if;

    select cpe.* into v_provider_event
    from public.commerce_provider_events cpe
    where cpe.id = p_source_id
    for update;

    if not found
       or v_provider_event.status not in ('verified', 'processed')
       or v_provider_event.environment is distinct from 'production'
       or v_provider_event.resolution_source_type is distinct from 'receipt'
       or v_provider_event.resolved_subject_id is null
       or v_provider_event.resolved_receipt_id is null then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_provider_event_unavailable',
        message = 'production verified receipt-lineage provider event authority is unavailable';
    end if;

    select cr.* into v_receipt
    from public.commerce_receipts cr
    where cr.id = v_provider_event.resolved_receipt_id
      and cr.subject_id = v_provider_event.resolved_subject_id;

    if not found
       or v_receipt.provider is distinct from v_provider_event.provider
       or v_receipt.environment is distinct from 'production'
       or v_receipt.verification_status not in ('verified', 'revoked')
       or v_receipt.product_offer_id is null
       or (v_provider_event.external_transaction_id is not null
           and v_provider_event.external_transaction_id is distinct from v_receipt.external_transaction_id) then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_provider_event_lineage_mismatch',
        message = 'provider event does not resolve to authoritative production Receipt lineage';
    end if;

    select eg.* into v_grant
    from public.entitlement_grants eg
    where eg.id = p_grant_id
    for update;

    if not found
       or v_grant.subject_id is distinct from v_provider_event.resolved_subject_id
       or v_grant.grant_source_type is distinct from 'purchase'
       or v_grant.source_receipt_id is distinct from v_receipt.id then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_provider_grant_lineage_mismatch',
        message = 'provider event does not resolve to the target purchase Grant lineage';
    end if;

    select po.product_id into v_product_id
    from public.product_offers po
    where po.id = v_receipt.product_offer_id;
    if not found then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_provider_product_unavailable',
        message = 'provider event Receipt Product authority is unavailable';
    end if;

    v_entitlement_key := v_grant.entitlement_key;
    v_scope_key := v_grant.scope_key;
    v_scope_key_norm := v_grant.scope_key_norm;
    v_grant_key := v_grant.grant_key;
    v_next_ordering_key := v_provider_event.provider_ordering_key;

    if p_target_valid_from is distinct from v_grant.valid_from then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_effect_valid_from_immutable',
        message = 'existing Grant valid_from must be preserved by lifecycle effects';
    end if;
    if p_event_type in ('expired', 'revoked')
       and p_target_valid_until is distinct from v_grant.valid_until then
      raise exception using errcode = '23514',
        constraint = 'internal_entitlement_effect_historical_interval_immutable',
        message = 'expired/revoked effects must preserve the historical Grant interval';
    end if;
  end if;

  v_event_dedupe_key := pg_catalog.jsonb_build_array(
    'entitlement-effect-v1',
    case when p_source_type = 'receipt' then 'receipt:' || v_receipt.id::text
         else 'provider_event:' || v_provider_event.id::text end,
    p_event_type,
    (pg_catalog.date_part('epoch', p_effective_at) * 1000000)::bigint,
    p_target_status,
    (pg_catalog.date_part('epoch', p_target_valid_from) * 1000000)::bigint,
    case when p_target_valid_until is null then null
         else (pg_catalog.date_part('epoch', p_target_valid_until) * 1000000)::bigint end,
    p_reason_code
  )::text;

  v_effect_payload := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'schemaVersion', 'entitlement-effect-v1',
    'eventType', p_event_type,
    'effectiveAt', pg_catalog.to_char(p_effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'targetStatus', p_target_status,
    'targetValidFrom', pg_catalog.to_char(p_target_valid_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'targetValidUntil', case when p_target_valid_until is null then null
      else pg_catalog.to_char(p_target_valid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
    'reasonCode', p_reason_code
  ));

  if p_source_type = 'receipt' then
    select count(*)::integer into v_source_event_count
    from public.entitlement_events ee
    where ee.grant_id = v_grant.id and ee.source_type = 'receipt'
      and ee.source_receipt_id = v_receipt.id and ee.event_type = 'granted';
  else
    select count(*)::integer into v_source_event_count
    from public.entitlement_events ee
    where ee.grant_id = v_grant.id and ee.source_type = 'provider_event'
      and ee.source_provider_event_id = v_provider_event.id;
  end if;

  if v_source_event_count > 1 then
    raise exception using errcode = '23505',
      constraint = 'internal_entitlement_effect_source_event_ambiguous',
      message = 'authoritative source is already bound to multiple Entitlement Events for this Grant';
  end if;

  if v_source_event_count = 1 then
    if p_source_type = 'receipt' then
      select ee.* into v_existing_event from public.entitlement_events ee
      where ee.grant_id = v_grant.id and ee.source_type = 'receipt'
        and ee.source_receipt_id = v_receipt.id and ee.event_type = 'granted' limit 1;
    else
      select ee.* into v_existing_event from public.entitlement_events ee
      where ee.grant_id = v_grant.id and ee.source_type = 'provider_event'
        and ee.source_provider_event_id = v_provider_event.id limit 1;
    end if;

    if v_existing_event.event_schema_version is distinct from 'ent-event-v2'
       or v_existing_event.product_id is distinct from v_product_id
       or v_existing_event.entitlement_key is distinct from v_entitlement_key
       or v_existing_event.scope_key_norm is distinct from v_scope_key_norm
       or v_existing_event.event_type is distinct from p_event_type
       or v_existing_event.event_dedupe_key is distinct from v_event_dedupe_key
       or v_existing_event.effective_at is distinct from p_effective_at
       or v_existing_event.target_status is distinct from p_target_status
       or v_existing_event.target_valid_from is distinct from p_target_valid_from
       or v_existing_event.target_valid_until is distinct from p_target_valid_until
       or v_existing_event.reason_code is distinct from p_reason_code
       or v_existing_event.provider_ordering_key is distinct from v_next_ordering_key then
      raise exception using errcode = '23505',
        constraint = 'internal_entitlement_effect_source_semantic_conflict',
        message = 'authoritative source is already bound to conflicting Entitlement Effect semantics';
    end if;

    select e.id, e.revision into v_projection_id, v_projection_revision
    from public.entitlements e
    where e.subject_id = v_grant.subject_id
      and e.entitlement_key = v_grant.entitlement_key
      and e.scope_key_norm = v_grant.scope_key_norm;
    if not found then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_replay_projection_missing',
        message = 'replayed Entitlement Effect is missing its committed Effective Entitlement projection';
    end if;

    select oe.id into v_outbox_event_id from public.outbox_events oe
    where oe.aggregate_type = 'entitlement' and oe.aggregate_id = v_projection_id::text
      and oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
      and oe.dedupe_key = v_event_dedupe_key limit 1;

    return query select v_grant.id, v_existing_event.id, v_projection_id,
      v_grant.revision, v_projection_revision, false, v_outbox_event_id, true;
    return;
  end if;

  if p_source_type = 'receipt' and not v_grant_inserted then
    raise exception using errcode = '23505',
      constraint = 'internal_entitlement_effect_receipt_grant_without_event',
      message = 'existing receipt Grant lacks authoritative granted-event provenance required for replay';
  end if;

  if p_source_type = 'provider_event' then
    if v_grant.revision is distinct from p_expected_revision
       or v_grant.last_provider_ordering_key is distinct from p_expected_last_provider_ordering_key then
      raise exception using errcode = '40001',
        constraint = 'internal_entitlement_effect_cas_mismatch',
        message = 'Grant revision/order provenance changed; caller must re-read and re-compare provider ordering';
    end if;

    v_material_grant_change := row(v_grant.status, v_grant.valid_from, v_grant.valid_until)
      is distinct from row(p_target_status, p_target_valid_from, p_target_valid_until);

    if not v_material_grant_change then
      if v_next_ordering_key is not null
         and v_grant.last_provider_ordering_key is distinct from v_next_ordering_key then
        update public.entitlement_grants eg
        set last_provider_ordering_key = v_next_ordering_key, updated_at = v_as_of
        where eg.id = v_grant.id returning * into v_grant;
      end if;
      select e.id, e.revision into v_projection_id, v_projection_revision
      from public.entitlements e
      where e.subject_id = v_grant.subject_id
        and e.entitlement_key = v_grant.entitlement_key
        and e.scope_key_norm = v_grant.scope_key_norm;
      return query select v_grant.id, null::uuid, v_projection_id, v_grant.revision,
        v_projection_revision, false, null::uuid, false;
      return;
    end if;

    update public.entitlement_grants eg
    set status = p_target_status,
        valid_until = p_target_valid_until,
        revision = eg.revision + 1,
        last_effective_at = p_effective_at,
        last_provider_ordering_key = coalesce(v_next_ordering_key, eg.last_provider_ordering_key),
        updated_at = v_as_of
    where eg.id = v_grant.id and eg.revision = p_expected_revision
      and eg.last_provider_ordering_key is not distinct from p_expected_last_provider_ordering_key
    returning * into v_grant;
    if not found then
      raise exception using errcode = '40001',
        constraint = 'internal_entitlement_effect_cas_mismatch',
        message = 'Grant revision/order provenance changed during Entitlement Effect apply';
    end if;
  end if;

  v_event_id := gen_random_uuid();
  insert into public.entitlement_events (
    id, grant_id, subject_id, entitlement_key, scope_key_norm, product_id,
    source_type, source_receipt_id, source_provider_event_id, source_actor_ref,
    event_type, event_schema_version, event_dedupe_key, effective_at,
    provider_ordering_key, payload_jsonb, created_at,
    target_status, target_valid_from, target_valid_until, reason_code
  ) values (
    v_event_id, v_grant.id, v_grant.subject_id, v_grant.entitlement_key,
    v_grant.scope_key_norm, v_product_id, p_source_type,
    case when p_source_type = 'receipt' then v_receipt.id else null end,
    case when p_source_type = 'provider_event' then v_provider_event.id else null end,
    null, p_event_type, 'ent-event-v2', v_event_dedupe_key, p_effective_at,
    v_next_ordering_key, v_effect_payload, v_as_of,
    p_target_status, p_target_valid_from, p_target_valid_until, p_reason_code
  );

  select r.projection_id, r.projection_status, r.projection_active_grant_count,
         r.projection_effective_valid_until, r.projection_revision, r.projection_changed
    into v_projection_id, v_projection_status, v_projection_active_grant_count,
         v_projection_effective_valid_until, v_projection_revision, v_projection_changed
  from public.internal_recompute_entitlement_projection_v1(
    v_grant.subject_id, v_grant.entitlement_key, v_grant.scope_key
  ) r;

  if v_projection_id is null then
    raise exception using errcode = 'P0001',
      constraint = 'internal_entitlement_effect_projection_unavailable',
      message = 'Effective Entitlement projection recompute did not return authoritative state';
  end if;

  if v_projection_changed then
    insert into public.outbox_events (
      id, aggregate_type, aggregate_id, event_type, event_schema_version, dedupe_key,
      payload_jsonb, status, locked_at, lock_owner, lease_expires_at, attempt_count,
      available_at, processed_at, last_error_code, dead_lettered_at, created_at
    ) values (
      gen_random_uuid(), 'entitlement', v_projection_id::text,
      'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED', 'entitlement-right-change-v1',
      v_event_dedupe_key,
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'entitlement-right-change-v1',
        'entitlementId', v_projection_id::text,
        'subjectId', v_grant.subject_id::text,
        'entitlementKey', v_grant.entitlement_key,
        'scopeKey', v_grant.scope_key,
        'status', v_projection_status,
        'activeGrantCount', v_projection_active_grant_count,
        'effectiveValidUntil', case when v_projection_effective_valid_until is null then null
          else pg_catalog.to_char(v_projection_effective_valid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
        'revision', v_projection_revision
      ),
      'pending', null, null, null, 0, v_as_of, null, null, null, v_as_of
    )
    on conflict (aggregate_type, aggregate_id, event_type, dedupe_key) do nothing
    returning id into v_outbox_event_id;

    if v_outbox_event_id is null then
      select oe.id into v_outbox_event_id from public.outbox_events oe
      where oe.aggregate_type = 'entitlement' and oe.aggregate_id = v_projection_id::text
        and oe.event_type = 'ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
        and oe.dedupe_key = v_event_dedupe_key limit 1;
    end if;
    if v_outbox_event_id is null then
      raise exception using errcode = 'P0001',
        constraint = 'internal_entitlement_effect_outbox_unavailable',
        message = 'material Effective Entitlement change requires one deduped outbox event';
    end if;
  end if;

  return query select v_grant.id, v_event_id, v_projection_id, v_grant.revision,
    v_projection_revision, v_projection_changed, v_outbox_event_id, false;
end;
$$;

comment on function public.internal_apply_entitlement_effect_v1(
  text, uuid, uuid, text, bigint, text, text, timestamptz, text, timestamptz, timestamptz, text
) is
  'Internal provider-neutral atomic EntitlementEffectV1 apply foundation. Provider ordering comparison and Capability validity derivation remain outside this function.';

revoke all on function public.internal_apply_entitlement_effect_v1(
  text, uuid, uuid, text, bigint, text, text, timestamptz, text, timestamptz, timestamptz, text
) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_apply_entitlement_effect_v1(text,uuid,uuid,text,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text) from %I',
      v_role
    );
  END LOOP;
END
$$;
