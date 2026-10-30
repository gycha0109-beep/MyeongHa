-- MANUAL private AI finance and Seoul-month budget read projections.
-- Existing source ledgers only. No provider call, invoice assertion or activation.
BEGIN;
DO $finance_preflight$
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'Expected managed Production installation principal';END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='myeongha_admin_finance_source_reader')
  OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='myeongha_admin_ops'
   AND p.proname IN ('qry_ai_finance_calls_v1','qry_ai_finance_summary_v1','qry_ai_finance_prices_v1','qry_ai_monthly_budget_v1'))
  OR to_regclass('public.seyeon_ai_call_cost_events') IS NULL THEN RAISE EXCEPTION 'Missing source or existing AI finance authority';END IF;
END
$finance_preflight$;

do $$ begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname='myeongha_admin_finance_source_reader') then
    create role myeongha_admin_finance_source_reader nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_catalog.pg_roles r where rolname='myeongha_admin_finance_source_reader'
    and not rolcanlogin and not rolinherit and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls
    and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid)) then
    raise exception 'AI finance source principal drifted';
  end if;
end $$;
grant usage on schema public,myeongha_admin_ops to myeongha_admin_finance_source_reader;
grant select(call_id,subject_id,turn_id,attempt_id,phase,provider_key,model_key,outcome,price_version,cost_status,estimated_cost_micro_usd,created_at,event_jsonb)
  on public.seyeon_ai_call_cost_events to myeongha_admin_finance_source_reader;
create policy admin_finance_cost_source_v1 on public.seyeon_ai_call_cost_events
  for select to myeongha_admin_finance_source_reader using(true);
-- Optional post-frontier quote/price sources must not block basic ledger reads.
do $$ begin
 if (select count(*) from pg_catalog.pg_attribute where attrelid='public.seyeon_ai_call_cost_events'::regclass and not attisdropped and attname in ('governor_price_version','governor_receipt_pinned_at','governor_input_rate_micro_usd_per_million','governor_cached_input_rate_micro_usd_per_million','governor_output_rate_micro_usd_per_million'))=5 then
  execute 'grant select(governor_price_version,governor_receipt_pinned_at,governor_input_rate_micro_usd_per_million,governor_cached_input_rate_micro_usd_per_million,governor_output_rate_micro_usd_per_million) on public.seyeon_ai_call_cost_events to myeongha_admin_finance_source_reader';
 end if;
 if exists(select 1 from pg_class where oid=to_regclass('public.seyeon_ai_provider_receipt_queue_v1') and relowner=(select oid from pg_roles where rolname=current_user)) then
  execute 'grant select(call_id,subject_id,provider_key,model_key,price_version,input_rate,cached_input_rate,output_rate) on public.seyeon_ai_provider_receipt_queue_v1 to myeongha_admin_finance_source_reader';
  execute 'create policy admin_finance_quote_source_v1 on public.seyeon_ai_provider_receipt_queue_v1 for select to myeongha_admin_finance_source_reader using(true)';
 end if;
 if exists(select 1 from pg_class where oid=to_regclass('public.seyeon_ai_governor_model_policies_v1') and relowner=(select oid from pg_roles where rolname=current_user)) then
  execute 'grant select(provider_key,model_key,policy_version,price_version,input_micro_usd_per_million,cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active) on public.seyeon_ai_governor_model_policies_v1 to myeongha_admin_finance_source_reader';
  execute 'create policy admin_finance_price_source_v1 on public.seyeon_ai_governor_model_policies_v1 for select to myeongha_admin_finance_source_reader using(true)';
 end if;
end $$;

create function myeongha_admin_ops.qry_ai_finance_calls_v1(
  p_limit int,p_offset int,p_from date,p_to date,p_subject uuid,p_feature text,p_model text
) returns table("callId" text,"subjectId" text,"attemptId" text,"turnId" text,"createdAt" text,
  feature text,provider text,model text,outcome text,"priceVersion" text,"recordedEstimateMicroUsd" text,
  "inputTokens" text,"outputTokens" text,"cachedInputTokens" text,"reasoningTokens" text,
  "appliedInputRate" text,"appliedCachedInputRate" text,"appliedOutputRate" text,"priceAppliedAt" text)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if p_limit is null or p_offset is null or p_limit not between 1 and 51 or p_offset not between 0 and 10000 or p_from is null or p_to is null or p_to<p_from or p_to-p_from>90
    or (p_feature is not null and p_feature not in ('chat','post_turn'))
    or (p_model is not null and p_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$') then raise exception 'Invalid bounded AI finance read';end if;
  if (select count(*) from pg_catalog.pg_attribute where attrelid='public.seyeon_ai_call_cost_events'::regclass and not attisdropped and attname in ('governor_price_version','governor_receipt_pinned_at','governor_input_rate_micro_usd_per_million','governor_cached_input_rate_micro_usd_per_million','governor_output_rate_micro_usd_per_million'))=5 then
  return query
  select e.call_id::text,e.subject_id::text,e.attempt_id::text,e.turn_id::text,e.created_at::text,
    e.phase,e.provider_key,e.model_key,e.outcome,coalesce(e.price_version,e.governor_price_version),
    case when e.cost_status='estimated' then e.estimated_cost_micro_usd::text else null end,
    case when jsonb_typeof(e.event_jsonb->'inputTokens')='number' then e.event_jsonb->>'inputTokens' else null end,
    case when jsonb_typeof(e.event_jsonb->'outputTokens')='number' then e.event_jsonb->>'outputTokens' else null end,
    case when jsonb_typeof(e.event_jsonb->'cachedInputTokens')='number' then e.event_jsonb->>'cachedInputTokens' else null end,
    case when jsonb_typeof(e.event_jsonb->'reasoningTokens')='number' then e.event_jsonb->>'reasoningTokens' else null end,
    e.governor_input_rate_micro_usd_per_million::text,e.governor_cached_input_rate_micro_usd_per_million::text,e.governor_output_rate_micro_usd_per_million::text,coalesce(e.governor_receipt_pinned_at,e.created_at)::text
  from public.seyeon_ai_call_cost_events e
  where e.created_at >= (p_from::timestamp at time zone 'UTC') and e.created_at < ((p_to+1)::timestamp at time zone 'UTC')
    and e.created_at>=CURRENT_TIMESTAMP-interval '90 days'
    and (p_subject is null or e.subject_id=p_subject) and (p_feature is null or e.phase=p_feature) and (p_model is null or e.model_key=p_model)
  order by e.created_at desc,e.call_id desc limit p_limit offset p_offset;
  elsif has_column_privilege(current_user,to_regclass('public.seyeon_ai_provider_receipt_queue_v1'),'call_id','SELECT') and has_column_privilege(current_user,to_regclass('public.seyeon_ai_provider_receipt_queue_v1'),'subject_id','SELECT') and has_column_privilege(current_user,to_regclass('public.seyeon_ai_provider_receipt_queue_v1'),'provider_key','SELECT') and has_column_privilege(current_user,to_regclass('public.seyeon_ai_provider_receipt_queue_v1'),'model_key','SELECT') and has_column_privilege(current_user,to_regclass('public.seyeon_ai_provider_receipt_queue_v1'),'price_version','SELECT') and has_column_privilege(current_user,to_regclass('public.seyeon_ai_provider_receipt_queue_v1'),'input_rate','SELECT') and has_column_privilege(current_user,to_regclass('public.seyeon_ai_provider_receipt_queue_v1'),'cached_input_rate','SELECT') and has_column_privilege(current_user,to_regclass('public.seyeon_ai_provider_receipt_queue_v1'),'output_rate','SELECT') then
  return query
  select e.call_id::text,e.subject_id::text,e.attempt_id::text,e.turn_id::text,e.created_at::text,
    e.phase,e.provider_key,e.model_key,e.outcome,e.price_version,
    case when e.cost_status='estimated' then e.estimated_cost_micro_usd::text else null end,
    case when jsonb_typeof(e.event_jsonb->'inputTokens')='number' then e.event_jsonb->>'inputTokens' else null end,
    case when jsonb_typeof(e.event_jsonb->'outputTokens')='number' then e.event_jsonb->>'outputTokens' else null end,
    case when jsonb_typeof(e.event_jsonb->'cachedInputTokens')='number' then e.event_jsonb->>'cachedInputTokens' else null end,
    case when jsonb_typeof(e.event_jsonb->'reasoningTokens')='number' then e.event_jsonb->>'reasoningTokens' else null end,
    q.input_rate::text,q.cached_input_rate::text,q.output_rate::text,e.created_at::text
  from public.seyeon_ai_call_cost_events e
  left join public.seyeon_ai_provider_receipt_queue_v1 q on q.call_id=e.call_id and q.subject_id=e.subject_id
    and q.provider_key=e.provider_key and q.model_key=e.model_key and q.price_version=e.price_version
  where e.created_at >= (p_from::timestamp at time zone 'UTC') and e.created_at < ((p_to+1)::timestamp at time zone 'UTC')
    and e.created_at>=CURRENT_TIMESTAMP-interval '90 days'
    and (p_subject is null or e.subject_id=p_subject) and (p_feature is null or e.phase=p_feature) and (p_model is null or e.model_key=p_model)
  order by e.created_at desc,e.call_id desc limit p_limit offset p_offset;
  else
  return query
  select e.call_id::text,e.subject_id::text,e.attempt_id::text,e.turn_id::text,e.created_at::text,
    e.phase,e.provider_key,e.model_key,e.outcome,e.price_version,
    case when e.cost_status='estimated' then e.estimated_cost_micro_usd::text else null end,
    case when jsonb_typeof(e.event_jsonb->'inputTokens')='number' then e.event_jsonb->>'inputTokens' else null end,
    case when jsonb_typeof(e.event_jsonb->'outputTokens')='number' then e.event_jsonb->>'outputTokens' else null end,
    case when jsonb_typeof(e.event_jsonb->'cachedInputTokens')='number' then e.event_jsonb->>'cachedInputTokens' else null end,
    case when jsonb_typeof(e.event_jsonb->'reasoningTokens')='number' then e.event_jsonb->>'reasoningTokens' else null end,
    null::text,null::text,null::text,e.created_at::text
  from public.seyeon_ai_call_cost_events e
  where e.created_at >= (p_from::timestamp at time zone 'UTC') and e.created_at < ((p_to+1)::timestamp at time zone 'UTC')
    and e.created_at>=CURRENT_TIMESTAMP-interval '90 days'
    and (p_subject is null or e.subject_id=p_subject) and (p_feature is null or e.phase=p_feature) and (p_model is null or e.model_key=p_model)
  order by e.created_at desc,e.call_id desc limit p_limit offset p_offset;
  end if;
end $$;

create function myeongha_admin_ops.qry_ai_finance_summary_v1(
 p_limit int,p_offset int,p_from date,p_to date,p_subject uuid,p_feature text,p_model text,p_granularity text,p_group_by text
) returns table(period text,"subjectId" text,workload text,feature text,provider text,model text,calls text,"failedCalls" text,
 "observedAttempts" text,"inputTokens" text,"outputTokens" text,"cachedInputTokens" text,"reasoningTokens" text,
 "unknownUsageCalls" text,"knownEstimateMicroUsd" text,"estimatedMicroUsd" text,"unknownCostCalls" text,
 "confirmedMicroUsd" text,"billingStatus" text,"confirmedMicroKrw" text,"estimatedMicroKrw" text,"verifiedRevenueMicroKrw" text,"revenueCostBasisPoints" text)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if p_limit is null or p_offset is null or p_limit not between 1 and 51 or p_offset not between 0 and 10000 or p_from is null or p_to is null or p_to<p_from or p_to-p_from>90
  or p_granularity is null or p_group_by is null or p_granularity not in ('day','month') or p_group_by not in ('feature','subject')
  or (p_feature is not null and p_feature not in ('chat','post_turn'))
  or (p_model is not null and p_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$') then raise exception 'Invalid bounded AI finance summary';end if;
 return query select to_char(date_trunc(p_granularity,e.created_at at time zone 'UTC'),case when p_granularity='month' then 'YYYY-MM' else 'YYYY-MM-DD' end),
  case when p_group_by='subject' then e.subject_id::text else null::text end,'character_chat'::text,e.phase,e.provider_key,e.model_key,
  count(*)::text,count(*) filter(where e.outcome<>'response_received')::text,count(distinct e.attempt_id)::text,
  sum(case when jsonb_typeof(e.event_jsonb->'inputTokens')='number' then (e.event_jsonb->>'inputTokens')::numeric else null end)::text,
  sum(case when jsonb_typeof(e.event_jsonb->'outputTokens')='number' then (e.event_jsonb->>'outputTokens')::numeric else null end)::text,
  sum(case when jsonb_typeof(e.event_jsonb->'cachedInputTokens')='number' then (e.event_jsonb->>'cachedInputTokens')::numeric else null end)::text,
  sum(case when jsonb_typeof(e.event_jsonb->'reasoningTokens')='number' then (e.event_jsonb->>'reasoningTokens')::numeric else null end)::text,
  count(*) filter(where jsonb_typeof(e.event_jsonb->'inputTokens') is distinct from 'number' or jsonb_typeof(e.event_jsonb->'outputTokens') is distinct from 'number' or jsonb_typeof(e.event_jsonb->'cachedInputTokens') is distinct from 'number')::text,
  coalesce(sum(e.estimated_cost_micro_usd) filter(where e.cost_status='estimated'),0)::text,
  case when count(*) filter(where (e.cost_status is distinct from 'estimated' or e.estimated_cost_micro_usd is null))=0 then coalesce(sum(e.estimated_cost_micro_usd),0)::text else null::text end,
  count(*) filter(where (e.cost_status is distinct from 'estimated' or e.estimated_cost_micro_usd is null))::text,null::text,'provider_invoice_cohort_unconnected'::text,
  null::text,null::text,null::text,null::text
 from public.seyeon_ai_call_cost_events e
 where e.created_at>=(p_from::timestamp at time zone 'UTC') and e.created_at<((p_to+1)::timestamp at time zone 'UTC')
  and e.created_at>=CURRENT_TIMESTAMP-interval '90 days'
  and (p_subject is null or e.subject_id=p_subject) and (p_feature is null or e.phase=p_feature) and (p_model is null or e.model_key=p_model)
 group by 1,2,e.phase,e.provider_key,e.model_key
 order by 1 desc,2 nulls last,e.phase,e.provider_key,e.model_key limit p_limit offset p_offset;
end $$;

create function myeongha_admin_ops.qry_ai_finance_prices_v1(p_limit int,p_offset int,p_model text)
returns table(provider text,model text,"policyVersion" text,"priceVersion" text,"inputMicroUsdPerMillion" text,
 "cachedInputMicroUsdPerMillion" text,"outputMicroUsdPerMillion" text,"isActive" boolean,"effectiveFrom" text,"effectiveTo" text,"sourceStatus" text)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if p_limit is null or p_offset is null or p_limit not between 1 and 51 or p_offset not between 0 and 10000 or (p_model is not null and p_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$') then raise exception 'Invalid bounded AI price read';end if;
 if has_column_privilege(current_user,to_regclass('public.seyeon_ai_governor_model_policies_v1'),'provider_key','SELECT') is not true or has_column_privilege(current_user,to_regclass('public.seyeon_ai_governor_model_policies_v1'),'model_key','SELECT') is not true or has_column_privilege(current_user,to_regclass('public.seyeon_ai_governor_model_policies_v1'),'policy_version','SELECT') is not true or has_column_privilege(current_user,to_regclass('public.seyeon_ai_governor_model_policies_v1'),'price_version','SELECT') is not true or has_column_privilege(current_user,to_regclass('public.seyeon_ai_governor_model_policies_v1'),'input_micro_usd_per_million','SELECT') is not true or has_column_privilege(current_user,to_regclass('public.seyeon_ai_governor_model_policies_v1'),'cached_input_micro_usd_per_million','SELECT') is not true or has_column_privilege(current_user,to_regclass('public.seyeon_ai_governor_model_policies_v1'),'output_micro_usd_per_million','SELECT') is not true or has_column_privilege(current_user,to_regclass('public.seyeon_ai_governor_model_policies_v1'),'is_active','SELECT') is not true then raise exception 'AI rate source unavailable';end if;
 return query select p.provider_key,p.model_key,p.policy_version,p.price_version,p.input_micro_usd_per_million::text,
  p.cached_input_micro_usd_per_million::text,p.output_micro_usd_per_million::text,p.is_active,null::text,null::text,
  'stored_policy_version_effective_dates_unrecorded'::text from public.seyeon_ai_governor_model_policies_v1 p
 where p_model is null or p.model_key=p_model order by p.provider_key,p.model_key,p.policy_version limit p_limit offset p_offset;
end $$;

grant myeongha_admin_finance_source_reader to postgres with inherit false,set true;
grant create on schema myeongha_admin_ops to myeongha_admin_finance_source_reader;
alter function myeongha_admin_ops.qry_ai_finance_calls_v1(int,int,date,date,uuid,text,text) owner to myeongha_admin_finance_source_reader;
alter function myeongha_admin_ops.qry_ai_finance_summary_v1(int,int,date,date,uuid,text,text,text,text) owner to myeongha_admin_finance_source_reader;
alter function myeongha_admin_ops.qry_ai_finance_prices_v1(int,int,text) owner to myeongha_admin_finance_source_reader;
set local role myeongha_admin_finance_source_reader;
revoke all on function myeongha_admin_ops.qry_ai_finance_calls_v1(int,int,date,date,uuid,text,text) from public;
revoke all on function myeongha_admin_ops.qry_ai_finance_summary_v1(int,int,date,date,uuid,text,text,text,text) from public;
revoke all on function myeongha_admin_ops.qry_ai_finance_prices_v1(int,int,text) from public;
grant execute on function myeongha_admin_ops.qry_ai_finance_calls_v1(int,int,date,date,uuid,text,text),
 myeongha_admin_ops.qry_ai_finance_summary_v1(int,int,date,date,uuid,text,text,text,text),
 myeongha_admin_ops.qry_ai_finance_prices_v1(int,int,text) to myeongha_admin_reader;

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

alter function myeongha_admin_ops.qry_ai_monthly_budget_v1(timestamptz,timestamptz) owner to myeongha_admin_finance_source_reader;

revoke all on function myeongha_admin_ops.qry_ai_monthly_budget_v1(timestamptz,timestamptz) from public;
grant execute on function myeongha_admin_ops.qry_ai_monthly_budget_v1(timestamptz,timestamptz) to myeongha_admin_reader;
reset role;
revoke create on schema myeongha_admin_ops from myeongha_admin_finance_source_reader;
revoke myeongha_admin_finance_source_reader from postgres granted by postgres;
DO $finance_postflight$
BEGIN
 IF has_schema_privilege('myeongha_admin_finance_source_reader','myeongha_admin_ops','CREATE')
  OR has_table_privilege('myeongha_admin_finance_source_reader','public.seyeon_ai_call_cost_events','INSERT,UPDATE,DELETE,TRUNCATE')
  OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
   LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE n.nspname='myeongha_admin_ops' AND p.proname IN ('qry_ai_finance_calls_v1','qry_ai_finance_summary_v1','qry_ai_finance_prices_v1','qry_ai_monthly_budget_v1')
    AND a.grantee=0 AND a.privilege_type='EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member
   WHERE u.rolname='postgres' AND r.rolname='myeongha_admin_finance_source_reader' AND (m.inherit_option OR m.set_option)) THEN
  RAISE EXCEPTION 'AI finance source isolation unavailable';
 END IF;
END
$finance_postflight$;
COMMIT;
