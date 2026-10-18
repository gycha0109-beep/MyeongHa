-- Reader Receipt/Grant S2: stop legacy direct 1090 and 1080(receipt)
-- writers bypassing the Reader scope advisory transaction lock.
-- This is an internal PostgreSQL precondition, NOT an access or product grant.
-- No API/public execution; non-Reader Commerce receipts remain untouched.
create or replace function public.internal_assert_reader_receipt_scope_prelocked_v1(
  p_receipt_id uuid
)
returns void
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $reader_receipt_scope_guard$
declare
  v_subject uuid;
  v_reader text;
  v_product uuid;
  v_reading uuid;
  v_reading_count integer;
  v_pending text;
  v_lock_identity text;
  v_lock_key bigint;
begin
  if p_receipt_id is null then return; end if;

  -- Immutable purchase selection and its offer/receipt lineage are the only
  -- source of the Reader and product; the client cannot choose either.
  select cr.subject_id,prs.reader_character_id,po.product_id
  into v_subject,v_reader,v_product
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
  join public.product_offers po on po.id=pi.product_offer_id
  join public.purchase_intent_reader_selections prs
    on prs.purchase_intent_id=pi.id and prs.product_id=po.product_id
  join public.standard_reading_delivery_policies dp
    on dp.product_id=prs.product_id and dp.retired_at is null
  where cr.id=p_receipt_id;

  if not found then
    -- No Reader purchase lineage. Do not affect ordinary Commerce.
    return;
  end if;

  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_s2_receipt_guard_read_committed_required',
      message='Reader Receipt writer requires READ COMMITTED';
  end if;
  perform public.assert_myeongha_subject_context_v1(v_subject);

  select count(*)::integer,min(b.reading_id::text)::uuid
    into v_reading_count,v_reading
  from public.standard_reading_official_bindings b
  where b.subject_id=v_subject and b.product_id=v_product;

  if v_reading_count>1 then
    raise exception using errcode='40001',
      constraint='official_reader_s2_receipt_scope_ambiguous',
      message='Multiple official Readings require a resolved server-owned scope';
  end if;

  if v_reading_count=0 then
    -- Initial Reader purchase: no official Reading is stored yet. The trusted
    -- combined 1760 writer has ALREADY locked the proposed Reading and MUST
    -- validate the actual bound Reading against that same key after mutation.
    v_pending:=pg_catalog.current_setting(
      'myeongha.reader_pending_reading_id',true
    );
    if v_pending is null
       or v_pending !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode='P0001',
        constraint='official_reader_s2_initial_receipt_scope_required',
        message='Initial Reader receipt requires prelocked proposed official Reading';
    end if;
    v_reading:=v_pending::uuid;
  end if;

  v_lock_identity:='myeongha:official-reader:scope-lock:v1:'
    ||v_subject::text||':'||v_reading::text||':'
    ||pg_catalog.octet_length(v_reader)::text||':'||v_reader;
  v_lock_key:=pg_catalog.hashtextextended(v_lock_identity,1827::bigint);

  if not exists (
    select 1 from pg_catalog.pg_locks l
    where l.pid=pg_catalog.pg_backend_pid()
      and l.locktype='advisory' and l.mode='ExclusiveLock'
      and l.granted and l.objsubid=1
      and l.classid=((v_lock_key >> 32) & 4294967295::bigint)::oid
      and l.objid=(v_lock_key & 4294967295::bigint)::oid
  ) then
    raise exception using errcode='P0001',
      constraint='official_reader_s2_legacy_receipt_scope_lock_required',
      message='Legacy Reader receipt writer cannot bypass the S1 scope lock';
  end if;
end
$reader_receipt_scope_guard$;

revoke all on function public.internal_assert_reader_receipt_scope_prelocked_v1(uuid)
  from public;
do $s2_reader_receipt_guard_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_assert_reader_receipt_scope_prelocked_v1(uuid) from %I',
      v_role);
  end loop;
end
$s2_reader_receipt_guard_acl$;

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

  -- Reader receipt direct calls cannot lock a Receipt first and only later
  -- discover the Reading. Confirm an already held shared S1 scope lock.
  perform public.internal_assert_reader_receipt_scope_prelocked_v1(p_receipt_id);

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

    -- Legacy direct initial Grant writer must observe the same S1 scope
    -- precondition as 1090 BEFORE touching any Receipt row lock.
    perform public.internal_assert_reader_receipt_scope_prelocked_v1(p_source_id);

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

    -- Reader grants MUST be serialized with S1 before the first provider/Grant
    -- row lock. A direct legacy 1080 call without previously held scope locks
    -- is rejected. Non-Reader Commerce effects are unchanged.
    perform public.internal_assert_reader_grant_scopes_prelocked_v1(p_grant_id);

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

create or replace function public.internal_apply_verified_reader_purchase_under_scope_v1(
  p_subject_id uuid,
  p_expected_official_reading_id uuid,
  p_reader_character_id text,
  p_receipt_id uuid,
  p_purchase_intent_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[],
  p_proposed_reading_session_id uuid,
  p_proposed_reading_id uuid,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=pg_catalog, public
as $reader_purchase_s2$
declare
  v_receipt_subject uuid;
  v_verified_intent uuid;
  v_selected_reader text;
  v_effects jsonb;
  v_access jsonb;
  v_real_reading uuid;
begin
  -- A post-lock committed authority read MUST observe a fresh snapshot.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode='25001',
      constraint='official_reader_s2_read_committed_required',
      message='Official Reader shared-scope purchase requires READ COMMITTED';
  end if;
  if p_subject_id is null or p_expected_official_reading_id is null
     or p_receipt_id is null or p_purchase_intent_id is null
     or p_proposed_reading_session_id is null or p_proposed_reading_id is null
     or p_reader_character_id is null then
    raise exception using
      errcode='23514',
      constraint='official_reader_s2_required_identity',
      message='Official Reader purchase requires complete server-owned identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- Pre-lock SELECT does not claim ownership or lock any purchase row. It
  -- fixes the candidate scope based on *stored* verified Receipt and Reader
  -- selection, not a request-provided Reader id alone. Both source writers
  -- independently re-check their own current authorities after acquisition.
  select cr.subject_id,cr.purchase_intent_id,prs.reader_character_id
    into v_receipt_subject,v_verified_intent,v_selected_reader
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id
   and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
  join public.purchase_intent_reader_selections prs
    on prs.purchase_intent_id=cr.purchase_intent_id
  where cr.id=p_receipt_id
    and cr.subject_id=p_subject_id
    and cr.purchase_intent_id=p_purchase_intent_id
    and cr.verification_status='verified'
    and cr.environment='production'
    and pi.status='verified';

  if not found
     or v_receipt_subject is distinct from p_subject_id
     or v_verified_intent is distinct from p_purchase_intent_id
     or v_selected_reader is distinct from p_reader_character_id then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_verified_lineage_unavailable',
      message='Verified Reader receipt, purchase and Reader selection unavailable';
  end if;

  -- One reader+official reading scope for BOTH real writer operations. This
  -- lock is acquired BEFORE the existing Receipt/Grant/Purchase/Birth locks.
  perform public.internal_acquire_official_reader_scope_lock_v1(
    p_subject_id,p_expected_official_reading_id,v_selected_reader
  );

  -- The original Reading can be generated only after Grant issuance. Keep
  -- its S1-locked candidate in transaction-local context for the legacy
  -- receipt/Grant writer, which checks the lock itself (never trusts GUC alone).
  perform pg_catalog.set_config(
    'myeongha.reader_pending_reading_id',
    p_expected_official_reading_id::text, true
  );

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) order by e.result_item_key)
    into v_effects
  from public.internal_apply_verified_receipt_capability_effects_v1(
    p_receipt_id,p_capability_item_keys,p_effective_ats,
    p_target_valid_froms,p_target_valid_untils,p_reason_codes
  ) e;

  if v_effects is null or pg_catalog.jsonb_array_length(v_effects)=0 then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_grant_effects_missing',
      message='No committed verified capability effects available';
  end if;

  select pg_catalog.to_jsonb(a) into v_access
  from public.cmd_bind_standard_reading_access_v2(
    p_subject_id,p_purchase_intent_id,p_proposed_reading_session_id,
    p_proposed_reading_id,p_request_hash,p_request_contract_version,
    p_request_snapshot_jsonb
  ) a;

  if v_access is null then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_bind_result_missing',
      message='Reader bind did not produce an authoritative result';
  end if;

  v_real_reading := (v_access->>'reading_id')::uuid;
  if v_real_reading is distinct from p_expected_official_reading_id
     or v_access->>'reader_character_id' is distinct from v_selected_reader
     or (v_access->>'purchase_intent_id')::uuid
        is distinct from p_purchase_intent_id then
    -- Any Grant mutation above rolls back atomically with this error. A
    -- guessed wrong Reader/Reading lock MUST NEVER commit another scope.
    raise exception using
      errcode='40001',
      constraint='official_reader_s2_scope_changed_during_bind',
      message='Reader bind authority does not match the locked official scope';
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion','official-reader-s2-atomic-receipt-bind-v1',
    'capabilityEffects',v_effects,
    'readerAccess',v_access
  );
end
$reader_purchase_s2$;


comment on function public.internal_assert_reader_receipt_scope_prelocked_v1(uuid) is
'Enforce actual held S1 advisory scope lock before both legacy 1090 batch and 1080 receipt Grant writes. An initial unbound Reading requires transaction-local candidate from 1760, later verified by original 1760 bind. Does not expose paid access.';
comment on function public.internal_apply_verified_receipt_capability_effects_v1(
  uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) is 'S2 guarded 1090 existing Receipt batch Grant writer; Reader purchase requires held official scope lock before Receipt FOR UPDATE. Non-Reader Commerce unaffected.';
comment on function public.internal_apply_verified_reader_purchase_under_scope_v1(
  uuid,uuid,text,uuid,uuid,text[],timestamptz[],timestamptz[],
  timestamptz[],text[],uuid,uuid,text,text,jsonb
) is 'S2 original 1760 combined Writer: holder of S1 scope lock and source of initial pending Reading ID; retains original real Grant+Bind+post-bind rollback authority.';
