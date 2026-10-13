-- D2 PRIVATE: one common D1 lock entry for initial/additional Receipt issuance and binding.
-- Watchtower-Track: db-authority-core
-- Stacked on D1 #2012. NO runtime EXECUTE, production activation or Writer cutover.
--
-- This migration deliberately wraps the original 1090/1220 authority; it does
-- not alter their CAS, provider-ordering, entitlement ledger, outbox or replay.
-- An advisory scope lock alone NEVER proves an active entitlement.

create or replace function public.internal_apply_official_reader_unified_receipt_v1(
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
volatile
security invoker
set search_path = pg_catalog, public
as $d2_receipt$
declare
  v_subject_id uuid;
  v_intent_id uuid;
  v_offer_id uuid;
  v_check_subject uuid;
  v_check_intent uuid;
  v_check_offer uuid;
  v_scope record;
  v_after record;
begin
  if p_receipt_id is null then
    raise exception using errcode='23514',
      constraint='reader_d2_receipt_required',
      message='Exact verified Official Reader Receipt required';
  end if;

  -- Preflight is READ ONLY. The first row lock must be taken only by 1090
  -- AFTER the D1 source-derived L0 -> optional L1 lock is acquired.
  select cr.subject_id, cr.purchase_intent_id, cr.product_offer_id
  into v_subject_id, v_intent_id, v_offer_id
  from public.commerce_receipts cr
  join public.purchase_intents pi on pi.id=cr.purchase_intent_id
    and pi.subject_id=cr.subject_id
    and pi.product_offer_id=cr.product_offer_id
    and pi.status='verified'
  where cr.id=p_receipt_id
    and cr.environment='production'
    and cr.verification_status='verified';

  if not found or v_subject_id is null or v_intent_id is null
     or v_offer_id is null then
    raise exception using errcode='P0001',
      constraint='reader_d2_verified_receipt_required',
      message='Verified Receipt / Purchase Intent lineage unavailable';
  end if;

  select * into strict v_scope
  from public.internal_acquire_official_reader_purchase_scope_v2(
    v_subject_id,v_intent_id
  );
  -- The resolver enforces exact initial_reading (L0 only) or
  -- additional_reader_interpretation (L0 then L1) and rechecks after wait.

  select cr.subject_id, cr.purchase_intent_id, cr.product_offer_id
  into v_check_subject,v_check_intent,v_check_offer
  from public.commerce_receipts cr
  join public.purchase_intents pi on pi.id=cr.purchase_intent_id
    and pi.subject_id=cr.subject_id
    and pi.product_offer_id=cr.product_offer_id
    and pi.status='verified'
  where cr.id=p_receipt_id
    and cr.environment='production'
    and cr.verification_status='verified';

  if not found or row(v_check_subject,v_check_intent,v_check_offer)
     is distinct from row(v_subject_id,v_intent_id,v_offer_id) then
    raise exception using errcode='40001',
      constraint='reader_d2_receipt_lineage_drift',
      message='Verified Receipt scope changed while acquiring D1 locks';
  end if;

  return query
  select * from public.internal_apply_verified_receipt_capability_effects_v1(
    p_receipt_id,p_capability_item_keys,p_effective_ats,
    p_target_valid_froms,p_target_valid_untils,p_reason_codes
  );

  -- A scope change AFTER an original Commerce effect raises an error that
  -- aborts the statement and every Grant / ledger / projection / outbox write.
  select * into strict v_after
  from public.internal_acquire_official_reader_purchase_scope_v2(
    v_subject_id,v_intent_id
  );
  if row(v_after.purchase_role,v_after.product_id,v_after.reading_ref,
         v_after.reader_character_id)
     is distinct from
     row(v_scope.purchase_role,v_scope.product_id,v_scope.reading_ref,
         v_scope.reader_character_id) then
    raise exception using errcode='40001',
      constraint='reader_d2_issuance_scope_drift',
      message='Purchase scope changed during Receipt issuance';
  end if;

  select cr.subject_id,cr.purchase_intent_id,cr.product_offer_id
  into v_check_subject,v_check_intent,v_check_offer
  from public.commerce_receipts cr
  join public.purchase_intents pi on pi.id=cr.purchase_intent_id
    and pi.subject_id=cr.subject_id
    and pi.product_offer_id=cr.product_offer_id
    and pi.status='verified'
  where cr.id=p_receipt_id
    and cr.environment='production'
    and cr.verification_status='verified';
  if not found or row(v_check_subject,v_check_intent,v_check_offer)
     is distinct from row(v_subject_id,v_intent_id,v_offer_id) then
    raise exception using errcode='40001',
      constraint='reader_d2_receipt_lineage_drift',
      message='Verified Receipt scope changed during issuance';
  end if;
end
$d2_receipt$;

create or replace function public.internal_cmd_bind_official_reader_unified_v1(
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
as $d2_bind$
declare
  v_scope record;
  v_after record;
  v_result record;
  v_selection_count bigint;
  v_selected_reader text;
  v_selected_bundle uuid;
  v_birth_revision uuid;
begin
  if p_subject_id is null or p_purchase_intent_id is null
     or p_proposed_reading_session_id is null
     or p_proposed_reading_id is null then
    raise exception using errcode='23514',
      constraint='reader_d2_bind_input_required',
      message='Exact official purchase and proposed Reading IDs required';
  end if;
  -- Source-owned purchase scope is acquired BEFORE any Intent/Grant/Birth row
  -- locks in the original v2 binder, not after it.
  select * into strict v_scope
  from public.internal_acquire_official_reader_purchase_scope_v2(
    p_subject_id,p_purchase_intent_id
  );

  select count(*), (array_agg(sel.reader_character_id))[1],
         (array_agg(sel.reader_content_bundle_id))[1]
  into v_selection_count,v_selected_reader,v_selected_bundle
  from public.purchase_intents pi
  join public.product_offers po on po.id=pi.product_offer_id
  join public.purchase_intent_reader_selections sel
    on sel.purchase_intent_id=pi.id and sel.product_id=po.product_id
  where pi.id=p_purchase_intent_id and pi.subject_id=p_subject_id
    and pi.status='verified' and po.product_id=v_scope.product_id;

  if v_selection_count <> 1 or v_selected_reader is null
     or pg_catalog.btrim(v_selected_reader)=''
     or v_selected_bundle is null
     or (v_scope.purchase_role='additional_reader_interpretation'
         and v_selected_reader is distinct from v_scope.reader_character_id) then
    raise exception using errcode='40001',
      constraint='reader_d2_reader_selection_drift',
      message='Selected Reader / Bundle is not authoritative for this purchase';
  end if;

  -- 1220 retains sole right to resolve current independent Grant, CAS,
  -- Birth revision, current official Binding and historical replay.
  select * into strict v_result
  from public.cmd_bind_standard_reading_access_v2(
    p_subject_id,p_purchase_intent_id,p_proposed_reading_session_id,
    p_proposed_reading_id,p_request_hash,p_request_contract_version,
    p_request_snapshot_jsonb
  );

  if v_result.purchase_intent_id is distinct from p_purchase_intent_id
     or v_result.product_id is distinct from v_scope.product_id
     or v_result.reader_character_id is distinct from v_selected_reader
     or v_result.reader_content_bundle_id is distinct from v_selected_bundle
     or v_result.reading_id is null then
    raise exception using errcode='40001',
      constraint='reader_d2_bind_authority_mismatch',
      message='Original Binder returned a different purchase scope';
  end if;

  if v_result.replayed is null
     or v_result.official_reading_created is null
     or v_result.entitlement_grant_id is null then
    raise exception using errcode='40001',
      constraint='reader_d2_bind_result_incomplete',
      message='Original Binder returned incomplete purchase-backed result';
  end if;

  if v_scope.purchase_role='initial_reading' then
    if v_result.access_role is distinct from 'initial_reader'
       or (v_result.replayed is false and
            v_result.official_reading_created is distinct from true)
       or (v_result.replayed is true and
            v_result.official_reading_created is distinct from false) then
      raise exception using errcode='40001',
        constraint='reader_d2_initial_cannot_reuse_other_official',
        message='Initial purchase must create one Official Reading or replay itself';
    end if;
  elsif v_scope.purchase_role='additional_reader_interpretation' then
    if v_result.access_role is distinct from 'additional_reader'
       or v_result.official_reading_created is distinct from false
       or v_result.reading_id is distinct from v_scope.reading_ref then
      raise exception using errcode='40001',
        constraint='reader_d2_additional_must_reuse_official',
        message='Additional Reader purchase must reuse exact Official Reading';
    end if;
  else
    raise exception using errcode='P0001',
      constraint='reader_d2_role_unavailable',
      message='Unsupported Official Reader purchase role';
  end if;

  select * into strict v_after
  from public.internal_acquire_official_reader_purchase_scope_v2(
    p_subject_id,p_purchase_intent_id
  );
  if row(v_after.purchase_role,v_after.product_id,v_after.reading_ref,
         v_after.reader_character_id)
     is distinct from
     row(v_scope.purchase_role,v_scope.product_id,v_scope.reading_ref,
         v_scope.reader_character_id) then
    raise exception using errcode='40001',
      constraint='reader_d2_bind_scope_drift',
      message='Purchase scope changed during bind; rollback required';
  end if;

  -- Selection metadata can also drift through legacy/unparticipating paths.
  -- Recheck both Reader and immutable Bundle after the original binder.
  select count(*), (array_agg(sel.reader_character_id))[1],
         (array_agg(sel.reader_content_bundle_id))[1]
  into v_selection_count,v_selected_reader,v_selected_bundle
  from public.purchase_intents pi
  join public.product_offers po on po.id=pi.product_offer_id
  join public.purchase_intent_reader_selections sel
    on sel.purchase_intent_id=pi.id and sel.product_id=po.product_id
  where pi.id=p_purchase_intent_id and pi.subject_id=p_subject_id
    and pi.status='verified' and po.product_id=v_scope.product_id;
  if v_selection_count <> 1
     or v_selected_reader is distinct from v_result.reader_character_id
     or v_selected_bundle is distinct from v_result.reader_content_bundle_id then
    raise exception using errcode='40001',
      constraint='reader_d2_reader_selection_drift',
      message='Reader or Bundle selection drift after original bind';
  end if;

  if v_result.replayed is false then
    select bp.current_revision_id into v_birth_revision
    from public.birth_profiles bp
    where bp.subject_id=p_subject_id and bp.profile_kind='self'
      and bp.archived_at is null;
    if v_result.source_birth_revision_id is distinct from v_birth_revision then
      raise exception using errcode='40001',
        constraint='reader_d2_birth_revision_drift',
        message='Current Birth revision differs from newly bound Reading';
    end if;
  end if;

  return query select
    v_result.purchase_intent_id,v_result.entitlement_grant_id,
    v_result.product_id,v_result.reader_character_id,
    v_result.reader_content_bundle_id,v_result.reading_session_id,
    v_result.reading_id,v_result.source_birth_revision_id,
    v_result.saju_domain,v_result.domain_capability_version,
    v_result.access_role,v_result.official_reading_created,
    v_result.interpretation_created,v_result.replayed;
end
$d2_bind$;

revoke all on function public.internal_apply_official_reader_unified_receipt_v1(
  uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) from public;
revoke all on function public.internal_cmd_bind_official_reader_unified_v1(
  uuid,uuid,uuid,uuid,text,text,jsonb
) from public;

do $d2_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles where rolname in (
    'anon','authenticated','service_role','myeongha_api_executor',
    'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
  ) loop
    execute pg_catalog.format(
      'revoke all on function public.internal_apply_official_reader_unified_receipt_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]) from %I',v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.internal_cmd_bind_official_reader_unified_v1(uuid,uuid,uuid,uuid,text,text,jsonb) from %I',v_role
    );
  end loop;
end
$d2_acl$;

comment on function public.internal_apply_official_reader_unified_receipt_v1(
 uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) is 'D2 PRIVATE 1090 Receipt wrapper using D1 initial L0 or additional L0-L1 first. Not Provider refund, runtime cutover or entitlement permission.';
comment on function public.internal_cmd_bind_official_reader_unified_v1(
 uuid,uuid,uuid,uuid,text,text,jsonb
) is 'D2 PRIVATE 1220 Binder wrapper using D1 initial L0 or additional L0-L1 first; source-derived scope revalidated. Not a public T2/Chat writer.';
