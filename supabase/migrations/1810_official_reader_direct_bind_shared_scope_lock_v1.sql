-- Official Reader S2: retrofit the EXISTING 1220 access binding function.
-- No route/grants activated, no mutation to immutable earlier migration.
-- Direct bind, replay and combined 1760 share the same transaction lock.
-- First reading: prospective ID is held before row locks, verified later.

create or replace function public.cmd_bind_standard_reading_access_v2(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_proposed_reading_session_id uuid,
  p_proposed_reading_id uuid,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb
)
returns table (
  purchase_intent_id uuid,
  entitlement_grant_id uuid,
  product_id uuid,
  reader_character_id text,
  reader_content_bundle_id uuid,
  reading_session_id uuid,
  reading_id uuid,
  source_birth_revision_id uuid,
  saju_domain text,
  domain_capability_version text,
  access_role text,
  official_reading_created boolean,
  interpretation_created boolean,
  replayed boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_now timestamptz := transaction_timestamp();
  v_subject_kind text;
  v_subject_status text;
  v_subject_merged_into uuid;

  v_purchase_status text;
  v_product_offer_id uuid;
  v_purchase_capability_set_id uuid;
  v_product_id uuid;
  v_reader_character_id text;
  v_reader_content_bundle_id uuid;
  v_reader_selection_hash text;

  v_spec_capability_set_id uuid;
  v_spec_version text;
  v_topic_key text;
  v_saju_domain text;
  v_reading_period text;
  v_reading_variant text;
  v_reader_selection_mode text;
  v_policy_version text;
  v_purchase_role text;

  v_capability_count integer;
  v_entitlement_key text;
  v_scope_mode text;
  v_fixed_scope_key text;
  v_scope_key_norm text;
  v_grant_count integer;
  v_entitlement_grant_id uuid;

  v_source_birth_profile_id uuid;
  v_source_birth_revision_id uuid;
  v_domain_availability text;
  v_domain_capability_version text;
  v_reader_can_initiate boolean;

  v_existing_access public.standard_reading_reader_access_grants%rowtype;
  v_official public.standard_reading_official_bindings%rowtype;
  v_core record;
  v_expected_request_snapshot jsonb;
  v_official_created boolean := false;
  v_interpretation_count integer := 0;
  v_access_role text;
  v_locked_official_reading_id uuid;
  v_locked_reader_character_id text;
  v_pending_reading_id text;
begin
  if p_subject_id is null
     or p_purchase_intent_id is null
     or p_proposed_reading_session_id is null
     or p_proposed_reading_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_standard_reading_access_v2_ids_required',
      message = 'Standard Reading v2 binding requires subject, purchase, and proposed Reading identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_request_hash is null
     or p_request_hash !~ '^sha256:v1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_standard_reading_access_v2_request_hash',
      message = 'Standard Reading v2 request hash is invalid';
  end if;

  if p_request_contract_version is distinct from 'standard-reading-access-bind-v2' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_standard_reading_access_v2_request_contract',
      message = 'Standard Reading v2 request contract is invalid';
  end if;

  v_expected_request_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', 'standard-reading-access-bind-v2',
    'purchaseIntentId', p_purchase_intent_id::text
  );

  if p_request_snapshot_jsonb is distinct from v_expected_request_snapshot then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_standard_reading_access_v2_request_snapshot',
      message = 'Standard Reading v2 request snapshot must exactly match server-owned purchase provenance';
  end if;

  select s.kind, s.status, s.merged_into_subject_id
    into v_subject_kind, v_subject_status, v_subject_merged_into
  from public.subjects s
  where s.id = p_subject_id;

  if not found
     or v_subject_kind not in ('guest', 'member')
     or v_subject_status is distinct from 'active'
     or v_subject_merged_into is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_subject_ineligible',
      message = 'Standard Reading v2 requires an active canonical Guest or Member subject';
  end if;

  -- Mandatory S2 boundary: the legacy v2 binding command is itself an
  -- independent Reader access writer. Resolve the canonical persisted
  -- selection and exact official identity BEFORE locking Purchase/Grant/Birth.
  -- Existing replay uses its stored Reading. Additional purchases use exact
  -- current official identity. Only a genuinely new first Reading uses the
  -- proposed Reading, which is verified again after original binding.
  select prs.reader_character_id,
         pg_catalog.coalesce(access.official_reading_id,o.reading_id,p_proposed_reading_id)
    into v_locked_reader_character_id,v_locked_official_reading_id
  from public.purchase_intents pi
  join public.product_offers po
    on po.id=pi.product_offer_id
  join public.purchase_intent_reader_selections prs
    on prs.purchase_intent_id=pi.id and prs.product_id=po.product_id
  join public.standard_reading_product_specs sp
    on sp.product_id=po.product_id and sp.retired_at is null
  join public.standard_reading_delivery_policies dp
    on dp.product_id=sp.product_id and dp.retired_at is null
    and dp.reading_identity_mode='official_subject_product_scope_birth_authority'
    and dp.reader_interpretation_mode='per_reader_purchase_grant'
  left join public.standard_reading_reader_access_grants access
    on access.purchase_intent_id=pi.id and access.subject_id=pi.subject_id
  left join public.birth_profiles bp
    on bp.subject_id=pi.subject_id and bp.profile_kind='self'
    and bp.archived_at is null
  left join public.saju_domain_runtime domain
    on domain.saju_domain=sp.saju_domain
  left join public.standard_reading_official_bindings o
    on o.subject_id=pi.subject_id and o.product_id=po.product_id
    and o.source_birth_revision_id=bp.current_revision_id
    and o.topic_key=sp.topic_key and o.saju_domain=sp.saju_domain
    and o.reading_period=sp.reading_period
    and o.reading_variant=sp.reading_variant
    and o.product_spec_version=sp.spec_version
    and o.domain_capability_version=domain.capability_version
  where pi.id=p_purchase_intent_id and pi.subject_id=p_subject_id;

  if not found
     or v_locked_reader_character_id is null
     or v_locked_official_reading_id is null then
    raise exception using
      errcode='P0001',
      constraint='cmd_standard_reading_access_v2_lock_scope_unavailable',
      message='Reader purchase lock scope must resolve from stored official purchase authority';
  end if;

  -- Combined 1760 caller has already locked this candidate. A stale/wrong
  -- proposed lock must fail instead of acquiring a second scope out-of-order.
  v_pending_reading_id:=pg_catalog.current_setting(
    'myeongha.reader_pending_reading_id',true
  );
  if v_pending_reading_id is not null and v_pending_reading_id<>''
     and v_pending_reading_id is distinct from v_locked_official_reading_id::text then
    raise exception using
      errcode='40001',
      constraint='official_reader_s2_bind_scope_changed_before_lock',
      message='Combined Reader purchase locked a different official Reading';
  end if;

  perform public.internal_acquire_official_reader_scope_lock_v1(
    p_subject_id,v_locked_official_reading_id,v_locked_reader_character_id
  );

  select pi.status, pi.product_offer_id, pi.capability_set_id
    into v_purchase_status, v_product_offer_id, v_purchase_capability_set_id
  from public.purchase_intents pi
  where pi.id = p_purchase_intent_id
    and pi.subject_id = p_subject_id
  for update;

  if not found
     or v_purchase_status is distinct from 'verified'
     or v_purchase_capability_set_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_purchase_unavailable',
      message = 'verified Standard Reading Purchase Intent is unavailable';
  end if;

  select a.*
    into v_existing_access
  from public.standard_reading_reader_access_grants a
  where a.purchase_intent_id = p_purchase_intent_id;

  if found then
    if v_existing_access.subject_id is distinct from p_subject_id
       or v_existing_access.request_contract_version is distinct from p_request_contract_version
       or v_existing_access.request_hash is distinct from p_request_hash then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_standard_reading_access_v2_binding_conflict',
        message = 'Standard Reading purchase is already bound to different v2 request provenance';
    end if;

    select o.* into strict v_official
    from public.standard_reading_official_bindings o
    where o.reading_id = v_existing_access.official_reading_id
      and o.subject_id = p_subject_id;

    if v_official.reading_id is distinct from v_locked_official_reading_id
       or v_existing_access.reader_character_id is distinct from v_locked_reader_character_id then
      raise exception using
        errcode='40001',
        constraint='official_reader_s2_bind_replay_scope_changed',
        message='Reader binding replay is outside the locked official scope';
    end if;

    return query
    select
      v_existing_access.purchase_intent_id,
      v_existing_access.entitlement_grant_id,
      v_official.product_id,
      v_existing_access.reader_character_id,
      v_existing_access.reader_content_bundle_id,
      v_official.reading_session_id,
      v_official.reading_id,
      v_official.source_birth_revision_id,
      v_official.saju_domain,
      v_official.domain_capability_version,
      v_existing_access.access_role,
      false,
      false,
      true;
    return;
  end if;

  select
    po.product_id,
    pirs.reader_character_id,
    pirs.reader_content_bundle_id,
    pirs.selection_hash,
    srps.capability_set_id,
    srps.spec_version,
    srps.topic_key,
    srps.saju_domain,
    srps.reading_period,
    srps.reading_variant,
    srps.reader_selection_mode,
    srdp.policy_version,
    sror.purchase_role
  into
    v_product_id,
    v_reader_character_id,
    v_reader_content_bundle_id,
    v_reader_selection_hash,
    v_spec_capability_set_id,
    v_spec_version,
    v_topic_key,
    v_saju_domain,
    v_reading_period,
    v_reading_variant,
    v_reader_selection_mode,
    v_policy_version,
    v_purchase_role
  from public.product_offers po
  join public.purchase_intent_reader_selections pirs
    on pirs.purchase_intent_id = p_purchase_intent_id
   and pirs.product_id = po.product_id
  join public.standard_reading_product_specs srps
    on srps.product_id = po.product_id
   and srps.retired_at is null
  join public.standard_reading_delivery_policies srdp
    on srdp.product_id = srps.product_id
   and srdp.retired_at is null
   and srdp.reading_identity_mode = 'official_subject_product_scope_birth_authority'
   and srdp.reader_interpretation_mode = 'per_reader_purchase_grant'
  join public.standard_reading_offer_roles sror
    on sror.product_offer_id = po.id
   and sror.retired_at is null
  where po.id = v_product_offer_id;

  if not found
     or v_reader_character_id is null
     or btrim(v_reader_character_id) = ''
     or v_reader_content_bundle_id is null
     or v_reader_selection_hash is null
     or btrim(v_reader_selection_hash) = ''
     or v_reader_selection_mode is distinct from 'required'
     or v_policy_version is null
     or v_purchase_role not in ('initial_reading', 'additional_reader_interpretation') then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_reader_provenance_unavailable',
      message = 'Official Reading + Reader Interpretation purchase provenance is unavailable';
  end if;

  if v_spec_capability_set_id is null
     or v_spec_capability_set_id is distinct from v_purchase_capability_set_id then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_capability_unavailable',
      message = 'Purchase Intent Capability Set does not match Standard Reading Product authority';
  end if;

  select count(*)::integer
    into v_capability_count
  from public.product_capability_items pci
  where pci.capability_set_id = v_purchase_capability_set_id;

  if v_capability_count <> 1 then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_capability_unavailable',
      message = 'Standard Reading purchase must resolve exactly one pinned Capability Item';
  end if;

  select pci.entitlement_key, pci.scope_mode, pci.fixed_scope_key
    into v_entitlement_key, v_scope_mode, v_fixed_scope_key
  from public.product_capability_items pci
  where pci.capability_set_id = v_purchase_capability_set_id;

  if v_entitlement_key is null
     or btrim(v_entitlement_key) = ''
     or v_scope_mode not in ('global', 'fixed')
     or (v_scope_mode = 'fixed' and (v_fixed_scope_key is null or btrim(v_fixed_scope_key) = '')) then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_capability_unavailable',
      message = 'Standard Reading Capability Item cannot resolve an entitlement target';
  end if;

  v_scope_key_norm := case
    when v_scope_mode = 'global' then '__GLOBAL__'
    else v_fixed_scope_key
  end;

  select count(*)::integer
    into v_grant_count
  from public.entitlement_grants eg
  join public.commerce_receipts cr
    on cr.id = eg.source_receipt_id
   and cr.subject_id = eg.subject_id
  where eg.subject_id = p_subject_id
    and eg.entitlement_key = v_entitlement_key
    and eg.scope_key_norm = v_scope_key_norm
    and eg.grant_source_type = 'purchase'
    and eg.status = 'active'
    and eg.valid_from <= v_now
    and (eg.valid_until is null or v_now < eg.valid_until)
    and cr.purchase_intent_id = p_purchase_intent_id
    and cr.product_offer_id = v_product_offer_id
    and cr.verification_status = 'verified'
    and cr.environment = 'production';

  if v_grant_count = 0 then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_entitlement_unavailable',
      message = 'active purchase-backed Entitlement Grant for this Standard Reading purchase is unavailable';
  end if;

  if v_grant_count <> 1 then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_entitlement_ambiguous',
      message = 'Standard Reading purchase resolves to multiple active purchase-backed Entitlement Grants';
  end if;

  select eg.id
    into v_entitlement_grant_id
  from public.entitlement_grants eg
  join public.commerce_receipts cr
    on cr.id = eg.source_receipt_id
   and cr.subject_id = eg.subject_id
  where eg.subject_id = p_subject_id
    and eg.entitlement_key = v_entitlement_key
    and eg.scope_key_norm = v_scope_key_norm
    and eg.grant_source_type = 'purchase'
    and eg.status = 'active'
    and eg.valid_from <= v_now
    and (eg.valid_until is null or v_now < eg.valid_until)
    and cr.purchase_intent_id = p_purchase_intent_id
    and cr.product_offer_id = v_product_offer_id
    and cr.verification_status = 'verified'
    and cr.environment = 'production'
  order by eg.id
  limit 1
  for update of eg;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_entitlement_unavailable',
      message = 'purchase-backed Entitlement Grant became unavailable before Standard Reading v2 binding';
  end if;

  -- Preserve #1090 revoke-race hardening: after the selected Grant row is locked,
  -- re-evaluate the exact qualifying set before any official Reading/access mutation.
  select count(*)::integer
    into v_grant_count
  from public.entitlement_grants eg
  join public.commerce_receipts cr
    on cr.id = eg.source_receipt_id
   and cr.subject_id = eg.subject_id
  where eg.subject_id = p_subject_id
    and eg.entitlement_key = v_entitlement_key
    and eg.scope_key_norm = v_scope_key_norm
    and eg.grant_source_type = 'purchase'
    and eg.status = 'active'
    and eg.valid_from <= v_now
    and (eg.valid_until is null or v_now < eg.valid_until)
    and cr.purchase_intent_id = p_purchase_intent_id
    and cr.product_offer_id = v_product_offer_id
    and cr.verification_status = 'verified'
    and cr.environment = 'production';

  if v_grant_count = 0 then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_entitlement_unavailable',
      message = 'purchase-backed Entitlement Grant became unavailable before Standard Reading v2 mutation';
  end if;

  if v_grant_count <> 1 then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_entitlement_ambiguous',
      message = 'Standard Reading purchase became ambiguous before Standard Reading v2 mutation';
  end if;

  -- Serialize the official-Reading identity on the current self Birth aggregate.
  select bp.id, bp.current_revision_id
    into v_source_birth_profile_id, v_source_birth_revision_id
  from public.birth_profiles bp
  where bp.subject_id = p_subject_id
    and bp.profile_kind = 'self'
    and bp.archived_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_source_profile_unavailable',
      message = 'current self Birth Profile is unavailable';
  end if;

  if v_source_birth_revision_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_standard_reading_access_v2_source_profile_not_ready',
      message = 'current self Birth Profile has no immutable current revision';
  end if;

  select sdr.availability, sdr.capability_version
    into v_domain_availability, v_domain_capability_version
  from public.saju_domain_runtime sdr
  where sdr.saju_domain = v_saju_domain;

  if v_domain_availability is null
     or v_domain_availability = 'unavailable'
     or v_domain_capability_version is null
     or btrim(v_domain_capability_version) = '' then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_domain_unavailable',
      message = 'Standard Reading Saju domain is unavailable';
  end if;

  select cc.can_initiate
    into v_reader_can_initiate
  from public.character_capabilities cc
  where cc.content_bundle_id = v_reader_content_bundle_id
    and cc.character_id = v_reader_character_id
    and cc.saju_domain = v_saju_domain;

  if v_reader_can_initiate is distinct from true then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_access_v2_reader_capability_unavailable',
      message = 'Selected Reader cannot initiate this Standard Reading domain';
  end if;

  select o.*
    into v_official
  from public.standard_reading_official_bindings o
  where o.subject_id = p_subject_id
    and o.product_id = v_product_id
    and o.source_birth_revision_id = v_source_birth_revision_id
    and o.topic_key = v_topic_key
    and o.saju_domain = v_saju_domain
    and o.reading_period = v_reading_period
    and o.reading_variant = v_reading_variant
    and o.product_spec_version = v_spec_version
    and o.domain_capability_version = v_domain_capability_version;

  if found and v_official.reading_id is distinct from v_locked_official_reading_id then
    raise exception using
      errcode='40001',
      constraint='official_reader_s2_bind_official_scope_changed',
      message='Authoritative official Reading changed after scope lock';
  end if;

  if v_reader_character_id is distinct from v_locked_reader_character_id then
    raise exception using
      errcode='40001',
      constraint='official_reader_s2_bind_reader_scope_changed',
      message='Stored Reader selection changed after scope lock';
  end if;

  if not found then
    if v_purchase_role is distinct from 'initial_reading' then
      raise exception using
        errcode = 'P0001',
        constraint = 'cmd_standard_reading_access_v2_additional_requires_official',
        message = 'Additional Reader Interpretation requires an existing committed official Standard Reading';
    end if;

    select *
      into strict v_core
    from public.cmd_create_reading_session_v1(
      p_subject_id,
      p_proposed_reading_session_id,
      p_proposed_reading_id,
      'official-standard-reading:' || p_purchase_intent_id::text,
      p_request_hash,
      p_request_contract_version,
      p_request_snapshot_jsonb,
      v_saju_domain,
      v_source_birth_profile_id,
      null,
      null,
      null,
      null,
      null
    );

    if v_core.reading_id is distinct from v_locked_official_reading_id then
      raise exception using
        errcode='40001',
        constraint='official_reader_s2_bind_created_scope_changed',
        message='New official Reading differs from the locked proposed scope';
    end if;

    if v_core.replayed then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_standard_reading_access_v2_orphan_replay',
        message = 'Official Standard Reading idempotency namespace was already used without official binding provenance';
    end if;

    insert into public.standard_reading_official_bindings(
      reading_id,
      reading_session_id,
      subject_id,
      product_id,
      generation_purchase_intent_id,
      generation_entitlement_grant_id,
      source_birth_profile_id,
      source_birth_revision_id,
      topic_key,
      saju_domain,
      reading_period,
      reading_variant,
      product_spec_version,
      domain_capability_version,
      authority_contract_version,
      created_at
    ) values (
      v_core.reading_id,
      v_core.reading_session_id,
      p_subject_id,
      v_product_id,
      p_purchase_intent_id,
      v_entitlement_grant_id,
      v_source_birth_profile_id,
      v_core.source_birth_revision_id,
      v_topic_key,
      v_saju_domain,
      v_reading_period,
      v_reading_variant,
      v_spec_version,
      v_core.domain_capability_version,
      'official-standard-reading-binding-v1',
      v_now
    )
    returning * into v_official;

    v_official_created := true;
    v_access_role := 'initial_reader';
  else
    if v_purchase_role is distinct from 'additional_reader_interpretation' then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_standard_reading_access_v2_initial_official_conflict',
        message = 'Initial Standard Reading purchase cannot bind over an existing official Reading';
    end if;

    -- A different Reader may reuse only an actually committed official Source Truth.
    if not exists (
      select 1
      from public.readings r
      join public.reading_refs rr
        on rr.reading_id = r.id
       and rr.subject_id = r.subject_id
       and rr.execution_attempt_id = r.committed_execution_attempt_id
      where r.id = v_official.reading_id
        and r.reading_session_id = v_official.reading_session_id
        and r.subject_id = p_subject_id
        and r.execution_status = 'succeeded'
        and r.committed_execution_attempt_id is not null
        and r.completed_at is not null
        and rr.response_snapshot_jsonb is not null
        and btrim(rr.reading_contract_version) <> ''
        and btrim(rr.saju_engine_version) <> ''
        and btrim(rr.response_hash) <> ''
    ) then
      raise exception using
        errcode = 'P0001',
        constraint = 'cmd_standard_reading_access_v2_official_not_reusable',
        message = 'Existing official Standard Reading is not yet reusable as committed Source Truth';
    end if;

    v_access_role := 'additional_reader';
  end if;

  insert into public.standard_reading_reader_interpretations(
    official_reading_id,
    subject_id,
    reader_character_id,
    initial_reader_content_bundle_id,
    interpretation_contract_version,
    created_at
  ) values (
    v_official.reading_id,
    p_subject_id,
    v_reader_character_id,
    v_reader_content_bundle_id,
    'standard-reader-interpretation-v1',
    v_now
  )
  on conflict (official_reading_id, reader_character_id) do nothing;

  get diagnostics v_interpretation_count = row_count;

  insert into public.standard_reading_reader_access_grants(
    purchase_intent_id,
    subject_id,
    official_reading_id,
    reader_character_id,
    reader_content_bundle_id,
    entitlement_grant_id,
    reader_selection_hash,
    access_role,
    access_contract_version,
    request_contract_version,
    request_hash,
    created_at
  ) values (
    p_purchase_intent_id,
    p_subject_id,
    v_official.reading_id,
    v_reader_character_id,
    v_reader_content_bundle_id,
    v_entitlement_grant_id,
    v_reader_selection_hash,
    v_access_role,
    'standard-reading-reader-access-v1',
    p_request_contract_version,
    p_request_hash,
    v_now
  );

  return query
  select
    p_purchase_intent_id,
    v_entitlement_grant_id,
    v_product_id,
    v_reader_character_id,
    v_reader_content_bundle_id,
    v_official.reading_session_id,
    v_official.reading_id,
    v_official.source_birth_revision_id,
    v_official.saju_domain,
    v_official.domain_capability_version,
    v_access_role,
    v_official_created,
    (v_interpretation_count = 1),
    false;
end;
$$;

comment on function public.cmd_bind_standard_reading_access_v2(
  uuid,uuid,uuid,uuid,text,text,jsonb
) is
'Reader binding now acquires the actual S1 Subject x authoritative Official Reading x selected Reader transaction lock before Purchase/Grant/Birth row locks. Resolves replay/existing/current/initial separately and verifies exact bound identity before access INSERT. Direct legacy 1220 calls no longer bypass scope lock; no public paid activation.';
