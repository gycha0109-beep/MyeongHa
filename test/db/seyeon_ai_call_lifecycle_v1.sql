-- Offline SQL regression; reuses the committed attempt from
-- chat_attempt_commit_concurrency.sh and rolls every test mutation back.
begin;
set local role myeongha_api_executor;
set local myeongha.subject_id = 'a0000000-0000-0000-0000-000000000001';

do $test$
declare
  v_call uuid := 'b0100000-0000-4000-8000-000000000001';
  v_other uuid := 'b0100000-0000-4000-8000-000000000002';
  v_subject uuid := 'a0000000-0000-0000-0000-000000000001';
  v_turn uuid := 'a4000000-0000-0000-0000-000000000006';
  v_attempt uuid := 'a6000000-0000-0000-0000-000000000006';
  v_start record;
  v_settle record;
  v_summary record;
  v_model record;
  v_unsettled_count bigint;
  v_event jsonb;
  v_failed boolean;
begin
  if pg_catalog.has_table_privilege(
    'myeongha_api_executor',
    'public.seyeon_ai_call_cost_events',
    'INSERT, UPDATE, DELETE'
  ) then
    raise exception 'API executor must not have direct cost ledger DML';
  end if;

  -- This committed turn allows post-turn extraction, but never an inline call.
  v_failed := false;
  begin
    perform * from public.cmd_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'chat',v_other,
      'dialogue_render','openai-responses','test-model');
  exception when check_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'Committed attempt allowed inline call'; end if;

  select * into strict v_start from public.cmd_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_call,
    'event_extraction','openai-responses','test-model');
  if v_start.call_id is distinct from v_call then
    raise exception 'Start receipt mismatch';
  end if;

  -- Started calls are billable-unknown, not free; they are visible in totals.
  select * into strict v_summary from public.qry_seyeon_ai_turn_cost_v1(
    v_subject,v_turn);
  if v_summary.call_count<>1
     or v_summary.unknown_cost_calls<>1
     or v_summary.total_estimated_cost_micro_usd is not null then
    raise exception 'Unsettled AI cost silently disappeared from turn summary';
  end if;

  select * into strict v_model from public.qry_seyeon_ai_model_cost_v1(v_subject,v_turn);
  select count(*) into v_unsettled_count
    from public.qry_seyeon_ai_unsettled_calls_v1(v_subject,v_turn);
  if v_model.model_key is distinct from 'test-model'
     or v_model.unsettled_calls<>1
     or v_model.unknown_cost_calls<>1
     or v_model.total_estimated_cost_micro_usd is not null
     or v_unsettled_count<>1 then
    raise exception 'Pending per-model cost did not remain unresolved';
  end if;

  -- Even identical duplicate start must reject: never authorize a second dispatch.
  v_failed := false;
  begin
    perform * from public.cmd_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_call,
      'event_extraction','openai-responses','test-model');
  exception when unique_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'Duplicate paid call ID was admitted'; end if;

  v_event := pg_catalog.jsonb_build_object(
    'schemaVersion','seyeon-ai-cost-v1',
    'callId',v_call::text,
    'purpose','event_extraction',
    'providerKey','openai-responses',
    'modelKey','test-model',
    'outcome','response_received',
    'httpStatus',200,
    'elapsedMs',15,
    'inputTokens',25,
    'cachedInputTokens',0,
    'outputTokens',8,
    'reasoningTokens',0,
    'priceVersion','offline-v1',
    'estimatedCostMicroUsd',27,
    'costStatus','estimated',
    'invoiceReconciled',false
  );
  select * into strict v_settle from public.cmd_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_event);
  if v_settle.call_id is distinct from v_call or v_settle.replayed then
    raise exception 'First settlement was not applied';
  end if;

  select * into strict v_settle from public.cmd_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_event);
  if not v_settle.replayed then
    raise exception 'Identical settlement replay was not idempotent';
  end if;

  v_failed := false;
  begin
    perform * from public.cmd_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',
      pg_catalog.jsonb_set(v_event,'{elapsedMs}','16'::jsonb));
  exception when check_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'Conflicting settlement replay was admitted'; end if;

  v_failed := false;
  begin
    perform * from public.cmd_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',
      v_event || '{"rawPrompt":"forbidden"}'::jsonb);
  exception when check_violation then v_failed:=true;
  end;
  if not v_failed then raise exception 'Untrusted raw prompt entered cost ledger'; end if;

  v_failed := false;
  begin
    perform * from public.cmd_start_seyeon_ai_call_v1(
      'a0000000-0000-0000-0000-000000000099',
      v_turn,v_attempt,'post_turn',v_other,
      'event_extraction','openai-responses','test-model');
  exception when insufficient_privilege then v_failed:=true;
  end;
  if not v_failed then raise exception 'Cross-Subject call start was admitted'; end if;

  select * into strict v_model from public.qry_seyeon_ai_model_cost_v1(v_subject,v_turn);
  select count(*) into v_unsettled_count
    from public.qry_seyeon_ai_unsettled_calls_v1(v_subject,v_turn);
  if v_model.call_count<>1 or v_model.unsettled_calls<>0
     or v_model.unknown_cost_calls<>0
     or v_model.total_estimated_cost_micro_usd<>27
     or v_unsettled_count<>0 then
    raise exception 'Settled per-model cost or pending list is inconsistent';
  end if;

  select * into strict v_summary from public.qry_seyeon_ai_turn_cost_v1(
    v_subject,v_turn);
  if v_summary.call_count<>1
     or v_summary.known_cost_micro_usd<>27
     or v_summary.unknown_cost_calls<>0
     or v_summary.total_estimated_cost_micro_usd<>27 then
    raise exception 'Settled call produced an incorrect aggregate';
  end if;
end
$test$;
rollback;
select 'Se-yeon call lifecycle RPC tests passed' as status;
