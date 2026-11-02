-- Required staged Commerce schema must apply to an isolated migrated DB.
do $test$
begin
  if not exists (
    select 1 from public.products p join public.product_offers o on o.product_id=p.id
      where p.product_key='chat_credits_300_v1' and p.product_type='credit'
        and not p.enabled and not o.enabled and o.display_price_minor=1900
        and o.currency='KRW' and o.provider='portone_v2'
  ) then raise exception 'Staged PortOne product must remain disabled'; end if;

  if to_regprocedure('public.internal_cmd_chat_credit_verified_topup_v1(uuid,uuid,uuid,text,integer)') is null
    or to_regprocedure('public.internal_cmd_chat_first_paid_reading_reward_v1(uuid,uuid,uuid)') is null then
    raise exception 'Verified credit functions not installed'; end if;

  if exists(
    select 1 from pg_roles r
      where r.rolname in ('anon','authenticated','service_role','myeongha_api_executor')
        and (has_function_privilege(r.rolname,
          'public.internal_cmd_chat_credit_verified_topup_v1(uuid,uuid,uuid,text,integer)','EXECUTE')
          or has_function_privilege(r.rolname,
          'public.internal_cmd_chat_first_paid_reading_reward_v1(uuid,uuid,uuid)','EXECUTE'))
  ) then raise exception 'Private credit grant leaked'; end if;

  if not exists(
    select 1 from pg_constraint
     where conrelid='public.chat_credit_lots_v1'::regclass
       and conname='chat_credit_lots_validity_v1'
       and pg_get_constraintdef(oid) like '%portone_topup%'
  ) then raise exception 'Paid-credit nonexpiry constraint absent'; end if;
end
$test$;
select 'PAID_CREDIT_POLICY_DB_PASS' as status;
