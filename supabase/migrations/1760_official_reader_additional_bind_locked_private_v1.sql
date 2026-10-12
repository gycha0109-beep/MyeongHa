-- S2 staged additional-Reader access binder with scope lock acquired before
-- the existing v2 binder's Purchase Intent / Grant / Birth row locks.
-- Watchtower-Track: db-authority-core
--
-- HOLD: this is an ungranted DB-owner candidate, NOT an API/Commerce cutover.
-- Scope is independently derived from the exact server-owned verified purchase
-- and existing Official Reading. No client-supplied Reading/Reader lock key.
-- First-ever Official Reading purchase and ambiguous historical targets DENY.
-- Existing v2 binder retains ownership of its immutable purchase/Grant checks.
-- New receipt issuance and provider refund/revocation writers have NOT adopted
-- this scope lock; paid T2 final revelation remains prohibited.

create or replace function public.internal_cmd_bind_official_reader_additional_locked_v1(
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
volatile
security invoker
set search_path = pg_catalog, public
as $reader_locked_additional$
declare
  v_match_count bigint;
  v_reading_ref uuid;
  v_reader_id text;
  v_result record;
begin
  if p_subject_id is null
     or p_purchase_intent_id is null
     or p_proposed_reading_session_id is null
     or p_proposed_reading_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'reader_additional_locked_input_required',
      message = 'Official Reader additional binding identifiers are required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '25001',
      constraint = 'reader_additional_locked_isolation_required',
      message = 'Official Reader additional binding requires READ COMMITTED';
  end if;

  -- Resolve only a purchase-selected Reader and an existing exact official
  -- Reading. Initial Reading is deliberately excluded because its identity may
  -- not yet exist when Commerce issues the first Grant.
  with matches as materialized (
    select o.reading_id, selected.reader_character_id
    from public.purchase_intents intent
    join public.product_offers offer
      on offer.id = intent.product_offer_id
    join public.purchase_intent_reader_selections selected
      on selected.purchase_intent_id = intent.id
     and selected.product_id = offer.product_id
    join public.standard_reading_offer_roles roles
      on roles.product_offer_id = offer.id
     and roles.retired_at is null
     and roles.purchase_role = 'additional_reader_interpretation'
    join public.standard_reading_product_specs spec
      on spec.product_id = offer.product_id
     and spec.retired_at is null
     and spec.reader_selection_mode = 'required'
    join public.standard_reading_delivery_policies policy
      on policy.product_id = spec.product_id
     and policy.retired_at is null
     and policy.reading_identity_mode = 'official_subject_product_scope_birth_authority'
     and policy.reader_interpretation_mode = 'per_reader_purchase_grant'
    join public.birth_profiles birth
      on birth.subject_id = intent.subject_id
     and birth.profile_kind = 'self'
     and birth.archived_at is null
     and birth.current_revision_id is not null
    join public.saju_domain_runtime domain
      on domain.saju_domain = spec.saju_domain
     and domain.availability <> 'unavailable'
    join public.standard_reading_official_bindings o
      on o.subject_id = intent.subject_id
     and o.product_id = spec.product_id
     and o.source_birth_revision_id = birth.current_revision_id
     and o.topic_key = spec.topic_key
     and o.saju_domain = spec.saju_domain
     and o.reading_period = spec.reading_period
     and o.reading_variant = spec.reading_variant
     and o.product_spec_version = spec.spec_version
     and o.domain_capability_version = domain.capability_version
    where intent.id = p_purchase_intent_id
      and intent.subject_id = p_subject_id
      and intent.status = 'verified'
      and intent.capability_set_id = spec.capability_set_id
  )
  select count(*), (array_agg(m.reading_id))[1],
         (array_agg(m.reader_character_id))[1]
    into v_match_count, v_reading_ref, v_reader_id
  from matches m;

  if v_match_count <> 1 or v_reading_ref is null
     or v_reader_id is null or btrim(v_reader_id) = '' then
    raise exception using
      errcode = 'P0001',
      constraint = 'reader_additional_locked_unique_official_scope_required',
      message = 'One server-owned additional Reader and existing Official Reading scope is required';
  end if;

  -- This MUST precede the v2 bind command's row locks. Caller must not already
  -- hold a Grant/Receipt/Birth lock; Commerce writers must use the same order.
  perform public.internal_acquire_official_reader_scope_lock_v1(
    p_subject_id, v_reading_ref, v_reader_id
  );

  -- v2 has the definitive immutable purchase/Grant authority and selects the
  -- current Official Reading after taking its original row locks. Any scope
  -- drift, including changed Birth revision, rolls back the entire statement.
  select * into strict v_result
  from public.cmd_bind_standard_reading_access_v2(
    p_subject_id, p_purchase_intent_id,
    p_proposed_reading_session_id, p_proposed_reading_id,
    p_request_hash, p_request_contract_version, p_request_snapshot_jsonb
  );

  if v_result.reading_id is distinct from v_reading_ref
     or v_result.reader_character_id is distinct from v_reader_id
     or v_result.access_role is distinct from 'additional_reader'
     or v_result.official_reading_created is distinct from false then
    raise exception using
      errcode = '40001',
      constraint = 'reader_additional_locked_scope_drift',
      message = 'Official Reader additional binding scope changed during locking';
  end if;

  -- replayed=true remains historical binding provenance, not a live Grant.
  return query select
    v_result.purchase_intent_id, v_result.entitlement_grant_id,
    v_result.product_id, v_result.reader_character_id,
    v_result.reader_content_bundle_id, v_result.reading_session_id,
    v_result.reading_id, v_result.source_birth_revision_id,
    v_result.saju_domain, v_result.domain_capability_version,
    v_result.access_role, v_result.official_reading_created,
    v_result.interpretation_created, v_result.replayed;
end
$reader_locked_additional$;

revoke all on function public.internal_cmd_bind_official_reader_additional_locked_v1(
  uuid, uuid, uuid, uuid, text, text, jsonb
) from public;

do $reader_additional_acl$
declare
  v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
                      'myeongha_api_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_cmd_bind_official_reader_additional_locked_v1(uuid,uuid,uuid,uuid,text,text,jsonb) from %I',
      v_role
    );
  end loop;
end
$reader_additional_acl$;

comment on function public.internal_cmd_bind_official_reader_additional_locked_v1(
  uuid,uuid,uuid,uuid,text,text,jsonb
) is
'Staged DB-owner additional Reader binding wrapper: server-derived exact existing Official Reading scope is locked before v2 Grant/Birth locks. NO initial Reading, no public EXECUTE, no Commerce issuance/revoke adoption, no paid Reader T2 authority.';
