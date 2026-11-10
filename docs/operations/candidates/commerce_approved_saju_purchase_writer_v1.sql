-- Owner-only isolated candidate. Load after commerce_approved_saju_purchase_scope_v1.
-- The two registries are empty; this does not release any Product or target data.
create table commerce_saju_private.approved_fulfillment_release_v1 (
  product_offer_id uuid primary key references public.product_offers(id),
  approved_offer_id text not null,
  capability_set_id uuid not null references public.product_capability_sets(id),
  components jsonb not null check (jsonb_typeof(components) = 'array'),
  revoked_at timestamptz
);
create table commerce_saju_private.comparison_use_approval_v1 (
  approval_ref text primary key check (length(approval_ref) between 1 and 200),
  subject_id uuid not null,
  target_person_id uuid not null,
  birth_revision_id uuid not null,
  target_birth_revision_id uuid not null,
  valid_until timestamptz not null,
  revoked_at timestamptz,
  foreign key (target_person_id, subject_id) references public.target_person_profiles(id, subject_id) on delete cascade
);
create index comparison_use_approval_target_v1_idx
  on commerce_saju_private.comparison_use_approval_v1(target_person_id, subject_id);
create index approved_fulfillment_release_capability_v1_idx
  on commerce_saju_private.approved_fulfillment_release_v1(capability_set_id);
alter table commerce_saju_private.approved_fulfillment_release_v1 enable row level security;
alter table commerce_saju_private.comparison_use_approval_v1 enable row level security;
revoke all on commerce_saju_private.approved_fulfillment_release_v1,
  commerce_saju_private.comparison_use_approval_v1 from public, anon, authenticated, service_role;

create function commerce_saju_private.resolve_approved_purchase_admission_v1(
  p_subject_id uuid, p_record_id uuid, p_birth_revision_id uuid, p_offer_id uuid,
  p_capability_set_id uuid, p_approved_offer_id text, p_idempotency_key text, p_target_person_id uuid
)
returns jsonb
language plpgsql security invoker
set search_path = pg_catalog
as $function$
declare
  v_offer record;
  v_components jsonb;
  v_prior jsonb;
  v_admission jsonb;
  v_target jsonb;
  v_as_of timestamptz := clock_timestamp();
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform public.ct_assert_active_member_paid_checkout_v1(p_subject_id);
  if not exists (
    select 1 from public.commerce_saju_records_v1
    where id = p_record_id and subject_id = p_subject_id and birth_revision_id = p_birth_revision_id
  ) then return null; end if;
  select * into v_offer from commerce_saju_private.approved_offer_v1(p_approved_offer_id);
  if not found or (p_target_person_id is null) <> (v_offer.counterpart_order is null) then
    return null;
  end if;
  select release.components into v_components
  from commerce_saju_private.approved_fulfillment_release_v1 release
  join public.product_offers offer on offer.id = release.product_offer_id
  join public.products product on product.id = offer.product_id
  join public.product_offer_charge_terms terms on terms.product_offer_id = offer.id
  where release.product_offer_id = p_offer_id and release.approved_offer_id = p_approved_offer_id
    and release.capability_set_id = p_capability_set_id and release.revoked_at is null
    and offer.capability_set_id = p_capability_set_id and offer.platform = 'web' and offer.provider = 'portone_v2'
    and offer.enabled and offer.retired_at is null and product.enabled and product.retired_at is null
    and terms.retired_at is null and terms.amount_minor = v_offer.amount_minor and terms.currency = 'KRW';
  if not found then return null; end if;

  select scope.admission into v_prior
  from public.purchase_intents intent
  left join commerce_saju_private.approved_purchase_scope_v1 scope on scope.purchase_intent_id = intent.id
  where intent.subject_id = p_subject_id and intent.idempotency_key = p_idempotency_key;
  if found then
    if v_prior->>'approvedOfferId' is distinct from p_approved_offer_id
      or v_prior->>'productOfferId' is distinct from p_offer_id::text
      or v_prior->>'sajuRecordId' is distinct from p_record_id::text
      or v_prior->>'birthRevisionId' is distinct from p_birth_revision_id::text
      or v_prior->'counterpart'->>'targetPersonId' is distinct from p_target_person_id::text then
      raise exception using errcode = '23505', constraint = 'approved_saju_replay_conflict',
        message = 'Approved Saju replay must retain its existing scope';
    end if;
    return v_prior;
  end if;

  v_admission := jsonb_build_object(
    'policy','approved-saju-2026-11-06','approvedOfferId',p_approved_offer_id,'subjectId',p_subject_id,
    'sajuRecordId',p_record_id,'birthRevisionId',p_birth_revision_id,'productOfferId',p_offer_id,
    'capabilitySetId',p_capability_set_id,'currency','KRW','amountMinor',v_offer.amount_minor,
    'components',v_components);
  if v_offer.fields && array['year','month'] then
    v_admission := v_admission || jsonb_build_object('periodReferenceDateTime',
      to_char(timezone('UTC', v_as_of),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;
  if p_target_person_id is not null then
    select case when count(*) = 1 then (jsonb_agg(approval.value)->0) else null end into v_target
    from (
      select jsonb_build_object('targetPersonId',target.id,'targetBirthRevisionId',birth.current_revision_id,
        'order',v_offer.counterpart_order,'useApprovalRef',use_approval.approval_ref) value
      from public.target_person_profiles target
      join public.birth_profiles birth on birth.id = target.birth_profile_id and birth.subject_id = target.subject_id
      join commerce_saju_private.comparison_use_approval_v1 use_approval
        on use_approval.target_person_id = target.id and use_approval.subject_id = target.subject_id
        and use_approval.target_birth_revision_id = birth.current_revision_id
      where target.id = p_target_person_id and target.subject_id = p_subject_id and target.deleted_at is null
        and birth.archived_at is null and birth.profile_kind = 'target'
        and use_approval.birth_revision_id = p_birth_revision_id and use_approval.revoked_at is null
        and use_approval.valid_until > v_as_of
      limit 2
    ) approval;
    if v_target is null then return null; end if;
    v_admission := v_admission || jsonb_build_object('counterpart',v_target);
  end if;
  return v_admission;
end
$function$;
revoke all on function commerce_saju_private.resolve_approved_purchase_admission_v1(
  uuid,uuid,uuid,uuid,uuid,text,text,uuid
) from public, anon, authenticated, service_role, myeongha_api_executor;

create function commerce_saju_private.create_approved_purchase_intent_v1(
  p_subject_id uuid, p_intent_id uuid, p_record_id uuid, p_birth_revision_id uuid,
  p_offer_id uuid, p_idempotency_key text, p_request_hash text,
  p_offer_snapshot jsonb, p_offer_hash text, p_capability_snapshot jsonb, p_capability_hash text,
  p_admission_text text, p_admission_hash text
)
returns table (
  purchase_intent_id uuid, product_offer_id uuid, provider_account_link_id uuid, status text,
  offer_snapshot_jsonb jsonb, offer_snapshot_hash text, expected_amount_minor bigint, expected_currency text,
  charge_terms_version text, capability_set_id uuid, capability_snapshot_jsonb jsonb,
  capability_snapshot_hash text, replayed boolean, approved_admission_hash text
)
language plpgsql security invoker
set search_path = pg_catalog
as $function$
#variable_conflict use_column
declare
  v_record public.commerce_saju_records_v1%rowtype;
  v_admission jsonb;
  v_intent record;
  v_keys jsonb;
  v_target jsonb;
  v_has_paid_comparison boolean;
  v_target_already_paid boolean;
  v_as_of timestamptz;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '23514', message = 'Approved Saju purchase requires read committed';
  end if;
  perform public.ct_assert_active_member_paid_checkout_v1(p_subject_id);
  select * into strict v_record from public.commerce_saju_records_v1
    where id = p_record_id and subject_id = p_subject_id and birth_revision_id = p_birth_revision_id for update;
  v_as_of := clock_timestamp();
  if p_admission_text is null or octet_length(p_admission_text) > 8192
     or p_admission_hash is distinct from 'sha256:v1:' ||
       encode(sha256(convert_to(p_admission_text, 'UTF8')), 'hex') then
    raise exception using errcode = '23514', message = 'Approved Saju admission hash mismatch';
  end if;
  v_admission := p_admission_text::jsonb;
  if not exists (
    select 1 from commerce_saju_private.approved_fulfillment_release_v1 release
    where release.product_offer_id = p_offer_id and release.revoked_at is null
      and release.approved_offer_id = v_admission->>'approvedOfferId'
      and release.capability_set_id::text = p_capability_snapshot->>'capabilitySetId'
      and release.components @> (v_admission->'components')
      and release.components <@ (v_admission->'components')
    for share
  ) then
    raise exception using errcode = 'P0001', constraint = 'approved_saju_fulfillment_unavailable',
      message = 'Approved Saju fulfillment is unavailable';
  end if;
  v_target := v_admission->'counterpart';
  if v_target is not null and not exists (
    select 1 from commerce_saju_private.comparison_use_approval_v1 approval
    join public.target_person_profiles target on target.id = approval.target_person_id
      and target.subject_id = approval.subject_id and target.deleted_at is null
    join public.birth_profiles birth on birth.id = target.birth_profile_id and birth.subject_id = target.subject_id
      and birth.archived_at is null and birth.profile_kind = 'target'
      and birth.current_revision_id = approval.target_birth_revision_id
    where approval.approval_ref = v_target->>'useApprovalRef' and approval.subject_id = p_subject_id
      and approval.birth_revision_id = p_birth_revision_id and approval.revoked_at is null
      and approval.valid_until > v_as_of
      and approval.target_person_id::text = v_target->>'targetPersonId'
      and approval.target_birth_revision_id::text = v_target->>'targetBirthRevisionId'
    for share of target, birth, approval
  ) then
    raise exception using errcode = 'P0001', constraint = 'approved_saju_target_use_unavailable',
      message = 'Approved Saju target use is unavailable';
  end if;

  insert into public.commerce_saju_purchase_admission_context_v1
    (backend_pid,transaction_id,subject_id,saju_record_id,birth_revision_id,product_offer_id,approved_purchase_intent_id)
  values (pg_backend_pid(),txid_current(),p_subject_id,p_record_id,p_birth_revision_id,p_offer_id,p_intent_id);
  select * into strict v_intent from public.cmd_create_purchase_intent_v3(
    p_subject_id,p_intent_id,p_offer_id,null,p_idempotency_key,p_request_hash,
    p_offer_snapshot,p_offer_hash,p_capability_snapshot,p_capability_hash);
  if v_intent.replayed then
    if not exists (
      select 1 from commerce_saju_private.approved_purchase_scope_v1 scope
      join public.commerce_saju_purchase_origins_v1 origin using (purchase_intent_id)
      where origin.purchase_intent_id = v_intent.purchase_intent_id and origin.subject_id = p_subject_id
        and origin.saju_record_id = p_record_id and origin.birth_revision_id = p_birth_revision_id
        and scope.admission_hash = p_admission_hash
    ) then
      raise exception using errcode = '23505', constraint = 'approved_saju_replay_conflict',
        message = 'Approved Saju replay must retain its existing scope';
    end if;
  else
    insert into public.commerce_saju_purchase_origins_v1
      (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
    values (v_intent.purchase_intent_id,p_subject_id,p_record_id,p_birth_revision_id,'original');
    v_keys := commerce_saju_private.bind_approved_purchase_scope_v1(
      p_subject_id,v_intent.purchase_intent_id,p_admission_text,p_admission_hash);

    if exists (
      select 1 from jsonb_each_text(v_keys) component(field, scope_key)
      join public.entitlement_grants grant_row
        on grant_row.subject_id = p_subject_id
        and grant_row.entitlement_key = public.internal_commerce_saju_entitlement_key_v1(component.field)
        and grant_row.scope_key in (component.scope_key, 'saju-record:' || v_record.entitlement_scope_id::text)
      where grant_row.status = 'active' and grant_row.valid_from <= v_as_of
        and (grant_row.valid_until is null or grant_row.valid_until > v_as_of)
    ) or exists (
      select 1 from public.commerce_saju_purchase_origins_v1 prior
      join public.purchase_intents intent on intent.id = prior.purchase_intent_id and intent.subject_id = prior.subject_id
      join public.product_offers offer on offer.id = intent.product_offer_id
      join public.products product on product.id = offer.product_id
      left join commerce_saju_private.approved_purchase_scope_v1 scope using (purchase_intent_id)
      where prior.subject_id = p_subject_id and prior.saju_record_id = p_record_id
        and prior.birth_revision_id = p_birth_revision_id and prior.purchase_intent_id <> v_intent.purchase_intent_id
        and intent.status in ('created','pending') and (
          (scope.purchase_intent_id is null and coalesce(
             public.internal_commerce_saju_product_fields_v1(product.product_key)
               && array(select jsonb_object_keys(v_keys)), true))
          or exists (
            select 1 from jsonb_each_text(v_keys) component(field, scope_key)
            where scope.component_scope_keys->>component.field = component.scope_key
          )
          or (v_target is not null and scope.admission->'counterpart' is not null and (
            scope.admission->'counterpart'->>'targetPersonId' = v_target->>'targetPersonId'
            or (scope.admission->'counterpart'->>'order' = 'first' and v_target->>'order' = 'first')
          ))
        )
    ) then
      raise exception using errcode = '23505', constraint = 'approved_saju_scope_conflict',
        message = 'Approved Saju scope is already held or pending';
    end if;

    -- A provider cancellation must settle before a related purchase may
    -- proceed or a previous comparison can determine the next price.
    if exists (
      select 1 from public.commerce_saju_purchase_origins_v1 prior
      join public.purchase_intents intent on intent.id = prior.purchase_intent_id and intent.subject_id = prior.subject_id
      join public.commerce_receipts receipt on receipt.purchase_intent_id = intent.id and receipt.subject_id = intent.subject_id
      join public.commerce_provider_events event on event.resolved_receipt_id = receipt.id
        and event.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
        and event.status in ('received','verified','processed','unresolved')
      left join commerce_saju_private.approved_purchase_scope_v1 scope on scope.purchase_intent_id = intent.id
      where prior.subject_id = p_subject_id and prior.saju_record_id = p_record_id
        and prior.birth_revision_id = p_birth_revision_id
        and (scope.purchase_intent_id is null
          or (v_target is not null and scope.component_scope_keys ? 'compatibility')
          or exists (
            select 1 from jsonb_each_text(v_keys) component(field, scope_key)
            where scope.component_scope_keys->>component.field = component.scope_key
          ))
        and not exists (
          select 1 from public.commerce_saju_verified_refund_effects_v1 settled
          where settled.provider_event_id = event.id and settled.receipt_id = receipt.id
        )
    ) then
      raise exception using errcode = 'P0001', constraint = 'approved_saju_cancellation_pending',
        message = 'Approved Saju purchase has an unsettled related cancellation';
    end if;

    if v_target is not null then
      select coalesce(bool_or(scope.admission->'counterpart'->>'targetPersonId' <> v_target->>'targetPersonId'),false),
             coalesce(bool_or(scope.admission->'counterpart'->>'targetPersonId' = v_target->>'targetPersonId'),false)
        into v_has_paid_comparison,v_target_already_paid
        from public.commerce_saju_purchase_origins_v1 prior
        join commerce_saju_private.approved_purchase_scope_v1 scope using (purchase_intent_id)
        join public.purchase_intents intent on intent.id = prior.purchase_intent_id
          and intent.subject_id = prior.subject_id and intent.status = 'verified'
        join public.commerce_receipts receipt on receipt.purchase_intent_id = prior.purchase_intent_id
          and receipt.subject_id = prior.subject_id and receipt.verification_status = 'verified'
          and receipt.environment = 'production' and receipt.provider = 'portone_v2' and receipt.platform = 'web'
          and receipt.product_offer_id = intent.product_offer_id
          and receipt.verified_amount_minor = intent.expected_amount_minor
          and receipt.verified_currency = intent.expected_currency
        join public.entitlement_grants grant_row on grant_row.source_receipt_id = receipt.id
          and grant_row.subject_id = receipt.subject_id and grant_row.entitlement_key = 'saju.compatibility'
          and grant_row.scope_key = scope.component_scope_keys->>'compatibility'
          and grant_row.grant_source_type = 'purchase' and grant_row.status = 'active' and grant_row.valid_from <= v_as_of
          and (grant_row.valid_until is null or grant_row.valid_until > v_as_of)
        where prior.subject_id = p_subject_id and prior.saju_record_id = p_record_id
          and prior.birth_revision_id = p_birth_revision_id;
      if v_target_already_paid or (v_target->>'order' = 'additional') is distinct from v_has_paid_comparison then
        raise exception using errcode = 'P0001', constraint = 'approved_saju_counterpart_order_unavailable',
          message = 'Approved Saju comparison order is unavailable';
      end if;
    end if;
  end if;
  delete from public.commerce_saju_purchase_admission_context_v1
    where backend_pid = pg_backend_pid() and transaction_id = txid_current();
  return query select
    v_intent.purchase_intent_id,v_intent.product_offer_id,v_intent.provider_account_link_id,v_intent.status,
    v_intent.offer_snapshot_jsonb,v_intent.offer_snapshot_hash,v_intent.expected_amount_minor,v_intent.expected_currency,
    v_intent.charge_terms_version,v_intent.capability_set_id,v_intent.capability_snapshot_jsonb,
    v_intent.capability_snapshot_hash,v_intent.replayed,p_admission_hash;
end
$function$;
revoke all on function commerce_saju_private.create_approved_purchase_intent_v1(
  uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text,text,text
) from public, anon, authenticated, service_role, myeongha_api_executor;
