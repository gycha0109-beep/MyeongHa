-- Production Standard Reading Character turn persistence authority.
--
-- Reuses the existing 0220 Chat attempt/generate/validate/commit state machine.
-- This migration only exposes narrow subject-bound SECURITY DEFINER wrappers and
-- AI execution provenance persistence. It does not introduce a second Chat lifecycle,
-- relationship-stage policy, Character memory admission policy, or Saju semantics.

DO $$
DECLARE
  v_owner_oid oid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'myeongha_character_turn_owner'
  ) THEN
    CREATE ROLE myeongha_character_turn_owner
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION NOBYPASSRLS;
  END IF;

  SELECT oid INTO STRICT v_owner_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_character_turn_owner'
    AND NOT rolcanlogin
    AND NOT rolsuper
    AND NOT rolcreatedb
    AND NOT rolcreaterole
    AND NOT rolinherit
    AND NOT rolreplication
    AND NOT rolbypassrls;
END
$$;

grant usage on schema public to myeongha_character_turn_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_character_turn_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_character_turn_owner;

grant execute on function public.cmd_allocate_chat_turn_attempt_v1(uuid, uuid, uuid, text)
  to myeongha_character_turn_owner;
grant execute on function public.cmd_mark_chat_turn_context_ready_v1(uuid, uuid, uuid)
  to myeongha_character_turn_owner;
grant execute on function public.cmd_mark_chat_turn_failed_v1(uuid, uuid, uuid, text, text)
  to myeongha_character_turn_owner;
grant execute on function public.cmd_mark_chat_turn_generated_v1(
  uuid, uuid, uuid, uuid, text, uuid, text, jsonb, text, text, jsonb
) to myeongha_character_turn_owner;
grant execute on function public.cmd_validate_chat_turn_attempt_v1(
  uuid, uuid, uuid, uuid, text, jsonb, boolean, text
) to myeongha_character_turn_owner;
grant execute on function public.cmd_commit_chat_turn_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) to myeongha_character_turn_owner;

-- Mandatory state-machine relations only. Optional relationship/world/memory branches
-- are intentionally inaccessible and wrappers always pass NULL for those effects.
grant select (id, subject_id, status, next_sequence_no)
  on public.conversation_threads to myeongha_character_turn_owner;
grant update (next_sequence_no, updated_at)
  on public.conversation_threads to myeongha_character_turn_owner;

grant select on public.chat_turns to myeongha_character_turn_owner;
grant update (
  state, revision, next_attempt_no, committed_attempt_id, error_code,
  committed_at, delivered_at, updated_at
) on public.chat_turns to myeongha_character_turn_owner;

grant select on public.chat_turn_attempts to myeongha_character_turn_owner;
grant insert on public.chat_turn_attempts to myeongha_character_turn_owner;
grant update on public.chat_turn_attempts to myeongha_character_turn_owner;

grant select (
  id, thread_id, character_id, content_bundle_id, role, joined_at, left_at
) on public.conversation_thread_characters to myeongha_character_turn_owner;

grant select (
  id, thread_id, subject_id, turn_id, sequence_no, sender_type,
  thread_character_id, character_content_bundle_id, body_text,
  message_payload_jsonb, message_schema_version, content_hash, created_at
) on public.conversation_messages to myeongha_character_turn_owner;
grant insert (
  id, thread_id, subject_id, turn_id, sequence_no, sender_type,
  thread_character_id, character_content_bundle_id, body_text,
  message_payload_jsonb, message_schema_version, content_hash, created_at
) on public.conversation_messages to myeongha_character_turn_owner;

grant select, insert on public.ai_execution_logs to myeongha_character_turn_owner;
grant select, insert on public.ai_execution_groundings to myeongha_character_turn_owner;
grant select (id, reading_id, subject_id)
  on public.reading_groundings to myeongha_character_turn_owner;
grant select (reading_id, subject_id)
  on public.standard_reading_official_bindings to myeongha_character_turn_owner;
grant select (official_reading_id, subject_id, reader_character_id)
  on public.standard_reading_reader_interpretations to myeongha_character_turn_owner;
grant insert on public.outbox_events to myeongha_character_turn_owner;

-- Existing Chat read RLS is preserved. Add only the NOLOGIN wrapper owner's exact
-- current-subject paths; the API executor still receives no direct write DML.
drop policy if exists conversation_threads_character_turn_select_v1
  on public.conversation_threads;
create policy conversation_threads_character_turn_select_v1
on public.conversation_threads
for select
to myeongha_character_turn_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_threads_character_turn_update_v1
  on public.conversation_threads;
create policy conversation_threads_character_turn_update_v1
on public.conversation_threads
for update
to myeongha_character_turn_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_thread_characters_character_turn_select_v1
  on public.conversation_thread_characters;
create policy conversation_thread_characters_character_turn_select_v1
on public.conversation_thread_characters
for select
to myeongha_character_turn_owner
using (
  exists (
    select 1
    from public.conversation_threads ct
    where ct.id = conversation_thread_characters.thread_id
      and ct.subject_id = public.current_myeongha_subject_id()
  )
);

drop policy if exists conversation_messages_character_turn_select_v1
  on public.conversation_messages;
create policy conversation_messages_character_turn_select_v1
on public.conversation_messages
for select
to myeongha_character_turn_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_messages_character_turn_insert_v1
  on public.conversation_messages;
create policy conversation_messages_character_turn_insert_v1
on public.conversation_messages
for insert
to myeongha_character_turn_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and sender_type = 'character'
);

create or replace function public.qry_character_production_committed_turn_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid
)
returns table (
  turn_id uuid,
  attempt_id uuid,
  message_id uuid,
  sequence_no bigint,
  provider_key text,
  model_key text,
  envelope_jsonb jsonb
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
    l.provider,
    l.model,
    m.message_payload_jsonb
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.id = t.committed_attempt_id
   and a.turn_id = t.id
   and a.subject_id = t.subject_id
   and a.state = 'committed'
  join public.conversation_messages m
    on m.id = a.committed_message_id
   and m.turn_id = t.id
   and m.subject_id = t.subject_id
   and m.sender_type = 'character'
  join public.ai_execution_logs l
    on l.id = a.generation_ai_execution_log_id
   and l.turn_id = t.id
   and l.turn_attempt_id = a.id
   and l.subject_id = t.subject_id
   and l.stage = 'renderer'
   and l.status = 'success'
  where t.id = p_turn_id
    and t.subject_id = p_subject_id
    and t.state in ('committed', 'delivered')
    and m.message_schema_version = 'v1'
    and m.message_payload_jsonb is not null;
end;
$$;

create or replace function public.cmd_character_production_allocate_attempt_runtime_v1(
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
  select *
  from public.cmd_allocate_chat_turn_attempt_v1(
    p_subject_id, p_turn_id, p_attempt_id, p_planner_version
  );
end;
$$;

create or replace function public.cmd_character_production_context_ready_runtime_v1(
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
    p_subject_id, p_turn_id, p_attempt_id
  );
end;
$$;

create or replace function public.cmd_character_production_fail_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_error_code is null or btrim(p_error_code) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'character_production_failure_code_required',
      message = 'Character production failure code is required';
  end if;

  -- No automatic retry policy is admitted by this slice. Fail closed/final and let
  -- an explicit governed retry command decide whether a later attempt may exist.
  return public.cmd_mark_chat_turn_failed_v1(
    p_subject_id, p_turn_id, p_attempt_id, 'failed_final', left(p_error_code, 120)
  );
end;
$$;

create or replace function public.cmd_character_production_stage_generated_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_generation_log_id uuid,
  p_character_id text,
  p_reading_id uuid,
  p_content_bundle_id uuid,
  p_provider text,
  p_model text,
  p_renderer_version text,
  p_prompt_version text,
  p_envelope_jsonb jsonb,
  p_content_hash text
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
  v_thread_character_id uuid;
  v_participant_count bigint;
  v_grounding_refs jsonb;
  v_replayed boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_character_id is null or btrim(p_character_id) = ''
     or p_provider is null or btrim(p_provider) = ''
     or p_model is null or btrim(p_model) = ''
     or p_renderer_version is null or btrim(p_renderer_version) = ''
     or p_prompt_version is null or btrim(p_prompt_version) = ''
     or p_envelope_jsonb is null
     or jsonb_typeof(p_envelope_jsonb) <> 'object'
     or p_envelope_jsonb ->> 'schemaVersion' is distinct from 'v1'
     or p_content_hash !~ '^sha256:v1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'character_production_generation_contract',
      message = 'Character production generation contract is invalid';
  end if;

  select t.thread_id, t.resolved_content_release_id,
         t.resolved_content_bundle_id, t.created_at
    into v_thread_id, v_release_id, v_bundle_id, v_turn_created_at
  from public.chat_turns t
  where t.id = p_turn_id
    and t.subject_id = p_subject_id;

  if not found
     or v_release_id is null
     or v_bundle_id is null
     or v_bundle_id is distinct from p_content_bundle_id then
    raise exception using
      errcode = '23514',
      constraint = 'character_production_turn_binding_conflict',
      message = 'Character production turn content binding is unavailable or mismatched';
  end if;

  if not exists (
    select 1
    from public.standard_reading_official_bindings o
    join public.standard_reading_reader_interpretations i
      on i.official_reading_id = o.reading_id
     and i.subject_id = o.subject_id
     and i.reader_character_id = p_character_id
    where o.reading_id = p_reading_id
      and o.subject_id = p_subject_id
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'character_production_reading_reader_conflict',
      message = 'Official Reading / Reader provenance does not match this Character turn';
  end if;

  select count(*), min(tc.id::text)::uuid
    into v_participant_count, v_thread_character_id
  from public.conversation_thread_characters tc
  where tc.thread_id = v_thread_id
    and tc.character_id = p_character_id
    and tc.content_bundle_id = v_bundle_id
    and tc.joined_at <= v_turn_created_at
    and (tc.left_at is null or tc.left_at >= v_turn_created_at);

  if v_participant_count <> 1 or v_thread_character_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'character_production_participant_conflict',
      message = 'Character production requires exactly one pinned thread participant';
  end if;

  insert into public.ai_execution_logs(
    id, subject_id, turn_id, turn_attempt_id,
    stage, provider, model, prompt_version,
    content_release_id, content_bundle_id, character_id,
    input_ref_jsonb, output_ref_jsonb,
    status, created_at
  ) values (
    p_generation_log_id, p_subject_id, p_turn_id, p_attempt_id,
    'renderer', p_provider, p_model, p_prompt_version,
    v_release_id, v_bundle_id, p_character_id,
    jsonb_build_object(
      'readingId', p_reading_id,
      'rendererVersion', p_renderer_version
    ),
    jsonb_build_object('generatedContentHash', p_content_hash),
    'success', clock_timestamp()
  );

  insert into public.ai_execution_groundings(
    ai_execution_log_id, grounding_id, subject_id, role, created_at
  )
  select
    p_generation_log_id, g.id, p_subject_id, 'context', clock_timestamp()
  from public.reading_groundings g
  where g.reading_id = p_reading_id
    and g.subject_id = p_subject_id
  order by g.id;

  select coalesce(
    jsonb_agg(to_jsonb(g.id::text) order by g.id::text),
    '[]'::jsonb
  )
    into v_grounding_refs
  from public.reading_groundings g
  where g.reading_id = p_reading_id
    and g.subject_id = p_subject_id;

  v_replayed := public.cmd_mark_chat_turn_generated_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_generation_log_id,
    p_renderer_version,
    v_thread_character_id,
    null,
    p_envelope_jsonb,
    'v1',
    p_content_hash,
    v_grounding_refs
  );

  return v_replayed;
end;
$$;

create or replace function public.cmd_character_production_validate_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_validation_log_id uuid,
  p_output_guard_version text,
  p_expected_content_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_release_id uuid;
  v_bundle_id uuid;
  v_generation_log_id uuid;
  v_generated_hash text;
  v_character_id text;
  v_replayed boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_output_guard_version is null or btrim(p_output_guard_version) = ''
     or p_expected_content_hash !~ '^sha256:v1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'character_production_guard_version_required',
      message = 'Character Output Guard version is required';
  end if;

  select t.resolved_content_release_id,
         t.resolved_content_bundle_id,
         a.generation_ai_execution_log_id,
         a.generated_content_hash,
         tc.character_id
    into v_release_id, v_bundle_id, v_generation_log_id,
         v_generated_hash, v_character_id
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.turn_id = t.id
   and a.subject_id = t.subject_id
   and a.id = p_attempt_id
  join public.conversation_thread_characters tc
    on tc.id = a.generated_thread_character_id
   and tc.thread_id = t.thread_id
   and tc.content_bundle_id = t.resolved_content_bundle_id
  where t.id = p_turn_id
    and t.subject_id = p_subject_id;

  if not found
     or v_generation_log_id is null
     or v_generated_hash is null
     or v_release_id is null
     or v_bundle_id is null
     or v_character_id is null
     or v_generated_hash is distinct from p_expected_content_hash then
    raise exception using
      errcode = '23514',
      constraint = 'character_production_validation_source_missing',
      message = 'Character production staged generation provenance is unavailable';
  end if;

  insert into public.ai_execution_logs(
    id, subject_id, turn_id, turn_attempt_id,
    stage, provider, model, prompt_version,
    content_release_id, content_bundle_id, character_id,
    input_ref_jsonb, output_ref_jsonb,
    status, created_at
  ) values (
    p_validation_log_id, p_subject_id, p_turn_id, p_attempt_id,
    'output_guard', 'myeongha_internal', p_output_guard_version, p_output_guard_version,
    v_release_id, v_bundle_id, v_character_id,
    jsonb_build_object(
      'generationAiExecutionLogId', v_generation_log_id,
      'generatedContentHash', v_generated_hash
    ),
    jsonb_build_object('generatedContentHash', v_generated_hash),
    'success', clock_timestamp()
  );

  insert into public.ai_execution_groundings(
    ai_execution_log_id, grounding_id, subject_id, role, created_at
  )
  select
    p_validation_log_id,
    g.grounding_id,
    p_subject_id,
    g.role,
    clock_timestamp()
  from public.ai_execution_groundings g
  where g.ai_execution_log_id = v_generation_log_id
    and g.subject_id = p_subject_id
  order by g.grounding_id;

  v_replayed := public.cmd_validate_chat_turn_attempt_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_validation_log_id,
    p_output_guard_version,
    jsonb_build_object(
      'passed', true,
      'generatedContentHash', v_generated_hash,
      'outputGuardVersion', p_output_guard_version
    ),
    true,
    null
  );

  return v_replayed;
end;
$$;

create or replace function public.cmd_character_production_commit_runtime_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_message_id uuid,
  p_outbox_event_id uuid,
  p_character_id text,
  p_provider text,
  p_model text,
  p_expected_content_hash text
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
declare
  v_log_provider text;
  v_log_model text;
  v_log_character_id text;
  v_generated_hash text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select l.provider, l.model, l.character_id, a.generated_content_hash
    into v_log_provider, v_log_model, v_log_character_id, v_generated_hash
  from public.chat_turn_attempts a
  join public.ai_execution_logs l
    on l.id = a.generation_ai_execution_log_id
   and l.turn_id = a.turn_id
   and l.turn_attempt_id = a.id
   and l.subject_id = a.subject_id
   and l.stage = 'renderer'
   and l.status = 'success'
  where a.id = p_attempt_id
    and a.turn_id = p_turn_id
    and a.subject_id = p_subject_id;

  if not found
     or v_log_character_id is distinct from p_character_id
     or v_log_provider is distinct from p_provider
     or v_log_model is distinct from p_model
     or p_expected_content_hash !~ '^sha256:v1:[0-9a-f]{64}$'
     or v_generated_hash is distinct from p_expected_content_hash then
    raise exception using
      errcode = '23514',
      constraint = 'character_production_commit_renderer_provenance_conflict',
      message = 'Character production commit does not match renderer provenance';
  end if;

  return query
  select *
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
  );
end;
$$;

-- Own the wrappers with the NOLOGIN least-privilege role.
grant myeongha_character_turn_owner to current_user;
grant create on schema public to myeongha_character_turn_owner;

alter function public.qry_character_production_committed_turn_runtime_v1(uuid, uuid)
  owner to myeongha_character_turn_owner;
alter function public.cmd_character_production_allocate_attempt_runtime_v1(uuid, uuid, uuid, text)
  owner to myeongha_character_turn_owner;
alter function public.cmd_character_production_context_ready_runtime_v1(uuid, uuid, uuid)
  owner to myeongha_character_turn_owner;
alter function public.cmd_character_production_fail_runtime_v1(uuid, uuid, uuid, text)
  owner to myeongha_character_turn_owner;
alter function public.cmd_character_production_stage_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, uuid, uuid, text, text, text, text, jsonb, text
) owner to myeongha_character_turn_owner;
alter function public.cmd_character_production_validate_runtime_v1(
  uuid, uuid, uuid, uuid, text, text
) owner to myeongha_character_turn_owner;
alter function public.cmd_character_production_commit_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text
) owner to myeongha_character_turn_owner;

revoke all on function public.qry_character_production_committed_turn_runtime_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cmd_character_production_allocate_attempt_runtime_v1(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.cmd_character_production_context_ready_runtime_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cmd_character_production_fail_runtime_v1(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.cmd_character_production_stage_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, uuid, uuid, text, text, text, text, jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function public.cmd_character_production_validate_runtime_v1(
  uuid, uuid, uuid, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.cmd_character_production_commit_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.qry_character_production_committed_turn_runtime_v1(uuid, uuid)
  to myeongha_api_executor;
grant execute on function public.cmd_character_production_allocate_attempt_runtime_v1(uuid, uuid, uuid, text)
  to myeongha_api_executor;
grant execute on function public.cmd_character_production_context_ready_runtime_v1(uuid, uuid, uuid)
  to myeongha_api_executor;
grant execute on function public.cmd_character_production_fail_runtime_v1(uuid, uuid, uuid, text)
  to myeongha_api_executor;
grant execute on function public.cmd_character_production_stage_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, uuid, uuid, text, text, text, text, jsonb, text
) to myeongha_api_executor;
grant execute on function public.cmd_character_production_validate_runtime_v1(
  uuid, uuid, uuid, uuid, text, text
) to myeongha_api_executor;
grant execute on function public.cmd_character_production_commit_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text
) to myeongha_api_executor;

revoke create on schema public from myeongha_character_turn_owner;
revoke myeongha_character_turn_owner from current_user;

DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.qry_character_production_committed_turn_runtime_v1(uuid,uuid)',
    'public.cmd_character_production_allocate_attempt_runtime_v1(uuid,uuid,uuid,text)',
    'public.cmd_character_production_context_ready_runtime_v1(uuid,uuid,uuid)',
    'public.cmd_character_production_fail_runtime_v1(uuid,uuid,uuid,text)',
    'public.cmd_character_production_stage_generated_runtime_v1(uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,jsonb,text)',
    'public.cmd_character_production_validate_runtime_v1(uuid,uuid,uuid,uuid,text,text)',
    'public.cmd_character_production_commit_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text)'
  ]
  LOOP
    IF NOT pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      v_signature,
      'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'myeongha_api_executor lacks Character production runtime EXECUTE: %',
        v_signature;
    END IF;
  END LOOP;

  IF pg_catalog.has_table_privilege(
       'myeongha_api_executor', 'public.chat_turns', 'UPDATE'
     )
     OR pg_catalog.has_table_privilege(
       'myeongha_api_executor', 'public.chat_turn_attempts', 'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'myeongha_api_executor', 'public.ai_execution_logs', 'INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'myeongha_api_executor', 'public.conversation_messages', 'INSERT'
     ) THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly has direct Character production DML';
  END IF;
END
$$;

comment on function public.cmd_character_production_stage_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, uuid, uuid, text, text, text, text, jsonb, text
) is
'Subject-bound Production Character renderer provenance + staged generation wrapper. Reuses the 0220 state machine and links only existing Reading grounding rows.';

comment on function public.cmd_character_production_commit_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text
) is
'Subject-bound Production Character commit wrapper. Relationship, World and Memory effects remain NULL until separate governed admission authorities exist.';
