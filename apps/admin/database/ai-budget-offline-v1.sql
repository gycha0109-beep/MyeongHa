-- Offline only; same installation/approval gate as AI finance. No price writes,
-- service interruption, credentials, billing lookup or alert delivery.
begin;
create function myeongha_admin_ops.qry_ai_monthly_budget_v1(p_from timestamptz,p_to timestamptz)
returns table(bucket jsonb) language plpgsql stable security definer
set search_path=pg_catalog,public as $$
begin
 if p_from is null or p_to is null
  or p_from<>(date_trunc('month',p_from at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
  or p_to<>((date_trunc('month',p_from at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul') then
  raise exception 'Exact Seoul calendar month required';end if;
 return query select jsonb_build_object('workload','character_chat','feature',e.phase,'provider',e.provider_key,'model',e.model_key,
  'calls',count(*)::text,'unknownCostCalls',count(*) filter(where e.cost_status is distinct from 'estimated' or e.estimated_cost_micro_usd is null)::text,
  'estimateMicroUsd',coalesce(sum(e.estimated_cost_micro_usd) filter(where e.cost_status='estimated'),0)::text)
 from public.seyeon_ai_call_cost_events e where e.created_at>=p_from and e.created_at<p_to and e.created_at<=current_timestamp
 group by e.phase,e.provider_key,e.model_key order by e.phase,e.provider_key,e.model_key limit 501;
end $$;
grant create on schema myeongha_admin_ops to myeongha_admin_finance_source_reader;
alter function myeongha_admin_ops.qry_ai_monthly_budget_v1(timestamptz,timestamptz) owner to myeongha_admin_finance_source_reader;
revoke create on schema myeongha_admin_ops from myeongha_admin_finance_source_reader;
revoke all on function myeongha_admin_ops.qry_ai_monthly_budget_v1(timestamptz,timestamptz) from public;
grant execute on function myeongha_admin_ops.qry_ai_monthly_budget_v1(timestamptz,timestamptz) to myeongha_admin_reader;
commit;
