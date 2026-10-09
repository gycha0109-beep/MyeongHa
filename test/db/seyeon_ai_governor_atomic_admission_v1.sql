-- PR-04B: offline database admission with a committed post-turn attempt.
-- Must follow chat_attempt_commit_concurrency.sh. All changes roll back.
begin;
insert into public.seyeon_ai_governor_model_policies_v1 (
  provider_key,model_key,policy_version,price_version,allowed_purposes,
  context_window_tokens,maximum_input_tokens,maximum_output_tokens,
  maximum_serialized_request_bytes,
  input_micro_usd_per_million,cached_input_micro_usd_per_million,
  output_micro_usd_per_million,is_active
) values (
  'openai-responses','test-model','offline-policy-v1','offline-rate-v1',
  array['event_extraction']::text[],
  2000,1200,800,20000,
  1000000,250000,4000000,true
);
insert into public.seyeon_ai_governor_daily_budgets_v1 (
  bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd
) values ((clock_timestamp() at time zone 'UTC')::date,15000,8000);

set local role myeongha_api_executor;
set local myeongha.subject_id = 'a0000000-0000-0000-0000-000000000001';

do $test$
declare
  v_subject uuid := 'a0000000-0000-0000-0000-000000000001';
  v_turn uuid := 'a4000000-0000-0000-0000-000000000006';
  v_attempt uuid := 'a6000000-0000-0000-0000-000000000006';
  v_call1 uuid := 'b0200000-0000-4000-8000-000000000001';
  v_call2 uuid := 'b0200000-0000-4000-8000-000000000002';
  v_call3 uuid := 'b0200000-0000-4000-8000-000000000003';
  v_receipt record;
  v_summary record;
  v_denied boolean;
begin
  if pg_catalog.has_table_privilege(
    'myeongha_api_executor','public.seyeon_ai_governor_daily_budgets_v1',
    'SELECT,INSERT,UPDATE,DELETE'
  ) or pg_catalog.has_table_privilege(
    'myeongha_api_executor','public.seyeon_ai_governor_model_policies_v1',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'API executor can mutate or read budget operator tables';
  end if;

  select * into strict v_receipt from public.cmd_governed_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_call1,'event_extraction',
    'openai-responses','test-model','offline-policy-v1','offline-rate-v1',
    500,800,2500
  );
  if v_receipt.call_id is distinct from v_call1
     or v_receipt.ceiling_micro_usd<>3700
     or v_receipt.bucket_utc_date<>(clock_timestamp() at time zone 'UTC')::date then
    raise exception 'First budget reservation receipt incorrect';
  end if;

  -- Retry of an admitted call never authorizes another dispatch.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_call1,'event_extraction',
      'openai-responses','test-model','offline-policy-v1','offline-rate-v1',
      500,800,2500);
  exception when unique_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Duplicate call ID was admitted'; end if;

  -- No caller may reduce the server-approved output ceiling or claim a
  -- different price policy to under-reserve a paid call.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_call3,'event_extraction',
      'openai-responses','test-model','offline-policy-v1','offline-rate-v1',
      500,799,2500);
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Unbounded output underquoted'; end if;

  v_denied:=false;
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_call3,'event_extraction',
      'openai-responses','test-model','offline-policy-v1','invalid-price',
      500,800,2500);
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Unknown rate card was admitted'; end if;

  v_denied:=false;
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_call3,'event_extraction',
      'openai-responses','test-model','offline-policy-v1','offline-rate-v1',
      1201,800,2500);
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Exceeded approved input ceiling'; end if;

  v_denied:=false;
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      'a0000000-0000-0000-0000-000000000099',
      v_turn,v_attempt,'post_turn',v_call3,'event_extraction',
      'openai-responses','test-model','offline-policy-v1','offline-rate-v1',
      500,800,2500);
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Foreign Subject bypassed budget'; end if;

  select * into strict v_receipt from public.cmd_governed_start_seyeon_ai_call_v1(
    v_subject,v_turn,v_attempt,'post_turn',v_call2,'event_extraction',
    'openai-responses','test-model','offline-policy-v1','offline-rate-v1',
    500,800,2500
  );
  if v_receipt.ceiling_micro_usd<>3700 then
    raise exception 'Second same-Subject budget receipt incorrect';
  end if;

  -- Subject daily budget is 8000, globally 15000: Subject rejection wins.
  v_denied:=false;
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      v_subject,v_turn,v_attempt,'post_turn',v_call3,'event_extraction',
      'openai-responses','test-model','offline-policy-v1','offline-rate-v1',
      500,800,2500);
  exception when check_violation then
    v_denied := sqlerrm like '%Subject daily budget exhausted%';
  end;
  if not v_denied then raise exception 'Subject daily budget exceeded'; end if;

  select * into strict v_summary from public.qry_seyeon_ai_turn_cost_v1(
    v_subject,v_turn);
  if v_summary.call_count<>2 or v_summary.unknown_cost_calls<>2
     or v_summary.total_estimated_cost_micro_usd is not null then
    raise exception 'Budget-ledger started calls became cost-free';
  end if;
end
$test$;

-- Privileged test observation: rejected reservations must not alter the
-- service-wide accounting counter, and no API caller has direct access.
reset role;
do $verify$
declare v_used bigint;
begin
  select occupied_micro_usd into strict v_used
  from public.seyeon_ai_governor_daily_budgets_v1
  where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date;
  if v_used<>7400 then
    raise exception 'Atomic budget accounting expected 7400 microUSD, got %',v_used;
  end if;
end
$verify$;

-- The same Subject is still below its configured 8000 budget, but globally
-- below 7400+3700 => 10000, so globally exhausted after operator cap change.
update public.seyeon_ai_governor_daily_budgets_v1
set global_limit_micro_usd=9000,subject_limit_micro_usd=15000
where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date;
set local role myeongha_api_executor;
do $test_global$
declare v_denied boolean:=false;
begin
  begin
    perform * from public.cmd_governed_start_seyeon_ai_call_v1(
      'a0000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000006',
      'a6000000-0000-0000-0000-000000000006',
      'post_turn','b0200000-0000-4000-8000-000000000003',
      'event_extraction','openai-responses','test-model',
      'offline-policy-v1','offline-rate-v1',500,800,2500);
  exception when check_violation then
    v_denied:=sqlerrm like '%global daily budget exhausted%';
  end;
  if not v_denied then raise exception 'Global daily budget exceeded'; end if;
end
$test_global$;
rollback;
select 'Se-yeon atomic budget admission v1 tests passed' as status;
