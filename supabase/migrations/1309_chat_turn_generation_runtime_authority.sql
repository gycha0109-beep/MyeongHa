-- Production Character Chat generation / validation / no-effects commit authority.
--
-- This is the minimum production execution slice after the receive/attempt authority:
--
-- context_ready
--   -> renderer AI execution provenance + GENERATED
--   -> deterministic Output Guard provenance + VALIDATED
--   -> assistant message + outbox COMMITTED
--
-- Relationship / World / Memory effects are intentionally forced to NULL in the
-- runtime commit wrapper. SRC-22 and private disclosure authority remain outside
-- this slice.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'myeongha_chat_turn_execution_owner'
  ) THEN
    CREATE ROLE myeongha_chat_turn_execution_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

grant usage on schema public to myeongha_chat_turn_execution_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_chat_turn_execution_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_chat_turn_execution_owner;

grant select (id, status)
  on public.subjects to myeongha_chat_turn_execution_owner;

grant execute on function public.cmd_mark_chat_turn_generated_v1(
  uuid, uuid, uuid, uuid, text, uuid, text, jsonb, text, text, jsonb
) to myeongha_chat_turn_execution_owner;
grant execute on function public.cmd_validate_chat_turn_attempt_v1(
  uuid, uuid, uuid, uuid, text, jsonb, boolean, text
) to myeongha_chat_turn_execution_owner;
grant execute on function public.cmd_commit_chat_turn_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) to myeongha_chat_turn_execution_owner;

grant select (
  id,
  subject_id,
  status,
  next_sequence_no
) on public.conversation_threads to myeongha_chat_turn_execution_owner;
grant update (
  next_sequence_no,
  updated_at
) on public.conversation_threads to myeongha_chat_turn_execution_owner;

grant select (
  id,
  thread_id,
  subject_id,
  resolved_content_release_id,
  resolved_content_bundle_id,
  state,
  revision,
  created_at,
  committed_attempt_id,
  next_attempt_no
) on public.chat_turns to myeongha_chat_turn_execution_owner;
grant update (
  state,
  revision,
  error_code,
  updated_at,
  committed_attempt_id,
  committed_at
) on public.chat_turns to myeongha_chat_turn_execution_owner;

grant select (
  id,
  thread_id,
  character_id,
  content_bundle_id,
  role,
  joined_at,
  left_at
) on public.conversation_thread_characters to myeongha_chat_turn_execution_owner;

grant select (
  id,
  turn_id,
  subject_id,
  attempt_no,
  state,
  generation_ai_execution_log_id,
  validation_ai_execution_log_id,
  generated_thread_character_id,
  generated_character_content_bundle_id,
  generated_body_text,
  generated_message_payload_jsonb,
  generated_message_schema_version,
  generated_content_hash,
  grounding_refs_jsonb,
  validation_result_jsonb,
  committed_message_id
) on public.chat_turn_attempts to myeongha_chat_turn_execution_owner;
grant update (
  state,
  renderer_version,
  output_guard_version,
  generation_ai_execution_log_id,
  validation_ai_execution_log_id,
  generated_thread_character_id,
  generated_character_content_bundle_id,
  generated_body_text,
  generated_message_payload_jsonb,
  generated_message_schema_version,
  generated_content_hash,
  grounding_refs_jsonb,
  validation_result_jsonb,
  generated_at,
  validated_at,
  finished_at,
  error_code,
  committed_message_id
) on public.chat_turn_attempts to myeongha_chat_turn_execution_owner;

grant select (
  id,
  turn_id,
  subject_id,
  sender_type,
  sequence_no
) on public.conversation_messages to myeongha_chat_turn_execution_owner;
grant insert (
  id,
  thread_id,
  subject_id,
  turn_id,
  sequence_no,
  sender_type,
  thread_character_id,
  character_content_bundle_id,
  body_text,
  message_payload_jsonb,
  message_schema_version,
  content_hash,
  created_at
) on public.conversation_messages to myeongha_chat_turn_execution_owner;

grant select (
  id,
  subject_id,
  turn_id,
  turn_attempt_id,
  stage,
  provider,
  model,
  prompt_version,
  content_release_id,
  content_bundle_id,
  character_id,
  input_ref_jsonb,
  output_ref_jsonb,
  status
) on public.ai_execution_logs to myeongha_chat_turn_execution_owner;
grant insert (
  id,
  subject_id,
  turn_id,
  turn_attempt_id,
  stage,
  provider,
  model,
  prompt_version,
  content_release_id,
  content_bundle_id,
  character_id,
  input_ref_jsonb,
  output_ref_jsonb,
  status,
  created_at
) on public.ai_execution_logs to myeongha_chat_turn_execution_owner;

grant select (
  ai_execution_log_id,
  grounding_id,
  subject_id,
  role
) on public.ai_execution_groundings to myeongha_chat_turn_execution_owner;
grant insert (
  ai_execution_log_id,
  grounding_id,
  subject_id,
  role,
  created_at
) on public.ai_execution_groundings to myeongha_chat_turn_execution_owner;

grant insert (
  id,
  aggregate_type,
  aggregate_id,
  event_type,
  event_schema_version,
  dedupe_key,
  payload_jsonb,
  status,
  attempt_count,
  available_at,
  created_at
) on public.outbox_events to myeongha_chat_turn_execution_owner;

-- Subject-pinned RLS for the narrow execution owner.
drop policy if exists subjects_chat_turn_execution_select_v1
  on public.subjects;
create policy subjects_chat_turn_execution_select_v1
on public.subjects
for select
to myeongha_chat_turn_execution_owner
using (id = public.current_myeongha_subject_id());

drop policy if exists conversation_threads_chat_turn_execution_select_v1
  on public.conversation_threads;
create policy conversation_threads_chat_turn_execution_select_v1
on public.conversation_threads
for select
to myeongha_chat_turn_execution_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_threads_chat_turn_execution_update_v1
  on public.conversation_threads;
create policy conversation_threads_chat_turn_execution_update_v1
on public.conversation_threads
for update
to myeongha_chat_turn_execution_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists chat_turns_chat_turn_execution_select_v1
  on public.chat_turns;
create policy chat_turns_chat_turn_execution_select_v1
on public.chat_turns
for select
to myeongha_chat_turn_execution_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists chat_turns_chat_turn_execution_update_v1
  on public.chat_turns;
create policy chat_turns_chat_turn_execution_update_v1
on public.chat_turns
for update
to myeongha_chat_turn_execution_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_thread_characters_chat_turn_execution_select_v1
  on public.conversation_thread_characters;
create policy conversation_thread_characters_chat_turn_execution_select_v1
on public.conversation_thread_characters
for select
to myeongha_chat_turn_execution_owner
using (
  exists (
    select 1
    from public.conversation_threads ct
    where ct.id = conversation_thread_characters.thread_id
      and ct.subject_id = public.current_myeongha_subject_id()
  )
);

drop policy if exists chat_turn_attempts_chat_turn_execution_select_v1
  on public.chat_turn_attempts;
create policy chat_turn_attempts_chat_turn_execution_select_v1
on public.chat_turn_attempts
for select
to myeongha_chat_turn_execution_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists chat_turn_attempts_chat_turn_execution_update_v1
  on public.chat_turn_attempts;
create policy chat_turn_attempts_chat_turn_execution_update_v1
on public.chat_turn_attempts
for update
to myeongha_chat_turn_execution_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_messages_chat_turn_execution_select_v1
  on public.conversation_messages;
create policy conversation_messages_chat_turn_execution_select_v1
on public.conversation_messages
for select
to myeongha_chat_turn_execution_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_messages_chat_turn_execution_insert_v1
  on public.conversation_messages;
create policy conversation_messages_chat_turn_execution_insert_v1
on public.conversation_messages
for insert
to myeongha_chat_turn_execution_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and exists (
    select 1
    from public.chat_turns t
    where t.id = conversation_messages.turn_id
      and t.thread_id = conversation_messages.thread_id
      and t.subject_id = public.current_myeongha_subject_id()
  )
);

-- outbox_events already has RLS enabled by the account-deletion authority track.
-- Add only this narrow Chat insert policy; do not alter the table's global RLS state.
drop policy if exists outbox_events_chat_turn_execution_insert_v1
  on public.outbox_events;
create policy outbox_events_chat_turn_execution_insert_v1
on public.outbox_events
for insert
to myeongha_chat_turn_execution_owner
with check (
  aggregate_type = 'chat_turn'
  and exists (
    select 1
    from public.chat_turns t
    where t.id::text = outbox_events.aggregate_id
      and t.subject_id = public.current_myeongha_subject_id()
  )
);

create or replace function public.cmd_stage_chat_turn_generated_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_generation_ai_execution_log_id uuid,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_renderer_version text,
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
  v_release_id uuid;
  v_bundle_id uuid;
  v_thread_character_id uuid;
  v_character_id text;
  v_primary_count bigint;
  v_existing_count bigint;
  v_expected_grounding_count bigint;
  v_actual_grounding_count bigint;
  v_unexpected_grounding_count bigint;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_generation_ai_execution_log_id is null
     or p_provider is null or btrim(p_provider) = ''
     or p_model is null or btrim(p_model) = ''
     or p_prompt_version is null or btrim(p_prompt_version) = ''
     or p_renderer_version is null or btrim(p_renderer_version) = ''
     or p_content_hash is null or btrim(p_content_hash) = ''
     or p_grounding_refs_jsonb is null
     or jsonb_typeof(p_grounding_refs_jsonb) <> 'array' then
    raise exception using
      errcode = '23514',
      constraint = 'chat_turn_generation_runtime_input_required',
      message = 'renderer execution provenance is incomplete';
  end if;

  select t.thread_id, t.resolved_content_release_id, t.resolved_content_bundle_id
  into v_thread_id, v_release_id, v_bundle_id
  from public.chat_turns t
  where t.id = p_turn_id
    and t.subject_id = p_subject_id;

  if not found or v_release_id is null or v_bundle_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'chat_turn_generation_runtime_turn_unavailable',
      message = 'Chat turn authority is unavailable';
  end if;

  select count(*)
  into v_primary_count
  from public.conversation_thread_characters ctc
  where ctc.thread_id = v_thread_id
    and ctc.content_bundle_id = v_bundle_id
    and ctc.role = 'primary'
    and ctc.left_at is null;

  if v_primary_count <> 1 then
    raise exception using
      errcode = '23514',
      constraint = 'chat_turn_generation_runtime_primary_participant',
      message = 'Chat generation requires exactly one active primary Character';
  end if;

  select ctc.id, ctc.character_id
  into strict v_thread_character_id, v_character_id
  from public.conversation_thread_characters ctc
  where ctc.thread_id = v_thread_id
    and ctc.content_bundle_id = v_bundle_id
    and ctc.role = 'primary'
    and ctc.left_at is null;

  insert into public.ai_execution_logs(
    id,
    subject_id,
    turn_id,
    turn_attempt_id,
    stage,
    provider,
    model,
    prompt_version,
    content_release_id,
    content_bundle_id,
    character_id,
    input_ref_jsonb,
    output_ref_jsonb,
    status,
    created_at
  ) values (
    p_generation_ai_execution_log_id,
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    'renderer',
    p_provider,
    p_model,
    p_prompt_version,
    v_release_id,
    v_bundle_id,
    v_character_id,
    jsonb_build_object('turnId', p_turn_id, 'attemptId', p_attempt_id),
    jsonb_build_object('generatedContentHash', p_content_hash),
    'success',
    v_now
  )
  on conflict (id) do nothing;

  select count(*)
  into v_existing_count
  from public.ai_execution_logs l
  where l.id = p_generation_ai_execution_log_id
    and l.subject_id = p_subject_id
    and l.turn_id = p_turn_id
    and l.turn_attempt_id = p_attempt_id
    and l.stage = 'renderer'
    and l.provider = p_provider
    and l.model = p_model
    and l.prompt_version = p_prompt_version
    and l.content_release_id is not distinct from v_release_id
    and l.content_bundle_id is not distinct from v_bundle_id
    and l.character_id is not distinct from v_character_id
    and l.output_ref_jsonb ->> 'generatedContentHash' is not distinct from p_content_hash
    and l.status = 'success';

  if v_existing_count <> 1 then
    raise exception using
      errcode = '23505',
      constraint = 'chat_turn_generation_runtime_log_conflict',
      message = 'renderer execution log identity conflicts with existing provenance';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_grounding_refs_jsonb) r(value)
    where value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'chat_turn_generation_runtime_grounding_ref_invalid',
      message = 'renderer grounding refs must be UUIDs';
  end if;

  insert into public.ai_execution_groundings(
    ai_execution_log_id,
    grounding_id,
    subject_id,
    role,
    created_at
  )
  select
    p_generation_ai_execution_log_id,
    r.value::uuid,
    p_subject_id,
    'primary',
    v_now
  from jsonb_array_elements_text(p_grounding_refs_jsonb) r(value)
  on conflict (ai_execution_log_id, grounding_id) do nothing;

  select count(*)
  into v_expected_grounding_count
  from jsonb_array_elements_text(p_grounding_refs_jsonb);

  select count(*)
  into v_actual_grounding_count
  from public.ai_execution_groundings g
  where g.ai_execution_log_id = p_generation_ai_execution_log_id
    and g.subject_id = p_subject_id
    and exists (
      select 1
      from jsonb_array_elements_text(p_grounding_refs_jsonb) r(value)
      where r.value::uuid = g.grounding_id
    );

  select count(*)
  into v_unexpected_grounding_count
  from public.ai_execution_groundings g
  where g.ai_execution_log_id = p_generation_ai_execution_log_id
    and g.subject_id = p_subject_id
    and not exists (
      select 1
      from jsonb_array_elements_text(p_grounding_refs_jsonb) r(value)
      where r.value::uuid = g.grounding_id
    );

  if v_actual_grounding_count <> v_expected_grounding_count
     or v_unexpected_grounding_count <> 0 then
    raise exception using
      errcode = '23505',
      constraint = 'chat_turn_generation_runtime_grounding_conflict',
      message = 'renderer execution grounding set conflicts with existing provenance';
  end if;

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
end;
$$;

create or replace function public.cmd_validate_chat_turn_generated_runtime_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_validation_ai_execution_log_id uuid,
  p_output_guard_version text,
  p_validation_result_jsonb jsonb,
  p_passed boolean,
  p_failure_state text
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
  v_thread_character_id uuid;
  v_character_id text;
  v_generated_hash text;
  v_existing_count bigint;
  v_status text;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_validation_ai_execution_log_id is null
     or p_output_guard_version is null or btrim(p_output_guard_version) = ''
     or p_validation_result_jsonb is null then
    raise exception using
      errcode = '23514',
      constraint = 'chat_turn_validation_runtime_input_required',
      message = 'Output Guard provenance is incomplete';
  end if;

  select
    t.resolved_content_release_id,
    t.resolved_content_bundle_id,
    a.generation_ai_execution_log_id,
    a.generated_thread_character_id,
    a.generated_content_hash
  into
    v_release_id,
    v_bundle_id,
    v_generation_log_id,
    v_thread_character_id,
    v_generated_hash
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.turn_id = t.id
   and a.subject_id = t.subject_id
  where t.id = p_turn_id
    and t.subject_id = p_subject_id
    and a.id = p_attempt_id;

  if not found
     or v_release_id is null
     or v_bundle_id is null
     or v_generation_log_id is null
     or v_thread_character_id is null
     or v_generated_hash is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'chat_turn_validation_runtime_generation_unavailable',
      message = 'staged Chat generation authority is unavailable';
  end if;

  select ctc.character_id
  into v_character_id
  from public.conversation_thread_characters ctc
  where ctc.id = v_thread_character_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'chat_turn_validation_runtime_character_unavailable',
      message = 'staged Character participation is unavailable';
  end if;

  v_status := case when p_passed then 'success' else 'blocked' end;

  insert into public.ai_execution_logs(
    id,
    subject_id,
    turn_id,
    turn_attempt_id,
    stage,
    provider,
    model,
    prompt_version,
    content_release_id,
    content_bundle_id,
    character_id,
    input_ref_jsonb,
    output_ref_jsonb,
    status,
    created_at
  ) values (
    p_validation_ai_execution_log_id,
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    'output_guard',
    'myeongha-server',
    'deterministic-output-guard-v1',
    p_output_guard_version,
    v_release_id,
    v_bundle_id,
    v_character_id,
    jsonb_build_object('turnId', p_turn_id, 'attemptId', p_attempt_id),
    jsonb_build_object('generatedContentHash', v_generated_hash),
    v_status,
    v_now
  )
  on conflict (id) do nothing;

  select count(*)
  into v_existing_count
  from public.ai_execution_logs l
  where l.id = p_validation_ai_execution_log_id
    and l.subject_id = p_subject_id
    and l.turn_id = p_turn_id
    and l.turn_attempt_id = p_attempt_id
    and l.stage = 'output_guard'
    and l.provider = 'myeongha-server'
    and l.model = 'deterministic-output-guard-v1'
    and l.prompt_version = p_output_guard_version
    and l.content_release_id is not distinct from v_release_id
    and l.content_bundle_id is not distinct from v_bundle_id
    and l.character_id is not distinct from v_character_id
    and l.output_ref_jsonb ->> 'generatedContentHash' is not distinct from v_generated_hash
    and l.status = v_status;

  if v_existing_count <> 1 then
    raise exception using
      errcode = '23505',
      constraint = 'chat_turn_validation_runtime_log_conflict',
      message = 'Output Guard execution log identity conflicts with existing provenance';
  end if;

  insert into public.ai_execution_groundings(
    ai_execution_log_id,
    grounding_id,
    subject_id,
    role,
    created_at
  )
  select
    p_validation_ai_execution_log_id,
    g.grounding_id,
    p_subject_id,
    'context',
    v_now
  from public.ai_execution_groundings g
  where g.ai_execution_log_id = v_generation_log_id
    and g.subject_id = p_subject_id
  on conflict (ai_execution_log_id, grounding_id) do nothing;

  return public.cmd_validate_chat_turn_attempt_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_validation_ai_execution_log_id,
    p_output_guard_version,
    p_validation_result_jsonb,
    p_passed,
    p_failure_state
  );
end;
$$;

create or replace function public.cmd_commit_chat_turn_no_effects_runtime_v1(
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

grant myeongha_chat_turn_execution_owner to current_user;
grant create on schema public to myeongha_chat_turn_execution_owner;

alter function public.cmd_stage_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, text, text, jsonb
) owner to myeongha_chat_turn_execution_owner;
alter function public.cmd_validate_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, jsonb, boolean, text
) owner to myeongha_chat_turn_execution_owner;
alter function public.cmd_commit_chat_turn_no_effects_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid
) owner to myeongha_chat_turn_execution_owner;

revoke all on function public.cmd_stage_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, text, text, jsonb
) from public;
revoke all on function public.cmd_validate_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, jsonb, boolean, text
) from public;
revoke all on function public.cmd_commit_chat_turn_no_effects_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid
) from public;

DO $$
DECLARE
  v_role text;
  v_signature text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    FOREACH v_signature IN ARRAY ARRAY[
      'public.cmd_stage_chat_turn_generated_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,text,text,jsonb)',
      'public.cmd_validate_chat_turn_generated_runtime_v1(uuid,uuid,uuid,uuid,text,jsonb,boolean,text)',
      'public.cmd_commit_chat_turn_no_effects_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)'
    ]
    LOOP
      EXECUTE pg_catalog.format(
        'revoke all on function %s from %I',
        v_signature,
        v_role
      );
    END LOOP;
  END LOOP;
END
$$;

grant execute on function public.cmd_stage_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, text, text, jsonb
) to myeongha_api_executor;
grant execute on function public.cmd_validate_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, jsonb, boolean, text
) to myeongha_api_executor;
grant execute on function public.cmd_commit_chat_turn_no_effects_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid
) to myeongha_api_executor;

-- Legacy generated/validate/commit primitives remain unavailable to the API role.
revoke all on function public.cmd_mark_chat_turn_generated_v1(
  uuid, uuid, uuid, uuid, text, uuid, text, jsonb, text, text, jsonb
) from myeongha_api_executor;
revoke all on function public.cmd_validate_chat_turn_attempt_v1(
  uuid, uuid, uuid, uuid, text, jsonb, boolean, text
) from myeongha_api_executor;
revoke all on function public.cmd_commit_chat_turn_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) from myeongha_api_executor;

revoke insert, update, delete on public.ai_execution_logs from myeongha_api_executor;
revoke insert, update, delete on public.ai_execution_groundings from myeongha_api_executor;
revoke insert, update, delete on public.outbox_events from myeongha_api_executor;

revoke create on schema public from myeongha_chat_turn_execution_owner;
revoke myeongha_chat_turn_execution_owner from current_user;

comment on function public.cmd_stage_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb, text, text, jsonb
) is
'Production subject-bound renderer provenance + GENERATED transition. Resolves the exact active primary participant server-side.';
comment on function public.cmd_validate_chat_turn_generated_runtime_v1(
  uuid, uuid, uuid, uuid, text, jsonb, boolean, text
) is
'Production deterministic Output Guard provenance + VALIDATED/failure transition. Reuses the exact generation grounding set.';
comment on function public.cmd_commit_chat_turn_no_effects_runtime_v1(
  uuid, uuid, uuid, uuid, uuid, uuid
) is
'Production Chat commit baseline with relationship/world/memory effects forced to NULL.';
