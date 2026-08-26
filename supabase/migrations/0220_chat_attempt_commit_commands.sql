-- MyeongHa chat attempt/generate/validate/commit persistence authority.
--
-- This keeps the 59-table catalog intact. Generated assistant output is staged on
-- chat_turn_attempts and does not enter conversation_messages until a validated
-- attempt is atomically committed with its approved side effects and outbox event.
--
-- P0-AUTH-01 remains unresolved. All command functions are SECURITY INVOKER and
-- PUBLIC EXECUTE is revoked. No production API database execution identity is chosen.

alter table public.chat_turn_attempts
  add column generation_ai_execution_log_id uuid null,
  add column validation_ai_execution_log_id uuid null,
  add column generated_thread_character_id uuid null,
  add column generated_character_content_bundle_id uuid null,
  add column generated_body_text text null,
  add column generated_message_payload_jsonb jsonb null,
  add column generated_message_schema_version text null,
  add column generated_content_hash text null,
  add column grounding_refs_jsonb jsonb null,
  add column validation_result_jsonb jsonb null,
  add column generated_at timestamptz null,
  add column validated_at timestamptz null,
  add column committed_message_id uuid null;

alter table public.ai_execution_logs
  add constraint ai_execution_logs_attempt_target_unique
  unique (id, turn_attempt_id, turn_id, subject_id);

alter table public.chat_turn_attempts
  add constraint chat_turn_attempts_generation_ai_execution_fk
    foreign key (generation_ai_execution_log_id, id, turn_id, subject_id)
    references public.ai_execution_logs(id, turn_attempt_id, turn_id, subject_id),
  add constraint chat_turn_attempts_validation_ai_execution_fk
    foreign key (validation_ai_execution_log_id, id, turn_id, subject_id)
    references public.ai_execution_logs(id, turn_attempt_id, turn_id, subject_id),
  add constraint chat_turn_attempts_generated_turn_bundle_fk
    foreign key (turn_id, generated_character_content_bundle_id)
    references public.chat_turns(id, resolved_content_bundle_id),
  add constraint chat_turn_attempts_committed_message_fk
    foreign key (committed_message_id, turn_id, subject_id)
    references public.conversation_messages(id, turn_id, subject_id)
    deferrable initially immediate,
  add constraint chat_turn_attempts_generated_shape_check
    check (
      state not in ('generated', 'validated', 'committed')
      or (
        generation_ai_execution_log_id is not null
        and generated_thread_character_id is not null
        and generated_character_content_bundle_id is not null
        and (generated_body_text is not null or generated_message_payload_jsonb is not null)
        and generated_content_hash is not null
        and grounding_refs_jsonb is not null
        and jsonb_typeof(grounding_refs_jsonb) = 'array'
        and generated_at is not null
      )
    ),
  add constraint chat_turn_attempts_validated_shape_check
    check (
      state not in ('validated', 'committed')
      or (
        validation_ai_execution_log_id is not null
        and validation_result_jsonb is not null
        and validated_at is not null
      )
    ),
  add constraint chat_turn_attempts_committed_message_check
    check (state <> 'committed' or committed_message_id is not null);

create or replace function public.tr_chat_turn_attempt_progression_guard()
returns trigger
language plpgsql
as $$
begin
  if row(old.turn_id, old.subject_id, old.attempt_no, old.started_at)
     is distinct from
     row(new.turn_id, new.subject_id, new.attempt_no, new.started_at) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_identity_immutable',
      message = 'chat turn attempt identity is immutable';
  end if;

  if old.state in ('failed_retryable', 'failed_final', 'committed')
     and row(old.*) is distinct from row(new.*) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_terminal_immutable',
      message = 'terminal chat turn attempt is immutable';
  end if;

  if old.state is distinct from new.state then
    if not (
      (old.state = 'running' and new.state in ('generated', 'failed_retryable', 'failed_final'))
      or (old.state = 'generated' and new.state in ('validated', 'failed_retryable', 'failed_final'))
      or (old.state = 'validated' and new.state in ('committed', 'failed_retryable', 'failed_final'))
    ) then
      raise exception using
        errcode = '23514',
        constraint = 'tr_chat_turn_attempt_state_transition',
        message = 'chat turn attempt state transition is not allowed';
    end if;
  end if;

  if old.generated_at is not null
     and row(
       old.generation_ai_execution_log_id,
       old.generated_thread_character_id,
       old.generated_character_content_bundle_id,
       old.generated_body_text,
       old.generated_message_payload_jsonb,
       old.generated_message_schema_version,
       old.generated_content_hash,
       old.grounding_refs_jsonb,
       old.generated_at
     ) is distinct from row(
       new.generation_ai_execution_log_id,
       new.generated_thread_character_id,
       new.generated_character_content_bundle_id,
       new.generated_body_text,
       new.generated_message_payload_jsonb,
       new.generated_message_schema_version,
       new.generated_content_hash,
       new.grounding_refs_jsonb,
       new.generated_at
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_generated_payload_immutable',
      message = 'generated chat attempt payload is immutable once staged';
  end if;

  if old.validated_at is not null
     and row(
       old.validation_ai_execution_log_id,
       old.validation_result_jsonb,
       old.validated_at
     ) is distinct from row(
       new.validation_ai_execution_log_id,
       new.validation_result_jsonb,
       new.validated_at
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_validation_immutable',
      message = 'chat attempt validation provenance is immutable once staged';
  end if;

  if old.planner_version is not null and old.planner_version is distinct from new.planner_version then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_planner_version_immutable',
      message = 'planner version is immutable once recorded';
  end if;

  if old.renderer_version is not null and old.renderer_version is distinct from new.renderer_version then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_renderer_version_immutable',
      message = 'renderer version is immutable once recorded';
  end if;

  if old.output_guard_version is not null and old.output_guard_version is distinct from new.output_guard_version then
    raise exception using
      errcode = '23514',
      constraint = 'tr_chat_turn_attempt_guard_version_immutable',
      message = 'output guard version is immutable once recorded';
  end if;

  return new;
end;
$$;

create trigger tr_chat_turn_attempt_progression_guard
  before update on public.chat_turn_attempts
  for each row execute function public.tr_chat_turn_attempt_progression_guard();

create or replace function public.cmd_allocate_chat_turn_attempt_v1(
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
security invoker
set search_path = public, pg_temp
as $$
declare
  v_turn_state text;
  v_next_attempt_no integer;
  v_existing_attempt_id uuid;
  v_existing_attempt_no integer;
  v_now timestamptz := clock_timestamp();
begin
  select state, next_attempt_no
    into v_turn_state, v_next_attempt_no
  from public.chat_turns
  where id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_attempt_turn_not_found',
      message = 'chat turn was not found for this subject';
  end if;

  if v_turn_state in ('committed', 'delivered', 'failed_final', 'abandoned') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_attempt_turn_terminal',
      message = 'terminal chat turn cannot allocate another attempt';
  end if;

  select a.id, a.attempt_no
    into v_existing_attempt_id, v_existing_attempt_no
  from public.chat_turn_attempts a
  where a.turn_id = p_turn_id
    and a.subject_id = p_subject_id
    and a.state in ('running', 'generated', 'validated')
  order by a.attempt_no desc
  limit 1;

  if v_existing_attempt_id is not null then
    return query select v_existing_attempt_id, v_existing_attempt_no, true;
    return;
  end if;

  if v_turn_state not in ('received', 'failed_retryable') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_attempt_turn_not_retryable',
      message = 'chat turn state is not eligible for attempt allocation';
  end if;

  insert into public.chat_turn_attempts(
    id, turn_id, subject_id, attempt_no, state, planner_version, started_at
  ) values (
    p_attempt_id, p_turn_id, p_subject_id, v_next_attempt_no, 'running', p_planner_version, v_now
  );

  update public.chat_turns
  set next_attempt_no = v_next_attempt_no + 1,
      state = 'planned',
      revision = revision + 1,
      error_code = null,
      updated_at = v_now
  where id = p_turn_id and subject_id = p_subject_id;

  return query select p_attempt_id, v_next_attempt_no, false;
end;
$$;

create or replace function public.cmd_mark_chat_turn_context_ready_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_turn_state text;
  v_attempt_state text;
  v_attempt_no integer;
  v_next_attempt_no integer;
  v_now timestamptz := clock_timestamp();
begin
  select state, next_attempt_no
    into v_turn_state, v_next_attempt_no
  from public.chat_turns
  where id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_context_turn_not_found',
      message = 'chat turn was not found for this subject';
  end if;

  select state, attempt_no
    into v_attempt_state, v_attempt_no
  from public.chat_turn_attempts
  where id = p_attempt_id and turn_id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_context_attempt_not_found',
      message = 'chat attempt was not found for this turn';
  end if;

  if v_turn_state = 'context_ready' and v_attempt_state = 'running' then
    return true;
  end if;

  if v_turn_state <> 'planned' or v_attempt_state <> 'running'
     or v_attempt_no <> v_next_attempt_no - 1 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_context_state_conflict',
      message = 'chat turn/attempt is not eligible for context-ready transition';
  end if;

  update public.chat_turns
  set state = 'context_ready',
      revision = revision + 1,
      updated_at = v_now
  where id = p_turn_id and subject_id = p_subject_id;

  return false;
end;
$$;

create or replace function public.cmd_mark_chat_turn_failed_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_failure_state text,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_turn_state text;
  v_attempt_state text;
  v_attempt_error text;
  v_attempt_no integer;
  v_next_attempt_no integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_failure_state not in ('failed_retryable', 'failed_final') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_fail_state_invalid',
      message = 'chat attempt failure state must be failed_retryable or failed_final';
  end if;

  select state, next_attempt_no
    into v_turn_state, v_next_attempt_no
  from public.chat_turns
  where id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_fail_turn_not_found',
      message = 'chat turn was not found for this subject';
  end if;

  select state, error_code, attempt_no
    into v_attempt_state, v_attempt_error, v_attempt_no
  from public.chat_turn_attempts
  where id = p_attempt_id and turn_id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_fail_attempt_not_found',
      message = 'chat attempt was not found for this turn';
  end if;

  if v_attempt_state = p_failure_state and v_attempt_error is not distinct from p_error_code then
    return true;
  end if;

  if v_turn_state in ('committed', 'delivered', 'failed_final', 'abandoned')
     or v_attempt_state in ('failed_retryable', 'failed_final', 'committed')
     or v_attempt_no <> v_next_attempt_no - 1 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_fail_state_conflict',
      message = 'chat turn/attempt is not eligible for failure finalization';
  end if;

  update public.chat_turn_attempts
  set state = p_failure_state,
      finished_at = v_now,
      error_code = p_error_code
  where id = p_attempt_id;

  update public.chat_turns
  set state = p_failure_state,
      revision = revision + 1,
      error_code = p_error_code,
      updated_at = v_now
  where id = p_turn_id;

  return false;
end;
$$;

create or replace function public.cmd_mark_chat_turn_generated_v1(
  p_subject_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_generation_ai_execution_log_id uuid,
  p_renderer_version text,
  p_thread_character_id uuid,
  p_body_text text,
  p_message_payload_jsonb jsonb,
  p_message_schema_version text,
  p_content_hash text,
  p_grounding_refs_jsonb jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_turn_state text;
  v_turn_thread_id uuid;
  v_turn_release_id uuid;
  v_turn_bundle_id uuid;
  v_turn_created_at timestamptz;
  v_next_attempt_no integer;
  v_attempt_state text;
  v_attempt_no integer;
  v_existing_generation_log_id uuid;
  v_existing_character_id uuid;
  v_existing_body text;
  v_existing_payload jsonb;
  v_existing_schema text;
  v_existing_hash text;
  v_existing_groundings jsonb;
  v_participant_thread_id uuid;
  v_participant_character_id text;
  v_participant_bundle_id uuid;
  v_participant_joined_at timestamptz;
  v_participant_left_at timestamptz;
  v_log_character_id text;
  v_expected_grounding_count integer;
  v_linked_grounding_count integer;
  v_distinct_grounding_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_body_text is null and p_message_payload_jsonb is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_generate_content_required',
      message = 'generated assistant content is required';
  end if;

  if p_grounding_refs_jsonb is null or jsonb_typeof(p_grounding_refs_jsonb) <> 'array' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_generate_grounding_array_required',
      message = 'grounding refs must be an explicit JSON array';
  end if;

  select state, thread_id, resolved_content_release_id, resolved_content_bundle_id,
         created_at, next_attempt_no
    into v_turn_state, v_turn_thread_id, v_turn_release_id, v_turn_bundle_id,
         v_turn_created_at, v_next_attempt_no
  from public.chat_turns
  where id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_generate_turn_not_found',
      message = 'chat turn was not found for this subject';
  end if;

  select state, attempt_no, generation_ai_execution_log_id,
         generated_thread_character_id, generated_body_text,
         generated_message_payload_jsonb, generated_message_schema_version,
         generated_content_hash, grounding_refs_jsonb
    into v_attempt_state, v_attempt_no, v_existing_generation_log_id,
         v_existing_character_id, v_existing_body, v_existing_payload,
         v_existing_schema, v_existing_hash, v_existing_groundings
  from public.chat_turn_attempts
  where id = p_attempt_id and turn_id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_generate_attempt_not_found',
      message = 'chat attempt was not found for this turn';
  end if;

  if v_attempt_state in ('generated', 'validated', 'committed') then
    if v_existing_generation_log_id is not distinct from p_generation_ai_execution_log_id
       and v_existing_character_id is not distinct from p_thread_character_id
       and v_existing_body is not distinct from p_body_text
       and v_existing_payload is not distinct from p_message_payload_jsonb
       and v_existing_schema is not distinct from p_message_schema_version
       and v_existing_hash is not distinct from p_content_hash
       and v_existing_groundings is not distinct from p_grounding_refs_jsonb then
      return true;
    end if;

    raise exception using
      errcode = '23505',
      constraint = 'cmd_chat_generate_replay_conflict',
      message = 'generated attempt already exists with different staged output';
  end if;

  if v_turn_state <> 'context_ready' or v_attempt_state <> 'running'
     or v_attempt_no <> v_next_attempt_no - 1 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_generate_state_conflict',
      message = 'chat turn/attempt is not eligible for generated persistence';
  end if;

  select thread_id, character_id, content_bundle_id, joined_at, left_at
    into v_participant_thread_id, v_participant_character_id, v_participant_bundle_id,
         v_participant_joined_at, v_participant_left_at
  from public.conversation_thread_characters
  where id = p_thread_character_id;

  if v_participant_thread_id is distinct from v_turn_thread_id
     or v_participant_bundle_id is distinct from v_turn_bundle_id
     or v_participant_joined_at > v_turn_created_at
     or (v_participant_left_at is not null and v_participant_left_at < v_turn_created_at) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_generate_participation_conflict',
      message = 'generated assistant participant does not match turn authority';
  end if;

  select character_id into v_log_character_id
  from public.ai_execution_logs
  where id = p_generation_ai_execution_log_id
    and subject_id = p_subject_id
    and turn_id = p_turn_id
    and turn_attempt_id = p_attempt_id
    and stage = 'renderer'
    and status = 'success'
    and content_release_id is not distinct from v_turn_release_id
    and content_bundle_id is not distinct from v_turn_bundle_id;

  if not found or v_log_character_id is distinct from v_participant_character_id then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_generate_ai_provenance_conflict',
      message = 'renderer AI execution does not match this turn/attempt/character authority';
  end if;

  select count(*), count(distinct value)
    into v_expected_grounding_count, v_distinct_grounding_count
  from jsonb_array_elements_text(p_grounding_refs_jsonb);

  if v_expected_grounding_count <> v_distinct_grounding_count then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_generate_grounding_duplicate',
      message = 'grounding refs must not contain duplicates';
  end if;

  select count(*) into v_linked_grounding_count
  from jsonb_array_elements_text(p_grounding_refs_jsonb) r(value)
  join public.ai_execution_groundings g
    on g.ai_execution_log_id = p_generation_ai_execution_log_id
   and g.grounding_id = r.value::uuid
   and g.subject_id = p_subject_id;

  if v_linked_grounding_count <> v_expected_grounding_count then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_generate_grounding_provenance_conflict',
      message = 'every staged grounding ref must be linked to the exact renderer execution';
  end if;

  update public.chat_turn_attempts
  set state = 'generated',
      renderer_version = p_renderer_version,
      generation_ai_execution_log_id = p_generation_ai_execution_log_id,
      generated_thread_character_id = p_thread_character_id,
      generated_character_content_bundle_id = v_turn_bundle_id,
      generated_body_text = p_body_text,
      generated_message_payload_jsonb = p_message_payload_jsonb,
      generated_message_schema_version = p_message_schema_version,
      generated_content_hash = p_content_hash,
      grounding_refs_jsonb = p_grounding_refs_jsonb,
      generated_at = v_now,
      finished_at = v_now
  where id = p_attempt_id;

  update public.chat_turns
  set state = 'generated',
      revision = revision + 1,
      updated_at = v_now
  where id = p_turn_id;

  return false;
end;
$$;

create or replace function public.cmd_validate_chat_turn_attempt_v1(
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
security invoker
set search_path = public, pg_temp
as $$
declare
  v_turn_state text;
  v_turn_release_id uuid;
  v_turn_bundle_id uuid;
  v_next_attempt_no integer;
  v_attempt_state text;
  v_attempt_no integer;
  v_generated_hash text;
  v_grounding_refs jsonb;
  v_existing_validation_log_id uuid;
  v_existing_validation_result jsonb;
  v_log_status text;
  v_log_output_ref jsonb;
  v_expected_grounding_count integer;
  v_guard_grounding_count integer;
  v_unexpected_grounding_count integer;
  v_target_state text;
  v_error_code text;
  v_now timestamptz := clock_timestamp();
begin
  if p_validation_result_jsonb is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_validate_result_required',
      message = 'validation result snapshot is required';
  end if;

  if not p_passed and p_failure_state not in ('failed_retryable', 'failed_final') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_validate_failure_state_invalid',
      message = 'failed validation requires failed_retryable or failed_final state';
  end if;

  select state, resolved_content_release_id, resolved_content_bundle_id, next_attempt_no
    into v_turn_state, v_turn_release_id, v_turn_bundle_id, v_next_attempt_no
  from public.chat_turns
  where id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_validate_turn_not_found',
      message = 'chat turn was not found for this subject';
  end if;

  select state, attempt_no, generated_content_hash, grounding_refs_jsonb,
         validation_ai_execution_log_id, validation_result_jsonb
    into v_attempt_state, v_attempt_no, v_generated_hash, v_grounding_refs,
         v_existing_validation_log_id, v_existing_validation_result
  from public.chat_turn_attempts
  where id = p_attempt_id and turn_id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_validate_attempt_not_found',
      message = 'chat attempt was not found for this turn';
  end if;

  v_target_state := case when p_passed then 'validated' else p_failure_state end;

  if v_attempt_state = v_target_state
     and v_existing_validation_log_id is not distinct from p_validation_ai_execution_log_id
     and v_existing_validation_result is not distinct from p_validation_result_jsonb then
    return true;
  end if;

  if v_turn_state <> 'generated' or v_attempt_state <> 'generated'
     or v_attempt_no <> v_next_attempt_no - 1 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_validate_state_conflict',
      message = 'chat turn/attempt is not eligible for validation persistence';
  end if;

  select status, output_ref_jsonb
    into v_log_status, v_log_output_ref
  from public.ai_execution_logs
  where id = p_validation_ai_execution_log_id
    and subject_id = p_subject_id
    and turn_id = p_turn_id
    and turn_attempt_id = p_attempt_id
    and stage = 'output_guard'
    and content_release_id is not distinct from v_turn_release_id
    and content_bundle_id is not distinct from v_turn_bundle_id;

  if not found
     or (p_passed and v_log_status <> 'success')
     or (not p_passed and v_log_status not in ('failed', 'blocked'))
     or v_log_output_ref ->> 'generatedContentHash' is distinct from v_generated_hash then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_validate_ai_provenance_conflict',
      message = 'output guard execution does not validate the exact staged generation';
  end if;

  select count(*) into v_expected_grounding_count
  from jsonb_array_elements_text(v_grounding_refs);

  select count(*) into v_guard_grounding_count
  from public.ai_execution_groundings g
  where g.ai_execution_log_id = p_validation_ai_execution_log_id
    and g.subject_id = p_subject_id
    and exists (
      select 1
      from jsonb_array_elements_text(v_grounding_refs) r(value)
      where r.value::uuid = g.grounding_id
    );

  select count(*) into v_unexpected_grounding_count
  from public.ai_execution_groundings g
  where g.ai_execution_log_id = p_validation_ai_execution_log_id
    and g.subject_id = p_subject_id
    and not exists (
      select 1
      from jsonb_array_elements_text(v_grounding_refs) r(value)
      where r.value::uuid = g.grounding_id
    );

  if v_guard_grounding_count <> v_expected_grounding_count
     or v_unexpected_grounding_count <> 0 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_validate_grounding_set_conflict',
      message = 'output guard grounding set must exactly match the staged generation grounding set';
  end if;

  v_error_code := case
    when p_passed then null
    else coalesce(p_validation_result_jsonb ->> 'errorCode', 'OUTPUT_GUARD_REJECTED')
  end;

  update public.chat_turn_attempts
  set state = v_target_state,
      output_guard_version = p_output_guard_version,
      validation_ai_execution_log_id = p_validation_ai_execution_log_id,
      validation_result_jsonb = p_validation_result_jsonb,
      validated_at = v_now,
      finished_at = v_now,
      error_code = v_error_code
  where id = p_attempt_id;

  update public.chat_turns
  set state = v_target_state,
      revision = revision + 1,
      error_code = v_error_code,
      updated_at = v_now
  where id = p_turn_id;

  return false;
end;
$$;

create or replace function public.cmd_commit_chat_turn_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_message_id uuid,
  p_outbox_event_id uuid,
  p_relationship_effect_jsonb jsonb,
  p_world_event_jsonb jsonb,
  p_memory_accept_jsonb jsonb
)
returns table (
  turn_id uuid,
  attempt_id uuid,
  message_id uuid,
  sequence_no bigint,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_thread_subject_id uuid;
  v_thread_status text;
  v_sequence_no bigint;
  v_turn_state text;
  v_turn_bundle_id uuid;
  v_turn_created_at timestamptz;
  v_turn_committed_attempt_id uuid;
  v_turn_next_attempt_no integer;
  v_effective_attempt_id uuid;
  v_attempt_state text;
  v_attempt_no integer;
  v_staged_character_id uuid;
  v_staged_bundle_id uuid;
  v_staged_body text;
  v_staged_payload jsonb;
  v_staged_schema text;
  v_staged_hash text;
  v_committed_message_id uuid;
  v_committed_sequence_no bigint;
  v_participant_thread_id uuid;
  v_participant_bundle_id uuid;
  v_participant_joined_at timestamptz;
  v_participant_left_at timestamptz;
  v_user_message_id uuid;
  v_rel_state_revision bigint;
  v_rel_policy_version text;
  v_rel_character_id text;
  v_rel_expected_revision bigint;
  v_rel_event_id uuid;
  v_rel_event_type text;
  v_rel_event_schema_version text;
  v_rel_event_dedupe_key text;
  v_rel_delta_closeness integer;
  v_rel_delta_trust integer;
  v_rel_delta_friction integer;
  v_rel_next_stage text;
  v_rel_effect_policy_version text;
  v_world_event_id uuid;
  v_proposal_id uuid;
  v_record_id uuid;
  v_proposal_kind text;
  v_proposal_status text;
  v_proposal_record_type text;
  v_proposal_schema_version text;
  v_proposal_value jsonb;
  v_proposal_source_turn_id uuid;
  v_proposal_source_message_id uuid;
  v_proposal_character_id text;
  v_grants_jsonb jsonb;
  v_grant jsonb;
  v_now timestamptz := clock_timestamp();
begin
  select subject_id, status, next_sequence_no
    into v_thread_subject_id, v_thread_status, v_sequence_no
  from public.conversation_threads
  where id = p_thread_id
  for update;

  if not found or v_thread_subject_id is distinct from p_subject_id then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_commit_thread_not_found',
      message = 'conversation thread was not found for this subject';
  end if;

  select state, resolved_content_bundle_id, created_at, committed_attempt_id, next_attempt_no
    into v_turn_state, v_turn_bundle_id, v_turn_created_at,
         v_turn_committed_attempt_id, v_turn_next_attempt_no
  from public.chat_turns
  where id = p_turn_id and thread_id = p_thread_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_commit_turn_not_found',
      message = 'chat turn was not found for this thread and subject';
  end if;

  if v_turn_state in ('committed', 'delivered') then
    v_effective_attempt_id := v_turn_committed_attempt_id;

    if p_attempt_id is not null and p_attempt_id is distinct from v_effective_attempt_id then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_chat_commit_replay_attempt_conflict',
        message = 'chat turn is already committed by a different authoritative attempt';
    end if;

    select state, committed_message_id
      into v_attempt_state, v_committed_message_id
    from public.chat_turn_attempts
    where id = v_effective_attempt_id and turn_id = p_turn_id and subject_id = p_subject_id
    for update;

    if v_attempt_state is distinct from 'committed' or v_committed_message_id is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_commit_replay_inconsistent',
        message = 'committed turn is missing its authoritative committed attempt/message';
    end if;

    select sequence_no into v_committed_sequence_no
    from public.conversation_messages
    where id = v_committed_message_id
      and turn_id = p_turn_id
      and subject_id = p_subject_id
      and sender_type = 'character';

    if not found then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_commit_replay_message_missing',
        message = 'committed attempt message is missing';
    end if;

    return query
      select p_turn_id, v_effective_attempt_id, v_committed_message_id,
             v_committed_sequence_no, true;
    return;
  end if;

  if v_thread_status is distinct from 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_commit_thread_not_active',
      message = 'conversation thread is not active';
  end if;

  if p_attempt_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_commit_attempt_required',
      message = 'validated attempt id is required for first commit';
  end if;

  select state, attempt_no, generated_thread_character_id,
         generated_character_content_bundle_id, generated_body_text,
         generated_message_payload_jsonb, generated_message_schema_version,
         generated_content_hash, committed_message_id
    into v_attempt_state, v_attempt_no, v_staged_character_id,
         v_staged_bundle_id, v_staged_body, v_staged_payload,
         v_staged_schema, v_staged_hash, v_committed_message_id
  from public.chat_turn_attempts
  where id = p_attempt_id and turn_id = p_turn_id and subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_commit_attempt_not_found',
      message = 'chat attempt was not found for this turn';
  end if;

  if v_turn_state <> 'validated'
     or v_attempt_state <> 'validated'
     or v_attempt_no <> v_turn_next_attempt_no - 1
     or v_staged_bundle_id is distinct from v_turn_bundle_id
     or v_committed_message_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_commit_not_validated',
      message = 'only the current validated attempt can commit';
  end if;

  select thread_id, content_bundle_id, joined_at, left_at
    into v_participant_thread_id, v_participant_bundle_id,
         v_participant_joined_at, v_participant_left_at
  from public.conversation_thread_characters
  where id = v_staged_character_id;

  if v_participant_thread_id is distinct from p_thread_id
     or v_participant_bundle_id is distinct from v_turn_bundle_id
     or v_participant_joined_at > v_turn_created_at
     or (v_participant_left_at is not null and v_participant_left_at < v_turn_created_at) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_commit_participation_conflict',
      message = 'staged assistant participant no longer matches turn authority';
  end if;

  select id into v_user_message_id
  from public.conversation_messages
  where turn_id = p_turn_id
    and subject_id = p_subject_id
    and sender_type = 'user';

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_commit_user_message_missing',
      message = 'chat turn is missing its authoritative user message';
  end if;

  update public.conversation_threads
  set next_sequence_no = v_sequence_no + 1,
      updated_at = v_now
  where id = p_thread_id;

  insert into public.conversation_messages(
    id, thread_id, subject_id, turn_id, sequence_no,
    sender_type, thread_character_id, character_content_bundle_id,
    body_text, message_payload_jsonb, message_schema_version,
    content_hash, created_at
  ) values (
    p_message_id, p_thread_id, p_subject_id, p_turn_id, v_sequence_no,
    'character', v_staged_character_id, v_staged_bundle_id,
    v_staged_body, v_staged_payload, v_staged_schema,
    v_staged_hash, v_now
  );

  if p_world_event_jsonb is not null then
    if jsonb_typeof(p_world_event_jsonb) <> 'object' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_commit_world_effect_invalid',
        message = 'approved world effect must be a JSON object';
    end if;

    v_world_event_id := (p_world_event_jsonb ->> 'id')::uuid;

    insert into public.world_events(
      id, subject_id, event_type, event_schema_version, event_dedupe_key,
      source_turn_id, content_bundle_id, payload_jsonb, occurred_at
    ) values (
      v_world_event_id,
      p_subject_id,
      p_world_event_jsonb ->> 'eventType',
      p_world_event_jsonb ->> 'eventSchemaVersion',
      p_world_event_jsonb ->> 'eventDedupeKey',
      p_turn_id,
      v_turn_bundle_id,
      coalesce(p_world_event_jsonb -> 'payload', '{}'::jsonb),
      v_now
    );
  end if;

  if p_relationship_effect_jsonb is not null then
    if jsonb_typeof(p_relationship_effect_jsonb) <> 'object' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_commit_relationship_effect_invalid',
        message = 'approved relationship effect must be a JSON object';
    end if;

    v_rel_event_id := (p_relationship_effect_jsonb ->> 'id')::uuid;
    v_rel_character_id := p_relationship_effect_jsonb ->> 'characterId';
    v_rel_event_type := p_relationship_effect_jsonb ->> 'eventType';
    v_rel_event_schema_version := p_relationship_effect_jsonb ->> 'eventSchemaVersion';
    v_rel_event_dedupe_key := p_relationship_effect_jsonb ->> 'eventDedupeKey';
    v_rel_expected_revision := (p_relationship_effect_jsonb ->> 'expectedRevision')::bigint;
    v_rel_delta_closeness := coalesce((p_relationship_effect_jsonb ->> 'deltaCloseness')::integer, 0);
    v_rel_delta_trust := coalesce((p_relationship_effect_jsonb ->> 'deltaTrust')::integer, 0);
    v_rel_delta_friction := coalesce((p_relationship_effect_jsonb ->> 'deltaFriction')::integer, 0);
    v_rel_next_stage := p_relationship_effect_jsonb ->> 'relationshipStage';
    v_rel_effect_policy_version := p_relationship_effect_jsonb ->> 'policyVersion';

    select revision, policy_version
      into v_rel_state_revision, v_rel_policy_version
    from public.user_character_states
    where subject_id = p_subject_id and character_id = v_rel_character_id
    for update;

    if not found
       or v_rel_state_revision is distinct from v_rel_expected_revision
       or v_rel_policy_version is distinct from v_rel_effect_policy_version
       or v_rel_next_stage is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_commit_relationship_authority_conflict',
        message = 'approved relationship effect does not match current projection/policy authority';
    end if;

    insert into public.relationship_events(
      id, subject_id, character_id, event_type, event_schema_version,
      event_dedupe_key, source_turn_id,
      delta_closeness, delta_trust, delta_friction,
      policy_version, state_revision_before, state_revision_after,
      payload_jsonb, applied_at
    ) values (
      v_rel_event_id, p_subject_id, v_rel_character_id,
      v_rel_event_type, v_rel_event_schema_version, v_rel_event_dedupe_key,
      p_turn_id,
      v_rel_delta_closeness, v_rel_delta_trust, v_rel_delta_friction,
      v_rel_effect_policy_version, v_rel_state_revision, v_rel_state_revision + 1,
      p_relationship_effect_jsonb -> 'payload', v_now
    );

    update public.user_character_states
    set closeness = closeness + v_rel_delta_closeness,
        trust = trust + v_rel_delta_trust,
        friction = friction + v_rel_delta_friction,
        relationship_stage = v_rel_next_stage,
        revision = revision + 1,
        last_interaction_at = v_now,
        updated_at = v_now
    where subject_id = p_subject_id and character_id = v_rel_character_id;
  end if;

  if p_memory_accept_jsonb is not null then
    if jsonb_typeof(p_memory_accept_jsonb) <> 'object' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_commit_memory_effect_invalid',
        message = 'memory acceptance effect must be a JSON object';
    end if;

    v_proposal_id := (p_memory_accept_jsonb ->> 'proposalId')::uuid;
    v_record_id := (p_memory_accept_jsonb ->> 'recordId')::uuid;
    v_grants_jsonb := coalesce(p_memory_accept_jsonb -> 'grants', '[]'::jsonb);

    if jsonb_typeof(v_grants_jsonb) <> 'array' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_commit_memory_grants_invalid',
        message = 'memory acceptance grants must be an explicit JSON array';
    end if;

    select proposal_kind, status, record_type, schema_version,
           proposed_value_jsonb, source_turn_id, source_message_id, character_id
      into v_proposal_kind, v_proposal_status, v_proposal_record_type,
           v_proposal_schema_version, v_proposal_value, v_proposal_source_turn_id,
           v_proposal_source_message_id, v_proposal_character_id
    from public.memory_proposals
    where id = v_proposal_id and subject_id = p_subject_id
    for update;

    if not found or v_proposal_status <> 'pending' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_commit_memory_proposal_not_pending',
        message = 'memory proposal is not pending for this subject';
    end if;

    if v_proposal_kind = 'life_fact' then
      insert into public.life_facts(
        id, subject_id, fact_type, schema_version, value_jsonb,
        source_kind, source_message_id, confirmed_at, created_at
      ) values (
        v_record_id, p_subject_id, v_proposal_record_type, v_proposal_schema_version,
        v_proposal_value, 'user_explicit', v_user_message_id, v_now, v_now
      );

      update public.memory_proposals
      set status = 'accepted',
          accepted_life_fact_id = v_record_id,
          accepted_memory_item_id = null,
          resolved_at = v_now
      where id = v_proposal_id;

      for v_grant in select value from jsonb_array_elements(v_grants_jsonb)
      loop
        insert into public.record_access_grants(
          id, subject_id, life_fact_id, memory_item_id,
          grantee_character_id, grant_reason, granted_at
        ) values (
          (v_grant ->> 'id')::uuid,
          p_subject_id,
          v_record_id,
          null,
          v_grant ->> 'characterId',
          'user_choice',
          v_now
        );
      end loop;
    elsif v_proposal_kind = 'memory' then
      insert into public.memory_items(
        id, subject_id, memory_type, schema_version, content_jsonb,
        source_kind, source_turn_id, source_message_id,
        created_by_character_id, created_at
      ) values (
        v_record_id, p_subject_id, v_proposal_record_type, v_proposal_schema_version,
        v_proposal_value, 'user_approved', v_proposal_source_turn_id,
        v_proposal_source_message_id, v_proposal_character_id, v_now
      );

      update public.memory_proposals
      set status = 'accepted',
          accepted_life_fact_id = null,
          accepted_memory_item_id = v_record_id,
          resolved_at = v_now
      where id = v_proposal_id;

      for v_grant in select value from jsonb_array_elements(v_grants_jsonb)
      loop
        insert into public.record_access_grants(
          id, subject_id, life_fact_id, memory_item_id,
          grantee_character_id, grant_reason, granted_at
        ) values (
          (v_grant ->> 'id')::uuid,
          p_subject_id,
          null,
          v_record_id,
          v_grant ->> 'characterId',
          'user_choice',
          v_now
        );
      end loop;
    else
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_commit_memory_proposal_kind_invalid',
        message = 'memory proposal kind is not persistable';
    end if;
  end if;

  insert into public.outbox_events(
    id, aggregate_type, aggregate_id, event_type, event_schema_version,
    dedupe_key, payload_jsonb, status, attempt_count, available_at, created_at
  ) values (
    p_outbox_event_id,
    'chat_turn',
    p_turn_id::text,
    'CHAT_TURN_COMMITTED',
    'v1',
    'turn-commit-v1',
    jsonb_build_object(
      'turnId', p_turn_id,
      'attemptId', p_attempt_id,
      'messageId', p_message_id,
      'relationshipEffect', p_relationship_effect_jsonb is not null,
      'worldEffect', p_world_event_jsonb is not null,
      'memoryAccepted', p_memory_accept_jsonb is not null
    ),
    'pending',
    0,
    v_now,
    v_now
  );

  update public.chat_turn_attempts
  set state = 'committed',
      committed_message_id = p_message_id,
      finished_at = v_now
  where id = p_attempt_id;

  update public.chat_turns
  set state = 'committed',
      committed_attempt_id = p_attempt_id,
      committed_at = v_now,
      revision = revision + 1,
      error_code = null,
      updated_at = v_now
  where id = p_turn_id;

  return query select p_turn_id, p_attempt_id, p_message_id, v_sequence_no, false;
end;
$$;

revoke all on function public.cmd_allocate_chat_turn_attempt_v1(uuid, uuid, uuid, text) from public;
revoke all on function public.cmd_mark_chat_turn_context_ready_v1(uuid, uuid, uuid) from public;
revoke all on function public.cmd_mark_chat_turn_failed_v1(uuid, uuid, uuid, text, text) from public;
revoke all on function public.cmd_mark_chat_turn_generated_v1(
  uuid, uuid, uuid, uuid, text, uuid, text, jsonb, text, text, jsonb
) from public;
revoke all on function public.cmd_validate_chat_turn_attempt_v1(
  uuid, uuid, uuid, uuid, text, jsonb, boolean, text
) from public;
revoke all on function public.cmd_commit_chat_turn_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) from public;
