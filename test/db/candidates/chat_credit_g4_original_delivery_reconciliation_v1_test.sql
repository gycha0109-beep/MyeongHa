\set ON_ERROR_STOP on
-- Watchtower-Track: security
-- G4 sealed rehearsal. Run ONLY after private credit candidate DDL on the
-- cloned, disposable PostgreSQL; the whole fixture rolls back.
begin;

insert into auth.users(id) values ('ce110000-0000-4000-8000-000000000001');
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
values ('ce110000-0000-4000-8000-000000000001','member',
        'ce110000-0000-4000-8000-000000000001','active',clock_timestamp(),clock_timestamp());
insert into public.conversation_threads(id,subject_id,thread_type,status,created_at,updated_at)
values('ce120000-0000-4000-8000-000000000001',
       'ce110000-0000-4000-8000-000000000001',
       'single_character','active',clock_timestamp(),clock_timestamp());
insert into public.chat_turns(id,thread_id,subject_id,client_turn_id,request_hash,
  request_contract_version,request_snapshot_jsonb,state,created_at,updated_at)
values ('ce140000-0000-4000-8000-000000000001',
        'ce120000-0000-4000-8000-000000000001',
        'ce110000-0000-4000-8000-000000000001',
        'ce130000-0000-4000-8000-000000000001',
        'sha256:v1:g4-disposable','chat-request-v1','{}'::jsonb,
        'received',clock_timestamp(),clock_timestamp());

do $g4$
declare
  s uuid:='ce110000-0000-4000-8000-000000000001';
  t uuid:='ce120000-0000-4000-8000-000000000001';
  c uuid:='ce130000-0000-4000-8000-000000000001';
  committed uuid:='ce140000-0000-4000-8000-000000000001';
  assistant uuid:='ce150000-0000-4000-8000-000000000001';
  reservation uuid;
  second_reservation uuid;
  status text;
  balance bigint;
  allocations bigint;
begin
  perform set_config('myeongha.subject_id',s::text,true);
  perform public.internal_cmd_chat_signup_credit_v1(s);
  select outcome,reservation_id into status,reservation
    from public.internal_cmd_chat_credit_reserve_v1(s,t,c);
  if status<>'reserved' or reservation is null then
    raise exception 'G4 first fresh credit reservation was not atomic';
  end if;
  select outcome,reservation_id into status,second_reservation
    from public.internal_cmd_chat_credit_reserve_v1(s,t,c);
  if status<>'already_reserved' or second_reservation is distinct from reservation then
    raise exception 'G4 duplicate ClientTurn created an extra reservation';
  end if;
  select available_credits into balance
    from public.internal_qry_chat_credit_balance_v1(s);
  select sum(credits) into allocations from public.chat_credit_turn_allocations_v1
    where reservation_id=reservation;
  if balance<>40 or allocations<>10 then
    raise exception 'G4 credit reservation charged more or less than ten';
  end if;

  -- A first socket send or a client ACK cannot settle without original
  -- DB-delivered Turn, committed Attempt, exact assistant and positive receipt.
  begin
    perform public.internal_cmd_chat_credit_ack_delivered_proven_v2(
      s,t,c,reservation,committed,assistant);
    raise exception 'G4 forged delivery was incorrectly settled';
  exception when others then
    if sqlerrm not like 'Credit ACK lacks matching original DB-delivered assistant proof%'
      then raise; end if;
  end;
  if (select state from public.chat_credit_turn_reservations_v1
      where id=reservation)<>'reserved' then
    raise exception 'G4 rejected ACK changed the credit reservation state';
  end if;

  begin
    perform public.internal_cmd_chat_credit_ack_delivered_proven_v2(
      s,t,c,'ce160000-0000-4000-8000-000000000001',committed,assistant);
    raise exception 'G4 forged reservation was incorrectly settled';
  exception when others then
    if sqlerrm not like 'Credit ACK has no matching open or settled reservation%'
      then raise; end if;
  end;

  -- A transient pending turn is NOT a definitive failure. No refund yet.
  if exists (
    select 1 from public.chat_credit_turn_reservations_v1 r
    join public.chat_turns ct on ct.subject_id=r.subject_id
      and ct.thread_id=r.thread_id and ct.client_turn_id=r.client_turn_id::text
    where r.id=reservation and r.subject_id=s
      and ct.state in ('failed_retryable','failed_final','abandoned')
      and ct.delivered_at is null and ct.committed_at is null
  ) then raise exception 'G4 pending turn qualifies for a false refund'; end if;

  update public.chat_turns set state='failed_final',updated_at=clock_timestamp(),
    error_code='g4-disposable-final-failure'
    where id=committed and subject_id=s and state='received';
  if not exists (
    select 1 from public.chat_credit_turn_reservations_v1 r
    join public.chat_turns ct on ct.subject_id=r.subject_id
      and ct.thread_id=r.thread_id and ct.client_turn_id=r.client_turn_id::text
    where r.id=reservation and r.subject_id=s
      and ct.state in ('failed_retryable','failed_final','abandoned')
      and ct.delivered_at is null and ct.committed_at is null
  ) then raise exception 'G4 terminal failed turn did not qualify for release'; end if;

  if public.internal_cmd_chat_credit_finalize_v1(s,reservation,false,null)<>'released'
    or public.internal_cmd_chat_credit_finalize_v1(s,reservation,false,null)<>'released' then
    raise exception 'G4 terminal release was not exactly-once';
  end if;
  select available_credits into balance from public.internal_qry_chat_credit_balance_v1(s);
  if balance<>50 then raise exception 'G4 verified terminal release did not restore ten credits'; end if;

  begin
    perform public.internal_cmd_chat_credit_ack_delivered_proven_v2(
      s,t,c,reservation,committed,assistant);
    raise exception 'G4 released credit was settled after terminal failure';
  exception when others then
    if sqlerrm not like 'Credit ACK has no matching open or settled reservation%'
      then raise; end if;
  end;

  if has_function_privilege('myeongha_api_executor',
    'public.internal_cmd_chat_credit_ack_delivered_proven_v2(uuid,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE') or has_function_privilege('authenticated',
    'public.internal_cmd_chat_credit_ack_delivered_proven_v2(uuid,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE') or has_function_privilege('service_role',
    'public.internal_cmd_chat_credit_ack_delivered_proven_v2(uuid,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE') then raise exception 'G4 private settlement RPC leaked execution grants'; end if;
end $g4$;

rollback;
