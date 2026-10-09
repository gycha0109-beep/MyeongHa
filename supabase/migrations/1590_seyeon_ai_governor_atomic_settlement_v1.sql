-- PR-04C-2: govern settlement and reserved budget release in one transaction.
-- Watchtower-Track: character-memory
-- No Production activation or operator budget seeding.
-- Subject-scoped reservations remain on the existing attempt-delete ledger.
-- Global occupied balance survives privacy deletion (conservatively).
alter table public.seyeon_ai_call_cost_events
  add column governor_effective_micro_usd bigint generated always as (
    case when governor_ceiling_micro_usd is null then null::bigint
      when lifecycle_state='settled' and cost_status='estimated'
        and estimated_cost_micro_usd is not null
        then estimated_cost_micro_usd
      else governor_ceiling_micro_usd
    end
  ) stored;

-- The previous admission command already serializes by locking the global
-- daily row. Subsequent same-Subject admissions see the actual settled cost,
-- or the full conservative reservation for unknown/in-flight usage.
create or replace function public.cmd_governed_start_seyeon_ai_call_v1(
  p_subject_id uuid, p_turn_id uuid, p_attempt_id uuid, p_phase text,
  p_call_id uuid, p_purpose text, p_provider_key text, p_model_key text,
  p_policy_version text, p_price_version text,
  p_verified_input_token_bound bigint, p_enforced_output_limit bigint,
  p_serialized_request_bytes bigint
)
returns table (call_id uuid, ceiling_micro_usd bigint, bucket_utc_date date)
language plpgsql security definer
set search_path = pg_catalog, public
as $admit$
declare
  v_day date := (clock_timestamp() at time zone 'UTC')::date;
  v_budget public.seyeon_ai_governor_daily_budgets_v1%rowtype;
  v_model public.seyeon_ai_governor_model_policies_v1%rowtype;
  v_subject_occupied numeric;
  v_ceiling numeric;
  v_rate numeric;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_call_id is null or p_phase not in ('chat','post_turn')
    or p_subject_id is null or p_turn_id is null or p_attempt_id is null
    or p_policy_version is null or p_price_version is null
    or p_verified_input_token_bound is null
    or p_enforced_output_limit is null or p_serialized_request_bytes is null
    or p_verified_input_token_bound < 1
    or p_enforced_output_limit < 1
    or p_serialized_request_bytes < 1
    or (p_phase='post_turn') is distinct from (p_purpose='event_extraction')
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_invalid_input',
      message='AI governed admission requires bounded authoritative inputs';
  end if;

  -- The one daily global row serializes ALL admissions, across Subjects.
  -- Missing operator-provisioned budget => fail closed. Do not hold this row
  -- lock while invoking the external model.
  select d.* into v_budget
  from public.seyeon_ai_governor_daily_budgets_v1 d
  where d.bucket_utc_date=v_day
  for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_day_not_configured',
      message='AI budget is not configured for the current UTC day';
  end if;

  select m.* into v_model
  from public.seyeon_ai_governor_model_policies_v1 m
  where m.provider_key=p_provider_key and m.model_key=p_model_key
    and m.policy_version=p_policy_version
    and m.price_version=p_price_version and m.is_active;
  if not found
    or not (p_purpose=any(v_model.allowed_purposes))
    or p_verified_input_token_bound>v_model.maximum_input_tokens
    or p_enforced_output_limit<>v_model.maximum_output_tokens
    or p_serialized_request_bytes>v_model.maximum_serialized_request_bytes
    or p_verified_input_token_bound::numeric+
       p_enforced_output_limit::numeric>v_model.context_window_tokens
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_model_policy_mismatch',
      message='AI governed admission requires an active bounded model rate policy';
  end if;

  v_rate := greatest(
    v_model.input_micro_usd_per_million,
    v_model.cached_input_micro_usd_per_million
  );
  v_ceiling := ceil((
      p_verified_input_token_bound::numeric * v_rate +
      p_enforced_output_limit::numeric * v_model.output_micro_usd_per_million
    ) / 1000000::numeric);
  if v_ceiling < 1 or v_ceiling > 9007199254740991::numeric then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_quote_out_of_range',
      message='AI governed maximum cost is outside approved integer range';
  end if;

  if v_budget.occupied_micro_usd::numeric + v_ceiling >
       v_budget.global_limit_micro_usd::numeric then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_global_exhausted',
      message='AI global daily budget exhausted';
  end if;
  select coalesce(sum(e.governor_effective_micro_usd),0)::numeric
    into v_subject_occupied
  from public.seyeon_ai_call_cost_events e
  where e.subject_id=p_subject_id and e.governor_bucket_utc_date=v_day;
  if v_subject_occupied + v_ceiling >
       v_budget.subject_limit_micro_usd::numeric then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_subject_exhausted',
      message='AI Subject daily budget exhausted';
  end if;

  -- No direct row-lock privilege is granted on chat_attempts/chat_turns.
  -- The existing authoritative cmd_start rechecks Subject/turn/attempt state.
  -- Finalizer vs admission concurrency remains an ENFORCE blocker for 04D.
  -- No ON CONFLICT replay: a duplicate ID must not authorize a second send.
  perform 1 from public.cmd_start_seyeon_ai_call_v1(
    p_subject_id,p_turn_id,p_attempt_id,p_phase,p_call_id,
    p_purpose,p_provider_key,p_model_key
  );

  update public.seyeon_ai_call_cost_events e
  set governor_bucket_utc_date=v_day,
      governor_policy_version=p_policy_version,
      governor_price_version=p_price_version,
      governor_ceiling_micro_usd=v_ceiling::bigint,
      governor_input_bound_tokens=p_verified_input_token_bound,
      governor_output_cap_tokens=p_enforced_output_limit
  where e.call_id=p_call_id and e.subject_id=p_subject_id
    and e.lifecycle_state='started';
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_ledger_write_failed',
      message='AI governed call start must remain in the same transaction';
  end if;

  update public.seyeon_ai_governor_daily_budgets_v1 d
  set occupied_micro_usd=(d.occupied_micro_usd::numeric+v_ceiling)::bigint
  where d.bucket_utc_date=v_day;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_counter_write_failed',
      message='AI governed budget write failed';
  end if;

  return query select p_call_id,v_ceiling::bigint,v_day;
end
$admit$;

create function public.cmd_governed_settle_seyeon_ai_call_v1(
  p_subject_id uuid,p_turn_id uuid,p_attempt_id uuid,p_phase text,p_event jsonb
)
returns table(call_id uuid,replayed boolean,occupied_micro_usd bigint,over_ceiling boolean)
language plpgsql security definer
set search_path=pg_catalog,public
as $settle_governed$
declare
  v_call uuid;
  v_day date;
  v_budget public.seyeon_ai_governor_daily_budgets_v1%rowtype;
  v_row public.seyeon_ai_call_cost_events%rowtype;
  v_actual numeric;
  v_delta numeric;
  v_next numeric;
  v_settled record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_phase not in ('chat','post_turn')
    or jsonb_typeof(p_event) is distinct from 'object'
    or p_event->>'callId' is null
    or p_event->>'callId' !~ '^[0-9a-fA-F-]{36}$'
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_invalid',
      message='Governed settlement must identify a versioned provider call';
  end if;
  v_call:=(p_event->>'callId')::uuid;
  -- Ownership checked under current Subject RLS before taking a global lock.
  select e.governor_bucket_utc_date into v_day
  from public.seyeon_ai_call_cost_events e
  where e.call_id=v_call and e.subject_id=p_subject_id
    and e.turn_id=p_turn_id and e.attempt_id=p_attempt_id
    and e.phase=p_phase and e.governor_bucket_utc_date is not null;
  if v_day is null then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_not_owned',
      message='Governed settlement requires an authoritative reserved call';
  end if;

  -- Same lock order as admission: global row FIRST, then Subject cost ledger.
  select d.* into v_budget from public.seyeon_ai_governor_daily_budgets_v1 d
  where d.bucket_utc_date=v_day for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_day_missing',
      message='Governed settlement daily budget was not found';
  end if;
  select e.* into v_row from public.seyeon_ai_call_cost_events e
  where e.call_id=v_call and e.subject_id=p_subject_id
    and e.turn_id=p_turn_id and e.attempt_id=p_attempt_id
    and e.phase=p_phase and e.governor_bucket_utc_date=v_day
    and e.governor_ceiling_micro_usd is not null
  for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_lost_reservation',
      message='Governed reserved call changed before settlement';
  end if;
  if p_event->>'providerKey' is distinct from v_row.provider_key
    or p_event->>'modelKey' is distinct from v_row.model_key
    or p_event->>'purpose' is distinct from v_row.purpose
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_identity_drift',
      message='Governed settlement must preserve the reserved model and purpose';
  end if;

  -- Use the exact existing validated ledger settlement contract.
  -- Unknown usage/price/timeout retains its full reserved cost.
  if p_event->>'costStatus'='estimated'
    and p_event->>'priceVersion' is distinct from v_row.governor_price_version
  then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_price_drift',
      message='Governed usage estimate must use the reservation price version';
  end if;
  select x.* into strict v_settled
  from public.cmd_settle_seyeon_ai_call_v1(
    p_subject_id,p_turn_id,p_attempt_id,p_phase,p_event
  ) x;
  if v_settled.call_id is distinct from v_call then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_receipt_drift',
      message='Governed settlement received a different provider call id';
  end if;
  if v_settled.replayed then
    -- Already settled. No second debit/refund, including after a day rollover.
    return query select v_call,true,v_row.governor_effective_micro_usd,
      v_row.governor_effective_micro_usd>v_row.governor_ceiling_micro_usd;
    return;
  end if;

  -- All event fields have been validated by the old ledger command above.
  v_actual:=case when p_event->>'costStatus'='estimated'
    then (p_event->>'estimatedCostMicroUsd')::numeric
    else v_row.governor_ceiling_micro_usd::numeric end;
  v_delta:=v_actual-v_row.governor_ceiling_micro_usd::numeric;
  v_next:=v_budget.occupied_micro_usd::numeric+v_delta;
  if v_next<0 or v_next>9223372036854775807::numeric then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_counter_range',
      message='Governed settlement daily accounting exceeded integer range';
  end if;
  update public.seyeon_ai_governor_daily_budgets_v1 d
  set occupied_micro_usd=v_next::bigint
  where d.bucket_utc_date=v_day;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_update_failed',
      message='Governed settlement cannot update reserved day balance';
  end if;
  -- Actual cost above ceiling is recorded and marked as an incident. Do not
  -- falsify invoice/usage to satisfy a configured budget.
  return query select v_call,false,v_actual::bigint,
    v_actual>v_row.governor_ceiling_micro_usd::numeric;
end
$settle_governed$;

grant myeongha_seyeon_cost_meter_owner to current_user;
grant create on schema public to myeongha_seyeon_cost_meter_owner;
alter function public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)
  owner to myeongha_seyeon_cost_meter_owner;
revoke all on function public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)
  from public;
do $acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute format(
      'revoke all on function public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb) from %I',
      v_role);
  end loop;
end $acl$;
grant execute on function public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)
  to myeongha_api_executor;
revoke create on schema public from myeongha_seyeon_cost_meter_owner;
revoke myeongha_seyeon_cost_meter_owner from current_user;
