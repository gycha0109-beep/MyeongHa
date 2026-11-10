-- Owner-only candidate. The browser chooses an approved catalog key and, for
-- comparison, an owned target. The DB supplies the Offer and self revision.
create function commerce_saju_private.select_approved_saju_checkout_v1(
  p_subject_id uuid,p_approved_offer_id text,p_idempotency_key text,p_target_person_id uuid
)
returns table(product_offer_id uuid,saju_record_id uuid,birth_revision_id uuid)
language plpgsql security invoker
set search_path=pg_catalog
as $function$
declare
  v_terms record;
  v_offer_id uuid;
  v_record_id uuid;
  v_birth_revision_id uuid;
  v_prior record;
  v_matches integer;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform public.ct_assert_active_member_paid_checkout_v1(p_subject_id);
  select * into v_terms from commerce_saju_private.approved_offer_v1(p_approved_offer_id);
  if not found or (v_terms.counterpart_order is null)<>(p_target_person_id is null) then return; end if;

  -- Use the prior identity even if the self profile now has a newer revision.
  select intent.product_offer_id,origin.saju_record_id,origin.birth_revision_id,scope.admission
    into v_prior
  from public.purchase_intents intent
  left join public.commerce_saju_purchase_origins_v1 origin
    on origin.purchase_intent_id=intent.id and origin.subject_id=intent.subject_id
  left join commerce_saju_private.approved_purchase_scope_v1 scope
    on scope.purchase_intent_id=origin.purchase_intent_id and scope.admission_hash=origin.approved_admission_hash
  where intent.subject_id=p_subject_id and intent.idempotency_key=p_idempotency_key;
  if found then
    if v_prior.admission->>'approvedOfferId' is distinct from p_approved_offer_id
      or v_prior.admission->'counterpart'->>'targetPersonId' is distinct from p_target_person_id::text then
      raise exception using errcode='23505',constraint='approved_saju_replay_conflict',
        message='Approved Saju checkout conflicts with the original selection';
    end if;
    return query select v_prior.product_offer_id,v_prior.saju_record_id,v_prior.birth_revision_id;
    return;
  end if;

  select (array_agg(offer.id))[1],count(*) into v_offer_id,v_matches
  from commerce_saju_private.approved_fulfillment_release_v1 release
  join public.product_offers offer on offer.id=release.product_offer_id
    and offer.capability_set_id=release.capability_set_id
  join public.products product on product.id=offer.product_id
  join public.product_offer_charge_terms terms on terms.product_offer_id=offer.id
  where release.approved_offer_id=p_approved_offer_id and release.revoked_at is null
    and offer.platform='web' and offer.provider='portone_v2' and offer.enabled and offer.retired_at is null
    and product.enabled and product.retired_at is null
    and terms.retired_at is null and terms.currency='KRW' and terms.amount_minor=v_terms.amount_minor;
  if v_matches<>1 then return; end if;

  -- The self profile lock serializes record creation and keeps the selected
  -- revision stable through the exact admission and intent writer transaction.
  select profile.current_revision_id into v_birth_revision_id
  from public.birth_profiles profile
  where profile.subject_id=p_subject_id and profile.profile_kind='self' and profile.archived_at is null
  for update of profile;
  if v_birth_revision_id is null then return; end if;
  select (array_agg(record.id))[1],count(*) into v_record_id,v_matches
  from public.commerce_saju_records_v1 record
  where record.subject_id=p_subject_id and record.birth_revision_id=v_birth_revision_id;
  if v_matches>1 then return; end if;
  if v_matches=0 then
    v_record_id := gen_random_uuid();
    insert into public.commerce_saju_records_v1(id,subject_id,birth_revision_id)
      values (v_record_id,p_subject_id,v_birth_revision_id);
  end if;
  return query select v_offer_id,v_record_id,v_birth_revision_id;
end
$function$;
revoke all on function commerce_saju_private.select_approved_saju_checkout_v1(uuid,text,text,uuid)
  from public,anon,authenticated,service_role,myeongha_api_executor;
