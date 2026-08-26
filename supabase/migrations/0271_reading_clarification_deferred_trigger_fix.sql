-- Align the deferred logical-reading authority trigger with §15 clarification commit semantics.
--
-- ct_reading_request_authority is DEFERRABLE INITIALLY DEFERRED. Therefore, for a valid
-- clarification transaction, it may execute only after reading_sessions.current_reading_id
-- has atomically advanced from the parent to the newly inserted child. The original check
-- accepted only the pre-advance parent pointer, which made the canonical command impossible
-- under the trigger's default deferred timing.
--
-- Preserve both valid evaluation moments:
-- - IMMEDIATE validation: session current pointer is still the parent.
-- - DEFERRED/commit validation: session current pointer is the new child.
-- Any unrelated current pointer remains fail-closed.

create or replace function public.ct_validate_reading_request_authority()
returns trigger
language plpgsql
as $$
declare
  source_thread_id uuid;
  participant_thread_id uuid;
  participant_character_id text;
  participant_bundle_id uuid;
  participant_joined_at timestamptz;
  participant_left_at timestamptz;
  source_turn_created_at timestamptz;
  capability_can_initiate boolean;
  session_current_reading_id uuid;
  parent_attempt_no integer;
begin
  if new.requested_character_id is not null then
    select can_initiate into capability_can_initiate
    from public.character_capabilities
    where content_bundle_id = new.requested_character_content_bundle_id
      and character_id = new.requested_character_id
      and saju_domain = new.saju_domain;

    if capability_can_initiate is distinct from true then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_character_capability',
        message = 'requested character cannot initiate this Saju domain';
    end if;
  end if;

  if new.source_turn_id is not null and new.requested_character_id is not null
     and new.requested_thread_character_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_character_participation',
      message = 'character-triggered chat reading requires exact thread participation';
  end if;

  if new.requested_thread_character_id is not null then
    select ct.thread_id, ct.character_id, ct.content_bundle_id, ct.joined_at, ct.left_at
      into participant_thread_id, participant_character_id, participant_bundle_id,
           participant_joined_at, participant_left_at
    from public.conversation_thread_characters ct
    where ct.id = new.requested_thread_character_id;

    select thread_id, created_at into source_thread_id, source_turn_created_at
    from public.chat_turns
    where id = new.source_turn_id and subject_id = new.subject_id;

    if participant_thread_id is distinct from source_thread_id
       or participant_character_id is distinct from new.requested_character_id
       or participant_bundle_id is distinct from new.requested_character_content_bundle_id
       or participant_joined_at > source_turn_created_at
       or (participant_left_at is not null and participant_left_at < source_turn_created_at) then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_character_participation',
        message = 'requested character participation does not match source turn authority';
    end if;
  end if;

  select current_reading_id into session_current_reading_id
  from public.reading_sessions
  where id = new.reading_session_id
    and subject_id = new.subject_id;

  if new.parent_reading_id is null then
    if new.attempt_no <> 1 then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_clarification_chain',
        message = 'first logical reading attempt must have attempt_no 1';
    end if;
  else
    select attempt_no into parent_attempt_no
    from public.readings
    where id = new.parent_reading_id
      and reading_session_id = new.reading_session_id
      and subject_id = new.subject_id;

    if parent_attempt_no is null
       or parent_attempt_no >= new.attempt_no
       or (
         session_current_reading_id is distinct from new.parent_reading_id
         and session_current_reading_id is distinct from new.id
       ) then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_clarification_chain',
        message = 'clarification attempt must extend the current prior reading without branching';
    end if;
  end if;

  return new;
end;
$$;
