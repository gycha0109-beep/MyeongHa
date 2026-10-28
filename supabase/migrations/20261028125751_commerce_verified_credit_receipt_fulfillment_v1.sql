-- Watchtower-Track: commerce-payment
-- Existing approved 300/KRW1900/non-expiring terms. No LIVE checkout or catalog enablement.
-- Saleability flags do not cancel an already verified purchased right.
begin;
create or replace function public.internal_cmd_chat_credit_verified_topup_v1(
  p_subject_id uuid,p_receipt_id uuid,p_approved_offer_id uuid,
  p_validity_mode text,p_validity_days integer
)
returns table(lot_id uuid,issued boolean,available_credits bigint,total_credits bigint)
language plpgsql volatile security definer
set search_path=pg_catalog,public
set row_security=off
as $mint$
declare v_id uuid; v_existing public.chat_credit_lots_v1%rowtype;
  v_issued boolean:=false;
begin
  if p_subject_id is null or p_receipt_id is null or p_approved_offer_id is null
     or p_validity_mode is distinct from 'never' or p_validity_days is not null then
    raise exception 'Paid credits require approved non-expiring policy';
  end if;
  perform 1 from public.subjects
   where id=p_subject_id and kind='member' and status='active' for update;
  if not found then raise exception 'Paid Credit owner is not active'; end if;
  perform 1 from public.commerce_receipts cr
    join public.purchase_intents pi on pi.id=cr.purchase_intent_id
      and pi.subject_id=cr.subject_id and pi.product_offer_id=cr.product_offer_id
    join public.product_offers po on po.id=cr.product_offer_id
    join public.products p on p.id=po.product_id
    join public.product_capability_sets pcs
      on pcs.id=pi.capability_set_id and pcs.product_id=p.id
   where cr.id=p_receipt_id and cr.subject_id=p_subject_id
     and cr.product_offer_id=p_approved_offer_id
     and cr.provider='portone_v2' and cr.platform='web'
     and cr.environment='production' and cr.verification_status='verified'
     and cr.verified_payload_jsonb->>'currentState'='active'
     and pi.charge_terms_version='krw-1900-v1'
     and cr.verified_at is not null
     and cr.verified_amount_minor=1900 and cr.verified_currency='KRW'
     and cr.external_transaction_id<>'' and cr.receipt_fingerprint<>''
     and pi.status='verified' and pi.expected_amount_minor=1900
     and pi.expected_currency='KRW' and pi.capability_snapshot_hash is not null
     and pi.capability_snapshot_jsonb=pg_catalog.jsonb_build_object(
       'capabilitySetId',pcs.id::text,
       'definitionVersion',pcs.definition_version,
       'definitionHash',pcs.definition_hash
     )
     and po.provider='portone_v2' and po.platform='web'
     and exists(select 1 from public.product_offer_charge_terms ct
       where ct.product_offer_id=pi.product_offer_id and ct.terms_version=pi.charge_terms_version
         and ct.amount_minor=1900 and ct.currency='KRW')
     and exists(select 1 from public.commerce_payment_attempts pa
       where pa.purchase_intent_id=pi.id and pa.subject_id=cr.subject_id
         and pa.product_offer_id=cr.product_offer_id and pa.provider=cr.provider
         and pa.environment=cr.environment and pa.provider_transaction_id=cr.external_transaction_id)
     and p.product_key='chat_credits_300_v1' and p.product_type='credit'
   for share of cr,pi,po,p,pcs;
  if not found then raise exception 'Verified PortOne receipt is not eligible'; end if;
  select * into v_existing from public.chat_credit_lots_v1
    where source_kind='portone_topup' and source_ref=p_receipt_id for update;
  if found then
    if v_existing.subject_id<>p_subject_id
      or v_existing.credits_issued<>300 or v_existing.expires_at is not null
    then raise exception 'Paid credit receipt replay conflicts'; end if;
    v_id:=v_existing.id;
  else
    insert into public.chat_credit_lots_v1(
      subject_id,source_kind,source_ref,
      credits_issued,credits_remaining,issued_at,expires_at
    ) values(p_subject_id,'portone_topup',p_receipt_id,
      300,300,pg_catalog.clock_timestamp(),null)
    on conflict on constraint chat_credit_lots_global_source_v1 do nothing
    returning id into v_id;
    if v_id is null then raise exception 'Paid credit source belongs to another owner'; end if;
    v_issued:=true;
  end if;
  return query select v_id,v_issued,b.available_credits,b.total_credits
    from public.internal_qry_chat_credit_balance_v1(p_subject_id) b;
end
$mint$;

create function public.cmd_fulfill_verified_chat_credit_receipt_v1(
 p_subject_id uuid,p_receipt_id uuid
) returns table(lot_id uuid,issued boolean,available_credits bigint,total_credits bigint)
language plpgsql volatile security definer
set search_path=pg_catalog,public
set row_security=off
as $fulfill$
begin
 perform public.assert_myeongha_subject_context_v1(p_subject_id);
 return query select * from public.internal_cmd_chat_credit_verified_topup_v1(
  p_subject_id,p_receipt_id,'26100000-0000-4000-8000-000000000003'::uuid,'never',null
 );
end
$fulfill$;
revoke all on function public.cmd_fulfill_verified_chat_credit_receipt_v1(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.cmd_fulfill_verified_chat_credit_receipt_v1(uuid,uuid)
 to myeongha_api_executor;
revoke all on function public.internal_cmd_chat_credit_verified_topup_v1(uuid,uuid,uuid,text,integer)
 from public,anon,authenticated,service_role,myeongha_api_executor;
commit;
