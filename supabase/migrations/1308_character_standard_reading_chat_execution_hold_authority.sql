-- HOLD-safe Standard Reading Character Chat execution lifecycle authority.
--
-- This migration prepares only the narrow pre-generation lifecycle:
-- acquire authoritative turn/attempt -> context-ready -> failed finalization.
--
-- IMPORTANT: myeongha_api_executor intentionally receives NO EXECUTE grant here.
-- Official Reading -> public Character Chat injection remains on HOLD until an
-- explicit Production promotion authority is approved. These wrappers are
-- therefore infrastructure only, not a public runtime activation.
--
-- Generated / validated / commit persistence remains separate because those
-- stages require exact AI execution-log / grounding / outbox provenance.

DO $$
DECLARE
  v_owner_oid oid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_character_chat_execution_owner'
  ) THEN
    CREATE ROLE myeongha_character_chat_execution_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;

  SELECT r.oid
  INTO v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_character_chat_execution_owner'
    AND NOT r.rolcanlogin
    AND NOT r.rolsuper
    AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole
    AND NOT r.rolinherit
    AND NOT r.rolreplication
    AND NOT r.rolbypassrls;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'myeongha_character_chat_execution_owner is outside the least-privilege role contract';
  END IF;
END
$$;

grant usage on schema public to myeongha_character_chat_execution_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_character_chat_execution_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_character_chat_execution_owner;

-- Generic 0220 commands remain SECURITY INVOKER. Only this NOLOGIN wrapper owner
-- may execute the three lifecycle commands prepared in this slice.
grant execute on function public.cmd_allocate_chat_turn_attempt_v1(uuid, uuid, uuid, text)
  to myeongha_character_chat_execution_owner;
grant execute on function public.cmd_mark_chat_turn_context_ready_v1(uuid, uuid, uuid)
  to myeongha_character_chat_execution_owner;
grant execute on function public.cmd_mark_chat_turn_failed_v1(uuid, uuid, uuid, text, text)
  to myeongha_character_chat_execution_owner;

-- Column-scoped privileges required by the three generic commands plus exact
-- turn lookup. No conversation message, AI log, memory, relationship, world or
-- outbox relation is granted in this HOLD slice.
grant select (
  id,
  thread_id,
  subject_id,
  client_turn_id,
  resolved_content_release_id,
  resolved_content_bundle_id,
  state,
  next_attempt_no,
  committed_attempt_id
) on public.chat_turns to myeongha_character_chat_execution_owner;

grant update (
  state,
  revision,
  next_attempt_no,
  error_code,
  updated_at
) on public.chat_turns to myeongha_character_chat_execution_owner;

grant select (
  id,
  turn_id,
  subject_id,
  attempt_no,
  state,
  error_code
) on public.chat_turn_attempts to myeongha_character_chat_execution_owner;

grant insert (
  id,
  turn_id,
  subject_id,
  attempt_no,
  state,
  planner_version,
  started_at
) on public.chat_turn_attempts to myeongha_character_chat_execution_owner;

grant update (
  state,
  finished_at,
  error_code
) on public.chat_turn_attempts to myeongha_character_chat_execution_owner;

create or replace function public.cmd_acquire_standard_reading_chat_execution_hold_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_client_turn_id text,
  p_attempt_id uuid,
  p_planner_version text,
  p_expected_release_id uuid,
  p_expected_bundle_id uuid
)
returns table (
  turn_id uuid,
  attempt_id uuid,
  attempt_no integer,
  execution_mode text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_turn_id uuid;
  v_turn_state text;
  v_turn_release_id uuid;
  v_turn_bundle_id uuid;
  v_committed_attempt_id uuid;
  v_attempt_id uuid;
  v_attempt_no integer;
  v_replayed boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_thread_id is null
     or p_attempt_id is null
     or p_expected_release_id is null
     or p_expected_bundle_id is null
     or p_client_turn_id is null
     or btrim(p_client_turn_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'standard_reading_chat_execution_input_required',
      message = 'Standard Reading Chat execution requires exact server-owned identifiers';
  end if;

  select
    ct.id,
    ct.state,
    ct.resolved_content_release_id,
    ct.resolved_content_bundle_id,
    ct.committed_attempt_id
  into
    v_turn_id,
    v_turn_state,
    v_turn_release_id,
    v_turn_bundle_id,
    v_committed_attempt_id
  from public.chat_turns ct
  where ct.thread_id = p_thread_id
    and ct.subject_id = p_subject_id
    and ct.client_turn_id = p_client_turn_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'standard_reading_chat_execution_turn_not_found',
      message = 'Standard Reading Chat turn is unavailable for this subject/thread/client turn';
  end if;

  if v_turn_release_id is distinct from p_expected_release_id
     or v_turn_bundle_id is distinct from p_expected_bundle_id then
    raise exception using
      errcode = '23514',
      constraint = 'standard_reading_chat_execution_content_provenance',
      message = 'Standard Reading Chat turn content provenance does not match server preflight';
  end if;

  if v_turn_state in ('committed', 'delivered') then
    if v_committed_attempt_id is null then
      raise exception using
        errcode = '23514',
        constraint = 'standard_reading_chat_execution_commit_shape',
        message = 'Committed Standard Reading Chat turn has no authoritative attempt';
    end if;

    select a.attempt_no
    into v_attempt_no
    from public.chat_turn_attempts a
    where a.id = v_committed_attempt_id
      and a.turn_id = v_turn_id
      and a.subject_id = p_subject_id
      and a.state = 'committed';

    if not found then
      raise exception using
        errcode = '23514',
        constraint = 'standard_reading_chat_execution_commit_attempt_missing',
        message = 'Committed Standard Reading Chat turn attempt is unavailable';
    end if;

    return query
    select
      v_turn_id,
      v_committed_attempt_id,
      v_attempt_no,
      'replay_committed'::text;
    return;
  end if;

  select allocated.attempt_id, allocated.attempt_no, allocated.replayed
  into v_attempt_id, v_attempt_no, v_replayed
  from public.cmd_allocate_chat_turn_attempt_v1(
    p_subject_id,
    v_turn_id,
    p_attempt_id,
    nullif(btrim(p_planner_version), '')
  ) allocated;

  if v_replayed then
    raise exception using
      errcode = '23514',
      constraint = 'standard_reading_chat_execution_attempt_in_flight',
      message = 'Standard Reading Chat turn already has an execution attempt in flight';
  end if;

  return query
  select v_turn_id, v_attempt_id, v_attempt_no, 'execute'::text;
end;
$$;

create or replace function public.cmd_mark_standard_reading_chat_context_ready_hold_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_turn_id is null or p_attempt_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'standard_reading_chat_context_ready_input_required',
      message = 'Standard Reading Chat context-ready transition requires turn and attempt';
  end if;

  return public.cmd_mark_chat_turn_context_ready_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id
  );
end;
$$;

create or replace function public.cmd_mark_standard_reading_chat_failed_hold_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_failure_state text,
  p_error_code text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_turn_id is null
     or p_attempt_id is null
     or p_failure_state not in ('failed_retryable', 'failed_final')
     or p_error_code is null
     or btrim(p_error_code) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'standard_reading_chat_failed_input_invalid',
      message = 'Standard Reading Chat failed transition input is invalid';
  end if;

  return public.cmd_mark_chat_turn_failed_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_failure_state,
    p_error_code
  );
end;
$$;

-- Transfer only the wrappers to the narrow NOLOGIN owner. Generic 0220 command
-- ownership is unchanged.
grant myeongha_character_chat_execution_owner to current_user;
grant create on schema public to myeongha_character_chat_execution_owner;

alter function public.cmd_acquire_standard_reading_chat_execution_hold_v1(
  uuid, uuid, text, uuid, text, uuid, uuid
) owner to myeongha_character_chat_execution_owner;
alter function public.cmd_mark_standard_reading_chat_context_ready_hold_v1(
  uuid, uuid, uuid
) owner to myeongha_character_chat_execution_owner;
alter function public.cmd_mark_standard_reading_chat_failed_hold_v1(
  uuid, uuid, uuid, text, text
) owner to myeongha_character_chat_execution_owner;

revoke all on function public.cmd_acquire_standard_reading_chat_execution_hold_v1(
  uuid, uuid, text, uuid, text, uuid, uuid
) from public, anon, authenticated, service_role, myeongha_api_executor;
revoke all on function public.cmd_mark_standard_reading_chat_context_ready_hold_v1(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role, myeongha_api_executor;
revoke all on function public.cmd_mark_standard_reading_chat_failed_hold_v1(
  uuid, uuid, uuid, text, text
) from public, anon, authenticated, service_role, myeongha_api_executor;

revoke create on schema public from myeongha_character_chat_execution_owner;
revoke myeongha_character_chat_execution_owner from current_user;

comment on function public.cmd_acquire_standard_reading_chat_execution_hold_v1(
  uuid, uuid, text, uuid, text, uuid, uuid
) is
'HOLD-only Standard Reading Character Chat attempt acquisition. Not executable by myeongha_api_executor until explicit Production promotion.';
comment on function public.cmd_mark_standard_reading_chat_context_ready_hold_v1(
  uuid, uuid, uuid
) is
'HOLD-only Standard Reading Character Chat context-ready transition. Not executable by myeongha_api_executor until explicit Production promotion.';
comment on function public.cmd_mark_standard_reading_chat_failed_hold_v1(
  uuid, uuid, uuid, text, text
) is
'HOLD-only Standard Reading Character Chat failure finalization. Not executable by myeongha_api_executor until explicit Production promotion.';
