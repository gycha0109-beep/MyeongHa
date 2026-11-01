\set ON_ERROR_STOP on
-- Watchtower-Track: security
-- All evidence and wallet rows rolled back on the isolated PG clone.
begin;

insert into auth.users(id) values ('cfa10000-0000-4000-8000-000000000001');
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
values ('cfa10000-0000-4000-8000-000000000001','member',
        'cfa10000-0000-4000-8000-000000000001','active',clock_timestamp(),clock_timestamp());
insert into public.conversation_threads(id,subject_id,thread_type,status,created_at,updated_at)
values ('cfa20000-0000-4000-8000-000000000001',
        'cfa10000-0000-4000-8000-000000000001',
        'single_character','active',clock_timestamp(),clock_timestamp());
insert into public.chat_turns(id,thread_id,subject_id,client_turn_id,
  request_hash,request_contract_version,request_snapshot_jsonb,state,created_at,updated_at)
values ('cfa40000-0000-4000-8000-000000000001',
        'cfa20000-0000-4000-8000-000000000001',
        'cfa10000-0000-4000-8000-000000000001',
        'cfa30000-0000-4000-8000-000000000001',
        'sha256:v1:g4-private-refund','chat-request-v1','{}'::jsonb,
        'received',clock_timestamp(),clock_timestamp());
select public.internal_cmd_chat_signup_credit_v1('cfa10000-0000-4000-8000-000000000001');

set local role myeongha_commerce_internal_executor;
select pg_catalog.set_config('myeongha.subject_id',
  'cfa10000-0000-4000-8000-000000000001',true);
do $in_flight$
declare
  s uuid:='cfa10000-0000-4000-8000-000000000001';
  t uuid:='cfa20000-0000-4000-8000-000000000001';
  c uuid:='cfa30000-0000-4000-8000-000000000001';
  rid uuid;
  outcome text;
begin
  if current_user<>'myeongha_commerce_internal_executor' then
    raise exception 'G4 refund private role not active';
  end if;
  if not has_function_privilege(current_user,
    'public.internal_cmd_seyeon_g4_credit_refund_proven_v1(uuid,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege(current_user,
    'public.internal_cmd_chat_credit_finalize_v1(uuid,uuid,boolean,uuid)','EXECUTE')
    or has_table_privilege(current_user,'public.chat_credit_turn_reservations_v1','SELECT')
  then raise exception 'G4 refund role not minimally scoped'; end if;
  select r.outcome,r.reservation_id into outcome,rid
    from public.internal_cmd_chat_credit_reserve_v1(s,t,c) r;
  if outcome<>'reserved' or rid is null then
    raise exception 'G4 failed to reserve credit before refund'; end if;
  begin
    perform public.internal_cmd_seyeon_g4_credit_refund_proven_v1(s,t,c,rid);
    raise exception 'G4 refunded a nonterminal in-flight Turn';
  exception when others then
    if sqlerrm not like 'G4 refund requires terminal uncommitted undelivered Turn%'
      then raise; end if;
  end;
end $in_flight$;

-- The actual original ChatTurn owner marks a definitive terminal DB failure.
reset role;
update public.chat_turns
  set state='failed_final',error_code='g4-private-test-final',updated_at=clock_timestamp()
  where id='cfa40000-0000-4000-8000-000000000001' and state='received';

set local role myeongha_commerce_internal_executor;
do $final_failure$
declare
  s uuid:='cfa10000-0000-4000-8000-000000000001';
  t uuid:='cfa20000-0000-4000-8000-000000000001';
  c uuid:='cfa30000-0000-4000-8000-000000000001';
  rid uuid;
  outcome text;
begin
  select r.outcome,r.reservation_id into outcome,rid
    from public.internal_cmd_chat_credit_reserve_v1(s,t,c) r;
  if outcome<>'already_reserved' or rid is null then
    raise exception 'G4 reservation changed after rejected premature refund';
  end if;
  begin
    perform public.internal_cmd_seyeon_g4_credit_refund_proven_v1(
      s,t,'cfa30000-0000-4000-8000-000000000002'::uuid,rid);
    raise exception 'G4 refunded using a mismatching ClientTurn';
  exception when others then
    if sqlerrm not like 'G4 refund requires exact still-reserved credit%'
      then raise; end if;
  end;
  if public.internal_cmd_seyeon_g4_credit_refund_proven_v1(s,t,c,rid)<>'released'
    then raise exception 'G4 authoritative terminal failure did not refund'; end if;
  begin
    perform public.internal_cmd_seyeon_g4_credit_refund_proven_v1(s,t,c,rid);
    raise exception 'G4 duplicate refund escaped DB state guard';
  exception when others then
    if sqlerrm not like 'G4 refund requires exact still-reserved credit%'
      then raise; end if;
  end;
  begin
    perform public.internal_cmd_chat_credit_ack_delivered_proven_v2(
      s,t,c,rid,
      'cfa40000-0000-4000-8000-000000000001'::uuid,
      'cfa50000-0000-4000-8000-000000000001'::uuid);
    raise exception 'G4 settled a previously refunded reservation';
  exception when others then
    if sqlerrm not like 'Credit ACK has no matching open or settled reservation%'
      then raise; end if;
  end;
  if has_function_privilege('myeongha_api_executor',
       'public.internal_cmd_seyeon_g4_credit_refund_proven_v1(uuid,uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.internal_cmd_seyeon_g4_credit_refund_proven_v1(uuid,uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('service_role',
       'public.internal_cmd_seyeon_g4_credit_refund_proven_v1(uuid,uuid,uuid,uuid)','EXECUTE')
  then raise exception 'G4 refund authority leaked outside private Commerce'; end if;
end $final_failure$;

reset role;
do $balance$
declare
  b bigint;
  n integer;
begin
  select available_credits into b from public.internal_qry_chat_credit_balance_v1(
    'cfa10000-0000-4000-8000-000000000001');
  select count(*) into n from public.chat_credit_turn_reservations_v1
   where subject_id='cfa10000-0000-4000-8000-000000000001' and state='released';
  if b<>50 or n<>1 then
    raise exception 'G4 terminal refund must restore exactly ten credits once';
  end if;
end $balance$;
rollback;
