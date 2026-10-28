-- OFFLINE CANDIDATE ONLY. Never installed by migrations/CI on Production.
-- Requires operator-roles-offline-v1.sql (private myeongha_admin_ops schema).
-- Isolated per-Reading PROVIDER-call costs, not Character AI using Reading
-- groundings. No Saju ProductReadingResponse payload, birth data, prompts,
-- responses, provider keys/secrets or browser-supplied cost estimates.
begin;

do $$ begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname='myeongha_reading_ai_cost_source_v1') then
    create role myeongha_reading_ai_cost_source_v1 nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_catalog.pg_roles where rolname='myeongha_reading_ai_cost_writer_v1') then
    create role myeongha_reading_ai_cost_writer_v1 login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if (select count(*) from pg_catalog.pg_roles r
    where r.rolname in ('myeongha_reading_ai_cost_source_v1','myeongha_reading_ai_cost_writer_v1')
      and r.rolcanlogin=(r.rolname='myeongha_reading_ai_cost_writer_v1')
      and not r.rolinherit and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole
      and not r.rolreplication and not r.rolbypassrls
      and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid))<>2 then
    raise exception 'Reading AI cost principal drift';
  end if;
end $$;

grant usage on schema public,myeongha_admin_ops to myeongha_reading_ai_cost_source_v1;
grant usage on schema myeongha_admin_ops to myeongha_reading_ai_cost_writer_v1;
grant select (id,reading_id,subject_id,started_at) on public.reading_execution_attempts
  to myeongha_reading_ai_cost_source_v1;
create policy reading_ai_cost_attempt_binding_v1 on public.reading_execution_attempts
  for select to myeongha_reading_ai_cost_source_v1 using(true);

create table myeongha_admin_ops.reading_ai_call_cost_events_v1 (
  call_id uuid primary key,
  reading_id uuid not null,
  subject_id uuid not null,
  execution_attempt_id uuid not null,
  provider_key text not null,
  model_key text not null,
  outcome text not null,
  source text not null,
  observed_at timestamptz not null,
  input_tokens bigint null,
  output_tokens bigint null,
  cached_input_tokens bigint null,
  reasoning_tokens bigint null,
  price_version text null,
  applied_input_rate_micro_usd_per_million bigint null,
  applied_cached_input_rate_micro_usd_per_million bigint null,
  applied_output_rate_micro_usd_per_million bigint null,
  estimated_cost_micro_usd bigint null,
  cost_status text not null,
  event_jsonb jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint reading_ai_cost_attempt_fk foreign key(execution_attempt_id,reading_id,subject_id)
    references public.reading_execution_attempts(id,reading_id,subject_id),
  constraint reading_ai_cost_outcome_ck check(outcome in
    ('response_received','http_failure','network_failure','timeout','invalid_content_type','invalid_response')),
  constraint reading_ai_cost_source_ck check(source in('provider_response_usage','provider_attempt_without_usage')),
  constraint reading_ai_cost_metadata_ck check(provider_key ~ '^[A-Za-z0-9_.:/-]{1,128}$'
    and model_key ~ '^[A-Za-z0-9_.:/-]{1,128}$'),
  constraint reading_ai_cost_status_ck check(
    (cost_status='estimated' and estimated_cost_micro_usd is not null and price_version is not null)
    or (cost_status in('usage_unknown','price_unknown') and estimated_cost_micro_usd is null)),
  constraint reading_ai_cost_rate_ck check(
    ((price_version is null and applied_input_rate_micro_usd_per_million is null
       and applied_cached_input_rate_micro_usd_per_million is null and applied_output_rate_micro_usd_per_million is null)
     or (price_version is not null and applied_input_rate_micro_usd_per_million>=0
       and applied_cached_input_rate_micro_usd_per_million>=0 and applied_output_rate_micro_usd_per_million>=0))),
  constraint reading_ai_cost_counts_ck check(
    (input_tokens is null or input_tokens>=0) and
    (output_tokens is null or output_tokens>=0) and
    (cached_input_tokens is null or (cached_input_tokens>=0 and cached_input_tokens<=input_tokens)) and
    (reasoning_tokens is null or (reasoning_tokens>=0 and reasoning_tokens<=output_tokens))),
  constraint reading_ai_cost_source_usage_ck check(
    (source='provider_response_usage' and outcome='response_received' and input_tokens is not null and output_tokens is not null)
    or (source='provider_attempt_without_usage' and input_tokens is null and output_tokens is null
        and cached_input_tokens is null and reasoning_tokens is null))
);
create index reading_ai_cost_reading_lookup_v1 on myeongha_admin_ops.reading_ai_call_cost_events_v1
  (reading_id,observed_at desc);
alter table myeongha_admin_ops.reading_ai_call_cost_events_v1 enable row level security;
grant create on schema myeongha_admin_ops to myeongha_reading_ai_cost_source_v1;
alter table myeongha_admin_ops.reading_ai_call_cost_events_v1 owner to myeongha_reading_ai_cost_source_v1;

-- SECURITY DEFINER is private and narrow; nobody gets table write access.
-- Idempotency uses exact canonical jsonb equality, never replace/update.
create function myeongha_admin_ops.cmd_record_reading_ai_call_v1(
  p_subject uuid,p_reading uuid,p_attempt uuid,p_event jsonb
) returns table(call_id uuid,replayed boolean)
language plpgsql volatile security definer set search_path=pg_catalog,myeongha_admin_ops
as $$
declare
  v_call uuid;
  v_inserted integer;
  v_existing jsonb;
  v_field text;
  v_amount numeric;
  v_expected numeric;
  v_observed timestamptz;
begin
  if p_subject is null or p_reading is null or p_attempt is null or
     jsonb_typeof(p_event) is distinct from 'object' or
     (select count(*) from jsonb_object_keys(p_event) k where k not in
       ('schemaVersion','source','workload','purpose','subjectId','readingId','executionAttemptId',
        'callId','observedAt','providerKey','modelKey','outcome','inputTokens','outputTokens',
        'cachedInputTokens','reasoningTokens','priceVersion','estimatedCostMicroUsd',
        'costStatus','invoiceReconciled','appliedInputRateMicroUsdPerMillion',
        'appliedCachedInputRateMicroUsdPerMillion','appliedOutputRateMicroUsdPerMillion'))>0 or
     (select count(*) from jsonb_object_keys(p_event))<>23 or
     p_event->>'schemaVersion'<>'reading-ai-call-cost-v1' or
     p_event->>'workload'<>'reading' or
     p_event->>'purpose'<>'reading_generation' or
     p_event->'invoiceReconciled' is distinct from 'false'::jsonb or
     p_event->>'subjectId' is distinct from p_subject::text or
     p_event->>'readingId' is distinct from p_reading::text or
     p_event->>'executionAttemptId' is distinct from p_attempt::text or
     p_event->>'source' not in ('provider_response_usage','provider_attempt_without_usage') or
     p_event->>'providerKey' !~ '^[A-Za-z0-9_.:/-]{1,128}$' or
     p_event->>'modelKey' !~ '^[A-Za-z0-9_.:/-]{1,128}$' or
     p_event->>'outcome' not in
       ('response_received','http_failure','network_failure','timeout','invalid_content_type','invalid_response') or
     p_event->>'costStatus' not in ('estimated','usage_unknown','price_unknown') then
    raise exception 'Invalid Reading AI source contract';
  end if;
  v_call := (p_event->>'callId')::uuid;
  if p_event->>'callId' is distinct from v_call::text or
     p_event->>'observedAt' !~ '^\d{4}-\d{2}-\d{2}T' then
    raise exception 'Invalid Reading AI call identity or time';
  end if;
  v_observed:=(p_event->>'observedAt')::timestamptz;
  if v_observed>clock_timestamp()+interval '1 minute' or
    not exists(select 1 from public.reading_execution_attempts a
      where a.id=p_attempt and a.reading_id=p_reading and a.subject_id=p_subject
      and v_observed>=a.started_at) then
    raise exception 'Unbound Reading AI execution attempt';
  end if;
  foreach v_field in array array['inputTokens','outputTokens','cachedInputTokens',
    'reasoningTokens','estimatedCostMicroUsd','appliedInputRateMicroUsdPerMillion',
    'appliedCachedInputRateMicroUsdPerMillion','appliedOutputRateMicroUsdPerMillion'] loop
    if p_event->v_field <> 'null'::jsonb then
      if jsonb_typeof(p_event->v_field) is distinct from 'number' or
        p_event->>v_field !~ '^(0|[1-9][0-9]*)$' then
        raise exception 'Invalid Reading AI usage count';
      end if;
      v_amount:=(p_event->>v_field)::numeric;
      if v_amount>9007199254740991 then raise exception 'Unsafe Reading AI cost amount';end if;
    end if;
  end loop;
  if ((p_event->>'priceVersion' is null) <> (p_event->>'appliedInputRateMicroUsdPerMillion' is null
     and p_event->>'appliedCachedInputRateMicroUsdPerMillion' is null
     and p_event->>'appliedOutputRateMicroUsdPerMillion' is null))
    or (p_event->>'priceVersion' is not null and
      (p_event->>'appliedInputRateMicroUsdPerMillion' is null
       or p_event->>'appliedCachedInputRateMicroUsdPerMillion' is null
       or p_event->>'appliedOutputRateMicroUsdPerMillion' is null))
    or (p_event->>'priceVersion' is null and p_event->>'costStatus'<>'price_unknown')
    or (p_event->>'priceVersion' is not null and p_event->>'inputTokens' is not null
      and p_event->>'outputTokens' is not null and p_event->>'cachedInputTokens' is not null
      and p_event->>'costStatus'<>'estimated')
    or (p_event->>'priceVersion' is not null and
      (p_event->>'inputTokens' is null or p_event->>'outputTokens' is null
       or p_event->>'cachedInputTokens' is null) and p_event->>'costStatus'<>'usage_unknown')
    or (p_event->>'costStatus'='estimated' and
      (p_event->>'inputTokens' is null or p_event->>'outputTokens' is null
       or p_event->>'cachedInputTokens' is null))
    or (p_event->>'costStatus'='estimated') <> (p_event->>'estimatedCostMicroUsd' is not null)
    or (p_event->>'costStatus'='estimated' and p_event->>'priceVersion' is null)
    or (p_event->>'source'='provider_response_usage' and
       (p_event->>'inputTokens' is null or p_event->>'outputTokens' is null))
    or (p_event->>'source'='provider_attempt_without_usage' and
       (p_event->>'inputTokens' is not null or p_event->>'outputTokens' is not null or
        p_event->>'cachedInputTokens' is not null or p_event->>'reasoningTokens' is not null)) then
    raise exception 'Unbound Reading AI cost observation';
  end if;
  if p_event->>'costStatus'='estimated' then
    v_expected:=ceil(((p_event->>'inputTokens')::numeric-(p_event->>'cachedInputTokens')::numeric)
      *(p_event->>'appliedInputRateMicroUsdPerMillion')::numeric / 1000000
      + (p_event->>'cachedInputTokens')::numeric*(p_event->>'appliedCachedInputRateMicroUsdPerMillion')::numeric / 1000000
      + (p_event->>'outputTokens')::numeric*(p_event->>'appliedOutputRateMicroUsdPerMillion')::numeric / 1000000);
    if v_expected is distinct from (p_event->>'estimatedCostMicroUsd')::numeric then
      raise exception 'Reading AI estimate does not match pinned usage and rate';
    end if;
  end if;
  insert into myeongha_admin_ops.reading_ai_call_cost_events_v1 (
    call_id,reading_id,subject_id,execution_attempt_id,provider_key,model_key,outcome,
    source,observed_at,input_tokens,output_tokens,cached_input_tokens,reasoning_tokens,
    price_version,applied_input_rate_micro_usd_per_million,
    applied_cached_input_rate_micro_usd_per_million,applied_output_rate_micro_usd_per_million,
    estimated_cost_micro_usd,cost_status,event_jsonb
  ) values (
    v_call,p_reading,p_subject,p_attempt,p_event->>'providerKey',p_event->>'modelKey',
    p_event->>'outcome',p_event->>'source',v_observed,
    (p_event->>'inputTokens')::bigint,(p_event->>'outputTokens')::bigint,
    (p_event->>'cachedInputTokens')::bigint,(p_event->>'reasoningTokens')::bigint,
    p_event->>'priceVersion',(p_event->>'appliedInputRateMicroUsdPerMillion')::bigint,
    (p_event->>'appliedCachedInputRateMicroUsdPerMillion')::bigint,
    (p_event->>'appliedOutputRateMicroUsdPerMillion')::bigint,
    (p_event->>'estimatedCostMicroUsd')::bigint,
    p_event->>'costStatus',p_event
  ) on conflict (call_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then
    select c.event_jsonb into v_existing from myeongha_admin_ops.reading_ai_call_cost_events_v1 c
      where c.call_id=v_call;
    if v_existing is distinct from p_event then
      raise exception 'Conflicting Reading AI call replay';
    end if;
  end if;
  return query select v_call,v_inserted=0;
end $$;

alter function myeongha_admin_ops.cmd_record_reading_ai_call_v1(uuid,uuid,uuid,jsonb)
  owner to myeongha_reading_ai_cost_source_v1;
revoke create on schema myeongha_admin_ops from myeongha_reading_ai_cost_source_v1;
revoke all on function myeongha_admin_ops.cmd_record_reading_ai_call_v1(uuid,uuid,uuid,jsonb) from public;
grant execute on function myeongha_admin_ops.cmd_record_reading_ai_call_v1(uuid,uuid,uuid,jsonb)
  to myeongha_reading_ai_cost_writer_v1;

-- Bounded private Owner-reader projection. No provider raw payload or
-- claim that these are all the calls made by the Saju Reading engine.
create function myeongha_admin_ops.qry_reading_ai_cost_calls_v1(
  p_reading uuid,p_limit integer,p_offset integer
) returns table("callId" text,"readingId" text,"executionAttemptId" text,
  "observedAt" text,provider text,model text,outcome text,source text,
  "inputTokens" text,"outputTokens" text,"cachedInputTokens" text,
  "reasoningTokens" text,"priceVersion" text,"estimatedMicroUsd" text,
  "costStatus" text)
language plpgsql stable security definer set search_path=pg_catalog,myeongha_admin_ops
as $
begin
  if p_reading is null or p_limit is null or p_limit not between 1 and 51
    or p_offset is null or p_offset not between 0 and 10000 then
    raise exception 'Invalid bounded Reading AI cost query';
  end if;
  return query
  select c.call_id::text,c.reading_id::text,c.execution_attempt_id::text,
    c.observed_at::text,c.provider_key,c.model_key,c.outcome,c.source,
    c.input_tokens::text,c.output_tokens::text,c.cached_input_tokens::text,
    c.reasoning_tokens::text,c.price_version,c.estimated_cost_micro_usd::text,
    c.cost_status
  from myeongha_admin_ops.reading_ai_call_cost_events_v1 c
  where c.reading_id=p_reading
    and c.observed_at>=current_timestamp-interval '90 days'
  order by c.observed_at desc,c.call_id desc limit p_limit offset p_offset;
end $;
grant create on schema myeongha_admin_ops to myeongha_reading_ai_cost_source_v1;
alter function myeongha_admin_ops.qry_reading_ai_cost_calls_v1(uuid,integer,integer)
  owner to myeongha_reading_ai_cost_source_v1;
revoke create on schema myeongha_admin_ops from myeongha_reading_ai_cost_source_v1;
revoke all on function myeongha_admin_ops.qry_reading_ai_cost_calls_v1(uuid,integer,integer) from public;
grant execute on function myeongha_admin_ops.qry_reading_ai_cost_calls_v1(uuid,integer,integer)
  to myeongha_admin_reader;

-- Month-bounded aggregate: observed supplier calls only. Even when every
-- recorded call has a rate, this is never a complete Reading AI budget:
-- there is still no Saju-wide provider-call admission/coverage receipt.
create index reading_ai_cost_observed_month_v1
  on myeongha_admin_ops.reading_ai_call_cost_events_v1(observed_at desc);

create function myeongha_admin_ops.qry_reading_ai_cost_month_v1(
  p_from timestamptz,p_to timestamptz
) returns table("observedCalls" text,"observedReadings" text,
  "unknownCostCalls" text,"missingUsageCalls" text,
  "knownEstimateMicroUsd" text)
language plpgsql stable security definer set search_path=pg_catalog,myeongha_admin_ops
as $
begin
  if p_from is null or p_to is null or p_to<=p_from
    or p_to>p_from+interval '32 days' then
    raise exception 'Invalid bounded Reading AI cost month';
  end if;
  return query
  select count(*)::text,count(distinct c.reading_id)::text,
    count(*) filter (where c.cost_status<>'estimated')::text,
    count(*) filter (where c.source='provider_attempt_without_usage'
      or c.input_tokens is null or c.output_tokens is null)::text,
    coalesce(sum(c.estimated_cost_micro_usd),0)::text
  from myeongha_admin_ops.reading_ai_call_cost_events_v1 c
  where c.observed_at>=p_from and c.observed_at<p_to;
end $;
grant create on schema myeongha_admin_ops to myeongha_reading_ai_cost_source_v1;
alter function myeongha_admin_ops.qry_reading_ai_cost_month_v1(timestamptz,timestamptz)
  owner to myeongha_reading_ai_cost_source_v1;
revoke create on schema myeongha_admin_ops from myeongha_reading_ai_cost_source_v1;
revoke all on function myeongha_admin_ops.qry_reading_ai_cost_month_v1(timestamptz,timestamptz)
  from public;
grant execute on function myeongha_admin_ops.qry_reading_ai_cost_month_v1(timestamptz,timestamptz)
  to myeongha_admin_reader;

-- Deliberately no direct writer access, no anon/authenticated/service_role
-- grant, no operational installation, and no claim of Reading coverage.
commit;
