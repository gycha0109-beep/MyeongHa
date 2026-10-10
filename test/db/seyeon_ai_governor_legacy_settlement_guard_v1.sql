-- PR-04D3B2B-1: offline regression against the real PostgreSQL authority.
-- Reuses the committed post-turn fixture and leaves the DB unchanged.
begin;
insert into public.seyeon_ai_governor_model_policies_v1(
  provider_key,model_key,policy_version,price_version,allowed_purposes,
  context_window_tokens,maximum_input_tokens,maximum_output_tokens,
  maximum_serialized_request_bytes,input_micro_usd_per_million,
  cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active
) values (
  'openai-responses','guard-test-model','offline-guard-policy-v1','offline-guard-rate-v1',
  array['event_extraction']::text[],2000,1200,800,20000,
  1000000,250000,4000000,true
);
insert into public.seyeon_ai_governor_daily_budgets_v1(
  bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd
) values ((clock_timestamp() at time zone 'UTC')::date,10000,4200);

do $acl$
declare v_owner oid;
begin
  if pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Internal settlement helper was executable by public or API roles';
  end if;

  select p.proowner into strict v_owner
  from pg_catalog.pg_proc p
  where p.oid='public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb)'::regprocedure;
  if v_owner is distinct from
     'myeongha_seyeon_cost_meter_owner'::regrole::oid then
    raise exception 'Internal settlement ownership drifted';
  end if;
end
$acl$;

set local role myeongha_api_executor;
set local myeongha.subject_id = 'a0000000-0000-0000-0000-000000000001';
do $test$
declare
  v_subject uuid:='a0000000-0000-0000-0000-000000000001';
  v_turn uuid:='a4000000-0000-0000-0000-000000000006';
  v_attempt uuid:='a6000000-0000-0000-0000-000000000006';
  v_governed uuid:='b0400000-0000-4000-8000-000000000001';
  v_legacy uuid:='b0400000-0000-4000-8000-000000000002';
  v_event jsonb;
  v_legacy_event jsonb;
  v_reply record;
  v_sum record;
  v_denied boolean;
begin
  -- A direct caller must not gain the NOLOGIN owner's private core authority.
  v_denied:=false;
  begin
    perform * from public.seyeon_ai_settle_internal_v1(
      v_subject,v_turn,v_attempt,'post_turn','{}'::jsonb
    );
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then
    raise exception 'Direct private settlement helper invocation was authorized';
  end if;

  perform * from public.cmd_governed_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_governed,
    'event_extraction','openai-responses','guard-test-model',
    'offline-guard-policy-v1','offline-guard-rate-v1',500,800,2500
  );
  v_event:=pg_catalog.jsonb_build_object(
    'schemaVersion','seyeon-ai-cost-v1',
    'callId',v_governed::text,
    'purpose','event_extraction','providerKey','openai-responses',
    'modelKey','guard-test-model',
    'outcome','response_received','httpStatus',200,'elapsedMs',8,
    'inputTokens',100,'cachedInputTokens',0,'outputTokens',50,
    'reasoningTokens',0,'priceVersion','offline-guard-rate-v1',
    'estimatedCostMicroUsd',300,'costStatus','estimated',
    'invoiceReconciled',false
  );

  -- The previous vulnerability: a legacy settlement would set the event
  -- to 'settled' without releasing/adjusting the governed global counter.
  v_denied:=false;
  begin
    perform * from public.cmd_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_event
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then
    raise exception 'Legacy settlement mutated an active governed reservation';
  end if;
  select * into strict v_sum from public.qry_seyeon_ai_turn_cost_v1(v_subject,v_turn);
  if v_sum.call_count<>1 or v_sum.unknown_cost_calls<>1 or
     v_sum.total_estimated_cost_micro_usd is not null then
    raise exception 'Rejected legacy settlement mutated the unsettled ledger';
  end if;

  select * into strict v_reply from public.cmd_governed_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_event
  );
  if v_reply.replayed or v_reply.occupied_micro_usd<>300 or v_reply.over_ceiling then
    raise exception 'Authorized governed settlement could not release the reservation';
  end if;
  select * into strict v_reply from public.cmd_governed_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_event
  );
  if not v_reply.replayed or v_reply.occupied_micro_usd<>300 then
    raise exception 'Governed settlement idempotency drifted after splitting the core';
  end if;

  -- A settled governed call is still permanently excluded from legacy replay.
  v_denied:=false;
  begin
    perform * from public.cmd_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_event
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then
    raise exception 'Legacy replay was permitted on governed settled evidence';
  end if;

  -- OFF-mode legacy start, settle, and idempotent replay MUST remain valid.
  perform * from public.cmd_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_legacy,
    'event_extraction','openai-responses','guard-test-model'
  );
  v_legacy_event:=pg_catalog.jsonb_set(
    v_event,'{callId}',to_jsonb(v_legacy::text)
  );
  select * into strict v_reply from public.cmd_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_legacy_event
  );
  if v_reply.replayed or v_reply.call_id is distinct from v_legacy then
    raise exception 'OFF legacy settlement regressed';
  end if;
  select * into strict v_reply from public.cmd_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_legacy_event
  );
  if not v_reply.replayed then
    raise exception 'OFF legacy replay regressed';
  end if;

  -- Cross-subject calls remain blocked through Subject authority.
  v_denied:=false;
  begin
    perform * from public.cmd_settle_seyeon_ai_call_v1(
      'a0000000-0000-0000-0000-000000000099',
      v_turn,v_attempt,'post_turn',v_legacy_event
    );
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Cross-Subject legacy call was admitted'; end if;
end
$test$;

reset role;
do $audit$
declare v_occupied bigint; v_reserved bigint;
begin
  select occupied_micro_usd into strict v_occupied
  from public.seyeon_ai_governor_daily_budgets_v1
  where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date;
  select sum(governor_effective_micro_usd) into v_reserved
  from public.seyeon_ai_call_cost_events
  where call_id='b0400000-0000-4000-8000-000000000001';
  if v_occupied<>300 or v_reserved<>300 then
    raise exception 'Governed budget/ledger disagree after legacy guard: %, %',
      v_occupied,v_reserved;
  end if;
end
$audit$;
rollback;
select 'Seyeon D3B2B-1 legacy settlement guard passed' as status;
