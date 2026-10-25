-- Synthetic hostile customers only: GitHub CI's disposable PostgreSQL database.
-- No real Supabase Auth signups, cards, PortOne calls, purchases, or production SQL writes.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
 ('cda10000-0000-4000-8000-000000000001'),
 ('cda10000-0000-4000-8000-000000000002'),
 ('cda10000-0000-4000-8000-000000000003');
-- Alice and Bob are independent Members, Carol is a Guest promoted to Member,
-- and Dave stays Guest (no entitlement to signup credits).
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at) values
 ('cda20000-0000-4000-8000-000000000001','member','cda10000-0000-4000-8000-000000000001','active',now(),now()),
 ('cda20000-0000-4000-8000-000000000002','member','cda10000-0000-4000-8000-000000000002','active',now(),now()),
 ('cda20000-0000-4000-8000-000000000003','guest',null,'active',now(),now()),
 ('cda20000-0000-4000-8000-000000000004','guest',null,'active',now(),now());

do $scenario$
begin
 if (select count(*) from public.chat_credit_lots_v1
     where subject_id='cda20000-0000-4000-8000-000000000004')<>0 then
   raise exception 'ATTACK_GUEST_MINT: Guest awarded Member credits';
 end if;
end $scenario$;

update public.subjects set kind='member',
 auth_user_id='cda10000-0000-4000-8000-000000000003',updated_at=now()
where id='cda20000-0000-4000-8000-000000000003';
update public.subjects set status='active',updated_at=now()
where id in (
 'cda20000-0000-4000-8000-000000000001',
 'cda20000-0000-4000-8000-000000000002',
 'cda20000-0000-4000-8000-000000000003');

do $attack$
declare
 alice uuid := 'cda20000-0000-4000-8000-000000000001';
 bob uuid := 'cda20000-0000-4000-8000-000000000002';
 carol uuid := 'cda20000-0000-4000-8000-000000000003';
 n integer;
begin
 select count(*) into n from public.chat_credit_lots_v1
 where subject_id in (alice,bob,carol)
   and source_kind='signup' and source_ref=subject_id
   and credits_issued=50 and credits_remaining=50
   and expires_at-issued_at=interval '30 days';
 if n<>3 then raise exception 'ATTACK_SIGNUP_REPLAY: expected 3 valid lots, got %',n; end if;
 if (select count(*) from public.chat_credit_lots_v1)<>3 then
   raise exception 'ATTACK_SIGNUP_FARMING: extra signup lots';
 end if;

 begin
   insert into public.chat_credit_lots_v1
     (subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at)
   values (bob,'signup',alice,50,50,now(),now()+interval '30 days');
   raise exception 'ATTACK_RECEIPT_REPLAY_SUCCEEDED';
 exception when unique_violation then null; end;

 begin
   insert into public.chat_credit_lots_v1
     (subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at)
   values (alice,'portone_topup',gen_random_uuid(),300,300,now(),now()+interval '30 days');
   raise exception 'ATTACK_FORGED_TOPUP_SUCCEEDED';
 exception when check_violation then null; end;
 begin
   insert into public.chat_credit_lots_v1
     (subject_id,source_kind,source_ref,credits_issued,credits_remaining,issued_at,expires_at)
   values (alice,'reading_reward',gen_random_uuid(),150,150,now(),now()+interval '90 days');
   raise exception 'ATTACK_FAKE_READING_REWARD_SUCCEEDED';
 exception when check_violation then null; end;

 begin
   update public.chat_credit_lots_v1 set credits_remaining=51 where subject_id=alice;
   raise exception 'ATTACK_BALANCE_INFLATION_SUCCEEDED';
 exception when check_violation then null; end;
 begin
   update public.chat_credit_lots_v1 set credits_remaining=-1 where subject_id=alice;
   raise exception 'ATTACK_NEGATIVE_BALANCE_SUCCEEDED';
 exception when check_violation then null; end;
 begin
   update public.chat_credit_lots_v1 set expires_at=issued_at+interval '365 days'
   where subject_id=alice;
   raise exception 'ATTACK_EXPIRY_EXTENSION_SUCCEEDED';
 exception when check_violation then null; end;

 if not has_function_privilege('myeongha_api_executor',
     'public.internal_qry_chat_credit_balance_v1(uuid)','EXECUTE')
   or has_function_privilege('myeongha_api_executor',
     'public.internal_cmd_chat_signup_credit_v1(uuid)','EXECUTE')
   or has_function_privilege('myeongha_api_executor',
     'public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)','EXECUTE')
   or has_function_privilege('myeongha_api_executor',
     'public.internal_cmd_chat_credit_finalize_v1(uuid,uuid,boolean,uuid)','EXECUTE')
   or has_function_privilege('authenticated',
     'public.internal_qry_chat_credit_balance_v1(uuid)','EXECUTE')
   or has_schema_privilege('authenticated','commerce_credit_private','USAGE')
 then raise exception 'ATTACK_PRIVILEGE_ESCALATION: wallet RPC boundary drift'; end if;

 if (select count(*) from public.chat_credit_lots_v1
     where subject_id=alice and credits_remaining=50)<>1 then
   raise exception 'ATTACK_FAILED_UPDATE_ROLLBACK: wallet mutated';
 end if;
end $attack$;

-- Age the reward while preserving exactly 30 days of validity.
update public.chat_credit_lots_v1
set issued_at=now()-interval '31 days',expires_at=now()-interval '1 day'
where subject_id='cda20000-0000-4000-8000-000000000003';

update public.subjects set status='deleted',updated_at=now()
where id='cda20000-0000-4000-8000-000000000002';
do $erasure$
begin
 if exists(select 1 from public.chat_credit_lots_v1
           where subject_id='cda20000-0000-4000-8000-000000000002')
 then raise exception 'ATTACK_DELETED_WALLET_SURVIVES'; end if;
 if (select count(*) from public.chat_credit_lots_v1
     where subject_id='cda20000-0000-4000-8000-000000000001'
       and credits_remaining=50)<>1
 then raise exception 'ATTACK_ERASURE_TENANT_CROSSOVER'; end if;
end $erasure$;
commit;
\echo PASS_PAYMENT_E2E_SYNTHETIC_CUSTOMERS_SIGNUP_REPLAY_FRAUD_EXPIRY_ERASURE
