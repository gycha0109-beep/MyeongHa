\set ON_ERROR_STOP on
-- Watchtower-Track: security
-- Isolated credit-ledger integration fixture: synthetic DB-persisted
-- first-Memory positive receipt, NOT proof of real browser ACK issuance.
-- The entire fixture and S0-shaped receipt columns are ROLLBACK-only.
begin;

alter table public.chat_turn_attempts
  add column if not exists seyeon_positive_delivery_receipt_hash bytea,
  add column if not exists seyeon_positive_delivery_issued_at timestamptz,
  add column if not exists seyeon_positive_delivery_received_at timestamptz;

insert into auth.users(id) values('cb110000-0000-4000-8000-000000000001');
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
values('cb110000-0000-4000-8000-000000000001','member',
       'cb110000-0000-4000-8000-000000000001','active',now(),now());
insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,
  min_client_capability,asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at
) values(
  'cb120000-0000-4000-8000-000000000001','g4-positive-settlement-fixture-v1',
  'sha256:v1:'||repeat('a',64),'fixture:g4-positive-settlement','v1','web-v1',
  'sha256:v1:'||repeat('b',64),'v1','{}'::jsonb,now()
);
insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_policy_version,
  rollout_seed,activated_at,created_at
) values(
  'cb130000-0000-4000-8000-000000000001','g4-positive-settlement-release',
  'cb120000-0000-4000-8000-000000000001','active',false,'v1','disposable',now(),now()
);
insert into public.characters(character_id,created_at)
values('seyeon',now()) on conflict do nothing;
insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,published_at
) values('seyeon','cb120000-0000-4000-8000-000000000001',
         'available',true,now());
insert into public.conversation_threads(
  id,subject_id,thread_type,status,active_content_release_id,
  active_content_bundle_id,created_at,updated_at
) values(
  'cb140000-0000-4000-8000-000000000001',
  'cb110000-0000-4000-8000-000000000001','single_character','active',
  'cb130000-0000-4000-8000-000000000001',
  'cb120000-0000-4000-8000-000000000001',now(),now()
);
insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at
) values(
  'cb150000-0000-4000-8000-000000000001',
  'cb140000-0000-4000-8000-000000000001','seyeon',
  'cb120000-0000-4000-8000-000000000001','primary',now()-interval '1 minute'
);
insert into public.chat_turns(
  id,thread_id,subject_id,client_turn_id,request_hash,
  request_contract_version,request_snapshot_jsonb,
  resolved_content_release_id,resolved_content_bundle_id,
  state,created_at,updated_at
) values(
  'cb170000-0000-4000-8000-000000000001',
  'cb140000-0000-4000-8000-000000000001',
  'cb110000-0000-4000-8000-000000000001',
  'cb160000-0000-4000-8000-000000000001',
  'sha256:v1:g4-positive-settlement','chat-request-v1','{}'::jsonb,
  'cb130000-0000-4000-8000-000000000001',
  'cb120000-0000-4000-8000-000000000001',
  'received',now(),now()
);

-- The source Pin and receipt marker are synthetic stored state. The actual
-- S0 issuer/authenticated user receipt are a SEPARATE pending G5/G6 test.
insert into public.chat_turn_attempts(
  id,turn_id,subject_id,attempt_no,state,planner_version,started_at,
  seyeon_personal_source_pin_jsonb,seyeon_personal_source_pinned_at,
  seyeon_positive_delivery_receipt_hash,
  seyeon_positive_delivery_issued_at,seyeon_positive_delivery_received_at
) values(
  'cb180000-0000-4000-8000-000000000001',
  'cb170000-0000-4000-8000-000000000001',
  'cb110000-0000-4000-8000-000000000001',
  1,'running','g4-disposable-fixture-v1',now(),
  '{"positiveProof":{"source":"synthetic-disposable-db-fixture"}}'::jsonb,now(),
  decode(repeat('a',64),'hex'),now()-interval '2 seconds',now()
);
insert into public.ai_execution_logs(
  id,subject_id,turn_id,turn_attempt_id,stage,provider,model,prompt_version,
  content_release_id,content_bundle_id,character_id,
  input_ref_jsonb,output_ref_jsonb,status,created_at
) values(
  'cb190000-0000-4000-8000-000000000001',
  'cb110000-0000-4000-8000-000000000001',
  'cb170000-0000-4000-8000-000000000001',
  'cb180000-0000-4000-8000-000000000001',
  'renderer','synthetic','offline','g4-pg-v1',
  'cb130000-0000-4000-8000-000000000001',
  'cb120000-0000-4000-8000-000000000001',
  'seyeon','{}'::jsonb,'{}'::jsonb,'success',now()
),(
  'cb1a0000-0000-4000-8000-000000000001',
  'cb110000-0000-4000-8000-000000000001',
  'cb170000-0000-4000-8000-000000000001',
  'cb180000-0000-4000-8000-000000000001',
  'output_guard','synthetic','offline','g4-pg-v1',
  'cb130000-0000-4000-8000-000000000001',
  'cb120000-0000-4000-8000-000000000001',
  'seyeon','{}'::jsonb,'{}'::jsonb,'success',now()
);
update public.chat_turn_attempts
  set state='generated',
      generation_ai_execution_log_id='cb190000-0000-4000-8000-000000000001',
      generated_thread_character_id='cb150000-0000-4000-8000-000000000001',
      generated_character_content_bundle_id='cb120000-0000-4000-8000-000000000001',
      generated_body_text='Synthetic original first positive answer',
      generated_content_hash='sha256:v1:'||repeat('c',64),
      grounding_refs_jsonb='[]'::jsonb,generated_at=now(),finished_at=now()
  where id='cb180000-0000-4000-8000-000000000001';
update public.chat_turn_attempts
  set state='validated',
      validation_ai_execution_log_id='cb1a0000-0000-4000-8000-000000000001',
      validation_result_jsonb='{"passed":true}'::jsonb,validated_at=now()
  where id='cb180000-0000-4000-8000-000000000001';
insert into public.conversation_messages(
  id,thread_id,subject_id,turn_id,sequence_no,sender_type,
  thread_character_id,character_content_bundle_id,body_text,
  content_hash,created_at
) values(
  'cb1b0000-0000-4000-8000-000000000001',
  'cb140000-0000-4000-8000-000000000001',
  'cb110000-0000-4000-8000-000000000001',
  'cb170000-0000-4000-8000-000000000001',
  1,'character','cb150000-0000-4000-8000-000000000001',
  'cb120000-0000-4000-8000-000000000001',
  'Synthetic original first positive answer','sha256:v1:'||repeat('c',64),now()
);
update public.chat_turn_attempts
  set state='committed',
      committed_message_id='cb1b0000-0000-4000-8000-000000000001',
      finished_at=now()
  where id='cb180000-0000-4000-8000-000000000001';
update public.chat_turns
  set state='delivered',
      committed_attempt_id='cb180000-0000-4000-8000-000000000001',
      committed_at=now()-interval '1 second',
      delivered_at=now(),updated_at=now()
  where id='cb170000-0000-4000-8000-000000000001';

select public.internal_cmd_chat_signup_credit_v1(
  'cb110000-0000-4000-8000-000000000001'
);

-- Real private Commerce executor, not Postgres owner and not the browser.
set local role myeongha_commerce_internal_executor;
select pg_catalog.set_config('myeongha.subject_id',
  'cb110000-0000-4000-8000-000000000001',true);
do $settlement$
declare
  s uuid:='cb110000-0000-4000-8000-000000000001';
  thread uuid:='cb140000-0000-4000-8000-000000000001';
  client_turn uuid:='cb160000-0000-4000-8000-000000000001';
  committed_turn uuid:='cb170000-0000-4000-8000-000000000001';
  assistant uuid:='cb1b0000-0000-4000-8000-000000000001';
  rid uuid;
  state text;
begin
  if current_user<>'myeongha_commerce_internal_executor' then
    raise exception 'Private G4 positive charge not executed as Commerce role';
  end if;
  select outcome,reservation_id into state,rid
    from public.internal_cmd_chat_credit_reserve_v1(s,thread,client_turn);
  if state<>'reserved' or rid is null then
    raise exception 'Original positive delivery did not reserve 10 credits';
  end if;
  begin
    perform public.internal_cmd_chat_credit_ack_delivered_proven_v2(
      s,thread,client_turn,rid,committed_turn,
      'cb1c0000-0000-4000-8000-000000000001'::uuid);
    raise exception 'Wrong assistant unexpectedly charged';
  exception when others then
    if sqlerrm not like 'Credit ACK lacks matching original DB-delivered assistant proof%'
      then raise; end if;
  end;
  -- No browser-selected reservation, subject or message can trigger this
  -- private post-receipt RPC; it binds all identifiers from the real DB.
  begin
    perform public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(
      'cb180000-0000-4000-8000-000000000002'::uuid);
    raise exception 'Unknown receipt Attempt unexpectedly settled';
  exception when others then
    if sqlerrm not like 'G4 receipt settlement requires original acknowledged positive delivery%'
      then raise; end if;
  end;
  if public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(
       'cb180000-0000-4000-8000-000000000001'::uuid)<>'settled' then
    raise exception 'Persisted positive receipt did not settle ten credits';
  end if;
  if public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(
       'cb180000-0000-4000-8000-000000000001'::uuid)<>'settled' then
    raise exception 'Repeated original receipt was not idempotent';
  end if;
  if has_function_privilege('myeongha_api_executor',
    'public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)','EXECUTE')
    or has_function_privilege('authenticated',
    'public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)','EXECUTE')
    or has_function_privilege('service_role',
    'public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)','EXECUTE') then
    raise exception 'Receipt-driven credit settlement leaked to public';
  end if;
  select outcome into state
    from public.internal_cmd_chat_credit_reserve_v1(s,thread,client_turn);
  if state<>'committed_replay' then
    raise exception 'Settled original allowed another 10-credit reservation';
  end if;
  begin
    perform public.internal_cmd_seyeon_g4_credit_refund_proven_v1(
      s,thread,client_turn,rid);
    raise exception 'Delivered original was refunded';
  exception when others then
    if sqlerrm not like 'G4 refund requires exact still-reserved credit%'
      then raise; end if;
  end;
  if has_function_privilege('myeongha_api_executor',
    'public.internal_cmd_chat_credit_ack_delivered_proven_v2(uuid,uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE') then raise exception 'Ordinary Member can charge credit'; end if;
end $settlement$;

reset role;
do $proof$
declare
  s uuid:='cb110000-0000-4000-8000-000000000001';
  rid uuid;
  balance bigint;
  state text;
  allocations integer;
begin
  select r.id,r.state into rid,state from public.chat_credit_turn_reservations_v1 r
    where r.subject_id=s and r.client_turn_id='cb160000-0000-4000-8000-000000000001';
  if rid is null or state<>'settled' then
    raise exception 'Persisted positive reservation not settled';
  end if;
  select sum(credits) into allocations from public.chat_credit_turn_allocations_v1
    where reservation_id=rid;
  select available_credits into balance
    from public.internal_qry_chat_credit_balance_v1(s);
  if allocations<>10 or balance<>40 then
    raise exception 'Positive reply charged more or less than ten credits';
  end if;
end $proof$;
rollback;
