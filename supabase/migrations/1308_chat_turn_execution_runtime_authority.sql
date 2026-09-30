-- Production Character Chat turn execution authority.
--
-- P0-AUTH-01: ordinary requests enter through myeongha_api_executor with a
-- transaction-local canonical subject. The historical Chat core commands remain
-- SECURITY INVOKER and closed to the API executor. This migration exposes narrow
-- SECURITY DEFINER wrappers owned by a dedicated NOLOGIN/NOBYPASSRLS role.
--
-- IMPORTANT: the runtime commit wrapper deliberately fixes relationship/world/
-- memory effects to NULL. SRC-22 and adjacent effect authorities remain unresolved;
-- this slice authorizes only the validated Character message + standard outbox commit.

DO $$
DECLARE
  v_role record;
  v_marker text;
  v_expected_marker constant text := 'myeongha:chat-turn-runtime-owner:v1';
BEGIN
  SELECT
    oid,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls
  INTO v_role
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_chat_turn_runtime_owner';

  IF NOT FOUND THEN
    CREATE ROLE myeongha_chat_turn_runtime_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;

    COMMENT ON ROLE myeongha_chat_turn_runtime_owner IS
      'myeongha:chat-turn-runtime-owner:v1';
  ELSE
    v_marker := pg_catalog.shobj_description(v_role.oid, 'pg_authid');

    IF v_marker IS DISTINCT FROM v_expected_marker THEN
      RAISE EXCEPTION 'myeongha_chat_turn_runtime_owner exists without the managed role marker';
    END IF;

    IF v_role.rolcanlogin
       OR v_role.rolsuper
       OR v_role.rolcreatedb
       OR v_role.rolcreaterole
       OR v_role.rolinherit
       OR v_role.rolreplication
       OR v_role.rolbypassrls THEN
      RAISE EXCEPTION 'managed Chat turn runtime owner violates least-privilege role shape';
    END IF;
  END IF;
END
$$;

grant usage on schema public to myeongha_chat_turn_runtime_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_chat_turn_runtime_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_chat_turn_runtime_owner;

grant execute on function public.cmd_allocate_chat_turn_attempt_v1(uuid, uuid, uuid, text)
  to myeongha_chat_turn_runtime_owner;
grant execute on function public.cmd_mark_chat_turn_context_ready_v1(uuid, uuid, uuid)
  to myeongha_chat_turn_runtime_owner;
grant execute on function public.cmd_mark_chat_turn_failed_v1(uuid, uuid, uuid, text, text)
  to myeongha_chat_turn_runtime_owner;
grant execute on function public.cmd_mark_chat_turn_generated_v1(
  uuid, uuid, uuid, uuid, text, uuid, text, jsonb, text, text, jsonb
) to myeongha_chat_turn_runtime_owner;
grant execute on function public.cmd_validate_chat_turn_attempt_v1(
  uuid, uuid, uuid, uuid, text, jsonb, boolean, text
) to myeongha_chat_turn_runtime_owner;
grant execute on function public.cmd_commit_chat_turn_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) to myeongha_chat_turn_runtime_owner;

-- Core command table capabilities. The role is NOLOGIN and is not granted to the
-- API executor. Runtime access is only through the definer wrappers below.
grant select (
  id, thread_id, subject_id, state, next_attempt_no,
  resolved_content_release_id, resolved_content_bundle_id,
  created_at, committed_attempt_id
) on public.chat_turns to myeongha_chat_turn_runtime_owner;
grant update (
  next_attempt_no, state, revision, error_code, updated_at,
  committed_attempt_id, committed_at
) on public.chat_turns to myeongha_chat_turn_runtime_owner;

grant select (
  id, turn_id, subject_id, attempt_no, state, error_code,
  generation_ai_execution_log_id, generated_thread_character_id,
  generated_body_text, generated_message_payload_jsonb,
  generated_message_schema_version, generated_content_hash,
  grounding_refs_jsonb, validation_ai_execution_log_id,
  validation_result_jsonb, committed_message_id
) on public.chat_turn_attempts to myeongha_chat_turn_runtime_owner;
grant insert (
  id, turn_id, subject_id, attempt_no, state, planner_version, started_at
) on public.chat_turn_attempts to myeongha_chat_turn_runtime_owner;
grant update (
  state, renderer_version, output_guard_version,
  generation_ai_execution_log_id, validation_ai_execution_log_id,
  generated_thread_character_id, generated_character_content_bundle_id,
  generated_body_text, generated_message_payload_jsonb,
  generated_message_schema_version, generated_content_hash,
  grounding_refs_jsonb, validation_result_jsonb,
  generated_at, validated_at, finished_at, error_code,
  committed_message_id
) on public.chat_turn_attempts to myeongha_chat_turn_runtime_owner;

grant select (id, subject_id, status, next_sequence_no)
  on public.conversation_threads to myeongha_chat_turn_runtime_owner;
grant update (next_sequence_no, updated_at)
  on public.conversation_threads to myeongha_chat_turn_runtime_owner;

grant select (
  id, thread_id, character_id, content_bundle_id, joined_at, left_at
) on public.conversation_thread_characters to myeongha_chat_turn_runtime_owner;

grant select (
  id, turn_id, subject_id, sequence_no, sender_type,
  body_text, message_payload_jsonb, message_schema_version
) on public.conversation_messages to myeongha_chat_turn_runtime_owner;
grant insert (
  id, thread_id, subject_id, turn_id, sequence_no,
  sender_type, thread_character_id, character_content_bundle_id,
  body_text, message_payload_jsonb, message_schema_version,
  content_hash, created_at
) on public.conversation_messages to myeongha_chat_turn_runtime_owner;

grant select (
  id, subject_id, turn_id, turn_attempt_id, stage, provider, model,
  prompt_version, content_release_id, content_bundle_id, character_id,
  input_ref_jsonb, output_ref_jsonb, status, error_code
) on public.ai_execution_logs to myeongha_chat_turn_runtime_owner;
grant insert (
  id, subject_id, turn_id, turn_attempt_id, stage, provider, model,
  prompt_version, content_release_id, content_bundle_id, character_id,
  input_ref_jsonb, output_ref_jsonb, status, error_code, created_at
) on public.ai_execution_logs to myeongha_chat_turn_runtime_owner;

grant select (ai_execution_log_id, grounding_id, subject_id, role)
  on public.ai_execution_groundings to myeongha_chat_turn_runtime_owner;
grant insert (
  ai_execution_log_id, grounding_id, subject_id, role, created_at
) on public.ai_execution_groundings to myeongha_chat_turn_runtime_owner;

grant select (id, subject_id)
  on public.reading_groundings to myeongha_chat_turn_runtime_owner;

grant insert (
  id, aggregate_type, aggregate_id, event_type, event_schema_version,
  dedupe_key, payload_jsonb, status, attempt_count, available_at, created_at
) on public.outbox_events to myeongha_chat_turn_runtime_owner;

-- Existing Chat read RLS is role-specific. Add the same current-subject shape for
-- the dedicated definer owner without widening myeongha_api_executor direct DML.
drop policy if exists conversation_threads_chat_turn_runtime_owner_select_v1
  on public.conversation_threads;
create policy conversation_threads_chat_turn_runtime_owner_select_v1
on public.conversation_threads
for select
to myeongha_chat_turn_runtime_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_threads_chat_turn_runtime_owner_update_v1
  on public.conversation_threads;
create policy conversation_threads_chat_turn_runtime_owner_update_v1
on public.conversation_threads
for update
to myeongha_chat_turn_runtime_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_thread_characters_chat_turn_runtime_owner_select_v1
  on public.conversation_thread_characters;
create policy conversation_thread_characters_chat_turn_runtime_owner_select_v1
on public.conversation_thread_characters
for select
to myeongha_chat_turn_runtime_owner
using (
  exists (
    select 1
    from public.conversation_threads ct
    where ct.id = conversation_thread_characters.thread_id
      and ct.subject_id = public.current_myeongha_subject_id()
  )
);

drop policy if exists conversation_messages_chat_turn_runtime_owner_select_v1
  on public.conversation_messages;
create policy conversation_messages_chat_turn_runtime_owner_select_v1
on public.conversation_messages
for select
to myeongha_chat_turn_runtime_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_messages_chat_turn_runtime_owner_insert_v1
  on public.conversation_messages;
create policy conversation_messages_chat_turn_runtime_owner_insert_v1
on public.conversation_messages
for insert
to myeongha_chat_turn_runtime_owner
with check (subject_id = public.current_myeongha_subject_id());

create or replace function public.cmd_allocate_chat_turn_attempt_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_planner_version text
)
returns table (
  attempt_id uuid,
  attempt_no integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select core.attempt_id, core.attempt_no, core.replayed
  from public.cmd_allocate_chat_turn_attempt_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_planner_version
  ) core;
end;
$$;

create or replace function public.cmd_mark_chat_turn_context_ready_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return public.cmd_mark_chat_turn_context_ready_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id
  );
end;
$$;

create or replace function public.cmd_mark_chat_turn_failed_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_failure_state text,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return public.cmd_mark_chat_turn_failed_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_failure_state,
    p_error_code
  );
end;
$$;

create or replace function public.cmd_record_chat_success_ai_execution_runtime_v1(
  p_subject_id uuid,
  p_execution_log_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_stage text,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_character_id text,
  p_input_ref_jsonb jsonb,
  p_output_ref_jsonb jsonb,
  p_grounding_ids_jsonb jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_thread_id uuid;
  v_release_id uuid;
  v_bundle_id uuid;
  v_turn_created_at timestamptz;
  v_grounding jsonb;
  v_grounding_id uuid;
  v_grounding_count integer;
  v_distinct_grounding_count integer;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_execution_log_id is null
     or p_stage not in ('renderer', 'output_guard')
     or p_provider is null or btrim(p_provider) = ''
     or p_model is null or btrim(p_model) = ''
     or p_prompt_version is null or btrim(p_prompt_version) = ''
     or p_character_id is null or btrim(p_character_id) = ''
     or p_output_ref_jsonb is null
     or jsonb_typeof(p_output_ref_jsonb) <> 'object'
     or coalesce(p_output_ref_jsonb ->> 'generatedContentHash', '') !~ '^sha256:v1:[0-9a-f]{64}$'
     or p_grounding_ids_jsonb is null
     or jsonb_typeof(p_grounding_ids_jsonb) <> 'array' then
    raise exception using
      errcode = '23514',
      constraint = 'chat_runtime_ai_execution_contract',
      message = 'Chat runtime AI execution provenance is invalid';
  end if;

  if p_input_ref_jsonb is not null
     and jsonb_typeof(p_input_ref_jsonb) <> 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'chat_runtime_ai_execution_input_ref',
      message = 'Chat runtime AI execution input ref must be a JSON object';
  end if;

  select t.thread_id, t.resolved_content_release_id,
         t.resolved_content_bundle_id, t.created_at
  into v_thread_id, v_release_id, v_bundle_id, v_turn_created_at
  from public.chat_turns t
  where t.id = p_turn_id
    and t.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'chat_runtime_ai_execution_turn_unavailable',
      message = 'Chat runtime AI execution turn is unavailable';
  end if;

  if not exists (
    select 1
    from public.chat_turn_attempts a
    where a.id = p_attempt_id
      and a.turn_id = p_turn_id
      and a.subject_id = p_subject_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'chat_runtime_ai_execution_attempt_unavailable',
      message = 'Chat runtime AI execution attempt is unavailable';
  end if;

  if not exists (
    select 1
    from public.conversation_thread_characters ctc
    where ctc.thread_id = v_thread_id
      and ctc.character_id = p_character_id
      and ctc.content_bundle_id = v_bundle_id
      and ctc.joined_at <= v_turn_created_at
      and (ctc.left_at is null or ctc.left_at >= v_turn_created_at)
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'chat_runtime_ai_execution_character_mismatch',
      message = 'Chat runtime AI execution Character is not authoritative for the turn';
  end if;

  select count(*), count(distinct value)
  into v_grounding_count, v_distinct_grounding_count
  from jsonb_array_elements_text(p_grounding_ids_jsonb);

  if v_grounding_count <> v_distinct_grounding_count then
    raise exception using
      errcode = '23514',
      constraint = 'chat_runtime_ai_execution_grounding_duplicate',
      message = 'Chat runtime AI execution grounding ids must be unique';
  end if;

  for v_grounding in
    select value from jsonb_array_elements(p_grounding_ids_jsonb)
  loop
    begin
      v_grounding_id := trim(both '"' from v_grounding::text)::uuid;
    exception
      when invalid_text_representation then
        raise exception using
          errcode = '23514',
          constraint = 'chat_runtime_ai_execution_grounding_invalid',
          message = 'Chat runtime AI execution grounding id is invalid';
    end;

    if not exists (
      select 1
      from public.reading_groundings rg
      where rg.id = v_grounding_id
        and rg.subject_id = p_subject_id
    ) then
      raise exception using
        errcode = '23514',
        constraint = 'chat_runtime_ai_execution_grounding_unavailable',
        message = 'Chat runtime AI execution grounding does not belong to the current subject';
    end if;
  end loop;

  insert into public.ai_execution_logs(
    id, subject_id, turn_id, turn_attempt_id, stage, provider, model,
    prompt_version, content_release_id, content_bundle_id, character_id,
    input_ref_jsonb, output_ref_jsonb, status, error_code, created_at
  ) values (
    p_execution_log_id, p_subject_id, p_turn_id, p_attempt_id,
    p_stage, p_provider, p_model, p_prompt_version,
    v_release_id, v_bundle_id, p_character_id,
    p_input_ref_jsonb, p_output_ref_jsonb,
    'success', null, clock_timestamp()
  );

  for v_grounding in
    select value from jsonb_array_elements(p_grounding_ids_jsonb)
  loop
    v_grounding_id := trim(both '"' from v_grounding::text)::uuid;

    insert into public.ai_execution_groundings(
      ai_execution_log_id, grounding_id, subject_id, role, created_at
    ) values (
      p_execution_log_id, v_grounding_id, p_subject_id, 'context', clock_timestamp()
    );
  end loop;

  return false;
end;
$$;

create or replace function public.cmd_mark_chat_turn_generated_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_generation_ai_execution_log_id uuid,
  p_renderer_version text,
  p_character_id text,
  p_body_text text,
  p_message_payload_jsonb jsonb,
  p_message_schema_version text,
  p_content_hash text,
  p_grounding_refs_jsonb jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_thread_id uuid;
  v_bundle_id uuid;
  v_turn_created_at timestamptz;
  v_thread_character_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select t.thread_id, t.resolved_content_bundle_id, t.created_at
  into v_thread_id, v_bundle_id, v_turn_created_at
  from public.chat_turns t
  where t.id = p_turn_id
    and t.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'chat_runtime_generated_turn_unavailable',
      message = 'Chat runtime generated turn is unavailable';
  end if;

  select ctc.id
  into strict v_thread_character_id
  from public.conversation_thread_characters ctc
  where ctc.thread_id = v_thread_id
    and ctc.character_id = p_character_id
    and ctc.content_bundle_id = v_bundle_id
    and ctc.joined_at <= v_turn_created_at
    and (ctc.left_at is null or ctc.left_at >= v_turn_created_at);

  return public.cmd_mark_chat_turn_generated_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_generation_ai_execution_log_id,
    p_renderer_version,
    v_thread_character_id,
    p_body_text,
    p_message_payload_jsonb,
    p_message_schema_version,
    p_content_hash,
    p_grounding_refs_jsonb
  );
exception
  when no_data_found then
    raise exception using
      errcode = 'P0001',
      constraint = 'chat_runtime_generated_character_unavailable',
      message = 'Chat runtime generated Character participant is unavailable';
  when too_many_rows then
    raise exception using
      errcode = '23514',
      constraint = 'chat_runtime_generated_character_ambiguous',
      message = 'Chat runtime generated Character participant is ambiguous';
end;
$$;

create or replace function public.cmd_validate_chat_turn_attempt_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_validation_ai_execution_log_id uuid,
  p_output_guard_version text,
  p_validation_result_jsonb jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return public.cmd_validate_chat_turn_attempt_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_validation_ai_execution_log_id,
    p_output_guard_version,
    p_validation_result_jsonb,
    true,
    'failed_final'
  );
end;
$$;

create or replace function public.cmd_commit_chat_turn_runtime_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_message_id uuid,
  p_outbox_event_id uuid
)
returns table (
  turn_id uuid,
  attempt_id uuid,
  message_id uuid,
  sequence_no bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select core.turn_id, core.attempt_id, core.message_id,
         core.sequence_no, core.replayed
  from public.cmd_commit_chat_turn_v1(
    p_subject_id,
    p_thread_id,
    p_turn_id,
    p_attempt_id,
    p_message_id,
    p_outbox_event_id,
    null,
    null,
    null
  ) core;
end;
$$;

create or replace function public.qry_committed_chat_turn_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid
)
returns table (
  turn_id uuid,
  attempt_id uuid,
  message_id uuid,
  sequence_no bigint,
  provider text,
  model text,
  body_text text,
  message_payload_jsonb jsonb,
  message_schema_version text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    t.id,
    a.id,
    m.id,
    m.sequence_no,
    log.provider,
    log.model,
    m.body_text,
    m.message_payload_jsonb,
    m.message_schema_version
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.id = t.committed_attempt_id
   and a.turn_id = t.id
   and a.subject_id = t.subject_id
  join public.conversation_messages m
    on m.id = a.committed_message_id
   and m.turn_id = t.id
   and m.subject_id = t.subject_id
   and m.sender_type = 'character'
  join public.ai_execution_logs log
    on log.id = a.generation_ai_execution_log_id
   and log.subject_id = t.subject_id
  where t.id = p_turn_id
    and t.subject_id = p_subject_id
    and t.state in ('committed', 'delivered')
    and a.state = 'committed';
end;
$$;

-- Transfer wrappers to the dedicated least-privilege owner.
grant myeongha_chat_turn_runtime_owner to current_user;
grant create on schema public to myeongha_chat_turn_runtime_owner;

alter function public.cmd_allocate_chat_turn_attempt_runtime_v1(uuid, uuid, uuid, text)
  owner to myeongha_chat_turn_runtime_owner;
alter function public.cmd_mark_chat_turn_context_ready_runtime_v1(uuid, uuid, uuid)
  owner to myeongha_chat_turn_runtime_owner;
alter function public.cmd_mark_chat_turn_failed_runtime_v1(uuid, uuid, uuid, text, text)
  owner to myeongha_chat_turn_runtime_owner;
alter function public.cmd_record_chat_success_ai_execution_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb, jsonb
) owner to myeongha_chat_turn_runtime_owner;
alter function public.cmd_mark_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, text, text, jsonb
) owner to myeongha_chat_turn_runtime_owner;
alter function public.cmd_validate_chat_turn_attempt_runtime_v1(
  uuid, uuid, uuid, uuid, text, jsonb
) owner to myeongha_chat_turn_runtime_owner;
alter function public.cmd_commit_chat_turn_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid
) owner to myeongha_chat_turn_runtime_owner;
alter function public.qry_committed_chat_turn_runtime_v1(uuid, uuid)
  owner to myeongha_chat_turn_runtime_owner;

revoke create on schema public from myeongha_chat_turn_runtime_owner;
revoke myeongha_chat_turn_runtime_owner from current_user;

-- Public and provider roles never execute these wrappers directly.
revoke all on function public.cmd_allocate_chat_turn_attempt_runtime_v1(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.cmd_mark_chat_turn_context_ready_runtime_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cmd_mark_chat_turn_failed_runtime_v1(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.cmd_record_chat_success_ai_execution_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.cmd_mark_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.cmd_validate_chat_turn_attempt_runtime_v1(
  uuid, uuid, uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.cmd_commit_chat_turn_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.qry_committed_chat_turn_runtime_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.cmd_allocate_chat_turn_attempt_runtime_v1(uuid, uuid, uuid, text)
  to myeongha_api_executor;
grant execute on function public.cmd_mark_chat_turn_context_ready_runtime_v1(uuid, uuid, uuid)
  to myeongha_api_executor;
grant execute on function public.cmd_mark_chat_turn_failed_runtime_v1(uuid, uuid, uuid, text, text)
  to myeongha_api_executor;
grant execute on function public.cmd_record_chat_success_ai_execution_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb, jsonb
) to myeongha_api_executor;
grant execute on function public.cmd_mark_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, text, text, jsonb
) to myeongha_api_executor;
grant execute on function public.cmd_validate_chat_turn_attempt_runtime_v1(
  uuid, uuid, uuid, uuid, text, jsonb
) to myeongha_api_executor;
grant execute on function public.cmd_commit_chat_turn_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid
) to myeongha_api_executor;
grant execute on function public.qry_committed_chat_turn_runtime_v1(uuid, uuid)
  to myeongha_api_executor;

-- Executor must not gain direct write capabilities to the underlying authority.
DO $$
BEGIN
  IF has_table_privilege('myeongha_api_executor', 'public.chat_turns', 'UPDATE')
     OR has_table_privilege('myeongha_api_executor', 'public.chat_turn_attempts', 'INSERT')
     OR has_table_privilege('myeongha_api_executor', 'public.chat_turn_attempts', 'UPDATE')
     OR has_table_privilege('myeongha_api_executor', 'public.ai_execution_logs', 'INSERT')
     OR has_table_privilege('myeongha_api_executor', 'public.ai_execution_groundings', 'INSERT')
     OR has_table_privilege('myeongha_api_executor', 'public.conversation_messages', 'INSERT')
     OR has_table_privilege('myeongha_api_executor', 'public.outbox_events', 'INSERT') THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly has direct Chat turn runtime DML';
  END IF;
END
$$;

comment on function public.cmd_commit_chat_turn_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid
) is
'Production current-subject Character Chat commit wrapper. Relationship/world/memory effects are fixed to NULL until their independent authorities are resolved.';
