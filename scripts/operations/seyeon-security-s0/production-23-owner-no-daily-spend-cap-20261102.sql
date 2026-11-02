-- Watchtower-Track: security
-- Fix 2026-11-02: NO operator-chosen daily spending cap for verified Owner Admin.
-- Preserve per-call protected model policy, quote/usage ledger, receipt binding,
-- exact canonical Subject verification and ordinary non-Owner daily limits.
-- This migration is based on inspected 2026-11-02 LIVE function definitions,
-- including the later private start/settle and deletion-concurrency protections.
BEGIN;
DO $pre$
DECLARE v_owner oid;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Expected postgres migration principal'; END IF;
  SELECT oid INTO v_owner FROM pg_roles
    WHERE rolname='myeongha_seyeon_cost_meter_owner'
      AND not rolcanlogin AND not rolsuper AND not rolbypassrls;
  IF v_owner IS NULL
    OR to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)') IS NULL
    OR to_regprocedure('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)') IS NULL
    OR to_regprocedure('public.qry_myeongha_owner_admin_access_v1(uuid)') IS NULL
    OR (SELECT proowner FROM pg_proc WHERE oid=to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)'))<>v_owner
    OR (SELECT proowner FROM pg_proc WHERE oid=to_regprocedure('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)'))<>v_owner
    OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)'))
    OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)'))
    OR has_function_privilege('anon',to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)'),'EXECUTE')
    OR has_function_privilege('authenticated',to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)'),'EXECUTE')
    OR has_function_privilege('service_role',to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)'),'EXECUTE')
    OR has_function_privilege('anon',to_regprocedure('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)'),'EXECUTE')
    OR has_function_privilege('authenticated',to_regprocedure('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)'),'EXECUTE')
    OR has_function_privilege('service_role',to_regprocedure('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)'),'EXECUTE')
    OR has_schema_privilege(v_owner,'public','CREATE')
  THEN RAISE EXCEPTION 'Governed principal / function ACL drift'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='seyeon_ai_call_cost_events'
      AND column_name='governor_owner_no_daily_limit')
  THEN RAISE EXCEPTION 'Owner daily-cap exemption already installed'; END IF;
END
$pre$;

ALTER TABLE public.seyeon_ai_call_cost_events
  ADD COLUMN governor_owner_no_daily_limit boolean NOT NULL DEFAULT false;
-- Grant only this private, NOLOGIN cost owner classification access.
-- The existing owner RPC itself checks the transaction-bound Subject identity.
GRANT EXECUTE ON FUNCTION public.qry_myeongha_owner_admin_access_v1(uuid)
  TO myeongha_seyeon_cost_meter_owner;

GRANT myeongha_seyeon_cost_meter_owner TO current_user WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO myeongha_seyeon_cost_meter_owner;
SET LOCAL ROLE myeongha_seyeon_cost_meter_owner;

CREATE OR REPLACE FUNCTION public.cmd_governed_start_seyeon_ai_call_v1(p_subject_id uuid, p_turn_id uuid, p_attempt_id uuid, p_phase text, p_call_id uuid, p_purpose text, p_provider_key text, p_model_key text, p_policy_version text, p_price_version text, p_verified_input_token_bound bigint, p_enforced_output_limit bigint, p_serialized_request_bytes bigint)
 RETURNS TABLE(call_id uuid, ceiling_micro_usd bigint, bucket_utc_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_day date := (clock_timestamp() at time zone 'UTC')::date;
  v_owner_unlimited boolean;
  v_budget public.seyeon_ai_governor_daily_budgets_v1%rowtype;
  v_model public.seyeon_ai_governor_model_policies_v1%rowtype;
  v_subject_occupied numeric;
  v_ceiling numeric;
  v_rate numeric;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  -- Only the canonical DB-recognized Owner Admin is exempt from a DAILY
  -- spending cap. Per-call quote, protected billing ledger, model limits
  -- and duplicate-dispatch protection remain mandatory for everyone.
  select (a.is_owner_admin and a.chat_credit_exempt)
    into v_owner_unlimited
    from public.qry_myeongha_owner_admin_access_v1(p_subject_id) a;
  if v_owner_unlimited is null then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_owner_authority_missing',
      message='Cannot verify canonical Owner cost-mode authority';
  end if;
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

  if not v_owner_unlimited then
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

  end if;

  -- D4B: deletion can commit while this transaction waits for the global row.
  -- Recheck AND hold the canonical Subject row through reservation COMMIT.
  -- Lock order: global daily budget -> canonical Subject -> attempt/ledger.
  perform public.seyeon_ai_lock_active_subject_for_cost_v1(p_subject_id);

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

  if not v_owner_unlimited then
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

  end if;

  -- No direct row-lock privilege is granted on chat_attempts/chat_turns.
  -- The NOLOGIN private start core rechecks Subject/turn/attempt state.
  -- Finalizer vs admission concurrency remains an ENFORCE blocker for 04D.
  -- No ON CONFLICT replay: a duplicate ID must not authorize a second send.
  perform 1 from public.seyeon_ai_start_internal_v1(
    p_subject_id,p_turn_id,p_attempt_id,p_phase,p_call_id,
    p_purpose,p_provider_key,p_model_key
  );

  update public.seyeon_ai_call_cost_events e
  set governor_bucket_utc_date=v_day,
      governor_policy_version=p_policy_version,
      governor_price_version=p_price_version,
      governor_ceiling_micro_usd=v_ceiling::bigint,
      governor_input_bound_tokens=p_verified_input_token_bound,
      governor_output_cap_tokens=p_enforced_output_limit,
      governor_owner_no_daily_limit=v_owner_unlimited
  where e.call_id=p_call_id and e.subject_id=p_subject_id
    and e.lifecycle_state='started';
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_ledger_write_failed',
      message='AI governed call start must remain in the same transaction';
  end if;

  if not v_owner_unlimited then
    update public.seyeon_ai_governor_daily_budgets_v1 d
    set occupied_micro_usd=(d.occupied_micro_usd::numeric+v_ceiling)::bigint
    where d.bucket_utc_date=v_day;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_ai_governor_counter_write_failed',
        message='AI governed budget write failed';
    end if;

  end if;

  return query select p_call_id,v_ceiling::bigint,v_day;
end
$function$;

CREATE OR REPLACE FUNCTION public.cmd_governed_settle_seyeon_ai_call_v1(p_subject_id uuid, p_turn_id uuid, p_attempt_id uuid, p_phase text, p_event jsonb)
 RETURNS TABLE(call_id uuid, replayed boolean, occupied_micro_usd bigint, over_ceiling boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_call uuid;
  v_day date;
  v_owner_unlimited boolean;
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
  select e.governor_bucket_utc_date, e.governor_owner_no_daily_limit into v_day,v_owner_unlimited
  from public.seyeon_ai_call_cost_events e
  where e.call_id=v_call and e.subject_id=p_subject_id
    and e.turn_id=p_turn_id and e.attempt_id=p_attempt_id
    and e.phase=p_phase and e.governor_bucket_utc_date is not null;
  if v_day is null then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_settlement_not_owned',
      message='Governed settlement requires an authoritative reserved call';
  end if;

  if not v_owner_unlimited then
    -- Same lock order as admission: global row FIRST, then Subject cost ledger.
    select d.* into v_budget from public.seyeon_ai_governor_daily_budgets_v1 d
    where d.bucket_utc_date=v_day for update;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_ai_governor_settlement_day_missing',
        message='Governed settlement daily budget was not found';
    end if;
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
  from public.seyeon_ai_settle_internal_v1(
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
  if not v_owner_unlimited then
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
  end if;

  -- Actual cost above ceiling is recorded and marked as an incident. Do not
  -- falsify invoice/usage to satisfy a configured budget.
  return query select v_call,false,v_actual::bigint,
    v_actual>v_row.governor_ceiling_micro_usd::numeric;
end
$function$;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM myeongha_seyeon_cost_meter_owner;
REVOKE myeongha_seyeon_cost_meter_owner FROM current_user;

DO $post$
BEGIN
 IF NOT has_function_privilege('myeongha_seyeon_cost_meter_owner',
      'public.qry_myeongha_owner_admin_access_v1(uuid)','EXECUTE')
   OR has_function_privilege('anon','public.qry_myeongha_owner_admin_access_v1(uuid)','EXECUTE')
   OR has_function_privilege('authenticated','public.qry_myeongha_owner_admin_access_v1(uuid)','EXECUTE')
   OR (SELECT position('governor_owner_no_daily_limit=v_owner_unlimited' in pg_get_functiondef(oid))=0
       FROM pg_proc WHERE oid=to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)'))
   OR (SELECT position('if not v_owner_unlimited then' in pg_get_functiondef(oid))=0
       FROM pg_proc WHERE oid=to_regprocedure('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)'))
   OR has_function_privilege('anon','public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)','EXECUTE')
   OR has_function_privilege('authenticated','public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)','EXECUTE')
   OR has_function_privilege('service_role','public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)','EXECUTE')
   OR has_function_privilege('anon','public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)','EXECUTE')
   OR has_function_privilege('service_role','public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)','EXECUTE')
   OR has_schema_privilege('myeongha_seyeon_cost_meter_owner','public','CREATE')
 THEN RAISE EXCEPTION 'Owner unlimited-daily cost path security postcondition failed'; END IF;
END
$post$;
COMMIT;
