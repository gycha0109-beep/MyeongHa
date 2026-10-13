-- D2 staged, NOT a runtime cutover: verified receipt and exact purchase bind
-- are dispatched through D1 Product L0 -> optional Reader L1, BEFORE
-- the original Commerce Receipt/Grant or Birth/Reading row locks.
-- Watchtower-Track: db-authority-core
--
-- Only delegates to existing 1760 additional / 1790 initial writers;
-- preserves original CAS, refund semantics, idempotency and history.
-- This neither routes live webhook/Commerce code nor grants runtime EXECUTE.
-- Source Product/Reader/Reading comes from 1800 authoritative purchase scope.

create or replace function public.internal_apply_official_reader_verified_receipt_unified_v1(
  p_receipt_id uuid,
  p_capability_item_keys text[],
  p_effective_ats timestamptz[],
  p_target_valid_froms timestamptz[],
  p_target_valid_untils timestamptz[],
  p_reason_codes text[]
)
returns table(
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
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $unified_receipt_dispatch$
declare
  v_subject_id uuid;
  v_intent_id uuid;
  v_role text;
  v_product_id uuid;
  v_receipt_count bigint;
  v_recheck_count bigint;
  v_after_role text;
  v_after_product uuid;
begin
  if p_receipt_id is null then
    raise exception using errcode='23514',
      constraint='reader_unified_receipt_required',
      message='Official Reader verified Receipt is required';
  end if;

  -- Exactly one PRODUCTION verified Receipt/Intent/Offer lineage. No row
  -- lock is taken until Product and optional Reader scope locks are acquired.
  select count(*), (array_agg(cr.subject_id))[1], (array_agg(cr.purchase_intent_id))[1]
  into v_receipt_count,v_subject_id,v_intent_id
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id
   and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
  where cr.id=p_receipt_id
    and cr.environment='production'
    and cr.verification_status='verified';
  if v_receipt_count <> 1 or v_subject_id is null or v_intent_id is null then
    raise exception using errcode='P0001',
      constraint='reader_unified_receipt_lineage_unavailable',
      message='Exact production verified Receipt lineage is required';
  end if;

  select p.purchase_role,p.product_id
    into strict v_role,v_product_id
  from public.internal_acquire_official_reader_purchase_scope_v2(
    v_subject_id,v_intent_id
  ) p;

  select count(*) into v_recheck_count
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
  join public.product_offers po on po.id=pi.product_offer_id
  where cr.id=p_receipt_id and cr.environment='production'
    and cr.verification_status='verified'
    and cr.subject_id=v_subject_id and cr.purchase_intent_id=v_intent_id
    and po.product_id=v_product_id;
  if v_recheck_count <> 1 then
    raise exception using errcode='40001',
      constraint='reader_unified_receipt_lineage_drift',
      message='Official Reader Receipt lineage changed while acquiring scope';
  end if;

  if v_role='initial_reading' then
    return query select * from
      public.internal_apply_initial_official_reader_receipt_locked_v1(
        p_receipt_id,p_capability_item_keys,p_effective_ats,
        p_target_valid_froms,p_target_valid_untils,p_reason_codes
      );
  elsif v_role='additional_reader_interpretation' then
    return query select * from
      public.internal_apply_additional_official_reader_receipt_locked_v1(
        p_receipt_id,p_capability_item_keys,p_effective_ats,
        p_target_valid_froms,p_target_valid_untils,p_reason_codes
      );
  else
    raise exception using errcode='P0001',
      constraint='reader_unified_receipt_role_unavailable',
      message='Official Reader verified Receipt role unavailable';
  end if;

  -- Recheck the same Product/Role AFTER original writer. The source scope
  -- remains locked until COMMIT; changed lineage aborts the entire batch.
  select p.purchase_role,p.product_id
    into strict v_after_role,v_after_product
  from public.internal_acquire_official_reader_purchase_scope_v2(
    v_subject_id,v_intent_id
  ) p;
  if v_after_role is distinct from v_role
     or v_after_product is distinct from v_product_id then
    raise exception using errcode='40001',
      constraint='reader_unified_receipt_scope_drift',
      message='Official Reader purchase scope changed during issuance';
  end if;
end
$unified_receipt_dispatch$;

create or replace function public.internal_cmd_bind_official_reader_unified_v1(
  p_subject_id uuid,
  p_purchase_intent_id uuid,
  p_proposed_reading_session_id uuid,
  p_proposed_reading_id uuid,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb
)
returns table(
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
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $unified_bind_dispatch$
declare
  v_scope record;
  v_result record;
  v_after record;
begin
  if p_subject_id is null or p_purchase_intent_id is null
     or p_proposed_reading_session_id is null
     or p_proposed_reading_id is null then
    raise exception using errcode='23514',
      constraint='reader_unified_bind_input_required',
      message='Exact Official Reader purchase and proposed binding IDs required';
  end if;

  -- No Grant/Birth/Thread row is locked by this preflight; L0 always first.
  select * into strict v_scope from
    public.internal_acquire_official_reader_purchase_scope_v2(
      p_subject_id,p_purchase_intent_id
    );

  if v_scope.purchase_role='initial_reading' then
    select * into strict v_result from
      public.internal_cmd_bind_initial_official_reader_locked_v1(
        p_subject_id,p_purchase_intent_id,
        p_proposed_reading_session_id,p_proposed_reading_id,
        p_request_hash,p_request_contract_version,p_request_snapshot_jsonb
      );
    if v_result.access_role is distinct from 'initial_reader' then
      raise exception using errcode='40001',
        constraint='reader_unified_bind_role_drift',
        message='First Reader bind authority role mismatch';
    end if;
  elsif v_scope.purchase_role='additional_reader_interpretation' then
    select * into strict v_result from
      public.internal_cmd_bind_official_reader_additional_locked_v1(
        p_subject_id,p_purchase_intent_id,
        p_proposed_reading_session_id,p_proposed_reading_id,
        p_request_hash,p_request_contract_version,p_request_snapshot_jsonb
      );
    if v_result.access_role is distinct from 'additional_reader'
      or v_result.reading_id is distinct from v_scope.reading_ref
      or v_result.reader_character_id is distinct from v_scope.reader_character_id then
      raise exception using errcode='40001',
        constraint='reader_unified_bind_role_drift',
        message='Additional Reader bind authority scope mismatch';
    end if;
  else
    raise exception using errcode='P0001',
      constraint='reader_unified_bind_role_unavailable',
      message='Official Reader verified purchase role unavailable';
  end if;

  if v_result.product_id is distinct from v_scope.product_id then
    raise exception using errcode='40001',
      constraint='reader_unified_bind_product_drift',
      message='Official Reader Product mismatch after binding';
  end if;

  select * into strict v_after from
    public.internal_acquire_official_reader_purchase_scope_v2(
      p_subject_id,p_purchase_intent_id
    );
  if v_after.purchase_role is distinct from v_scope.purchase_role
     or v_after.product_id is distinct from v_scope.product_id
     or v_after.reading_ref is distinct from v_scope.reading_ref
     or v_after.reader_character_id is distinct from v_scope.reader_character_id then
    raise exception using errcode='40001',
      constraint='reader_unified_bind_scope_drift',
      message='Official Reader Purchase scope changed after binding';
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
$unified_bind_dispatch$;

revoke all on function public.internal_apply_official_reader_verified_receipt_unified_v1(
  uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]
) from public;
revoke all on function public.internal_cmd_bind_official_reader_unified_v1(
  uuid,uuid,uuid,uuid,text,text,jsonb
) from public;

do $unified_purchase_private_acl$
declare v_role text;
begin
 for v_role in select rolname from pg_catalog.pg_roles
   where rolname in ('anon','authenticated','service_role',
       'myeongha_api_executor','myeongha_commerce_internal_executor',
       'myeongha_seyeon_chat_runtime_owner')
 loop
   execute pg_catalog.format(
     'revoke all on function public.internal_apply_official_reader_verified_receipt_unified_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[]) from %I',v_role);
   execute pg_catalog.format(
     'revoke all on function public.internal_cmd_bind_official_reader_unified_v1(uuid,uuid,uuid,uuid,text,text,jsonb) from %I',v_role);
 end loop;
end
$unified_purchase_private_acl$;

comment on function public.internal_apply_official_reader_verified_receipt_unified_v1(
 uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])
is 'D2 PRIVATE verified production Receipt dispatcher: source-derived L0 then L1 if additional, existing 1090 writers only; no Commerce runtime EXECUTE or automatic refund.';
comment on function public.internal_cmd_bind_official_reader_unified_v1(
 uuid,uuid,uuid,uuid,text,text,jsonb)
is 'D2 PRIVATE first/additional Reader bind dispatcher after 1800 Product-first verified purchase scope; original 1220 immutable authority delegated. No public T2.';
