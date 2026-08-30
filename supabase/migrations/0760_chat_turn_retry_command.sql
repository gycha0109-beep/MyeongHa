-- MyeongHa public Chat Turn retry authority.
--
-- The generic cmd_allocate_chat_turn_attempt_v1 command also owns first-attempt
-- allocation from RECEIVED. The public POST /api/chat/turns/:turnId/retry contract is
-- narrower: only an already FAILED_RETRYABLE logical turn may append a new attempt.
-- This command keeps that distinction inside the row-locked DB authority instead of
-- asking the API layer to infer lifecycle state from a read-before-write check.
--
-- Retry appends a new chat_turn_attempts row; it never rewrites the failed attempt.
-- Concurrent retry and retry-vs-abandon calls serialize on the same chat_turn row.
--
-- P0-AUTH-01 remains unresolved. This function is SECURITY INVOKER, uses a fixed
-- search_path, and revokes PUBLIC EXECUTE. No production API -> PostgreSQL execution
-- identity is selected here.

create or replace function public.cmd_retry_chat_turn_attempt_v1(
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
  v_active_attempt_id uuid;
  v_attempt_id uuid;
  v_attempt_no integer;
  v_replayed boolean;
begin
  select t.state
    into v_turn_state
  from public.chat_turns t
  where t.id = p_turn_id
    and t.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_chat_retry_turn_not_found',
      message = 'chat turn was not found for this subject';
  end if;

  if v_turn_state in ('committed', 'delivered', 'failed_final', 'abandoned') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_retry_turn_terminal',
      message = 'terminal chat turn cannot be retried';
  end if;

  select a.id
    into v_active_attempt_id
  from public.chat_turn_attempts a
  where a.turn_id = p_turn_id
    and a.subject_id = p_subject_id
    and a.state in ('running', 'generated', 'validated')
  order by a.attempt_no desc
  limit 1;

  if v_active_attempt_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_retry_turn_in_flight',
      message = 'chat turn already has an execution attempt in flight';
  end if;

  if v_turn_state <> 'failed_retryable' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_retry_turn_not_retryable',
      message = 'chat turn is not in failed_retryable state';
  end if;

  if p_attempt_id is null then
    raise exception using
      errcode = '23502',
      constraint = 'cmd_chat_retry_attempt_id_required',
      message = 'retry attempt id is required';
  end if;

  select allocated.attempt_id, allocated.attempt_no, allocated.replayed
    into v_attempt_id, v_attempt_no, v_replayed
  from public.cmd_allocate_chat_turn_attempt_v1(
    p_subject_id,
    p_turn_id,
    p_attempt_id,
    p_planner_version
  ) allocated;

  -- The retry-only command enters the generic allocator only after proving that the
  -- turn is FAILED_RETRYABLE and has no active attempt under the same row lock.
  -- A replay marker here would therefore indicate authority drift/corruption rather
  -- than a valid public retry replay.
  if v_replayed then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_retry_unexpected_allocator_replay',
      message = 'retry allocator replayed an unexpected active attempt';
  end if;

  return query select v_attempt_id, v_attempt_no, false;
end;
$$;

revoke all on function public.cmd_retry_chat_turn_attempt_v1(uuid, uuid, uuid, text) from public;
