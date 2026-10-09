-- Se-yeon Cost Governor PR-04D1 — immutable rate card and DB-recomputed cost.
-- Watchtower-Track: character-memory
-- No Production ENFORCE activation, no new public privileges, no paid calls.

-- Rate-card edits after admission could retrospectively authorize manipulated
-- cost estimates. Require a NEW policy_version for any pricing/model change.
-- Operators may only toggle is_active to stop admitting new requests.
create function public.guard_seyeon_ai_governor_rate_card_v1()
returns trigger language plpgsql
set search_path=pg_catalog,public
as $rate_immutable$
begin
  if tg_op='DELETE' then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_rate_card_immutable',
      message='Governed price policies cannot be deleted';
  end if;
  if (to_jsonb(new)-'is_active') is distinct from
     (to_jsonb(old)-'is_active') then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_rate_card_immutable',
      message='Governed prices require a new policy version';
  end if;
  return new;
end
$rate_immutable$;

create trigger guard_seyeon_ai_governor_rate_card_v1
before update or delete on public.seyeon_ai_governor_model_policies_v1
for each row execute function public.guard_seyeon_ai_governor_rate_card_v1();

revoke all on function public.guard_seyeon_ai_governor_rate_card_v1()
  from public;

-- Existing NOLOGIN cost-meter owner remains the SECURITY DEFINER owner.
-- Replacing the function preserves previously restricted EXECUTE grants.
create or replace function public.cmd_governed_settle_seyeon_ai_call_v1(
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
  v_rate public.seyeon_ai_governor_model_policies_v1%rowtype;
  v_expected numeric;
  v_input numeric;
  v_cached numeric;
  v_output numeric;
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

  -- Recompute against the immutable DB rate card used for this admission.
  -- Deactivated versions must remain usable to settle in-flight calls.
  select m.* into v_rate
  from public.seyeon_ai_governor_model_policies_v1 m
  where m.provider_key=v_row.provider_key
    and m.model_key=v_row.model_key
    and m.policy_version=v_row.governor_policy_version
    and m.price_version=v_row.governor_price_version;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_rate_card_missing',
      message='Governed settlement rate card missing';
  end if;

  if p_event->>'costStatus'='estimated' then
    if p_event->>'inputTokens' is null
      or p_event->>'outputTokens' is null
      or p_event->>'cachedInputTokens' is null
      or p_event->>'estimatedCostMicroUsd' is null
      or jsonb_typeof(p_event->'inputTokens') is distinct from 'number'
      or jsonb_typeof(p_event->'outputTokens') is distinct from 'number'
      or jsonb_typeof(p_event->'cachedInputTokens') is distinct from 'number'
      or jsonb_typeof(p_event->'estimatedCostMicroUsd') is distinct from 'number'
      or p_event->>'inputTokens' !~ '^[0-9]{1,16}$'
      or p_event->>'outputTokens' !~ '^[0-9]{1,16}$'
      or p_event->>'cachedInputTokens' !~ '^[0-9]{1,16}$'
      or p_event->>'estimatedCostMicroUsd' !~ '^[0-9]{1,16}$'
    then
      raise exception using errcode='23514',
        constraint='seyeon_ai_governor_usage_incomplete',
        message='Governed estimated settlement requires complete token usage';
    end if;
    v_input := (p_event->>'inputTokens')::numeric;
    v_cached := (p_event->>'cachedInputTokens')::numeric;
    v_output := (p_event->>'outputTokens')::numeric;
    if v_cached>v_input then
      raise exception using errcode='23514',
        constraint='seyeon_ai_governor_usage_invalid',
        message='Governed cached tokens cannot exceed input usage';
    end if;
    v_expected:=ceil((
      (v_input-v_cached)*v_rate.input_micro_usd_per_million::numeric
      +v_cached*v_rate.cached_input_micro_usd_per_million::numeric
      +v_output*v_rate.output_micro_usd_per_million::numeric
    ) / 1000000::numeric);
    if v_expected>9007199254740991::numeric
      or v_expected is distinct from
        (p_event->>'estimatedCostMicroUsd')::numeric then
      raise exception using errcode='23514',
        constraint='seyeon_ai_governor_cost_disagrees_with_rate',
        message='Governed estimated cost disagrees with immutable DB rate';
    end if;
  elsif p_event->>'costStatus'='price_unknown' then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_price_unknown_invalid',
      message='Governed call cannot settle with unknown price';
  elsif p_event->>'costStatus'='usage_unknown' then
    if p_event->>'inputTokens' is not null
      and p_event->>'outputTokens' is not null
      and p_event->>'cachedInputTokens' is not null then
      raise exception using errcode='23514',
        constraint='seyeon_ai_governor_unknown_usage_conflict',
        message='Complete governed usage cannot be marked unknown';
    end if;
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
