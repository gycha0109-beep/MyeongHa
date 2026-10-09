-- Se-yeon PR-04B: dormant PostgreSQL atomic budget admission.
-- Watchtower-Track: character-memory
-- No browser routes, no policy seeding and no Production activation.
-- The existing cost ledger's attempt-delete trigger remains the privacy cleanup.
-- A global counter is intentionally conservative, even after Subject deletion.

create table public.seyeon_ai_governor_model_policies_v1 (
  provider_key text not null,
  model_key text not null,
  policy_version text not null,
  price_version text not null,
  allowed_purposes text[] not null,
  context_window_tokens bigint not null,
  maximum_input_tokens bigint not null,
  maximum_output_tokens bigint not null,
  maximum_serialized_request_bytes bigint not null,
  input_micro_usd_per_million bigint not null,
  cached_input_micro_usd_per_million bigint not null,
  output_micro_usd_per_million bigint not null,
  is_active boolean not null default false,
  primary key (provider_key, model_key, policy_version),
  constraint seyeon_ai_governor_model_id_check check (
    provider_key ~ '^[a-zA-Z0-9._:/-]{1,128}$'
    and model_key ~ '^[a-zA-Z0-9._:/-]{1,128}$'
    and policy_version ~ '^[a-zA-Z0-9._:/-]{1,128}$'
    and price_version ~ '^[a-zA-Z0-9._:/-]{1,128}$'
  ),
  constraint seyeon_ai_governor_model_limits_check check (
    context_window_tokens > 0
    and maximum_input_tokens > 0
    and maximum_output_tokens > 0
    and maximum_serialized_request_bytes > 0
    and maximum_input_tokens::numeric + maximum_output_tokens::numeric <= context_window_tokens
    and input_micro_usd_per_million > 0
    and cached_input_micro_usd_per_million >= 0
    and output_micro_usd_per_million > 0
    and cardinality(allowed_purposes) > 0
    and allowed_purposes <@ array[
      'integrity_classification','unified_preflight_shadow',
      'turn_interpret_render_shadow','disclosure_classification',
      'turn_interpretation','dialogue_render','semantic_review',
      'event_extraction'
    ]::text[]
  )
);
create unique index seyeon_ai_governor_one_active_model_v1
  on public.seyeon_ai_governor_model_policies_v1(provider_key,model_key)
  where is_active;

create table public.seyeon_ai_governor_daily_budgets_v1 (
  bucket_utc_date date primary key,
  global_limit_micro_usd bigint not null check (global_limit_micro_usd > 0),
  subject_limit_micro_usd bigint not null check (subject_limit_micro_usd > 0),
  occupied_micro_usd bigint not null default 0 check (occupied_micro_usd >= 0),
  created_at timestamptz not null default clock_timestamp()
);

-- The ledger already has canonical Subject/Turn/Attempt and its approved
-- attempt-delete cleanup. No new user-specific table or historical FK.
alter table public.seyeon_ai_call_cost_events
  add column governor_bucket_utc_date date null,
  add column governor_policy_version text null,
  add column governor_price_version text null,
  add column governor_ceiling_micro_usd bigint null,
  add column governor_input_bound_tokens bigint null,
  add column governor_output_cap_tokens bigint null,
  add constraint seyeon_ai_governor_ledger_quote_shape_v1 check (
    (
      governor_bucket_utc_date is null
      and governor_policy_version is null
      and governor_price_version is null
      and governor_ceiling_micro_usd is null
      and governor_input_bound_tokens is null
      and governor_output_cap_tokens is null
    )
    or
    (
      governor_bucket_utc_date is not null
      and governor_policy_version is not null
      and governor_price_version is not null
      and governor_ceiling_micro_usd > 0
      and governor_input_bound_tokens > 0
      and governor_output_cap_tokens > 0
    )
  );
create index seyeon_ai_governor_ledger_subject_day_v1
  on public.seyeon_ai_call_cost_events(subject_id,governor_bucket_utc_date)
  where governor_bucket_utc_date is not null;

alter table public.seyeon_ai_governor_model_policies_v1 enable row level security;
alter table public.seyeon_ai_governor_model_policies_v1 force row level security;
alter table public.seyeon_ai_governor_daily_budgets_v1 enable row level security;
alter table public.seyeon_ai_governor_daily_budgets_v1 force row level security;

-- Both tables are provider/service policy state, not user data. Only an
-- administrator may provision rows. The NOLOGIN owner reads them via a
-- narrow SECURITY DEFINER admission command, never direct API table grants.
create policy seyeon_ai_governor_model_owner_read_v1
  on public.seyeon_ai_governor_model_policies_v1
  for select to myeongha_seyeon_cost_meter_owner using (true);
create policy seyeon_ai_governor_day_owner_read_v1
  on public.seyeon_ai_governor_daily_budgets_v1
  for select to myeongha_seyeon_cost_meter_owner using (true);
create policy seyeon_ai_governor_day_owner_update_v1
  on public.seyeon_ai_governor_daily_budgets_v1
  for update to myeongha_seyeon_cost_meter_owner
  using (true) with check (true);

alter table public.seyeon_ai_governor_model_policies_v1
  owner to myeongha_seyeon_cost_meter_owner;
alter table public.seyeon_ai_governor_daily_budgets_v1
  owner to myeongha_seyeon_cost_meter_owner;
revoke all on public.seyeon_ai_governor_model_policies_v1 from public;
revoke all on public.seyeon_ai_governor_daily_budgets_v1 from public;

create function public.cmd_governed_start_seyeon_ai_call_v1(
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
  select coalesce(sum(e.governor_ceiling_micro_usd),0)::numeric
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

grant myeongha_seyeon_cost_meter_owner to current_user;
grant create on schema public to myeongha_seyeon_cost_meter_owner;
alter function public.cmd_governed_start_seyeon_ai_call_v1(
  uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint
) owner to myeongha_seyeon_cost_meter_owner;
revoke all on function public.cmd_governed_start_seyeon_ai_call_v1(
  uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint
) from public;
do $acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute format(
      'revoke all on function public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint) from %I',
      v_role);
  end loop;
end $acl$;
grant execute on function public.cmd_governed_start_seyeon_ai_call_v1(
  uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint
) to myeongha_api_executor;
revoke create on schema public from myeongha_seyeon_cost_meter_owner;
revoke myeongha_seyeon_cost_meter_owner from current_user;
