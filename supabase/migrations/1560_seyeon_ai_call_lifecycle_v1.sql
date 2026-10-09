-- Se-yeon PR-03: durable pre-dispatch start -> post-dispatch settlement.
-- Watchtower-Track: character-memory
-- No new Subject FK: preserve the frozen P0-PR-01 discovery graph and
-- existing attempt-deletion privacy cleanup trigger.
-- Existing settled events remain readable. The legacy append-only RPC remains
-- compatible, while new metered calls require a previously committed start.
alter table public.seyeon_ai_call_cost_events
  add column lifecycle_state text not null default 'settled',
  add column settled_at timestamptz null;

update public.seyeon_ai_call_cost_events set settled_at = created_at
where lifecycle_state='settled';
alter table public.seyeon_ai_call_cost_events
  alter column settled_at set default clock_timestamp(),
  drop constraint seyeon_ai_cost_outcome_check,
  add constraint seyeon_ai_cost_outcome_check
    check (outcome in ('not_dispatched','response_received','http_failure',
      'network_failure','timeout','invalid_content_type','invalid_response')),
  add constraint seyeon_ai_cost_lifecycle_shape_check check (
    (lifecycle_state='started'
      and outcome='not_dispatched'
      and event_jsonb='{}'::jsonb
      and cost_status='usage_unknown'
      and price_version is null
      and estimated_cost_micro_usd is null
      and settled_at is null)
    or
    (lifecycle_state='settled'
      and outcome<>'not_dispatched'
      and settled_at is not null)
  );

-- Only the existing NOLOGIN/NOBYPASSRLS runtime owner may update costs;
-- myeongha_api_executor retains EXECUTE on narrow, Subject-scoped commands.
grant update on public.seyeon_ai_call_cost_events to myeongha_seyeon_cost_meter_owner;
create policy seyeon_ai_cost_ledger_owner_update_v1
  on public.seyeon_ai_call_cost_events for update
  to myeongha_seyeon_cost_meter_owner
  using (subject_id=public.current_myeongha_subject_id())
  with check (subject_id=public.current_myeongha_subject_id());

create function public.cmd_start_seyeon_ai_call_v1(
  p_subject_id uuid, p_turn_id uuid, p_attempt_id uuid, p_phase text,
  p_call_id uuid, p_purpose text, p_provider_key text, p_model_key text
)
returns table (call_id uuid)
language plpgsql security definer
set search_path = pg_catalog, public
as $start$
declare
  v_thread_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_call_id is null
     or p_phase not in ('chat','post_turn')
     or p_purpose is null or p_purpose !~ '^[a-z_]{1,64}$'
     or p_provider_key is null
     or p_provider_key !~ '^[a-zA-Z0-9._:/-]{1,128}$'
     or p_model_key is null
     or p_model_key !~ '^[a-zA-Z0-9._:/-]{1,128}$'
     or (p_phase='post_turn') is distinct from
        (p_purpose='event_extraction') then
    raise exception using errcode='23514',
      constraint='seyeon_ai_call_start_invalid',
      message='Se-yeon AI call start contract is invalid';
  end if;

  select t.thread_id into v_thread_id
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.turn_id=t.id and a.subject_id=t.subject_id
  where t.id=p_turn_id and t.subject_id=p_subject_id and a.id=p_attempt_id
    and (
      (p_phase='chat' and a.state in ('running','generated'))
      or (p_phase='post_turn' and a.state='committed')
    );
  if v_thread_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_ai_call_start_attempt_mismatch',
      message='AI call must bind an eligible authoritative Subject attempt';
  end if;

  -- Deliberately no ON CONFLICT replay: a reused call_id must never authorize
  -- a second paid dispatch. A new provider retry must receive a new call_id.
  insert into public.seyeon_ai_call_cost_events(
    call_id,subject_id,thread_id,turn_id,attempt_id,phase,
    event_jsonb,purpose,provider_key,model_key,outcome,price_version,
    cost_status,estimated_cost_micro_usd,lifecycle_state,settled_at
  ) values (
    p_call_id,p_subject_id,v_thread_id,p_turn_id,p_attempt_id,p_phase,
    '{}'::jsonb,p_purpose,p_provider_key,p_model_key,'not_dispatched',null,
    'usage_unknown',null,'started',null
  );
  return query select p_call_id;
end
$start$;

create function public.cmd_settle_seyeon_ai_call_v1(
  p_subject_id uuid, p_turn_id uuid, p_attempt_id uuid, p_phase text,
  p_event jsonb
)
returns table (call_id uuid, replayed boolean)
language plpgsql security definer
set search_path = pg_catalog, public
as $settle$
declare
  v_row public.seyeon_ai_call_cost_events%rowtype;
  v_call_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_phase not in ('chat','post_turn')
     or jsonb_typeof(p_event) is distinct from 'object'
     or pg_catalog.length(p_event::text)>8192
     or p_event->>'schemaVersion' is distinct from 'seyeon-ai-cost-v1'
     or p_event->>'invoiceReconciled' is distinct from 'false'
     or (select count(*) from jsonb_object_keys(p_event) as k where k not in (
       'schemaVersion','callId','purpose','providerKey','modelKey','outcome',
       'httpStatus','elapsedMs','inputTokens','outputTokens',
       'cachedInputTokens','reasoningTokens','priceVersion',
       'estimatedCostMicroUsd','costStatus','invoiceReconciled'
     ))<>0
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_call_settlement_event_invalid',
      message='AI settlement event is malformed or contains forbidden fields';
  end if;
  if p_event->>'callId' is null
     or p_event->>'callId' !~ '^[0-9a-fA-F-]{36}$'
     or p_event->>'purpose' !~ '^[a-z_]{1,64}$'
     or p_event->>'providerKey' !~ '^[a-zA-Z0-9._:/-]{1,128}$'
     or p_event->>'modelKey' !~ '^[a-zA-Z0-9._:/-]{1,128}$'
     or p_event->>'outcome' not in (
       'response_received','http_failure','network_failure',
       'timeout','invalid_content_type','invalid_response'
     )
     or p_event->>'costStatus' not in (
       'estimated','usage_unknown','price_unknown'
     )
     or (p_event->>'priceVersion' is not null
       and (pg_catalog.length(p_event->>'priceVersion')>256
         or p_event->>'priceVersion' !~ '^[a-zA-Z0-9._:/-]+$'))
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_call_settlement_identity_invalid',
      message='AI settlement event identity or outcome is invalid';
  end if;

  if exists (
    select 1 from unnest(array[
      'httpStatus','elapsedMs','inputTokens','outputTokens',
      'cachedInputTokens','reasoningTokens','estimatedCostMicroUsd'
    ]) as field
    where p_event->field is not null
      and p_event->field<>'null'::jsonb
      and (jsonb_typeof(p_event->field)<>'number'
        or (p_event->>field)!~'^[0-9]{1,16}$'
        or (p_event->>field)::numeric>9007199254740991)
  )
     or (p_event->>'cachedInputTokens')::numeric >
        (p_event->>'inputTokens')::numeric
     or (p_event->>'reasoningTokens')::numeric >
        (p_event->>'outputTokens')::numeric
     or (p_event->>'costStatus'='estimated' and
        (p_event->>'estimatedCostMicroUsd' is null
         or p_event->>'priceVersion' is null))
     or (p_event->>'costStatus'<>'estimated' and
        p_event->>'estimatedCostMicroUsd' is not null)
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_call_settlement_cost_invalid',
      message='AI settlement usage or cost partitions are inconsistent';
  end if;

  v_call_id := (p_event->>'callId')::uuid;
  select e.* into v_row
  from public.seyeon_ai_call_cost_events e
  where e.call_id=v_call_id
  for update;

  if not found
     or v_row.subject_id is distinct from p_subject_id
     or v_row.turn_id is distinct from p_turn_id
     or v_row.attempt_id is distinct from p_attempt_id
     or v_row.phase is distinct from p_phase
     or v_row.purpose is distinct from p_event->>'purpose'
     or v_row.provider_key is distinct from p_event->>'providerKey'
     or v_row.model_key is distinct from p_event->>'modelKey'
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_call_settlement_ownership_mismatch',
      message='AI settlement must match an owned, started provider call';
  end if;

  if v_row.lifecycle_state='settled' then
    if v_row.event_jsonb is distinct from p_event then
      raise exception using errcode='23514',
        constraint='seyeon_ai_call_settlement_conflict',
        message='AI settlement replay disagrees with immutable cost evidence';
    end if;
    return query select v_call_id,true;
    return;
  end if;

  update public.seyeon_ai_call_cost_events e
  set event_jsonb=p_event,
      outcome=p_event->>'outcome',
      price_version=p_event->>'priceVersion',
      cost_status=p_event->>'costStatus',
      estimated_cost_micro_usd=(p_event->>'estimatedCostMicroUsd')::bigint,
      lifecycle_state='settled',
      settled_at=clock_timestamp()
  where e.call_id=v_call_id and e.subject_id=p_subject_id
    and e.lifecycle_state='started';

  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_call_settlement_state_invalid',
      message='AI settlement state transition failed';
  end if;
  return query select v_call_id,false;
end
$settle$;

grant myeongha_seyeon_cost_meter_owner to current_user;
grant create on schema public to myeongha_seyeon_cost_meter_owner;
alter function public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)
  owner to myeongha_seyeon_cost_meter_owner;
alter function public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)
  owner to myeongha_seyeon_cost_meter_owner;
revoke all on function public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text) from public;
revoke all on function public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb) from public;
do $acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute format(
      'revoke all on function public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text) from %I',
      v_role);
    execute format(
      'revoke all on function public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb) from %I',
      v_role);
  end loop;
end $acl$;
grant execute on function public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)
  to myeongha_api_executor;
grant execute on function public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)
  to myeongha_api_executor;
revoke create on schema public from myeongha_seyeon_cost_meter_owner;
revoke myeongha_seyeon_cost_meter_owner from current_user;
