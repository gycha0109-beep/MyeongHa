-- Review candidate. Install after checkout, payment handoff and archive
-- candidates. Runtime grants are a separate, reversible step.
create function public.select_approved_saju_checkout_v1(uuid,text,text,uuid)
returns table(product_offer_id uuid,saju_record_id uuid,birth_revision_id uuid)
language sql volatile security definer set search_path=pg_catalog
as $function$
  select * from commerce_saju_private.select_approved_saju_checkout_v1($1,$2,$3,$4)
$function$;

create function public.resolve_approved_purchase_admission_v1(uuid,uuid,uuid,uuid,uuid,text,text,uuid)
returns jsonb
language sql volatile security definer set search_path=pg_catalog
as $function$
  select commerce_saju_private.resolve_approved_purchase_admission_v1($1,$2,$3,$4,$5,$6,$7,$8)
$function$;

create function public.create_approved_purchase_intent_v1(
  p_subject_id uuid,p_intent_id uuid,p_record_id uuid,p_birth_revision_id uuid,p_offer_id uuid,
  p_idempotency_key text,p_request_hash text,p_offer_snapshot jsonb,p_offer_hash text,
  p_capability_snapshot jsonb,p_capability_hash text,p_admission_text text,p_admission_hash text
)
returns table(
  purchase_intent_id uuid,product_offer_id uuid,provider_account_link_id uuid,status text,
  offer_snapshot_jsonb jsonb,offer_snapshot_hash text,expected_amount_minor bigint,expected_currency text,
  charge_terms_version text,capability_set_id uuid,capability_snapshot_jsonb jsonb,
  capability_snapshot_hash text,replayed boolean,approved_admission_hash text
)
language plpgsql volatile security definer set search_path=pg_catalog
as $function$
declare
  v_admission jsonb;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_admission_text is null or octet_length(p_admission_text)>8192 then
    raise exception using errcode='23514',message='Approved Saju admission is invalid';
  end if;
  v_admission := p_admission_text::jsonb;
  if not exists (
    select 1 from commerce_saju_private.select_approved_saju_checkout_v1(
      p_subject_id,v_admission->>'approvedOfferId',p_idempotency_key,
      (v_admission->'counterpart'->>'targetPersonId')::uuid
    ) selected
    where selected.product_offer_id=p_offer_id and selected.saju_record_id=p_record_id
      and selected.birth_revision_id=p_birth_revision_id
  ) then
    raise exception using errcode='P0001',constraint='approved_saju_fulfillment_unavailable',
      message='Approved Saju checkout selection is unavailable';
  end if;
  return query select * from commerce_saju_private.create_approved_purchase_intent_v1(
    p_subject_id,p_intent_id,p_record_id,p_birth_revision_id,p_offer_id,p_idempotency_key,p_request_hash,
    p_offer_snapshot,p_offer_hash,p_capability_snapshot,p_capability_hash,p_admission_text,p_admission_hash
  );
end
$function$;

create function public.create_approved_saju_sandbox_attempt_v1(uuid,uuid,uuid,text,text,text)
returns table(payment_attempt_id uuid,purchase_intent_id uuid,product_offer_id uuid,attempt_no integer,
  provider text,environment text,provider_request_id text,provider_transaction_id text,status text,replayed boolean)
language sql volatile security definer set search_path=pg_catalog
as $function$
  select * from commerce_saju_private.create_approved_saju_sandbox_attempt_v1($1,$2,$3,$4,$5,$6)
$function$;

create function public.read_approved_saju_sandbox_handoff_v1(uuid,uuid,text)
returns table(payment_attempt_id uuid,provider text,environment text,provider_request_id text,
  expected_amount_minor bigint,expected_currency text,status text,external_product_id text)
language sql volatile security definer set search_path=pg_catalog
as $function$
  select * from commerce_saju_private.read_approved_saju_sandbox_handoff_v1($1,$2,$3)
$function$;

revoke all on function
  public.select_approved_saju_checkout_v1(uuid,text,text,uuid),
  public.resolve_approved_purchase_admission_v1(uuid,uuid,uuid,uuid,uuid,text,text,uuid),
  public.create_approved_purchase_intent_v1(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text,text,text),
  public.create_approved_saju_sandbox_attempt_v1(uuid,uuid,uuid,text,text,text),
  public.read_approved_saju_sandbox_handoff_v1(uuid,uuid,text)
  from public,anon,authenticated,service_role,myeongha_api_executor;
