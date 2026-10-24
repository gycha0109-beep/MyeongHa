\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. Transaction rollback leaves no fixture data.
begin;
insert into auth.users(id) values ('cc110000-0000-4000-8000-000000000001');
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
values('cc110000-0000-4000-8000-000000000001','member',
'cc110000-0000-4000-8000-000000000001','active',clock_timestamp(),clock_timestamp());
insert into public.conversation_threads(
 id,subject_id,thread_type,status,created_at,updated_at
) values ('cc120000-0000-4000-8000-000000000001',
'cc110000-0000-4000-8000-000000000001','single_character','active',
clock_timestamp(),clock_timestamp());

do $credit$
declare
 s uuid := 'cc110000-0000-4000-8000-000000000001';
 t uuid := 'cc120000-0000-4000-8000-000000000001';
 i uuid := 'cc130000-0000-4000-8000-000000000001';
 v_lot uuid; v_lot2 uuid; v_res uuid;
 v_status text; v_avail bigint; v_total bigint;
 v_claim record; n integer;
begin
 v_lot:=public.internal_cmd_chat_signup_credit_v1(s);
 v_lot2:=public.internal_cmd_chat_signup_credit_v1(s);
 if v_lot is distinct from v_lot2 then
   raise exception 'Signup replay minted a second credit batch';
 end if;
 select * into v_claim from public.internal_qry_chat_credit_balance_v1(s);
 if v_claim.available_credits<>50 or v_claim.total_credits<>50 then
   raise exception 'Signup 50/30d spendable balance mismatch';
 end if;

 select outcome,reservation_id,available_credits,total_credits
 into v_status,v_res,v_avail,v_total
 from public.internal_cmd_chat_credit_reserve_v1(s,t,i);
 if v_status<>'reserved' or v_avail<>40 or v_total<>40 then
   raise exception 'First 10-credit reserve must be atomic';
 end if;
 select outcome into v_status
 from public.internal_cmd_chat_credit_reserve_v1(s,t,i);
 if v_status<>'already_reserved' then
   raise exception 'Repeated clientTurnId double-reserved instead of replay';
 end if;
 if public.internal_cmd_chat_credit_finalize_v1(s,v_res,false)<>'released'
   or public.internal_cmd_chat_credit_finalize_v1(s,v_res,false)<>'released' then
   raise exception 'Failure-release must refund exactly once';
 end if;
 select * into v_claim from public.internal_qry_chat_credit_balance_v1(s);
 if v_claim.available_credits<>50 then
   raise exception 'Failed delivery did not restore credits';
 end if;
 select outcome into v_status
 from public.internal_cmd_chat_credit_reserve_v1(s,t,i);
 if v_status<>'conflict' then
   raise exception 'Released same turn retried as new billable turn';
 end if;

 -- New ClientTurn ID admits 5 successful delivered replies exactly.
 for n in 1..5 loop
   select outcome,reservation_id into v_status,v_res
   from public.internal_cmd_chat_credit_reserve_v1(
     s,t,('cc130000-0000-4000-8000-'||lpad((n+1)::text,12,'0'))::uuid
   );
   if v_status<>'reserved' then
     raise exception '10-credit consumption % denied', n;
   end if;
   if public.internal_cmd_chat_credit_finalize_v1(s,v_res,true,
       ('cc140000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid)<>'settled'
     or public.internal_cmd_chat_credit_finalize_v1(s,v_res,true,
       ('cc140000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid)<>'settled' then
     raise exception 'Delivered reply settle replay failed';
   end if;
 end loop;
 select * into v_claim from public.internal_qry_chat_credit_balance_v1(s);
 if v_claim.available_credits<>0 then
   raise exception 'Five successfully delivered AI replies did not spend 50 credits';
 end if;
 select outcome,available_credits into v_status,v_avail
 from public.internal_cmd_chat_credit_reserve_v1(
   s,t,'cc130000-0000-4000-8000-000000000099'::uuid
 );
 if v_status<>'insufficient' or v_avail<>0 then
   raise exception '10-credit shortage was not denied';
 end if;

 -- No surviving charged balance after replay, expiry, or unauthorized owner.
 select outcome into v_status
 from public.internal_cmd_chat_credit_reserve_v1(
  s,t,'cc130000-0000-4000-8000-000000000002'::uuid
 );
 if v_status<>'committed_replay' then
   raise exception 'Already delivered replay double-billed';
 end if;
 begin
  perform public.internal_cmd_chat_credit_finalize_v1(s,v_res,false);
  raise exception 'Settled credit reversed by another terminal outcome';
 exception when others then
  if sqlerrm='Settled credit reversed by another terminal outcome' then raise; end if;
 end;
 if not exists (
   select 1 from public.chat_credit_lots_v1
   where subject_id=s and source_kind='signup'
   and credits_issued=50 and expires_at>=issued_at+interval '30 days'
 ) then raise exception 'Signup 30-day expiry not preserved'; end if;
end $credit$;

-- A paid lot with an EXPLICITLY chosen no-expiry test policy remains spendable.
-- Fixture-only direct insertion; it is not payment or Production fulfillment.
do $paid_candidate$
declare
 s uuid := 'cc110000-0000-4000-8000-000000000001';
 t uuid := 'cc120000-0000-4000-8000-000000000001';
 r uuid;
 a bigint;
 result_kind text;
begin
 insert into public.chat_credit_lots_v1(
   subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at
 ) values(
   s,'portone_topup','cc150000-0000-4000-8000-000000000001',300,300,clock_timestamp(),null
 );
 select available_credits into a from public.internal_qry_chat_credit_balance_v1(s);
 if a<>300 then raise exception 'Explicit non-expiring paid candidate lot is not spendable'; end if;
 select outcome,reservation_id into result_kind,r
 from public.internal_cmd_chat_credit_reserve_v1(
   s,t,'cc130000-0000-4000-8000-000000000120'
 );
 if result_kind<>'reserved' then raise exception 'Paid candidate lot could not reserve'; end if;
 perform public.internal_cmd_chat_credit_finalize_v1(
   s,r,true,'cc140000-0000-4000-8000-000000000120'
 );
 select available_credits into a from public.internal_qry_chat_credit_balance_v1(s);
 if a<>290 then raise exception 'Paid candidate lot was not charged exactly 10'; end if;
 -- Same receipt cannot be minted twice even across subjects.
 begin
   insert into public.chat_credit_lots_v1(
     subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at
   ) values(
     s,'portone_topup','cc150000-0000-4000-8000-000000000001',300,300,clock_timestamp(),null
   );
   raise exception 'Duplicate receipt source unexpectedly minted';
 exception when unique_violation then null;
 end;
 -- A missing approved Offer can never cause a paid mint.
 begin
   perform public.internal_cmd_chat_credit_verified_topup_v1(
     s,'cc150000-0000-4000-8000-000000000002',null,'never',null
   );
   raise exception 'Unapproved Offer unexpectedly minted';
 exception when raise_exception then
   if sqlerrm='Unapproved Offer unexpectedly minted' then raise; end if;
 end;
 -- Missing validity policy is independently blocked.
 begin
   perform public.internal_cmd_chat_credit_verified_topup_v1(
     s,'cc150000-0000-4000-8000-000000000002',
     'cc160000-0000-4000-8000-000000000001',null,null
   );
   raise exception 'Unknown paid validity unexpectedly minted';
 exception when raise_exception then
   if sqlerrm='Unknown paid validity unexpectedly minted' then raise; end if;
 end;
end $paid_candidate$;

-- The first eligible Reading reward must never mint without approved source.
do $bonus$
declare s uuid := 'cc110000-0000-4000-8000-000000000001';
begin
 begin
   perform public.internal_cmd_chat_first_paid_reading_reward_v1(
     s,'cc170000-0000-4000-8000-000000000001',null
   );
   raise exception 'Missing eligible Reading Offer unexpectedly rewarded';
 exception when raise_exception then
   if sqlerrm='Missing eligible Reading Offer unexpectedly rewarded' then raise; end if;
 end;
 insert into public.chat_credit_lots_v1(
   subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at
 ) values (
   s,'reading_reward','cc170000-0000-4000-8000-000000000001',150,150,
   clock_timestamp(),clock_timestamp()+interval '90 days'
 );
 begin
   insert into public.chat_credit_lots_v1(
     subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at
   ) values (
     s,'reading_reward','cc170000-0000-4000-8000-000000000002',150,150,
     clock_timestamp(),clock_timestamp()+interval '90 days'
   );
   raise exception 'Second paid Reading reward incorrectly minted';
 exception when unique_violation then null;
 end;
end $bonus$;

-- An uncommitted/unknown ClientTurn must never accept a delivery ACK.
do $ack$
declare s uuid := 'cc110000-0000-4000-8000-000000000001';
 t uuid := 'cc120000-0000-4000-8000-000000000001';
begin
 begin
   perform public.internal_cmd_chat_credit_ack_delivered_v1(
     s,t,'cc130000-0000-4000-8000-000000000120',
     'cc180000-0000-4000-8000-000000000001',
     'cc190000-0000-4000-8000-000000000001',
     'cc200000-0000-4000-8000-000000000001'
   );
   raise exception 'Missing settled ChatTurn unexpectedly charged';
 exception when raise_exception then
   if sqlerrm='Missing settled ChatTurn unexpectedly charged' then raise; end if;
 end;
end $ack$;


-- End-to-end verification in a DISPOSABLE DB only: simulate a fully pinned,
-- enabled Credit Offer + verified production-environment PortOne receipt.
-- This is NOT a live Product catalog seed and contains no real transactions.
insert into public.products(id,product_key,product_type,enabled,created_at)
values('cc210000-0000-4000-8000-000000000001','chat_credits_300_v1',
  'credit',true,clock_timestamp());
insert into public.product_capability_sets(
  id,product_id,definition_version,definition_hash,created_at
) values (
  'cc220000-0000-4000-8000-000000000001',
  'cc210000-0000-4000-8000-000000000001',
  'candidate-credits-v1','sha256:candidate-credits-300',clock_timestamp()
);
insert into public.product_capability_items(
 capability_set_id,item_key,entitlement_key,scope_mode,fixed_scope_key,
 validity_mode,duration_seconds
) values (
 'cc220000-0000-4000-8000-000000000001',
 'candidate-chat-credits-300','candidate.chat.credits',
 'global',null,'unbounded',null
);
insert into public.product_offers(
 id,product_id,platform,provider,external_product_id,currency,
 display_price_minor,enabled,created_at,capability_set_id
) values (
 'cc230000-0000-4000-8000-000000000001',
 'cc210000-0000-4000-8000-000000000001',
 'web','portone_v2','candidate-chat-credits-300','KRW',1900,true,
 clock_timestamp(),'cc220000-0000-4000-8000-000000000001'
);
insert into public.purchase_intents(
 id,subject_id,product_offer_id,idempotency_key,request_hash,
 offer_snapshot_jsonb,offer_snapshot_hash,status,created_at,updated_at,
 expected_amount_minor,expected_currency,charge_terms_version,
 capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
) values (
 'cc240000-0000-4000-8000-000000000001',
 'cc110000-0000-4000-8000-000000000001',
 'cc230000-0000-4000-8000-000000000001',
 'candidate-credit-purchase-1','sha256:candidate-request',
 '{}'::jsonb,'sha256:candidate-offer-snapshot','verified',
 clock_timestamp(),clock_timestamp(),1900,'KRW','candidate-terms-v1',
 'cc220000-0000-4000-8000-000000000001',
 jsonb_build_object(
   'capabilitySetId','cc220000-0000-4000-8000-000000000001',
   'definitionVersion','candidate-credits-v1',
   'definitionHash','sha256:candidate-credits-300'
 ),
 'sha256:candidate-capability-snapshot'
);
insert into public.commerce_receipts(
 id,subject_id,purchase_intent_id,product_offer_id,platform,provider,
 external_transaction_id,receipt_fingerprint,verification_status,
 verified_at,created_at,environment,verifier_revision,
 verified_amount_minor,verified_currency
) values (
 'cc250000-0000-4000-8000-000000000001',
 'cc110000-0000-4000-8000-000000000001',
 'cc240000-0000-4000-8000-000000000001',
 'cc230000-0000-4000-8000-000000000001',
 'web','portone_v2','candidate-portone-paid-1',
 'hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
 'verified',clock_timestamp(),clock_timestamp(),
 'production','candidate-only',1900,'KRW'
);

do $topup_positive$
declare
 s uuid := 'cc110000-0000-4000-8000-000000000001';
 receipt uuid := 'cc250000-0000-4000-8000-000000000001';
 offer uuid := 'cc230000-0000-4000-8000-000000000001';
 v_first uuid;
 v_second uuid;
 v_first_issued boolean;
 v_second_issued boolean;
 v_prior bigint;
 v_after bigint;
 v_replay_balance bigint;
begin
 select available_credits into v_prior
 from public.internal_qry_chat_credit_balance_v1(s);
 select lot_id,issued,available_credits
 into v_first,v_first_issued,v_after
 from public.internal_cmd_chat_credit_verified_topup_v1(
   s,receipt,offer,'never',null
 );
 if v_first is null or v_first_issued is distinct from true
    or v_after<>v_prior+300 then
   raise exception 'Verified 1900 KRW Receipt did not mint exactly 300 credits';
 end if;
 select lot_id,issued,available_credits
 into v_second,v_second_issued,v_replay_balance
 from public.internal_cmd_chat_credit_verified_topup_v1(
   s,receipt,offer,'never',null
 );
 if v_second is distinct from v_first
    or v_second_issued is distinct from false
    or v_replay_balance<>v_after then
   raise exception 'Verified Receipt replay minted duplicate 300 credits';
 end if;
 begin
   perform public.internal_cmd_chat_credit_verified_topup_v1(
     s,'cc250000-0000-4000-8000-000000000002',
     offer,'never',null
   );
   raise exception 'Unverified Receipt unexpectedly minted credits';
 exception when raise_exception then
   if sqlerrm='Unverified Receipt unexpectedly minted credits' then raise; end if;
 end;
end $topup_positive$;

-- Fail closed to runtime/public roles until an approved owner port is wired.
do $acl$
declare n text;
begin
 for n in select rolname from pg_roles
 where rolname in ('anon','authenticated','service_role','myeongha_api_executor')
 loop
   if has_function_privilege(n,'public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)','EXECUTE')
      or has_function_privilege(n,'public.internal_cmd_chat_credit_finalize_v1(uuid,uuid,boolean,uuid)','EXECUTE')
      or has_function_privilege(n,'public.internal_cmd_chat_credit_verified_topup_v1(uuid,uuid,uuid,text,integer)','EXECUTE')
      or has_function_privilege(n,'public.internal_cmd_chat_first_paid_reading_reward_v1(uuid,uuid,uuid)','EXECUTE')
      or has_function_privilege(n,'public.internal_cmd_chat_credit_ack_delivered_v1(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
      or has_table_privilege(n,'public.chat_credit_lots_v1','INSERT') then
     raise exception 'Credit private ledger leaked runtime access to %',n;
   end if;
 end loop;
end $acl$;
rollback;
