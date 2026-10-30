-- Local disposable PostgreSQL test only. No remote service or billing calls.
begin;
do $$ begin
  if current_database()<>'myeongha_admin_disposable' then raise exception 'Disposable admin database required';end if;
end $$;
insert into public.seyeon_ai_call_cost_events(call_id,subject_id,thread_id,turn_id,attempt_id,phase,event_jsonb,purpose,provider_key,model_key,outcome,price_version,cost_status,estimated_cost_micro_usd)
values
 ('123e4567-e89b-42d3-a456-426614174081','123e4567-e89b-42d3-a456-426614174080','123e4567-e89b-42d3-a456-426614174080','123e4567-e89b-42d3-a456-426614174080','123e4567-e89b-42d3-a456-426614174080','chat','{"inputTokens":1000,"outputTokens":100,"cachedInputTokens":500,"reasoningTokens":50}'::jsonb,'dialogue_render','finance-fixture','finance-test-model','response_received','finance-fixture-price','estimated',750),
 ('123e4567-e89b-42d3-a456-426614174082','123e4567-e89b-42d3-a456-426614174080','123e4567-e89b-42d3-a456-426614174080','123e4567-e89b-42d3-a456-426614174080','123e4567-e89b-42d3-a456-426614174083','chat','{"inputTokens":null,"outputTokens":null,"cachedInputTokens":null,"reasoningTokens":null}'::jsonb,'dialogue_render','finance-fixture','finance-test-model','timeout',null,'usage_unknown',null);
set local role myeongha_admin_reader;
do $$ declare result record;begin
 select * into strict result from myeongha_admin_ops.qry_ai_finance_summary_v1(21,0,current_date-1,current_date,'123e4567-e89b-42d3-a456-426614174080',null,null,'month','subject');
 if result.calls<>'2' or result."failedCalls"<>'1' or result."observedAttempts"<>'2' or result."knownEstimateMicroUsd"<>'750'
  or result."estimatedMicroUsd" is not null or result."confirmedMicroUsd" is not null or result."unknownUsageCalls"<>'1'
  or result."confirmedMicroKrw" is not null or result."revenueCostBasisPoints" is not null then raise exception 'Partial finance cohort was misstated';end if;
 if (select count(*) from myeongha_admin_ops.qry_ai_finance_calls_v1(21,0,current_date-1,current_date,'123e4567-e89b-42d3-a456-426614174080',null,null))<>2 then raise exception 'Exact finance cohort missing';end if;
 begin
  perform event_jsonb from public.seyeon_ai_call_cost_events limit 1;
  raise exception 'Raw cost JSON unexpectedly readable';
 exception when insufficient_privilege then null;end;
 begin
  perform * from myeongha_admin_ops.qry_ai_finance_calls_v1(null,0,current_date-1,current_date,null,null,null);
  raise exception 'Unbounded null limit accepted';
 exception when others then if SQLERRM<>'Invalid bounded AI finance read' then raise;end if;end;
 if has_column_privilege('myeongha_admin_finance_source_reader',to_regclass('public.seyeon_ai_governor_model_policies_v1'),'model_key','SELECT') is not true then
  begin
   perform * from myeongha_admin_ops.qry_ai_finance_prices_v1(20,0,null);
   raise exception 'Unconnected price authority was reported as readable';
  exception when raise_exception then if SQLERRM<>'AI rate source unavailable' then raise;end if;end;
 end if;
 raise notice 'PASS AI finance nonempty cohort, missing cost, no false invoice/FX, raw JSON ACL and null-limit denial';
end $$;
rollback;
