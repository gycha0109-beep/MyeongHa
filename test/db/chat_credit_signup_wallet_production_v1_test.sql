-- Disposable test: Production 1730 signup wallet; all inserted rows rollback.
begin;
insert into auth.users(id) values
('cde11000-0000-4000-8000-000000000001'),
('cde11000-0000-4000-8000-000000000002');
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at) values
('cde12000-0000-4000-8000-000000000001','member','cde11000-0000-4000-8000-000000000001','active',now(),now());
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at) values
('cde12000-0000-4000-8000-000000000002','guest',null,'active',now(),now());
update public.subjects set kind='member',
 auth_user_id='cde11000-0000-4000-8000-000000000002',updated_at=now()
where id='cde12000-0000-4000-8000-000000000002';
update public.subjects set status='active',updated_at=now()
where id='cde12000-0000-4000-8000-000000000002';
do $verify$
declare v_count integer; v_credits bigint; v_expiry_ok boolean;
begin
 select count(*),sum(credits_remaining),
        bool_and(expires_at-issued_at=interval '30 days')
 into v_count,v_credits,v_expiry_ok
 from public.chat_credit_lots_v1
 where subject_id in (
 'cde12000-0000-4000-8000-000000000001',
 'cde12000-0000-4000-8000-000000000002');
 if v_count<>2 or v_credits<>100 or v_expiry_ok is distinct from true then
   raise exception 'Signup 50 credits and 30-day expiry must issue exactly once';
 end if;
 if not has_function_privilege('myeongha_api_executor',
 'public.internal_qry_chat_credit_balance_v1(uuid)','EXECUTE')
 or has_function_privilege('myeongha_api_executor',
 'public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege('myeongha_api_executor',
 'public.internal_cmd_chat_credit_finalize_v1(uuid,uuid,boolean,uuid)','EXECUTE')
 or has_function_privilege('anon',
 'public.internal_qry_chat_credit_balance_v1(uuid)','EXECUTE') then
   raise exception 'Credit SQL execution privileges are incorrect';
 end if;
 if not exists (select 1 from pg_trigger where tgname='tr_chat_credit_subject_erasure_v1'
  and tgrelid='public.subjects'::regclass and not tgisinternal) then
   raise exception 'Account erasure trigger missing';
 end if;
end $verify$;
rollback;
