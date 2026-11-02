\set ON_ERROR_STOP on
-- Watchtower-Track: security
-- Only in cloned disposable PostgreSQL; no durable authority mutations.
begin;

insert into auth.users(id) values ('ce910000-0000-4000-8000-000000000001');
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
values ('ce910000-0000-4000-8000-000000000001','member',
        'ce910000-0000-4000-8000-000000000001','active',clock_timestamp(),clock_timestamp());
insert into public.conversation_threads(id,subject_id,thread_type,status,created_at,updated_at)
values ('ce920000-0000-4000-8000-000000000001',
        'ce910000-0000-4000-8000-000000000001',
        'single_character','active',clock_timestamp(),clock_timestamp());
select public.internal_cmd_chat_signup_credit_v1('ce910000-0000-4000-8000-000000000001');

-- Do not use superuser to assert permission. The transaction must genuinely
-- become the non-login, no-BYPASSRLS private Commerce executor.
set local role myeongha_commerce_internal_executor;
select pg_catalog.set_config('myeongha.subject_id',
  'ce910000-0000-4000-8000-000000000001',true);
do $g4_acl$
declare
  v_subject uuid:='ce910000-0000-4000-8000-000000000001';
  v_thread uuid:='ce920000-0000-4000-8000-000000000001';
  v_client_turn uuid:='ce930000-0000-4000-8000-000000000001';
  v_reservation uuid;
  v_status text;
begin
  if current_user<>'myeongha_commerce_internal_executor' then
    raise exception 'G4 private executor role not applied';
  end if;
  if not has_function_privilege(current_user,
    'public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)','EXECUTE')
    or not has_function_privilege(current_user,
    'public.internal_cmd_chat_credit_ack_delivered_proven_v2(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
  then raise exception 'G4 private executor missing narrow reservation/ACK grants'; end if;
  if has_function_privilege(current_user,
    'public.internal_cmd_chat_credit_finalize_v1(uuid,uuid,boolean,uuid)','EXECUTE')
    or has_table_privilege(current_user,
       'public.chat_credit_turn_reservations_v1','SELECT')
    or has_table_privilege(current_user,
       'public.chat_credit_turn_reservations_v1','UPDATE')
  then raise exception 'G4 private executor unexpectedly gained wallet direct access'; end if;
  select outcome,reservation_id into v_status,v_reservation
    from public.internal_cmd_chat_credit_reserve_v1(v_subject,v_thread,v_client_turn);
  if v_status<>'reserved' or v_reservation is null then
    raise exception 'G4 private reservation failed'; end if;
  select outcome into v_status
    from public.internal_cmd_chat_credit_reserve_v1(v_subject,v_thread,v_client_turn);
  if v_status<>'already_reserved' then
    raise exception 'G4 second credit request bypassed idempotency'; end if;
  begin
    perform public.internal_cmd_chat_credit_ack_delivered_proven_v2(
      v_subject,v_thread,v_client_turn,v_reservation,
      'ce940000-0000-4000-8000-000000000001'::uuid,
      'ce950000-0000-4000-8000-000000000001'::uuid
    );
    raise exception 'G4 private credit ACK accepted forged delivery';
  exception when others then
    if sqlerrm not like 'Credit ACK lacks matching original DB-delivered assistant proof%'
      then raise; end if;
  end;
  if has_function_privilege('myeongha_api_executor',
       'public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('service_role',
       'public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('myeongha_api_executor',
       'public.internal_cmd_chat_credit_ack_delivered_proven_v2(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.internal_cmd_chat_credit_ack_delivered_proven_v2(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('service_role',
       'public.internal_cmd_chat_credit_ack_delivered_proven_v2(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
  then raise exception 'G4 private RPC leaked to user or service role'; end if;
end $g4_acl$;
rollback;
