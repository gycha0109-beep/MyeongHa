-- D4B-1: lock the exact active Subject for governed admission and block
-- admission when deletion_pending/deleted/merged won the concurrent race.
-- Watchtower-Track: character-memory
-- Historical migrations are immutable. OFF-era legacy Start remains unchanged.
-- No provider calls, Production seeding, Production role cutover, or REVOKE.
--
-- Only the private cost-meter owner may invoke this narrow elevated read-lock
-- helper. A SELECT FOR SHARE conflicts with the UPDATE lock used by deletion
-- start/finalizer. The lock is transaction-scoped and is held until COMMIT.
begin;

create function public.seyeon_ai_lock_active_subject_for_cost_v1(p_subject_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $subject_guard$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1
  from public.subjects s
  where s.id = p_subject_id
    and s.status = 'active'
    and s.merged_into_subject_id is null
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_subject_inactive',
      message='Governed AI admission requires an active canonical Subject';
  end if;
end
$subject_guard$;

revoke all on function public.seyeon_ai_lock_active_subject_for_cost_v1(uuid)
  from public, myeongha_api_executor, myeongha_seyeon_governed_executor;
grant execute on function public.seyeon_ai_lock_active_subject_for_cost_v1(uuid)
  to myeongha_seyeon_cost_meter_owner;

-- CREATE OR REPLACE retains existing governed RPC ownership / EXECUTE ACLs.
-- Only the ENFORCE path gains the revalidation; OFF compatibility is retained.

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

commit;
