-- Nonempty, disposable-only Seoul boundary scenario. No provider API or FX lookup.
begin;
do $$ begin if current_database()<>'myeongha_admin_disposable' then raise exception 'Disposable admin database required';end if;end $$;
insert into public.seyeon_ai_call_cost_events(call_id,subject_id,thread_id,turn_id,attempt_id,phase,event_jsonb,purpose,provider_key,model_key,outcome,price_version,cost_status,estimated_cost_micro_usd,created_at)
select gen_random_uuid(),'123e4567-e89b-42d3-a456-426614174080','123e4567-e89b-42d3-a456-426614174080','123e4567-e89b-42d3-a456-426614174080',gen_random_uuid(),'chat','{}'::jsonb,'dialogue_render','budget-fixture','budget-model','response_received','fixture-v1',
 case when x=2 then 'usage_unknown' else 'estimated' end,case when x=2 then null else 750 end,
 case when x=0 then (date_trunc('month',now() at time zone 'Asia/Seoul')-interval '1 month') at time zone 'Asia/Seoul'-interval '1 microsecond'
 when x=1 then (date_trunc('month',now() at time zone 'Asia/Seoul')-interval '1 month') at time zone 'Asia/Seoul'
 else date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'-interval '1 microsecond' end
from generate_series(0,2) x;
set local role myeongha_admin_reader;
do $$ declare v jsonb;f timestamptz:=(date_trunc('month',now() at time zone 'Asia/Seoul')-interval '1 month') at time zone 'Asia/Seoul';t timestamptz:=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';begin
 select bucket into strict v from myeongha_admin_ops.qry_ai_monthly_budget_v1(f,t) where bucket->>'provider'='budget-fixture';
 if v->>'calls'<>'2' or v->>'unknownCostCalls'<>'1' or v->>'estimateMicroUsd'<>'750' then raise exception 'Seoul boundary or partial cost aggregate invalid';end if;
 begin perform * from myeongha_admin_ops.qry_ai_monthly_budget_v1(date_trunc('month',f at time zone 'UTC') at time zone 'UTC',t);raise exception 'UTC boundary wrongly accepted';
 exception when others then if SQLERRM<>'Exact Seoul calendar month required' then raise;end if;end;
 raise notice 'PASS Seoul month boundaries and partial cost ledger aggregate';
end $$;
rollback;
