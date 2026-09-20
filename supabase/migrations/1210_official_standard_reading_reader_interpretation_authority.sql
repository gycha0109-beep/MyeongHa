-- Official Standard Reading + per-Reader Interpretation/Access authority.
--
-- Forward-only correction of the historical Reader-bound Standard Reading model.
-- Existing standard_reading_unit_bindings rows remain immutable historical provenance,
-- but new v2 authority creates one Reader-independent official Reading and grants
-- Reader-specific interpretation access through exact purchase-backed Grants.
--
-- HOLD:
-- - no Product Offer / Charge Terms activation
-- - no EXECUTE grant for the v2 bind command or raw artifact source
-- - no Saju Production interpretation authority promotion
-- - no public generation/reread/chat route activation

create table public.standard_reading_delivery_policies (
  product_id uuid primary key,
  policy_version text not null,
  reading_identity_mode text not null,
  reader_interpretation_mode text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz null,
  constraint standard_reading_delivery_policies_product_fk
    foreign key (product_id) references public.standard_reading_product_specs(product_id),
  constraint standard_reading_delivery_policies_version_nonempty
    check (btrim(policy_version) <> ''),
  constraint standard_reading_delivery_policies_identity_mode
    check (reading_identity_mode = 'official_subject_product_scope_birth_authority'),
  constraint standard_reading_delivery_policies_interpretation_mode
    check (reader_interpretation_mode = 'per_reader_purchase_grant'),
  constraint standard_reading_delivery_policies_retirement_order
    check (retired_at is null or retired_at >= created_at)
);

comment on table public.standard_reading_delivery_policies is
'Current delivery authority layered over immutable historical standard_reading_product_specs. purchase_unit_mode=topic_reader_reading remains historical provenance and is not current Reading identity authority.';

insert into public.standard_reading_delivery_policies(
  product_id, policy_version, reading_identity_mode, reader_interpretation_mode
) values (
  '11300000-0000-0000-0000-000000000001',
  'official-reading-reader-interpretation-v1',
  'official_subject_product_scope_birth_authority',
  'per_reader_purchase_grant'
);

create table public.standard_reading_official_bindings (
  reading_id uuid primary key,
  reading_session_id uuid not null unique,
  subject_id uuid not null,
  product_id uuid not null,
  generation_purchase_intent_id uuid not null unique,
  generation_entitlement_grant_id uuid not null unique,
  source_birth_profile_id uuid not null,
  source_birth_revision_id uuid not null,
  topic_key text not null,
  saju_domain text not null,
  reading_period text not null,
  reading_variant text not null,
  product_spec_version text not null,
  domain_capability_version text not null,
  authority_contract_version text not null,
  created_at timestamptz not null,
  constraint standard_reading_official_binding_purchase_subject_fk
    foreign key (generation_purchase_intent_id, subject_id)
    references public.purchase_intents(id, subject_id),
  constraint standard_reading_official_binding_grant_fk
    foreign key (generation_entitlement_grant_id)
    references public.entitlement_grants(id),
  constraint standard_reading_official_binding_product_fk
    foreign key (product_id)
    references public.standard_reading_product_specs(product_id),
  constraint standard_reading_official_binding_profile_subject_fk
    foreign key (source_birth_profile_id, subject_id)
    references public.birth_profiles(id, subject_id),
  constraint standard_reading_official_binding_revision_subject_fk
    foreign key (source_birth_revision_id, subject_id)
    references public.birth_profile_revisions(id, subject_id),
  constraint standard_reading_official_binding_session_subject_fk
    foreign key (reading_session_id, subject_id)
    references public.reading_sessions(id, subject_id),
  constraint standard_reading_official_binding_reading_session_subject_fk
    foreign key (reading_id, reading_session_id, subject_id)
    references public.readings(id, reading_session_id, subject_id),
  constraint standard_reading_official_binding_domain_fk
    foreign key (saju_domain)
    references public.saju_domains(saju_domain),
  constraint standard_reading_official_binding_topic_nonempty
    check (btrim(topic_key) <> ''),
  constraint standard_reading_official_binding_period_nonempty
    check (btrim(reading_period) <> ''),
  constraint standard_reading_official_binding_variant_nonempty
    check (btrim(reading_variant) <> ''),
  constraint standard_reading_official_binding_spec_nonempty
    check (btrim(product_spec_version) <> ''),
  constraint standard_reading_official_binding_capability_nonempty
    check (btrim(domain_capability_version) <> ''),
  constraint standard_reading_official_binding_contract
    check (authority_contract_version = 'official-standard-reading-binding-v1'),
  constraint standard_reading_official_identity_unique
    unique (
      subject_id,
      product_id,
      source_birth_revision_id,
      topic_key,
      saju_domain,
      reading_period,
      reading_variant,
      product_spec_version,
      domain_capability_version
    )
);

comment on table public.standard_reading_official_bindings is
'One Reader-independent official Standard Reading identity. Reuse authority is relationally pinned to subject, Product/topic/scope, immutable Birth revision, Product spec version, and domain capability version.';

create table public.standard_reading_reader_interpretations (
  official_reading_id uuid not null,
  subject_id uuid not null,
  reader_character_id text not null,
  initial_reader_content_bundle_id uuid not null,
  interpretation_contract_version text not null,
  created_at timestamptz not null,
  primary key (official_reading_id, reader_character_id),
  constraint standard_reading_reader_interpretation_official_fk
    foreign key (official_reading_id)
    references public.standard_reading_official_bindings(reading_id),
  constraint standard_reading_reader_interpretation_reader_bundle_fk
    foreign key (reader_character_id, initial_reader_content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint standard_reading_reader_interpretation_contract
    check (interpretation_contract_version = 'standard-reader-interpretation-v1')
);

comment on table public.standard_reading_reader_interpretations is
'Logical Reader Interpretation identity only. It is presentation/explanation authority over one official Reading and never becomes Saju Source Truth. Generated prose/artifacts may be added by a later source-safe rendering slice.';

create table public.standard_reading_reader_access_grants (
  purchase_intent_id uuid primary key,
  subject_id uuid not null,
  official_reading_id uuid not null,
  reader_character_id text not null,
  reader_content_bundle_id uuid not null,
  entitlement_grant_id uuid not null unique,
  reader_selection_hash text not null,
  access_role text not null,
  access_contract_version text not null,
  request_contract_version text not null,
  request_hash text not null,
  created_at timestamptz not null,
  constraint standard_reading_reader_access_purchase_subject_fk
    foreign key (purchase_intent_id, subject_id)
    references public.purchase_intents(id, subject_id),
  constraint standard_reading_reader_access_official_subject_fk
    foreign key (official_reading_id, subject_id)
    references public.standard_reading_official_bindings(reading_id, subject_id),
  constraint standard_reading_reader_access_interpretation_fk
    foreign key (official_reading_id, reader_character_id)
    references public.standard_reading_reader_interpretations(official_reading_id, reader_character_id),
  constraint standard_reading_reader_access_reader_bundle_fk
    foreign key (reader_character_id, reader_content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint standard_reading_reader_access_entitlement_fk
    foreign key (entitlement_grant_id)
    references public.entitlement_grants(id),
  constraint standard_reading_reader_access_hash_nonempty
    check (btrim(reader_selection_hash) <> ''),
  constraint standard_reading_reader_access_role
    check (access_role in ('initial_reader', 'additional_reader')),
  constraint standard_reading_reader_access_contract
    check (access_contract_version = 'standard-reading-reader-access-v1'),
  constraint standard_reading_reader_access_request_contract
    check (request_contract_version = 'standard-reading-access-bind-v2'),
  constraint standard_reading_reader_access_request_hash
    check (request_hash ~ '^sha256:v1:[0-9a-f]{64}$')
);

comment on table public.standard_reading_reader_access_grants is
'Purchase-backed per-Reader access authority. Refund/revoke/expiry is evaluated against this exact Entitlement Grant; aggregate entitlement is insufficient.';

create unique index standard_reading_official_reading_subject_unique
  on public.standard_reading_official_bindings(reading_id, subject_id);

create index standard_reading_reader_access_subject_reader_idx
  on public.standard_reading_reader_access_grants(subject_id, reader_character_id, created_at desc);

create or replace function public.tr_standard_reading_v2_update_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_standard_reading_v2_update_immutable',
    message = 'Official Reading / Reader Interpretation provenance cannot be rewritten';
end;
$$;

create trigger tr_standard_reading_official_binding_update_immutable
  before update on public.standard_reading_official_bindings
  for each row execute function public.tr_standard_reading_v2_update_immutable();

create trigger tr_standard_reading_reader_interpretation_update_immutable
  before update on public.standard_reading_reader_interpretations
  for each row execute function public.tr_standard_reading_v2_update_immutable();

create trigger tr_standard_reading_reader_access_update_immutable
  before update on public.standard_reading_reader_access_grants
  for each row execute function public.tr_standard_reading_v2_update_immutable();

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
    srdp.policy_version
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
    v_policy_version
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
  where po.id = v_product_offer_id;

  if not found
     or v_reader_character_id is null
     or btrim(v_reader_character_id) = ''
     or v_reader_content_bundle_id is null
     or v_reader_selection_hash is null
     or btrim(v_reader_selection_hash) = ''
     or v_reader_selection_mode is distinct from 'required'
     or v_policy_version is null then
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

  if not found then
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
  uuid, uuid, uuid, uuid, text, text, jsonb
) is
'Fail-closed Standard Reading v2 binding: creates one Reader-independent official Reading only when none exists for the exact reusable identity, then adds per-Reader interpretation/access provenance.';

create or replace function public.internal_qry_character_standard_reading_access_v1(
  p_subject_id uuid,
  p_reader_character_id text,
  p_effective_at timestamptz
)
returns table (
  reading_id uuid,
  reading_session_id uuid,
  product_id uuid,
  topic_key text,
  saju_domain text,
  reading_period text,
  reading_variant text,
  source_birth_revision_id uuid,
  product_spec_version text,
  domain_capability_version text,
  reading_contract_version text,
  saju_engine_version text,
  response_hash text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null
     or p_reader_character_id is null
     or btrim(p_reader_character_id) = ''
     or p_effective_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'internal_character_standard_reading_access_input_required',
      message = 'Character Standard Reading access requires subject, Reader, and evaluation time';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  with source_subjects(subject_id) as (
    select p_subject_id
    union all
    select s.id
    from public.subjects s
    join public.subjects canonical
      on canonical.id = p_subject_id
     and canonical.kind = 'member'
     and canonical.status = 'active'
     and canonical.merged_into_subject_id is null
    where s.kind = 'guest'
      and s.status = 'merged'
      and s.merged_into_subject_id = p_subject_id
  )
  select distinct
    o.reading_id,
    o.reading_session_id,
    o.product_id,
    o.topic_key,
    o.saju_domain,
    o.reading_period,
    o.reading_variant,
    o.source_birth_revision_id,
    o.product_spec_version,
    o.domain_capability_version,
    rr.reading_contract_version,
    rr.saju_engine_version,
    rr.response_hash
  from public.standard_reading_official_bindings o
  join source_subjects src on src.subject_id = o.subject_id
  join public.readings r
    on r.id = o.reading_id
   and r.reading_session_id = o.reading_session_id
   and r.subject_id = o.subject_id
   and r.execution_status = 'succeeded'
   and r.committed_execution_attempt_id is not null
   and r.completed_at is not null
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  where exists (
    select 1
    from public.standard_reading_reader_access_grants a
    join public.entitlement_grants g
      on g.id = a.entitlement_grant_id
     and g.subject_id = a.subject_id
     and g.grant_source_type = 'purchase'
    where a.official_reading_id = o.reading_id
      and a.subject_id = o.subject_id
      and a.reader_character_id = p_reader_character_id
      and g.status = 'active'
      and g.valid_from <= p_effective_at
      and (g.valid_until is null or g.valid_until > p_effective_at)
  );
end;
$$;

comment on function public.internal_qry_character_standard_reading_access_v1(uuid, text, timestamptz)
is 'Metadata-only Reader Knowledge authority. Returns only official Readings opened to this exact Character by an active exact purchase-backed Grant. It does not expose raw ProductReadingResponse.';

create or replace function public.internal_qry_standard_reading_artifact_source_v2(
  p_subject_id uuid,
  p_reading_id uuid,
  p_reader_character_id text,
  p_effective_at timestamptz
)
returns table (
  reading_id uuid,
  product_id uuid,
  reader_character_id text,
  reading_contract_version text,
  product_response_state text,
  response_snapshot_jsonb jsonb,
  response_hash text,
  completed_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null
     or p_reading_id is null
     or p_reader_character_id is null
     or btrim(p_reader_character_id) = ''
     or p_effective_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'internal_standard_reading_artifact_source_v2_input_required',
      message = 'Standard Reading v2 artifact source requires subject, Reading, Reader, and evaluation time';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    o.reading_id,
    o.product_id,
    p_reader_character_id,
    rr.reading_contract_version,
    rr.product_response_state,
    rr.response_snapshot_jsonb,
    rr.response_hash,
    r.completed_at
  from public.standard_reading_official_bindings o
  join public.readings r
    on r.id = o.reading_id
   and r.reading_session_id = o.reading_session_id
   and r.subject_id = o.subject_id
   and r.execution_status = 'succeeded'
   and r.committed_execution_attempt_id is not null
   and r.completed_at is not null
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  where o.subject_id = p_subject_id
    and o.reading_id = p_reading_id
    and rr.response_snapshot_jsonb is not null
    and btrim(rr.reading_contract_version) <> ''
    and btrim(rr.product_response_state) <> ''
    and btrim(rr.response_hash) <> ''
    and exists (
      select 1
      from public.standard_reading_reader_access_grants a
      join public.entitlement_grants g
        on g.id = a.entitlement_grant_id
       and g.subject_id = a.subject_id
       and g.grant_source_type = 'purchase'
      where a.official_reading_id = o.reading_id
        and a.subject_id = o.subject_id
        and a.reader_character_id = p_reader_character_id
        and g.status = 'active'
        and g.valid_from <= p_effective_at
        and (g.valid_until is null or g.valid_until > p_effective_at)
    );
end;
$$;

comment on function public.internal_qry_standard_reading_artifact_source_v1(uuid, uuid, timestamptz)
is 'LEGACY INTERNAL SOURCE for historical Reader-bound bindings from #1099. New Official Reading + Reader Interpretation runtime must use v2 Reader-scoped source authority.';

revoke all on table public.standard_reading_delivery_policies from public;
revoke all on table public.standard_reading_official_bindings from public;
revoke all on table public.standard_reading_reader_interpretations from public;
revoke all on table public.standard_reading_reader_access_grants from public;
revoke all on function public.cmd_bind_standard_reading_access_v2(
  uuid, uuid, uuid, uuid, text, text, jsonb
) from public;
revoke all on function public.internal_qry_character_standard_reading_access_v1(
  uuid, text, timestamptz
) from public;
revoke all on function public.internal_qry_standard_reading_artifact_source_v2(
  uuid, uuid, text, timestamptz
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
      'revoke all on table public.standard_reading_delivery_policies from %I', v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on table public.standard_reading_official_bindings from %I', v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on table public.standard_reading_reader_interpretations from %I', v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on table public.standard_reading_reader_access_grants from %I', v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_bind_standard_reading_access_v2(uuid,uuid,uuid,uuid,text,text,jsonb) from %I', v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_qry_character_standard_reading_access_v1(uuid,text,timestamptz) from %I', v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_qry_standard_reading_artifact_source_v2(uuid,uuid,text,timestamptz) from %I', v_role
    );
  END LOOP;
END
$$;
