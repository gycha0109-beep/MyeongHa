-- MyeongHa PHASE L4: retire caller-chosen legacy relationship mutation from chat commit.
-- Watchtower-Track: character-memory
--
-- The old commit function accepted caller-provided relationship deltas/stage and wrote the
-- pre-SRC-22 relationship_events ledger. Preserve non-relationship chat/world/memory commit
-- behavior, but fail closed whenever that obsolete relationship mutation input is supplied.

alter function public.cmd_commit_chat_turn_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) rename to cmd_commit_chat_turn_legacy_v1;

create function public.cmd_commit_chat_turn_v1(
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
as $relationship_chat_commit_v1$
begin
  if p_relationship_effect_jsonb is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_chat_commit_legacy_relationship_effect_disabled_v1',
      message = 'caller-provided legacy relationship mutation is disabled; use governed Production relationship policy authority';
  end if;

  return query
  select *
  from public.cmd_commit_chat_turn_legacy_v1(
    p_subject_id,
    p_thread_id,
    p_turn_id,
    p_attempt_id,
    p_message_id,
    p_outbox_event_id,
    null,
    p_world_event_jsonb,
    p_memory_accept_jsonb
  );
end;
$relationship_chat_commit_v1$;

revoke all on function public.cmd_commit_chat_turn_legacy_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) from public;

revoke all on function public.cmd_commit_chat_turn_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) from public;

comment on function public.cmd_commit_chat_turn_legacy_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) is
  'Internal pre-SRC-22 implementation retained only so the public wrapper can preserve non-relationship chat/world/memory commit semantics. Do not call directly.';

comment on function public.cmd_commit_chat_turn_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb
) is
  'Chat commit compatibility wrapper. Caller-provided legacy relationship mutation is fail-closed; Production relationship mutation must use the governed policy path introduced in PHASE M.';
