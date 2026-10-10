-- Se-yeon PR-04D3B2B-2: isolate governed admission from external legacy Start RPC.
-- Watchtower-Track: character-memory
-- The current API executor's legacy Start/Settle/Record grants are unchanged.
-- No model requests, operator price seeding or Production ENFORCE activation.

-- Preserve the exact lifecycle state/Subject validator and non-replay INSERT
-- from 1560 in a NOLOGIN cost-meter-owned function with no API privileges.
create function public.seyeon_ai_start_internal_v1(
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

-- Preserve the existing OFF-era public RPC's ABI and behavior.
create or replace function public.cmd_start_seyeon_ai_call_v1(
  p_subject_id uuid, p_turn_id uuid, p_attempt_id uuid, p_phase text,
  p_call_id uuid, p_purpose text, p_provider_key text, p_model_key text
)
returns table (call_id uuid)
language plpgsql security definer
set search_path = pg_catalog, public
as $legacy_start_wrapper$
begin
  -- OFF compatibility: exactly the existing validated lifecycle, with no
  -- provider dispatch authorization beyond the current legacy contract.
  -- No budget reservation is performed by the legacy path.
  return query select x.call_id
  from public.seyeon_ai_start_internal_v1(
    p_subject_id,p_turn_id,p_attempt_id,p_phase,p_call_id,
    p_purpose,p_provider_key,p_model_key
  ) x;
end
$legacy_start_wrapper$;

-- Governed admission's budget-policy check + locked reservation now invokes
-- only the non-public core, never the legacy public RPC.
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

-- The governed and OFF wrappers already belong to this same NOLOGIN owner.
-- CREATE OR REPLACE preserves their previously hardened EXECUTE ACLs.
grant myeongha_seyeon_cost_meter_owner to current_user;
grant create on schema public to myeongha_seyeon_cost_meter_owner;
alter function public.seyeon_ai_start_internal_v1(
  uuid,uuid,uuid,text,uuid,text,text,text
) owner to myeongha_seyeon_cost_meter_owner;
revoke all on function public.seyeon_ai_start_internal_v1(
  uuid,uuid,uuid,text,uuid,text,text,text
) from public, myeongha_api_executor;
do $private_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute format(
      'revoke all on function public.seyeon_ai_start_internal_v1(uuid,uuid,uuid,text,uuid,text,text,text) from %I',
      v_role
    );
  end loop;
end $private_acl$;

revoke create on schema public from myeongha_seyeon_cost_meter_owner;
revoke myeongha_seyeon_cost_meter_owner from current_user;
