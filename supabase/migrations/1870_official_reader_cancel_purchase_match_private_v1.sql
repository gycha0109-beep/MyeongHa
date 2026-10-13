-- PRIVATE/HELD: compare a signed Provider-cancel observation to the
-- independently persisted payment attempt, verified Receipt and exact
-- one-Grant Official Reader purchase. This is NOT an effect or refund.
-- Synthetic observation rows or an authenticated webhook are not evidence
-- of Commerce/Legal authorization. No runtime grants or callback wiring.
create or replace function public.internal_qry_official_reader_cancel_purchase_match_v1(
  p_observation_id uuid,
  p_provider_event_id uuid,
  p_grant_id uuid
)
returns table(
  match_state text,
  matched_subject_id uuid,
  matched_receipt_id uuid,
  matched_grant_id uuid,
  effect_authorized boolean
)
language plpgsql stable security invoker
set search_path = pg_catalog, public
as $cancel_match$
declare
  v_subject uuid;
  v_receipt uuid;
  v_grant uuid;
begin
  if p_observation_id is null or p_provider_event_id is null
     or p_grant_id is null then
    return query select 'hold'::text,null::uuid,null::uuid,null::uuid,false;
    return;
  end if;

  -- Actual webhook/paymentId→attempt, transaction→receipt and exact purchase
  -- source must all agree. Never infer paymentId from transactionId alone.
  select cr.subject_id,cr.id,g.id
    into v_subject,v_receipt,v_grant
  from public.official_reader_portone_cancel_observation_shadow_v1 s
  join public.commerce_payment_attempts pa
    on pa.provider=s.provider
   and pa.environment='production'
   and pa.provider_request_id=s.payment_id
   and pa.provider_transaction_id=s.transaction_id
   and pa.status='response_received'
  join public.commerce_receipts cr
    on cr.provider=s.provider
   and cr.environment='production'
   and cr.external_transaction_id=s.transaction_id
   and cr.purchase_intent_id=pa.purchase_intent_id
   and cr.product_offer_id=pa.product_offer_id
   and cr.subject_id=pa.subject_id
   and cr.verification_status='verified'
   and cr.verified_amount_minor=s.paid_amount_minor
   and cr.verified_currency=s.currency
  join public.commerce_provider_events pe
    on pe.id=p_provider_event_id
   and pe.provider=s.provider
   and pe.environment='production'
   and pe.event_type='payment.cancelled'
   and pe.status='verified'
   and pe.external_event_id=s.webhook_id
   and pe.external_transaction_id=s.transaction_id
   and pe.resolution_source_type='receipt'
   and pe.resolved_receipt_id=cr.id
   and pe.resolved_subject_id=cr.subject_id
   and pe.payload_fingerprint=s.source_evidence_fingerprint
   and pe.provider_occurred_at=s.event_occurred_at
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id
   and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
   and pi.status='verified'
   and pi.expected_amount_minor=cr.verified_amount_minor
   and pi.expected_currency=cr.verified_currency
  join public.product_offers po
    on po.id=pi.product_offer_id
   and po.provider=s.provider
   and po.product_id is not null
  join public.standard_reading_product_specs spec on spec.product_id=po.product_id
  join public.standard_reading_offer_roles rr
    on rr.product_offer_id=po.id
   and rr.purchase_role in ('initial_reading','additional_reader_interpretation')
  join public.entitlement_grants g
    on g.id=p_grant_id
   and g.source_receipt_id=cr.id
   and g.subject_id=cr.subject_id
   and g.grant_source_type='purchase'
   and g.status='active'
  where s.id=p_observation_id
    and s.provider='portone_v2'
    and s.event_type='Transaction.Cancelled'
    and s.source_disposition='full_candidate'
    and s.shadow_classification='observed'
    and s.paid_amount_minor=s.cancelled_amount_minor
    -- This narrow checker cannot approve multi-Grant effects; that requires
    -- explicit complete-set discovery/locking through 1840+1850.
    and not exists (
      select 1 from public.entitlement_grants other_grant
      where other_grant.source_receipt_id=cr.id
        and other_grant.subject_id=cr.subject_id
        and other_grant.grant_source_type='purchase'
        and other_grant.id<>g.id
    )
    -- A newer or tied observation makes this snapshot insufficient.
    -- Even no competing observation cannot prove provider ordering.
    and not exists (
      select 1
      from public.official_reader_portone_cancel_observation_shadow_v1 later
      where later.provider=s.provider
        and later.payment_id=s.payment_id
        and later.transaction_id=s.transaction_id
        and later.id<>s.id
        and (later.provider_status_changed_at>=s.provider_status_changed_at
             or later.event_occurred_at>=s.event_occurred_at)
    )
  limit 1;

  if v_receipt is null then
    return query select 'hold'::text,null::uuid,null::uuid,null::uuid,false;
  else
    return query select 'review_candidate'::text,v_subject,v_receipt,v_grant,false;
  end if;
end
$cancel_match$;

revoke all on function public.internal_qry_official_reader_cancel_purchase_match_v1(
  uuid,uuid,uuid
) from public;
do $cancel_match_acl$
declare r text;
begin
  for r in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_cancel_purchase_match_v1(uuid,uuid,uuid) from %I',
      r
    );
  end loop;
end
$cancel_match_acl$;
comment on function public.internal_qry_official_reader_cancel_purchase_match_v1(
  uuid,uuid,uuid
) is 'PRIVATE review-only official Reader cancellation paymentId->Attempt->verified Receipt/Event->Purchase Intent/Offer->one active Grant matching; always effect_authorized=false, no runtime grants.';
