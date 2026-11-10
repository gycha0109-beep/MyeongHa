-- Isolated sandbox only. Load after the approved checkout writer.
create function commerce_saju_private.assert_approved_saju_payment_ready_v1(
  p_subject_id uuid,p_purchase_intent_id uuid
)
returns void
language plpgsql security invoker
set search_path=pg_catalog
as $function$
declare
  v_scope record;
  v_target jsonb;
  v_as_of timestamptz;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform public.ct_assert_active_member_paid_checkout_v1(p_subject_id);
  select scope.admission,origin.saju_record_id,origin.birth_revision_id into v_scope
  from public.purchase_intents intent
  join public.commerce_saju_purchase_origins_v1 origin
    on origin.purchase_intent_id=intent.id and origin.subject_id=intent.subject_id
  join commerce_saju_private.approved_purchase_scope_v1 scope
    on scope.purchase_intent_id=origin.purchase_intent_id and scope.admission_hash=origin.approved_admission_hash
  join commerce_saju_private.approved_fulfillment_release_v1 release on release.product_offer_id=intent.product_offer_id
    and release.capability_set_id=intent.capability_set_id and release.revoked_at is null
    and release.approved_offer_id=scope.admission->>'approvedOfferId'
    and release.components @> (scope.admission->'components') and release.components <@ (scope.admission->'components')
  join public.product_offers offer on offer.id=intent.product_offer_id and offer.enabled and offer.retired_at is null
    and offer.platform='web' and offer.provider='portone_v2'
  join public.products product on product.id=offer.product_id and product.enabled and product.retired_at is null
  join public.product_offer_charge_terms terms on terms.product_offer_id=offer.id and terms.retired_at is null
    and terms.terms_version=intent.charge_terms_version
    and terms.amount_minor=intent.expected_amount_minor and terms.currency=intent.expected_currency
  where intent.id=p_purchase_intent_id and intent.subject_id=p_subject_id and intent.status in ('created','pending')
    and intent.expected_amount_minor::text=scope.admission->>'amountMinor'
    and intent.expected_currency='KRW' and scope.admission->>'currency'='KRW'
  for update of intent for share of release,offer,product,terms;
  if not found then
    raise exception using errcode='P0001',constraint='approved_saju_payment_unavailable',
      message='Approved Saju checkout is unavailable';
  end if;
  v_as_of := clock_timestamp();
  v_target := v_scope.admission->'counterpart';
  if v_target is not null and (not exists (
    select 1 from commerce_saju_private.comparison_use_approval_v1 approval
    join public.target_person_profiles target on target.id=approval.target_person_id
      and target.subject_id=approval.subject_id and target.deleted_at is null
    join public.birth_profiles birth on birth.id=target.birth_profile_id and birth.subject_id=target.subject_id
      and birth.profile_kind='target' and birth.archived_at is null
      and birth.current_revision_id=approval.target_birth_revision_id
    where approval.subject_id=p_subject_id and approval.birth_revision_id=v_scope.birth_revision_id
      and approval.approval_ref=v_target->>'useApprovalRef' and approval.target_person_id::text=v_target->>'targetPersonId'
      and approval.target_birth_revision_id::text=v_target->>'targetBirthRevisionId'
      and approval.revoked_at is null and approval.valid_until>v_as_of
    for share of approval,target,birth
  ) or commerce_saju_private.current_approved_saju_comparison_order_v1(
    p_subject_id,v_scope.saju_record_id,v_scope.birth_revision_id,v_target->>'targetPersonId',v_as_of
  ) is distinct from v_target->>'order') then
    raise exception using errcode='P0001',constraint='approved_saju_payment_unavailable',
      message='Approved Saju comparison checkout is unavailable';
  end if;
end
$function$;

create function commerce_saju_private.create_approved_saju_sandbox_attempt_v1(
  p_subject_id uuid,p_payment_attempt_id uuid,p_purchase_intent_id uuid,
  p_environment text,p_idempotency_key text,p_provider_request_id text
)
returns table(payment_attempt_id uuid,purchase_intent_id uuid,product_offer_id uuid,attempt_no integer,
  provider text,environment text,provider_request_id text,provider_transaction_id text,status text,replayed boolean)
language plpgsql security invoker
set search_path=pg_catalog
as $function$
begin
  if p_environment is distinct from 'sandbox'
    or (p_provider_request_id ~ '^[A-Za-z0-9_-]{6,40}$') is not true then
    raise exception using errcode='P0001',constraint='approved_saju_payment_unavailable',
      message='Approved Saju payment environment is unavailable';
  end if;
  perform commerce_saju_private.assert_approved_saju_payment_ready_v1(p_subject_id,p_purchase_intent_id);
  if exists (
    select 1 from public.commerce_payment_attempts attempt
    where attempt.purchase_intent_id=p_purchase_intent_id and attempt.subject_id=p_subject_id
      and attempt.idempotency_key is distinct from p_idempotency_key
      and attempt.status in ('created','handed_off','response_received')
  ) then
    raise exception using errcode='23505',constraint='cmd_payment_attempt_v1_idempotency_conflict',
      message='An active attempt already exists for this checkout';
  end if;
  return query select * from public.cmd_create_payment_attempt_v1(
    p_subject_id,p_payment_attempt_id,p_purchase_intent_id,p_environment,p_idempotency_key,p_provider_request_id);
end
$function$;

create function commerce_saju_private.read_approved_saju_sandbox_handoff_v1(
  p_subject_id uuid,p_attempt_id uuid,p_approved_offer_id text
)
returns table(payment_attempt_id uuid,provider text,environment text,provider_request_id text,
  expected_amount_minor bigint,expected_currency text,status text)
language plpgsql security invoker
set search_path=pg_catalog
as $function$
declare
  v_intent_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  select attempt.purchase_intent_id into v_intent_id from public.commerce_payment_attempts attempt
    join commerce_saju_private.approved_purchase_scope_v1 scope on scope.purchase_intent_id=attempt.purchase_intent_id
    where attempt.id=p_attempt_id and attempt.subject_id=p_subject_id and attempt.environment='sandbox'
      and scope.admission->>'approvedOfferId'=p_approved_offer_id
      and attempt.provider='portone_v2' and attempt.status='created';
  if v_intent_id is null then
    raise exception using errcode='P0001',constraint='approved_saju_payment_unavailable',
      message='Approved Saju payment attempt is unavailable';
  end if;
  perform commerce_saju_private.assert_approved_saju_payment_ready_v1(p_subject_id,v_intent_id);
  return query select * from public.qry_commerce_payment_attempt_handoff_context_v1(p_subject_id,p_attempt_id);
end
$function$;
revoke all on function commerce_saju_private.assert_approved_saju_payment_ready_v1(uuid,uuid),
  commerce_saju_private.create_approved_saju_sandbox_attempt_v1(uuid,uuid,uuid,text,text,text),
  commerce_saju_private.read_approved_saju_sandbox_handoff_v1(uuid,uuid,text)
  from public,anon,authenticated,service_role,myeongha_api_executor;
