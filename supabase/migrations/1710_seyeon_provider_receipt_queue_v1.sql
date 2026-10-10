-- D4B-10C1: PRIVATE durable Provider outcome + fenced settlement queue.
-- Watchtower-Track: character-memory
-- OFFLINE ONLY. No new login, HTTP ingress, ENFORCE activation or paid dispatch.
-- Ledger FK cascade preserves existing attempt-delete privacy authority.
create table public.seyeon_ai_provider_receipt_queue_v1 (
  call_id uuid primary key
    references public.seyeon_ai_call_cost_events(call_id) on delete cascade,
  subject_id uuid not null,
  turn_id uuid not null,
  attempt_id uuid not null,
  phase text not null check (phase in ('chat','post_turn')),
  purpose text not null,
  provider_key text not null,
  model_key text not null,
  price_version text not null,
  input_rate bigint not null check (input_rate > 0),
  cached_input_rate bigint not null check (cached_input_rate >= 0),
  output_rate bigint not null check (output_rate > 0),
  provider_event jsonb not null check (jsonb_typeof(provider_event)='object'),
  recorded_at timestamptz not null default clock_timestamp(),
  claim_token uuid null,
  claimed_until timestamptz null,
  claim_count integer not null default 0 check (claim_count >= 0),
  acked_at timestamptz null,
  constraint seyeon_provider_queue_claim_shape_v1 check (
    (claim_token is null and claimed_until is null)
    or (claim_token is not null and claimed_until is not null)
  )
);
create index seyeon_ai_provider_receipt_pending_v1
  on public.seyeon_ai_provider_receipt_queue_v1(recorded_at,call_id)
  where acked_at is null;
alter table public.seyeon_ai_provider_receipt_queue_v1 enable row level security;
alter table public.seyeon_ai_provider_receipt_queue_v1 force row level security;
create policy seyeon_ai_provider_receipt_owner_only_v1
  on public.seyeon_ai_provider_receipt_queue_v1 for all
  to myeongha_seyeon_cost_meter_owner using (true) with check (true);
alter table public.seyeon_ai_provider_receipt_queue_v1
  owner to myeongha_seyeon_cost_meter_owner;
revoke all on public.seyeon_ai_provider_receipt_queue_v1 from public;

-- A trusted governed server principal records measured usage BEFORE settlement.
-- The browser, arbitrary api_executor and detached worker cannot call this RPC.
create function public.cmd_store_seyeon_provider_receipt_v1(
  p_subject_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_phase text,p_event jsonb
)
returns table(call_id uuid,replayed boolean)
language plpgsql security definer
set search_path=pg_catalog,public
as $record$
declare
  v_id uuid;
  v_ledger public.seyeon_ai_call_cost_events%rowtype;
  v_old public.seyeon_ai_provider_receipt_queue_v1%rowtype;
  v_input numeric;
  v_cached numeric;
  v_output numeric;
  v_expected numeric;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_phase not in ('chat','post_turn')
    or jsonb_typeof(p_event) is distinct from 'object'
    or length(p_event::text)>8192
    or p_event->>'schemaVersion' is distinct from 'seyeon-ai-cost-v1'
    or p_event->'invoiceReconciled' is distinct from 'false'::jsonb
    or p_event->>'callId' !~ '^[0-9a-fA-F-]{36}$'
    or p_event->>'outcome' not in (
      'response_received','http_failure','network_failure','timeout',
      'invalid_content_type','invalid_response')
    or p_event->>'costStatus' not in ('estimated','usage_unknown')
    or exists (
      select 1 from jsonb_object_keys(p_event) k where k not in (
        'schemaVersion','callId','purpose','providerKey','modelKey',
        'outcome','httpStatus','elapsedMs','inputTokens','outputTokens',
        'cachedInputTokens','reasoningTokens','priceVersion',
        'estimatedCostMicroUsd','costStatus','invoiceReconciled'
      )
    )
    or exists (
      select 1 from unnest(array[
        'httpStatus','elapsedMs','inputTokens','outputTokens',
        'cachedInputTokens','reasoningTokens','estimatedCostMicroUsd'
      ]) field
      where p_event->field is not null and p_event->field <> 'null'::jsonb
        and (jsonb_typeof(p_event->field)<>'number'
          or p_event->>field !~ '^[0-9]{1,16}$'
          or (p_event->>field)::numeric > 9007199254740991)
    )
    or p_event->>'elapsedMs' is null
  then
    raise exception using errcode='23514',
      constraint='seyeon_provider_receipt_malformed',
      message='Server Provider receipt is invalid';
  end if;

  v_id := (p_event->>'callId')::uuid;
  select e.* into v_ledger
  from public.seyeon_ai_call_cost_events e
  where e.call_id=v_id and e.subject_id=p_subject_id
    and e.turn_id=p_turn_id and e.attempt_id=p_attempt_id
    and e.phase=p_phase for update;
  if not found or v_ledger.governor_receipt_pinned_at is null
    or v_ledger.governor_ceiling_micro_usd is null
    or v_ledger.lifecycle_state <> 'started'
    or p_event->>'purpose' is distinct from v_ledger.purpose
    or p_event->>'providerKey' is distinct from v_ledger.provider_key
    or p_event->>'modelKey' is distinct from v_ledger.model_key
    or p_event->>'priceVersion' is distinct from v_ledger.governor_price_version
  then
    raise exception using errcode='23514',
      constraint='seyeon_provider_receipt_unreserved',
      message='Provider evidence requires the exact committed reserved call';
  end if;

  if (p_event->>'cachedInputTokens')::numeric >
       (p_event->>'inputTokens')::numeric
    or (p_event->>'reasoningTokens')::numeric >
       (p_event->>'outputTokens')::numeric
  then
    raise exception using errcode='23514',
      constraint='seyeon_provider_receipt_token_partition',
      message='Provider token partition is inconsistent';
  end if;

  if p_event->>'costStatus'='estimated' then
    if p_event->>'inputTokens' is null
      or p_event->>'outputTokens' is null
      or p_event->>'cachedInputTokens' is null
      or p_event->>'estimatedCostMicroUsd' is null
    then
      raise exception 'Estimated Provider receipt must have complete usage';
    end if;
    v_input := (p_event->>'inputTokens')::numeric;
    v_cached := (p_event->>'cachedInputTokens')::numeric;
    v_output := (p_event->>'outputTokens')::numeric;
    v_expected := ceil((
      (v_input-v_cached)*v_ledger.governor_input_rate_micro_usd_per_million
      +v_cached*v_ledger.governor_cached_input_rate_micro_usd_per_million
      +v_output*v_ledger.governor_output_rate_micro_usd_per_million
    )/1000000::numeric);
    if v_expected>9007199254740991::numeric
      or v_expected is distinct from
        (p_event->>'estimatedCostMicroUsd')::numeric
    then
      raise exception using errcode='23514',
        constraint='seyeon_provider_receipt_cost_mismatch',
        message='Provider estimate disagrees with reserved immutable rate';
    end if;
  elsif p_event->>'estimatedCostMicroUsd' is not null
    or (
      p_event->>'inputTokens' is not null
      and p_event->>'outputTokens' is not null
      and p_event->>'cachedInputTokens' is not null
    )
  then
    raise exception using errcode='23514',
      constraint='seyeon_provider_receipt_unknown_invalid',
      message='Unknown usage cannot be treated as a known estimate';
  end if;

  select q.* into v_old from public.seyeon_ai_provider_receipt_queue_v1 q
  where q.call_id=v_id for update;
  if found then
    if v_old.provider_event is distinct from p_event
      or v_old.subject_id is distinct from p_subject_id
      or v_old.turn_id is distinct from p_turn_id
      or v_old.attempt_id is distinct from p_attempt_id
    then
      raise exception using errcode='23514',
        constraint='seyeon_provider_receipt_conflicting_replay',
        message='Provider evidence cannot be replaced after persistence';
    end if;
    return query select v_id,true;
    return;
  end if;

  insert into public.seyeon_ai_provider_receipt_queue_v1(
    call_id,subject_id,turn_id,attempt_id,phase,
    purpose,provider_key,model_key,price_version,
    input_rate,cached_input_rate,output_rate,provider_event
  ) values (
    v_id,v_ledger.subject_id,v_ledger.turn_id,v_ledger.attempt_id,
    v_ledger.phase,v_ledger.purpose,v_ledger.provider_key,
    v_ledger.model_key,v_ledger.governor_price_version,
    v_ledger.governor_input_rate_micro_usd_per_million,
    v_ledger.governor_cached_input_rate_micro_usd_per_million,
    v_ledger.governor_output_rate_micro_usd_per_million,p_event
  );
  return query select v_id,false;
end
$record$;

-- Internal worker: lock exactly one committed pending receipt, no table SELECT.
-- Expired claims are safely available for another claim; no inference replay.
create function public.cmd_claim_seyeon_provider_receipt_v1()
returns table(
  call_id uuid,subject_id uuid,turn_id uuid,attempt_id uuid,
  phase text,purpose text,provider_key text,model_key text,
  price_version text,input_rate bigint,cached_input_rate bigint,
  output_rate bigint,provider_event jsonb,claim_token uuid
)
language plpgsql security definer
set search_path=pg_catalog,public
as $claim$
declare
  v_row public.seyeon_ai_provider_receipt_queue_v1%rowtype;
  v_token uuid;
begin
  select q.* into v_row
  from public.seyeon_ai_provider_receipt_queue_v1 q
  where q.acked_at is null
    and (q.claimed_until is null or q.claimed_until < clock_timestamp())
    and q.claim_count < 2147483647
  order by q.recorded_at,q.call_id
  for update skip locked limit 1;
  if not found then return; end if;
  v_token := pg_catalog.gen_random_uuid();
  update public.seyeon_ai_provider_receipt_queue_v1 q
  set claim_token=v_token,claimed_until=clock_timestamp()+interval '90 seconds',
      claim_count=q.claim_count+1
  where q.call_id=v_row.call_id;
  return query select
    v_row.call_id,v_row.subject_id,v_row.turn_id,v_row.attempt_id,
    v_row.phase,v_row.purpose,v_row.provider_key,v_row.model_key,
    v_row.price_version,v_row.input_rate,v_row.cached_input_rate,
    v_row.output_rate,v_row.provider_event,v_token;
end
$claim$;

-- Ack requires exact lease ownership AND a committed ledger settlement with
-- byte-equivalent normalized jsonb. Lost ACK is replayable after lease expiry.
create function public.cmd_ack_seyeon_provider_receipt_v1(
  p_call_id uuid,p_claim_token uuid
)
returns boolean
language plpgsql security definer
set search_path=pg_catalog,public
as $ack$
declare
  v_row public.seyeon_ai_provider_receipt_queue_v1%rowtype;
begin
  select q.* into v_row from public.seyeon_ai_provider_receipt_queue_v1 q
  where q.call_id=p_call_id for update;
  if not found or v_row.acked_at is not null
    or v_row.claim_token is distinct from p_claim_token
    or v_row.claimed_until <= clock_timestamp()
  then
    raise exception using errcode='23514',
      constraint='seyeon_provider_receipt_ack_not_claimed',
      message='Ack requires an active matching claim token';
  end if;

  perform pg_catalog.set_config('myeongha.subject_id',v_row.subject_id::text,true);
  perform 1 from public.seyeon_ai_call_cost_events e
  where e.call_id=v_row.call_id and e.subject_id=v_row.subject_id
    and e.turn_id=v_row.turn_id and e.attempt_id=v_row.attempt_id
    and e.phase=v_row.phase and e.lifecycle_state='settled'
    and e.event_jsonb=v_row.provider_event;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_provider_receipt_ack_unsettled',
      message='Ack cannot precede committed exact ledger settlement';
  end if;

  update public.seyeon_ai_provider_receipt_queue_v1
  set acked_at=clock_timestamp(),claim_token=null,claimed_until=null
  where call_id=p_call_id;
  return true;
end
$ack$;

-- All three functions run under an existing NOLOGIN owner.
grant myeongha_seyeon_cost_meter_owner to current_user;
grant create on schema public to myeongha_seyeon_cost_meter_owner;
alter function public.cmd_store_seyeon_provider_receipt_v1(
  uuid,uuid,uuid,text,jsonb) owner to myeongha_seyeon_cost_meter_owner;
alter function public.cmd_claim_seyeon_provider_receipt_v1()
  owner to myeongha_seyeon_cost_meter_owner;
alter function public.cmd_ack_seyeon_provider_receipt_v1(uuid,uuid)
  owner to myeongha_seyeon_cost_meter_owner;
revoke all on function public.cmd_store_seyeon_provider_receipt_v1(
  uuid,uuid,uuid,text,jsonb) from public;
revoke all on function public.cmd_claim_seyeon_provider_receipt_v1()
  from public;
revoke all on function public.cmd_ack_seyeon_provider_receipt_v1(uuid,uuid)
  from public;
grant execute on function public.cmd_store_seyeon_provider_receipt_v1(
  uuid,uuid,uuid,text,jsonb) to myeongha_seyeon_governed_executor;
grant execute on function public.cmd_claim_seyeon_provider_receipt_v1()
  to myeongha_seyeon_settlement_worker;
grant execute on function public.cmd_ack_seyeon_provider_receipt_v1(uuid,uuid)
  to myeongha_seyeon_settlement_worker;
revoke create on schema public from myeongha_seyeon_cost_meter_owner;
revoke myeongha_seyeon_cost_meter_owner from current_user;

do $acl$
declare
  v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb) from %I',
      v_role);
    execute pg_catalog.format(
      'revoke all on function public.cmd_claim_seyeon_provider_receipt_v1() from %I',
      v_role);
    execute pg_catalog.format(
      'revoke all on function public.cmd_ack_seyeon_provider_receipt_v1(uuid,uuid) from %I',
      v_role);
  end loop;
end
$acl$;
