-- R2-H/1760: NONDEPLOYABLE required Provider receipt enums ingress guard proposal.
-- Watchtower-Track: ops; HOLD_OWNER_REVIEW; disposable PostgreSQL 17 ONLY.
-- Original 1710 blob 1d0e773a8e8b27474a0fde182d75433077d8add8 unchanged. No Production permission/approval.
-- Normalize SQL three-valued logic at the Store RPC before the ledger lookup;
-- 1730 queue CHECK remains a separate persistence defense, not an ingress fix.
begin;
set local lock_timeout='5s';
do $preflight$
declare fn oid:=to_regprocedure('public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)');
begin
 if fn is null or not exists (select 1 from pg_catalog.pg_proc p
     where p.oid=fn and p.prosecdef
       and p.proowner='myeongha_seyeon_cost_meter_owner'::regrole)
    or position('p_event->>''outcome'' not in' in pg_get_functiondef(fn))=0
    or position('p_event->>''costStatus'' not in' in pg_get_functiondef(fn))=0
    or position('(p_event->>''outcome'') is null' in lower(pg_get_functiondef(fn)))>0
    or position('(p_event->>''coststatus'') is null' in lower(pg_get_functiondef(fn)))>0 then
   raise exception 'HOLD_R2_H_1760_ORIGINAL_STORE_FUNCTION_NOT_AT_PINNED_GAP';
 end if;
end
$preflight$;

create or replace function public.cmd_store_seyeon_provider_receipt_v1(
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
    or (p_event->>'outcome') is null
    or p_event->>'outcome' not in (
      'response_received','http_failure','network_failure','timeout',
      'invalid_content_type','invalid_response')
    or (p_event->>'costStatus') is null
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

do $postflight$
declare fn oid:=to_regprocedure('public.cmd_store_seyeon_provider_receipt_v1(uuid,uuid,uuid,text,jsonb)');
begin
 if fn is null or not exists (select 1 from pg_catalog.pg_proc p
    where p.oid=fn and p.prosecdef
      and p.proowner='myeongha_seyeon_cost_meter_owner'::regrole)
    or position('(p_event->>''outcome'') is null' in pg_get_functiondef(fn))=0
    or position('(p_event->>''costStatus'') is null' in pg_get_functiondef(fn))=0 then
   raise exception 'HOLD_R2_H_1760_NULL_SAFE_INGRESS_REPLACEMENT_MISSING';
 end if;
end
$postflight$;
commit;
