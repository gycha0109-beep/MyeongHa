-- MyeongHa chat retry/abandon persistence authority.
--
-- Retry remains the existing cmd_allocate_chat_turn_attempt_v1 path: a failed_retryable
-- logical turn allocates exactly one new attempt under the turn row lock. This migration
-- adds the complementary abandon command without inventing new lifecycle semantics.
--
-- Abandon is allowed only when no nonterminal attempt exists and the logical turn is
-- either still RECEIVED (no attempt started) or FAILED_RETRYABLE (the prior attempt is
-- already terminal). This prevents orphaning RUNNING/GENERATED/VALIDATED attempts.
--
-- P0-AUTH-01 remains unresolved. The function is SECURITY INVOKER and PUBLIC EXECUTE
-- is revoked; no production API -> PostgreSQL execution identity is selected here.

create or replace function public.cmd_abandon_chat_turn_v1(
  p_subject_id uuid,
  p_turn_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_turn_state text;
  v_active_attempt_id uuid;
  v_now timestamptz := clock_timestamp();
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
      constraint = 'cmd_chat_abandon_turn_not_found',
      message = 'chat turn was not found for this subject';
  end if;

  -- Network retry after a successful abandon is an idempotent replay.
  if v_turn_state = 'abandoned' then
    return true;
  end if;

  if v_turn_state in ('committed', 'delivered', 'failed_final') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_abandon_turn_terminal',
      message = 'terminal chat turn cannot be abandoned';
  end if;

  -- The governed baseline does not silently normalize partially progressed states.
  -- A turn with an active attempt must first reach its own terminal failure/commit path.
  if v_turn_state not in ('received', 'failed_retryable') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_abandon_turn_not_eligible',
      message = 'chat turn is not eligible for abandon';
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
      constraint = 'cmd_chat_abandon_attempt_in_flight',
      message = 'chat turn with a nonterminal attempt cannot be abandoned';
  end if;

  update public.chat_turns t
  set state = 'abandoned',
      revision = t.revision + 1,
      updated_at = v_now
  where t.id = p_turn_id
    and t.subject_id = p_subject_id;

  return false;
end;
$$;

revoke all on function public.cmd_abandon_chat_turn_v1(uuid, uuid) from public;
