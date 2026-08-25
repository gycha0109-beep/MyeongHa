-- Existing-thread chat receive command boundary.
-- The API planner resolves content/capability first; this command owns the atomic
-- persistence invariants: idempotency, one-in-flight serialization, sequence
-- allocation, RECEIVED turn creation, and authoritative user-message creation.
--
-- P0-AUTH-01 remains unresolved. This function is SECURITY INVOKER and EXECUTE is
-- revoked from PUBLIC. A future decided API database role may receive an explicit
-- grant; this migration does not choose that execution identity.

create or replace function public.cmd_receive_chat_turn_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_client_turn_id text,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb,
  p_resolved_content_release_id uuid,
  p_resolved_content_bundle_id uuid,
  p_turn_id uuid,
  p_message_id uuid,
  p_user_body_text text,
  p_user_message_payload_jsonb jsonb,
  p_user_content_hash text
)
returns table (
  turn_id uuid,
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
  v_thread_release_id uuid;
  v_thread_bundle_id uuid;
  v_sequence_no bigint;
  v_existing_turn_id uuid;
  v_existing_request_hash text;
  v_existing_message_id uuid;
  v_existing_sequence_no bigint;
  v_in_flight_turn_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_body_text is null and p_user_message_payload_jsonb is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_receive_user_content_required',
      message = 'chat receive requires authoritative user message content';
  end if;

  if p_resolved_content_release_id is null or p_resolved_content_bundle_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_receive_content_binding_required',
      message = 'chat receive requires an exact resolved content release and bundle';
  end if;

  select subject_id, status, active_content_release_id, active_content_bundle_id, next_sequence_no
    into v_thread_subject_id, v_thread_status, v_thread_release_id, v_thread_bundle_id, v_sequence_no
  from public.conversation_threads
  where id = p_thread_id
  for update;

  if not found or v_thread_subject_id is distinct from p_subject_id then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_receive_thread_not_found',
      message = 'conversation thread was not found for this subject';
  end if;

  if v_thread_status is distinct from 'active' then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_receive_thread_not_active',
      message = 'conversation thread is not active';
  end if;

  if v_thread_release_id is distinct from p_resolved_content_release_id
     or v_thread_bundle_id is distinct from p_resolved_content_bundle_id then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_receive_content_binding_conflict',
      message = 'resolved content does not match the thread content authority';
  end if;

  select id, request_hash
    into v_existing_turn_id, v_existing_request_hash
  from public.chat_turns
  where thread_id = p_thread_id
    and client_turn_id = p_client_turn_id;

  if v_existing_turn_id is not null then
    if v_existing_request_hash is distinct from p_request_hash then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_chat_receive_idempotency_conflict',
        message = 'clientTurnId already exists with a different canonical request hash';
    end if;

    select id, sequence_no
      into v_existing_message_id, v_existing_sequence_no
    from public.conversation_messages
    where turn_id = v_existing_turn_id
      and subject_id = p_subject_id
      and sender_type = 'user';

    if v_existing_message_id is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_chat_receive_replay_missing_user_message',
        message = 'existing logical turn is missing its authoritative user message';
    end if;

    return query
      select v_existing_turn_id, v_existing_message_id, v_existing_sequence_no, true;
    return;
  end if;

  select id into v_in_flight_turn_id
  from public.chat_turns
  where thread_id = p_thread_id
    and state in ('received', 'planned', 'context_ready', 'generated', 'validated', 'failed_retryable')
  order by created_at, id
  limit 1;

  if v_in_flight_turn_id is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_receive_turn_in_flight',
      message = 'another logical turn is still in flight for this thread';
  end if;

  update public.conversation_threads
  set next_sequence_no = v_sequence_no + 1,
      updated_at = v_now
  where id = p_thread_id;

  insert into public.chat_turns(
    id,
    thread_id,
    subject_id,
    client_turn_id,
    request_hash,
    request_contract_version,
    request_snapshot_jsonb,
    resolved_content_release_id,
    resolved_content_bundle_id,
    state,
    revision,
    next_attempt_no,
    created_at,
    updated_at
  ) values (
    p_turn_id,
    p_thread_id,
    p_subject_id,
    p_client_turn_id,
    p_request_hash,
    p_request_contract_version,
    p_request_snapshot_jsonb,
    p_resolved_content_release_id,
    p_resolved_content_bundle_id,
    'received',
    0,
    1,
    v_now,
    v_now
  );

  insert into public.conversation_messages(
    id,
    thread_id,
    subject_id,
    turn_id,
    sequence_no,
    sender_type,
    body_text,
    message_payload_jsonb,
    content_hash,
    created_at
  ) values (
    p_message_id,
    p_thread_id,
    p_subject_id,
    p_turn_id,
    v_sequence_no,
    'user',
    p_user_body_text,
    p_user_message_payload_jsonb,
    p_user_content_hash,
    v_now
  );

  return query
    select p_turn_id, p_message_id, v_sequence_no, false;
end;
$$;

revoke all on function public.cmd_receive_chat_turn_v1(
  uuid, uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid, text, jsonb, text
) from public;
