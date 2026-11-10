-- Isolated candidate, loaded after the approved checkout registries. The
-- Commerce role may be granted this narrow receipt-only command in a separate
-- approved rollout. No runtime role is granted access here.
create function public.internal_fulfill_verified_approved_saju_receipt_v1(p_receipt_id uuid)
returns table (outcome text, grant_count integer)
language plpgsql security definer
set search_path = pg_catalog
as $function$
declare
  v_receipt public.commerce_receipts%rowtype;
  v_origin public.commerce_saju_purchase_origins_v1%rowtype;
  v_scope commerce_saju_private.approved_purchase_scope_v1%rowtype;
  v_fields text[];
  v_count integer;
  v_replay_count integer;
  v_counterpart jsonb;
begin
  select * into v_receipt from public.commerce_receipts where id=p_receipt_id for update;
  if not found then
    return query select 'not_approved_saju'::text,0;
    return;
  end if;
  select * into v_origin from public.commerce_saju_purchase_origins_v1
    where purchase_intent_id=v_receipt.purchase_intent_id and subject_id=v_receipt.subject_id;
  if v_origin.approved_admission_hash is null then
    return query select 'not_approved_saju'::text,0;
    return;
  end if;
  select * into v_scope from commerce_saju_private.approved_purchase_scope_v1
    where purchase_intent_id=v_origin.purchase_intent_id and admission_hash=v_origin.approved_admission_hash;
  if not found then
    raise exception using errcode='P0001', constraint='approved_saju_receipt_scope_missing',
      message='Approved Saju receipt has no exact purchase scope';
  end if;
  if v_receipt.verification_status<>'verified' or v_receipt.environment is distinct from 'production'
     or v_receipt.provider<>'portone_v2' or v_receipt.platform<>'web' or v_receipt.verified_at is null then
    raise exception using errcode='P0001', message='Approved Saju verified receipt is unavailable';
  end if;
  if exists (
    select 1 from public.commerce_provider_events event
    where event.resolved_receipt_id=v_receipt.id and event.resolved_subject_id=v_receipt.subject_id
      and event.provider=v_receipt.provider and event.environment=v_receipt.environment
      and event.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
      and event.status in ('received','verified','processed','unresolved')
  ) then
    raise exception using errcode='P0001', message='Approved Saju receipt has cancellation evidence';
  end if;
  if not exists (
    select 1 from commerce_saju_private.approved_fulfillment_release_v1 release
    where release.product_offer_id=v_receipt.product_offer_id and release.revoked_at is null
      and release.capability_set_id::text=v_scope.admission->>'capabilitySetId'
      and release.approved_offer_id=v_scope.admission->>'approvedOfferId'
      and release.components @> (v_scope.admission->'components')
      and release.components <@ (v_scope.admission->'components')
    for share
  ) then
    raise exception using errcode='P0001', message='Approved Saju fulfillment release is unavailable';
  end if;
  v_counterpart := v_scope.admission->'counterpart';
  if v_counterpart is not null and not exists (
    select 1 from commerce_saju_private.comparison_use_approval_v1 approval
    join public.target_person_profiles target on target.id=approval.target_person_id
      and target.subject_id=approval.subject_id and target.deleted_at is null
    join public.birth_profiles birth on birth.id=target.birth_profile_id and birth.subject_id=target.subject_id
      and birth.profile_kind='target' and birth.archived_at is null
      and birth.current_revision_id=approval.target_birth_revision_id
    where approval.approval_ref=v_counterpart->>'useApprovalRef'
      and approval.subject_id=v_receipt.subject_id and approval.birth_revision_id=v_origin.birth_revision_id
      and approval.target_person_id::text=v_counterpart->>'targetPersonId'
      and approval.target_birth_revision_id::text=v_counterpart->>'targetBirthRevisionId'
      and approval.revoked_at is null and approval.valid_until>clock_timestamp()
    for share of approval,target,birth
  ) then
    raise exception using errcode='P0001', constraint='approved_saju_receipt_target_use_unavailable',
      message='Approved Saju receipt target use is unavailable';
  end if;

  select array_agg(item.item_key order by item.item_key) into v_fields
  from public.purchase_intents intent
  join public.product_capability_items item on item.capability_set_id=intent.capability_set_id
  where intent.id=v_origin.purchase_intent_id and item.validity_mode='unbounded'
    and v_scope.component_scope_keys ? item.item_key;
  v_count := cardinality(v_fields);
  if v_count is null or v_count<>(select count(*) from jsonb_object_keys(v_scope.component_scope_keys)) then
    raise exception using errcode='P0001', message='Approved Saju receipt capabilities are unavailable';
  end if;
  select count(*),count(*) filter (where result_replayed) into grant_count,v_replay_count
  from public.internal_apply_verified_receipt_capability_effects_v1(
    v_receipt.id,v_fields,
    array_fill(v_receipt.verified_at,array[v_count]),array_fill(v_receipt.verified_at,array[v_count]),
    array_fill(null::timestamptz,array[v_count]),array_fill('approved-saju-purchase-v1'::text,array[v_count])
  );
  if grant_count<>v_count then
    raise exception using errcode='P0001', message='Approved Saju receipt grant batch is incomplete';
  end if;
  outcome := case when v_replay_count=grant_count then 'replayed' else 'granted' end;
  return next;
end
$function$;
revoke all on function public.internal_fulfill_verified_approved_saju_receipt_v1(uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor,myeongha_commerce_internal_executor;
