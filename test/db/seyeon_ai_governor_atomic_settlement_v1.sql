-- PR-04C-2: deterministic, rolled-back governed settlement & budget tests.
-- Run after chat_attempt_commit_concurrency.sh (known committed attempt).
begin;
insert into public.seyeon_ai_governor_model_policies_v1(
  provider_key,model_key,policy_version,price_version,allowed_purposes,
  context_window_tokens,maximum_input_tokens,maximum_output_tokens,
  maximum_serialized_request_bytes,input_micro_usd_per_million,
  cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active
) values (
  'openai-responses','test-model','offline-policy-v1','offline-rate-v1',
  array['event_extraction']::text[],2000,1200,800,20000,
  1000000,250000,4000000,true
);
insert into public.seyeon_ai_governor_daily_budgets_v1(
  bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd
) values ((clock_timestamp() at time zone 'UTC')::date,10000,4200);

-- D1: A settled rate card cannot be repriced in place or deleted. Operators
-- may disable/restore admission without altering previously priced calls.
do $test_rate_card_immutable$
declare v_denied boolean;
begin
  v_denied:=false;
  begin
    update public.seyeon_ai_governor_model_policies_v1
    set input_micro_usd_per_million=2_000_000
    where policy_version='offline-policy-v1';
  exception when check_violation then
    v_denied:=true;
  end;
  if not v_denied then raise exception 'Model rate changed without version rollover'; end if;

  v_denied:=false;
  begin
    update public.seyeon_ai_governor_model_policies_v1
    set allowed_purposes=array['dialogue_render']::text[]
    where policy_version='offline-policy-v1';
  exception when check_violation then
    v_denied:=true;
  end;
  if not v_denied then raise exception 'Model purpose changed without new policy'; end if;

  v_denied:=false;
  begin
    delete from public.seyeon_ai_governor_model_policies_v1
    where policy_version='offline-policy-v1';
  exception when check_violation then
    v_denied:=true;
  end;
  if not v_denied then raise exception 'Governed immutable policy deleted'; end if;

  update public.seyeon_ai_governor_model_policies_v1
  set is_active=false
  where policy_version='offline-policy-v1';
  update public.seyeon_ai_governor_model_policies_v1
  set is_active=true
  where policy_version='offline-policy-v1';
end
$test_rate_card_immutable$;

set local role myeongha_api_executor;
set local myeongha.subject_id = 'a0000000-0000-0000-0000-000000000001';
do $test$
declare
  v_subject uuid:='a0000000-0000-0000-0000-000000000001';
  v_turn uuid:='a4000000-0000-0000-0000-000000000006';
  v_attempt uuid:='a6000000-0000-0000-0000-000000000006';
  v_first uuid:='b0300000-0000-4000-8000-000000000001';
  v_second uuid:='b0300000-0000-4000-8000-000000000002';
  v_third uuid:='b0300000-0000-4000-8000-000000000003';
  v_event jsonb;
  v_unknown jsonb;
  v_reply record;
  v_sum record;
  v_denied boolean;
begin
  perform * from public.cmd_governed_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_first,
    'event_extraction','openai-responses','test-model',
    'offline-policy-v1','offline-rate-v1',500,800,2500
  );
  v_event:=pg_catalog.jsonb_build_object(
    'schemaVersion','seyeon-ai-cost-v1',
    'callId',v_first::text,
    'purpose','event_extraction',
    'providerKey','openai-responses',
    'modelKey','test-model',
    'outcome','response_received',
    'httpStatus',200,'elapsedMs',8,
    'inputTokens',100,'cachedInputTokens',0,
    'outputTokens',50,'reasoningTokens',0,
    'priceVersion','offline-rate-v1',
    'estimatedCostMicroUsd',300,
    'costStatus','estimated',
    'invoiceReconciled',false
  );
  -- D1: Recalculate expected cost from the DB rate card, not the caller's
  -- untrusted estimatedCostMicroUsd, even when the quoted rate version matches.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',
      pg_catalog.jsonb_set(v_event,'{estimatedCostMicroUsd}','1'::jsonb)
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Forged underpriced cost passed settlement'; end if;

  -- Same forged total, but cache allocation differs from original pricing.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',
      pg_catalog.jsonb_set(v_event,'{cachedInputTokens}','10'::jsonb)
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Forged cache split passed settlement'; end if;

  -- An estimated settlement MUST expose the input, output, cached usage.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',
      pg_catalog.jsonb_set(v_event,'{inputTokens}','null'::jsonb)
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Estimated price admitted absent token usage'; end if;

  -- Governed pricing exists, so price_unknown cannot silently settle.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(v_event,'{costStatus}','"price_unknown"'::jsonb),
        '{estimatedCostMicroUsd}','null'::jsonb
      )
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Governed call lost configured pricing'; end if;

  -- Complete usage cannot be used to hide a charge under usage_unknown.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(v_event,'{costStatus}','"usage_unknown"'::jsonb),
        '{estimatedCostMicroUsd}','null'::jsonb
      )
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Complete usage was marked unknown'; end if;

  -- No direct executor SELECT grants on the protected cost ledger.
  -- Use its narrow, Subject-scoped summary to prove rejection left the
  -- record started, without bypassing RLS in the test.
  select * into strict v_sum from public.qry_seyeon_ai_turn_cost_v1(
    v_subject,v_turn
  );
  if v_sum.call_count<>1 or v_sum.unknown_cost_calls<>1
    or v_sum.total_estimated_cost_micro_usd is not null then
    raise exception 'Rejected price manipulation settled the reservation';
  end if;

  select * into strict v_reply from public.cmd_governed_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_event
  );
  if v_reply.call_id is distinct from v_first or v_reply.replayed
    or v_reply.occupied_micro_usd<>300 or v_reply.over_ceiling then
    raise exception 'First governed settlement failed to release unused reserve';
  end if;

  select * into strict v_reply from public.cmd_governed_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_event
  );
  if not v_reply.replayed or v_reply.occupied_micro_usd<>300 then
    raise exception 'Idempotent governed settlement replay charged again';
  end if;
  v_denied:=false;
  begin
    perform * from public.cmd_governed_settle_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',
      pg_catalog.jsonb_set(v_event,'{estimatedCostMicroUsd}','301'::jsonb)
    );
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then
    raise exception 'Conflicting governed settlement replay was accepted';
  end if;

  -- A second call is admitted ONLY after actual cost 300 replaces ceiling 3700
  -- for both the global budget and the per-Subject occupancy.
  select * into strict v_reply from public.cmd_governed_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_second,
    'event_extraction','openai-responses','test-model',
    'offline-policy-v1','offline-rate-v1',500,800,2500
  );
  if v_reply.ceiling_micro_usd<>3700 then
    raise exception 'Subject usage was not released after safe settlement';
  end if;
  -- Missing usage may still be invoiced. Hold entire second reservation.
  v_unknown:=pg_catalog.jsonb_build_object(
    'schemaVersion','seyeon-ai-cost-v1',
    'callId',v_second::text,
    'purpose','event_extraction',
    'providerKey','openai-responses',
    'modelKey','test-model',
    'outcome','timeout',
    'httpStatus',null,'elapsedMs',2000,
    'inputTokens',null,'cachedInputTokens',null,
    'outputTokens',null,'reasoningTokens',null,
    'priceVersion',null,
    'estimatedCostMicroUsd',null,
    'costStatus','usage_unknown',
    'invoiceReconciled',false
  );
  select * into strict v_reply from public.cmd_governed_settle_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_unknown
  );
  if v_reply.replayed or v_reply.occupied_micro_usd<>3700 or v_reply.over_ceiling then
    raise exception 'Unknown usage was refunded or concealed';
  end if;
  v_denied:=false;
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_third,
      'event_extraction','openai-responses','test-model',
      'offline-policy-v1','offline-rate-v1',500,800,2500
    );
  exception when check_violation then
    v_denied:=sqlerrm like '%Subject daily budget exhausted%';
  end;
  if not v_denied then raise exception 'Unknown usage stopped occupying Subject budget'; end if;

  select * into strict v_sum from public.qry_seyeon_ai_turn_cost_v1(v_subject,v_turn);
  if v_sum.call_count<>2 or v_sum.known_cost_micro_usd<>300
    or v_sum.unknown_cost_calls<>1
    or v_sum.total_estimated_cost_micro_usd is not null then
    raise exception 'Unsettled estimated and unknown costs became conflated';
  end if;
end
$test$;

reset role;
do $audit$
declare
  v_used bigint;
  v_effective bigint;
begin
  select occupied_micro_usd into strict v_used
  from public.seyeon_ai_governor_daily_budgets_v1
  where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date;
  if v_used<>4000 then
    raise exception 'Global actual+unknown budget expected 4000 microUSD, got %',v_used;
  end if;
  select sum(e.governor_effective_micro_usd) into v_effective
  from public.seyeon_ai_call_cost_events e
  where e.subject_id='a0000000-0000-0000-0000-000000000001'
    and e.governor_bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date;
  if v_effective<>4000 then
    raise exception 'Subject actual+held usage expected 4000 microUSD, got %',v_effective;
  end if;
end
$audit$;
rollback;
select 'Se-yeon governed atomic settlement v1 tests passed' as status;
