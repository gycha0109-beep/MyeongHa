-- Reader-bound Standard Reading purchase-unit -> Reading binding authority.
--
-- One verified Standard Reading Purchase Intent owns exactly one sparse Reader selection.
-- One purchase-backed active Entitlement Grant from the same verified production Receipt
-- may be consumed by exactly one pending Reading. The command below creates the logical
-- Reading through the existing Reading Session authority and appends immutable binding
-- provenance in the same PostgreSQL statement transaction.
--
-- IMPORTANT HOLD:
-- - this migration does not create/enable an Offer or Charge Terms;
-- - it does not grant this command to myeongha_api_executor;
-- - it does not call Saju transport, finalize ProductReadingResponse, or write grounding;
-- - production interpretation authority remains a separate activation prerequisite.

create table public.standard_reading_unit_bindings (
  purchase_intent_id uuid primary key,
  subject_id uuid not null,
  product_id uuid not null,
  entitlement_grant_id uuid not null,
  reader_character_id text not null,
  reader_content_bundle_id uuid not null,
  reader_selection_hash text not null,
  source_birth_profile_id uuid not null,
  source_birth_revision_id uuid not null,
  reading_session_id uuid not null,
  reading_id uuid not null,
  saju_domain text not null,
  domain_capability_version text not null,
  binding_contract_version text not null,
  request_contract_version text not null,
  request_hash text not null,
  created_at timestamptz not null,
  constraint standard_reading_unit_bindings_grant_unique
    unique (entitlement_grant_id),
  constraint standard_reading_unit_bindings_session_unique
    unique (reading_session_id),
  constraint standard_reading_unit_bindings_reading_unique
    unique (reading_id),
  constraint standard_reading_unit_bindings_purchase_subject_fk
    foreign key (purchase_intent_id, subject_id)
    references public.purchase_intents(id, subject_id),
  constraint standard_reading_unit_bindings_product_fk
    foreign key (product_id)
    references public.standard_reading_product_specs(product_id),
  constraint standard_reading_unit_bindings_grant_fk
    foreign key (entitlement_grant_id)
    references public.entitlement_grants(id),
  constraint standard_reading_unit_bindings_reader_bundle_fk
    foreign key (reader_character_id, reader_content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint standard_reading_unit_bindings_source_profile_subject_fk
    foreign key (source_birth_profile_id, subject_id)
    references public.birth_profiles(id, subject_id),
  constraint standard_reading_unit_bindings_source_revision_subject_fk
    foreign key (source_birth_revision_id, subject_id)
    references public.birth_profile_revisions(id, subject_id),
  constraint standard_reading_unit_bindings_session_subject_fk
    foreign key (reading_session_id, subject_id)
    references public.reading_sessions(id, subject_id),
  constraint standard_reading_unit_bindings_reading_session_subject_fk
    foreign key (reading_id, reading_session_id, subject_id)
    references public.readings(id, reading_session_id, subject_id),
  constraint standard_reading_unit_bindings_domain_fk
    foreign key (saju_domain)
    references public.saju_domains(saju_domain),
  constraint standard_reading_unit_bindings_reader_hash_nonempty
    check (btrim(reader_selection_hash) <> ''),
  constraint standard_reading_unit_bindings_binding_contract
    check (binding_contract_version = 'standard-reading-unit-binding-v1'),
  constraint standard_reading_unit_bindings_request_contract
    check (request_contract_version = 'standard-reading-unit-request-v1'),
  constraint standard_reading_unit_bindings_request_hash
    check (request_hash ~ '^sha256:v1:[0-9a-f]{64}$')
);

create or replace function public.tr_standard_reading_unit_binding_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_standard_reading_unit_binding_append_only',
    message = 'Standard Reading purchase-unit binding is immutable';
end;
$$;

create trigger tr_standard_reading_unit_binding_append_only
  before update or delete on public.standard_reading_unit_bindings
  for each row execute function public.tr_standard_reading_unit_binding_append_only();

create index standard_reading_unit_bindings_subject_created_idx
  on public.standard_reading_unit_bindings(subject_id, created_at desc);

create or replace function public.cmd_bind_standard_reading_unit_v1(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_reading_session_id uuid,
  p_reading_id uuid,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb,
  p_source_birth_profile_id uuid
)
returns table (
  purchase_intent_id uuid,
  entitlement_grant_id uuid,
  product_id uuid,
  reader_character_id text,
  reader_content_bundle_id uuid,
  reading_session_id uuid,
  reading_id uuid,
  attempt_no integer,
  source_birth_revision_id uuid,
  saju_domain text,
  domain_capability_version text,
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

  v_existing public.standard_reading_unit_bindings%rowtype;

  v_product_id uuid;
  v_reader_character_id text;
  v_reader_content_bundle_id uuid;
  v_reader_selection_hash text;
  v_spec_capability_set_id uuid;
  v_saju_domain text;
  v_reader_selection_mode text;
  v_purchase_unit_mode text;

  v_capability_count integer;
  v_entitlement_key text;
  v_scope_mode text;
  v_fixed_scope_key text;
  v_scope_key_norm text;

  v_grant_count integer;
  v_entitlement_grant_id uuid;

  v_expected_request_snapshot jsonb;
  v_core record;
begin
  if p_subject_id is null
     or p_purchase_intent_id is null
     or p_reading_session_id is null
     or p_reading_id is null
     or p_source_birth_profile_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_standard_reading_unit_ids_required',
      message = 'Standard Reading unit binding requires subject, purchase, Reading, and source profile identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_request_hash is null
     or p_request_hash !~ '^sha256:v1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_standard_reading_unit_request_hash',
      message = 'Standard Reading unit request hash is invalid';
  end if;

  if p_request_contract_version is distinct from 'standard-reading-unit-request-v1' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_standard_reading_unit_request_contract',
      message = 'Standard Reading unit request contract is invalid';
  end if;

  v_expected_request_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion', 'standard-reading-unit-request-v1',
    'purchaseIntentId', p_purchase_intent_id::text,
    'sourceBirthProfileId', p_source_birth_profile_id::text
  );

  if p_request_snapshot_jsonb is distinct from v_expected_request_snapshot then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_standard_reading_unit_request_snapshot',
      message = 'Standard Reading unit request snapshot must exactly match server-owned request authority';
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
      constraint = 'cmd_standard_reading_unit_subject_ineligible',
      message = 'Standard Reading unit binding requires an active canonical Guest or Member subject';
  end if;

  -- Serialize consumption by Purchase Intent. Replays and concurrent attempts for the
  -- same paid unit therefore converge before Reading allocation.
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
      constraint = 'cmd_standard_reading_unit_purchase_unavailable',
      message = 'verified Standard Reading Purchase Intent authority is unavailable';
  end if;

  select b.*
    into v_existing
  from public.standard_reading_unit_bindings b
  where b.purchase_intent_id = p_purchase_intent_id;

  if found then
    if v_existing.subject_id is distinct from p_subject_id
       or v_existing.request_hash is distinct from p_request_hash
       or v_existing.request_contract_version is distinct from p_request_contract_version
       or v_existing.source_birth_profile_id is distinct from p_source_birth_profile_id then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_standard_reading_unit_binding_conflict',
        message = 'Standard Reading Purchase Intent is already bound to different Reading request provenance';
    end if;

    return query
    select
      v_existing.purchase_intent_id,
      v_existing.entitlement_grant_id,
      v_existing.product_id,
      v_existing.reader_character_id,
      v_existing.reader_content_bundle_id,
      v_existing.reading_session_id,
      v_existing.reading_id,
      1,
      v_existing.source_birth_revision_id,
      v_existing.saju_domain,
      v_existing.domain_capability_version,
      true;
    return;
  end if;

  select
    po.product_id,
    pirs.reader_character_id,
    pirs.reader_content_bundle_id,
    pirs.selection_hash,
    srps.capability_set_id,
    srps.saju_domain,
    srps.reader_selection_mode,
    srps.purchase_unit_mode
  into
    v_product_id,
    v_reader_character_id,
    v_reader_content_bundle_id,
    v_reader_selection_hash,
    v_spec_capability_set_id,
    v_saju_domain,
    v_reader_selection_mode,
    v_purchase_unit_mode
  from public.product_offers po
  join public.purchase_intent_reader_selections pirs
    on pirs.purchase_intent_id = p_purchase_intent_id
   and pirs.product_id = po.product_id
  join public.standard_reading_product_specs srps
    on srps.product_id = po.product_id
  where po.id = v_product_offer_id;

  if not found
     or v_reader_character_id is null
     or btrim(v_reader_character_id) = ''
     or v_reader_content_bundle_id is null
     or v_reader_selection_hash is null
     or btrim(v_reader_selection_hash) = ''
     or v_reader_selection_mode is distinct from 'required'
     or v_purchase_unit_mode is distinct from 'topic_reader_reading' then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_unit_reader_provenance_unavailable',
      message = 'immutable Reader-bound Standard Reading purchase provenance is unavailable';
  end if;

  if v_spec_capability_set_id is null
     or v_spec_capability_set_id is distinct from v_purchase_capability_set_id then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_unit_capability_unavailable',
      message = 'Purchase Intent Capability Set does not match Standard Reading Product authority';
  end if;

  select count(*)::integer
    into v_capability_count
  from public.product_capability_items pci
  where pci.capability_set_id = v_purchase_capability_set_id;

  if v_capability_count <> 1 then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_unit_capability_unavailable',
      message = 'Reader-bound Standard Reading unit requires exactly one pinned Capability Item';
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
      constraint = 'cmd_standard_reading_unit_capability_unavailable',
      message = 'Reader-bound Standard Reading Capability Item cannot resolve an entitlement target';
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
      constraint = 'cmd_standard_reading_unit_entitlement_unavailable',
      message = 'active purchase-backed Entitlement Grant for this Standard Reading purchase is unavailable';
  end if;

  if v_grant_count <> 1 then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_standard_reading_unit_entitlement_ambiguous',
      message = 'Standard Reading purchase resolves to multiple active purchase-backed Entitlement Grants';
  end if;

  select eg.id
    into strict v_entitlement_grant_id
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

  select *
    into strict v_core
  from public.cmd_create_reading_session_v1(
    p_subject_id,
    p_reading_session_id,
    p_reading_id,
    'standard-reading-unit:' || p_purchase_intent_id::text,
    p_request_hash,
    p_request_contract_version,
    p_request_snapshot_jsonb,
    v_saju_domain,
    p_source_birth_profile_id,
    null,
    null,
    null,
    v_reader_character_id,
    v_reader_content_bundle_id
  );

  -- There was no binding row before the serialized Purchase Intent lock. A replay from
  -- the generic Reading command therefore means an unrelated/legacy logical Reading
  -- already claimed the server-owned idempotency namespace. Never adopt it silently.
  if v_core.replayed then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_standard_reading_unit_orphan_replay',
      message = 'Reading idempotency namespace was already used without Standard Reading unit binding provenance';
  end if;

  insert into public.standard_reading_unit_bindings(
    purchase_intent_id,
    subject_id,
    product_id,
    entitlement_grant_id,
    reader_character_id,
    reader_content_bundle_id,
    reader_selection_hash,
    source_birth_profile_id,
    source_birth_revision_id,
    reading_session_id,
    reading_id,
    saju_domain,
    domain_capability_version,
    binding_contract_version,
    request_contract_version,
    request_hash,
    created_at
  ) values (
    p_purchase_intent_id,
    p_subject_id,
    v_product_id,
    v_entitlement_grant_id,
    v_reader_character_id,
    v_reader_content_bundle_id,
    v_reader_selection_hash,
    p_source_birth_profile_id,
    v_core.source_birth_revision_id,
    v_core.reading_session_id,
    v_core.reading_id,
    v_saju_domain,
    v_core.domain_capability_version,
    'standard-reading-unit-binding-v1',
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
    v_core.reading_session_id,
    v_core.reading_id,
    v_core.attempt_no,
    v_core.source_birth_revision_id,
    v_saju_domain,
    v_core.domain_capability_version,
    false;
end;
$$;

comment on function public.cmd_bind_standard_reading_unit_v1(
  uuid, uuid, uuid, uuid, text, text, jsonb, uuid
) is
  'Fail-closed unactivated authority that consumes one verified Reader-bound Standard Reading purchase-backed Grant into exactly one pending Reading. No transport/finalization/grounding authority is included.';

revoke all on table public.standard_reading_unit_bindings from public;
revoke all on function public.cmd_bind_standard_reading_unit_v1(
  uuid, uuid, uuid, uuid, text, text, jsonb, uuid
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
      'revoke all on table public.standard_reading_unit_bindings from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke execute on function public.cmd_bind_standard_reading_unit_v1(uuid,uuid,uuid,uuid,text,text,jsonb,uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;
