-- Watchtower-Track: commerce-payment
-- Approved ledger terms: purchased PortOne credits NEVER expire;
-- signup 50/30 days; first purchased Reading reward 150/90 days.
-- This is a dormant payout authority: no API/Commerce execution grants.
begin;
alter table public.chat_credit_lots_v1
  drop constraint chat_credit_lots_v1_source_kind_check,
  drop constraint chat_credit_lots_validity_v1;
alter table public.chat_credit_lots_v1
  add constraint chat_credit_lots_v1_source_kind_check
    check (source_kind in ('signup','portone_topup','reading_reward')),
  add constraint chat_credit_lots_validity_v1 check (
    (source_kind='signup' and credits_issued=50
      and expires_at=issued_at+interval '30 days')
    or (source_kind='portone_topup' and credits_issued=300
      and expires_at is null)
    or (source_kind='reading_reward' and credits_issued=150
      and expires_at=issued_at+interval '90 days')
  );
create unique index chat_credit_first_paid_reading_once_v1
  on public.chat_credit_lots_v1(subject_id)
  where source_kind='reading_reward';

-- Reverify exact recorded payment evidence inside the mint transaction.
-- A successful browser callback or forged receipt identifier grants nothing.
create function public.internal_cmd_chat_credit_verified_topup_v1(
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
     and po.enabled and po.retired_at is null
     and po.provider='portone_v2' and po.platform='web'
     and po.currency='KRW' and po.display_price_minor=1900
     and p.enabled and p.retired_at is null
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
revoke all on function public.internal_cmd_chat_credit_verified_topup_v1(
  uuid,uuid,uuid,text,integer
) from public,anon,authenticated,service_role,myeongha_api_executor;

-- First paid Reading reward; one credit lot per Member, once only.
create function public.internal_cmd_chat_first_paid_reading_reward_v1(
  p_subject_id uuid,p_receipt_id uuid,p_approved_reading_offer_id uuid
)
returns table(lot_id uuid,outcome text,available_credits bigint,total_credits bigint)
language plpgsql volatile security definer
set search_path=pg_catalog,public
set row_security=off
as $reward$
declare v_id uuid; v_prior public.chat_credit_lots_v1%rowtype;
  v_outcome text:='issued'; v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_subject_id is null or p_receipt_id is null
    or p_approved_reading_offer_id is null then
    raise exception 'Reading reward requires canonical identifiers'; end if;
  perform 1 from public.subjects
    where id=p_subject_id and kind='member' and status='active' for update;
  if not found then raise exception 'Reading reward owner is inactive'; end if;
  perform 1 from public.commerce_receipts cr
    join public.purchase_intents pi on pi.id=cr.purchase_intent_id
      and pi.subject_id=cr.subject_id and pi.product_offer_id=cr.product_offer_id
    join public.product_offers po on po.id=cr.product_offer_id
    join public.products p on p.id=po.product_id
    join public.product_capability_sets pcs on pcs.id=pi.capability_set_id and pcs.product_id=p.id
   where cr.id=p_receipt_id and cr.subject_id=p_subject_id
     and cr.product_offer_id=p_approved_reading_offer_id
     and cr.provider='portone_v2' and cr.platform='web'
     and cr.environment='production' and cr.verification_status='verified'
     and cr.verified_at is not null and cr.verified_amount_minor>0
     and cr.verified_amount_minor=pi.expected_amount_minor
     and cr.verified_currency=pi.expected_currency
     and cr.external_transaction_id<>'' and cr.receipt_fingerprint<>''
     and pi.status='verified' and pi.capability_snapshot_hash is not null
     and pi.capability_snapshot_jsonb=pg_catalog.jsonb_build_object(
       'capabilitySetId',pcs.id::text,'definitionVersion',pcs.definition_version,
       'definitionHash',pcs.definition_hash
     )
     and po.enabled and po.retired_at is null and po.provider='portone_v2'
     and po.platform='web' and po.currency=pi.expected_currency
     and po.display_price_minor=pi.expected_amount_minor
     and p.enabled and p.retired_at is null and p.product_type='reading'
   for share of cr,pi,po,p,pcs;
  if not found then raise exception 'Verified Reading is not reward eligible'; end if;
  select * into v_prior from public.chat_credit_lots_v1
    where subject_id=p_subject_id and source_kind='reading_reward' for update;
  if found then
    if v_prior.credits_issued<>150
      or v_prior.expires_at is distinct from v_prior.issued_at+interval '90 days'
    then raise exception 'Prior reward terms conflict'; end if;
    v_id:=v_prior.id;v_outcome:='already_awarded';
  else
    insert into public.chat_credit_lots_v1
      (subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at)
      values(p_subject_id,'reading_reward',p_receipt_id,150,150,v_now,v_now+interval '90 days')
      returning id into v_id;
  end if;
  return query select v_id,v_outcome,b.available_credits,b.total_credits
    from public.internal_qry_chat_credit_balance_v1(p_subject_id) b;
end
$reward$;
revoke all on function public.internal_cmd_chat_first_paid_reading_reward_v1(
  uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;
commit;
