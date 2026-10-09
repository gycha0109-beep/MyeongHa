-- Se-yeon PR-03: Subject-scoped, append-only call expense ledger.
-- Watchtower-Track: character-memory
-- No inference or provider access. Estimates must never masquerade as invoiced cost.
create table public.seyeon_ai_call_cost_events (
  call_id uuid primary key,
  subject_id uuid not null,
  thread_id uuid not null,
  turn_id uuid not null,
  attempt_id uuid not null,
  phase text not null,
  event_jsonb jsonb not null,
  purpose text not null,
  provider_key text not null,
  model_key text not null,
  outcome text not null,
  price_version text null,
  cost_status text not null,
  estimated_cost_micro_usd bigint null,
  created_at timestamptz not null default clock_timestamp(),
  -- Provenance is verified under one Subject transaction by the insert RPC.
  -- Intentionally avoid extending the frozen P0-PR-01 FK discovery graph.
  -- A dedicated attempt-delete trigger supplies mandatory privacy cleanup.
  constraint seyeon_ai_cost_phase_check check (phase in ('chat','post_turn')),
  constraint seyeon_ai_cost_outcome_check check (outcome in
    ('response_received','http_failure','network_failure','timeout','invalid_content_type','invalid_response')),
  constraint seyeon_ai_cost_status_check check (cost_status in
    ('estimated','usage_unknown','price_unknown')),
  constraint seyeon_ai_cost_estimate_check check (
    (cost_status = 'estimated' and estimated_cost_micro_usd is not null and
      price_version is not null and estimated_cost_micro_usd >= 0)
    or (cost_status <> 'estimated' and estimated_cost_micro_usd is null)
  ),
  constraint seyeon_ai_cost_json_object_check check (jsonb_typeof(event_jsonb) = 'object')
);
create index seyeon_ai_cost_subject_turn_idx
  on public.seyeon_ai_call_cost_events(subject_id,turn_id,created_at);
create index seyeon_ai_cost_subject_created_idx
  on public.seyeon_ai_call_cost_events(subject_id,created_at);
alter table public.seyeon_ai_call_cost_events enable row level security;
alter table public.seyeon_ai_call_cost_events force row level security;

do $role$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname='myeongha_seyeon_cost_meter_owner') then
    create role myeongha_seyeon_cost_meter_owner
      nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname='myeongha_seyeon_cost_meter_owner'
      and not rolcanlogin and not rolsuper and not rolcreatedb
      and not rolcreaterole and not rolinherit and not rolreplication and not rolbypassrls
  ) then
    raise exception 'Se-yeon cost meter owner role privileges drifted';
  end if;
end $role$;

grant usage on schema public to myeongha_seyeon_cost_meter_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_seyeon_cost_meter_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_seyeon_cost_meter_owner;
grant select on public.chat_turns,public.chat_turn_attempts
  to myeongha_seyeon_cost_meter_owner;
grant select,insert,delete on public.seyeon_ai_call_cost_events
  to myeongha_seyeon_cost_meter_owner;

create policy seyeon_ai_cost_turn_owner_read
  on public.chat_turns for select to myeongha_seyeon_cost_meter_owner
  using (subject_id=public.current_myeongha_subject_id());
create policy seyeon_ai_cost_attempt_owner_read
  on public.chat_turn_attempts for select to myeongha_seyeon_cost_meter_owner
  using (subject_id=public.current_myeongha_subject_id());
create policy seyeon_ai_cost_ledger_owner_read
  on public.seyeon_ai_call_cost_events for select to myeongha_seyeon_cost_meter_owner
  using (subject_id=public.current_myeongha_subject_id());
create policy seyeon_ai_cost_ledger_owner_insert
  on public.seyeon_ai_call_cost_events for insert to myeongha_seyeon_cost_meter_owner
  with check (subject_id=public.current_myeongha_subject_id());

-- This DELETE permission belongs only to a non-login trigger function owner.
-- It intentionally does not depend on a current Subject session during the
-- approved account-deletion finalizer's own SECURITY DEFINER transaction.
create policy seyeon_ai_cost_ledger_owner_cleanup
  on public.seyeon_ai_call_cost_events for delete to myeongha_seyeon_cost_meter_owner
  using (true);

create function public.cleanup_seyeon_ai_cost_on_attempt_delete_v1()
returns trigger
language plpgsql security invoker
set search_path = pg_catalog, public
as $cleanup$
begin
  delete from public.seyeon_ai_call_cost_events e
  where e.subject_id=old.subject_id
    and e.turn_id=old.turn_id
    and e.attempt_id=old.id;
  return old;
end
$cleanup$;

create trigger cleanup_seyeon_ai_cost_on_attempt_delete_v1
after delete on public.chat_turn_attempts
for each row execute function public.cleanup_seyeon_ai_cost_on_attempt_delete_v1();

create function public.cmd_record_seyeon_ai_call_cost_v1(
  p_subject_id uuid,p_turn_id uuid,p_attempt_id uuid,p_phase text,p_event jsonb
)
returns table(call_id uuid,replayed boolean)
language plpgsql security definer
set search_path = pg_catalog, public
as $record$
declare
  v_thread_id uuid;
  v_existing public.seyeon_ai_call_cost_events%rowtype;
  v_inserted uuid;
  v_call_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_phase not in ('chat','post_turn')
     or jsonb_typeof(p_event) is distinct from 'object'
     or pg_catalog.length(p_event::text) > 8192
     or p_event->>'schemaVersion' is distinct from 'seyeon-ai-cost-v1'
     or p_event->>'invoiceReconciled' is distinct from 'false'
     or (select count(*) from jsonb_object_keys(p_event) as k
         where k not in (
           'schemaVersion','callId','purpose','providerKey','modelKey',
           'outcome','httpStatus','elapsedMs','inputTokens','outputTokens',
           'cachedInputTokens','reasoningTokens','priceVersion',
           'estimatedCostMicroUsd','costStatus','invoiceReconciled'
         )) <> 0
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_cost_event_invalid',
      message='Se-yeon AI cost event contract is invalid';
  end if;

  if p_event->>'callId' is null
     or p_event->>'purpose' !~ '^[a-z_]{1,64}$'
     or p_event->>'providerKey' !~ '^[a-zA-Z0-9._:/-]{1,128}$'
     or p_event->>'modelKey' !~ '^[a-zA-Z0-9._:/-]{1,128}$'
     or p_event->>'outcome' not in (
        'response_received','http_failure','network_failure','timeout',
        'invalid_content_type','invalid_response')
     or p_event->>'costStatus' not in ('estimated','usage_unknown','price_unknown')
     or (p_event->>'priceVersion' is not null and
         p_event->>'priceVersion' !~ '^[a-zA-Z0-9._:/-]{1,256}$')
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_cost_event_identity_invalid',
      message='Se-yeon AI cost event has invalid identity or enum';
  end if;
  -- Validate all numeric partitions. JSON numbers only; no coercion of strings.
  if exists (
    select 1 from unnest(array[
      'httpStatus','elapsedMs','inputTokens','outputTokens','cachedInputTokens',
      'reasoningTokens','estimatedCostMicroUsd'
    ]) as field
    where p_event->field is not null
      and p_event->field <> 'null'::jsonb
      and (jsonb_typeof(p_event->field) <> 'number'
           or (p_event->>field) !~ '^[0-9]{1,16}$'
           or (p_event->>field)::numeric > 9007199254740991)
  ) then
    raise exception using errcode='23514',
      constraint='seyeon_ai_cost_numeric_invalid',
      message='Se-yeon AI cost numeric field is invalid';
  end if;
  if (p_event->>'cachedInputTokens')::numeric >
     (p_event->>'inputTokens')::numeric
     or (p_event->>'reasoningTokens')::numeric >
        (p_event->>'outputTokens')::numeric
     or (p_event->>'costStatus'='estimated' and
         (p_event->>'estimatedCostMicroUsd' is null or
          p_event->>'priceVersion' is null))
     or (p_event->>'costStatus'<>'estimated' and
         p_event->>'estimatedCostMicroUsd' is not null)
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_cost_partition_invalid',
      message='Se-yeon AI cost token partitions or estimate are inconsistent';
  end if;
  v_call_id := (p_event->>'callId')::uuid;
  select t.thread_id into v_thread_id
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.turn_id=t.id and a.subject_id=t.subject_id
  where t.id=p_turn_id and t.subject_id=p_subject_id and a.id=p_attempt_id;
  if v_thread_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_ai_cost_attempt_subject_mismatch',
      message='Se-yeon AI cost event must bind an authoritative Subject turn attempt';
  end if;

  insert into public.seyeon_ai_call_cost_events(
    call_id,subject_id,thread_id,turn_id,attempt_id,phase,event_jsonb,
    purpose,provider_key,model_key,outcome,price_version,cost_status,
    estimated_cost_micro_usd
  ) values (
    v_call_id,p_subject_id,v_thread_id,p_turn_id,p_attempt_id,p_phase,p_event,
    p_event->>'purpose',p_event->>'providerKey',p_event->>'modelKey',
    p_event->>'outcome',p_event->>'priceVersion',p_event->>'costStatus',
    (p_event->>'estimatedCostMicroUsd')::bigint
  ) on conflict (call_id) do nothing returning
    seyeon_ai_call_cost_events.call_id into v_inserted;

  if v_inserted is not null then
    return query select v_call_id,false;
    return;
  end if;
  select e.* into v_existing from public.seyeon_ai_call_cost_events e
  where e.call_id=v_call_id;
  if not found or v_existing.subject_id is distinct from p_subject_id
     or v_existing.turn_id is distinct from p_turn_id
     or v_existing.attempt_id is distinct from p_attempt_id
     or v_existing.phase is distinct from p_phase
     or v_existing.event_jsonb is distinct from p_event
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_cost_call_id_conflict',
      message='Se-yeon AI call id must be immutable and single-owner';
  end if;
  return query select v_call_id,true;
end
$record$;

create function public.qry_seyeon_ai_turn_cost_v1(
  p_subject_id uuid,p_turn_id uuid
)
returns table(
  call_count bigint,known_cost_micro_usd numeric,unknown_cost_calls bigint,
  total_estimated_cost_micro_usd numeric
)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $query$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if not exists(select 1 from public.chat_turns t
    where t.id=p_turn_id and t.subject_id=p_subject_id) then
    raise exception using errcode='23514',
      constraint='seyeon_ai_cost_turn_not_owned',
      message='Se-yeon AI cost summary requires an owned turn';
  end if;
  return query
  select
    count(*)::bigint,
    coalesce(sum(e.estimated_cost_micro_usd),0)::numeric,
    count(*) filter(where e.estimated_cost_micro_usd is null)::bigint,
    case when count(*) filter(where e.estimated_cost_micro_usd is null)=0
      then coalesce(sum(e.estimated_cost_micro_usd),0)::numeric
      else null::numeric end
  from public.seyeon_ai_call_cost_events e
  where e.subject_id=p_subject_id and e.turn_id=p_turn_id;
end
$query$;

grant myeongha_seyeon_cost_meter_owner to current_user;
grant create on schema public to myeongha_seyeon_cost_meter_owner;
alter function public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)
  owner to myeongha_seyeon_cost_meter_owner;
alter function public.qry_seyeon_ai_turn_cost_v1(uuid,uuid)
  owner to myeongha_seyeon_cost_meter_owner;
alter function public.cleanup_seyeon_ai_cost_on_attempt_delete_v1()
  owner to myeongha_seyeon_cost_meter_owner;
revoke all on function public.cleanup_seyeon_ai_cost_on_attempt_delete_v1() from public;
revoke all on function public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb) from public;
revoke all on function public.qry_seyeon_ai_turn_cost_v1(uuid,uuid) from public;
do $acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute format('revoke all on function public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb) from %I',v_role);
    execute format('revoke all on function public.qry_seyeon_ai_turn_cost_v1(uuid,uuid) from %I',v_role);
    execute format('revoke all on function public.cleanup_seyeon_ai_cost_on_attempt_delete_v1() from %I',v_role);
  end loop;
end $acl$;
grant execute on function public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)
  to myeongha_api_executor;
grant execute on function public.qry_seyeon_ai_turn_cost_v1(uuid,uuid)
  to myeongha_api_executor;
revoke create on schema public from myeongha_seyeon_cost_meter_owner;
revoke myeongha_seyeon_cost_meter_owner from current_user;
