-- MyeongHa owner-authorized chat thread sequence stream read authority.
--
-- API_CONTRACT §9 defines GET /api/chat/:threadId as a sequence-cursor stream.
-- AUTH_RLS_PRIVACY_SPEC requires object ownership checks and forbids deleted
-- conversation plaintext from reappearing in UI/AI context. This query therefore:
--
-- - accepts only an active canonical subject resolved by the API boundary
-- - accepts only active/archived threads owned by that subject
-- - uses sequence_no as the deterministic cursor/order authority
-- - preserves redacted message tombstones while force-masking body/payload
-- - projects stable character identity instead of internal participation ids
-- - omits subject/auth/request/attempt/content-hash provenance from the stream
--
-- Thread deletion mutation, pagination page size, and HTTP wire DTO are outside
-- this read boundary. P0-AUTH-01 remains unresolved; SECURITY INVOKER is retained
-- and PUBLIC EXECUTE is revoked.

create or replace function public.qry_chat_thread_stream_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_after_sequence_no bigint
)
returns table (
  message_id uuid,
  sequence_no bigint,
  sender_type text,
  character_id text,
  body_text text,
  message_payload_jsonb jsonb,
  message_schema_version text,
  created_at timestamptz,
  redacted boolean,
  redacted_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_chat_thread_stream_subject_required',
      message = 'chat stream subject is required';
  end if;

  if p_thread_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_chat_thread_stream_thread_required',
      message = 'chat stream thread is required';
  end if;

  if p_after_sequence_no is null or p_after_sequence_no < 0 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_chat_thread_stream_cursor_valid',
      message = 'chat stream cursor must be a non-negative sequence number';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_chat_thread_stream_subject_ineligible',
      message = 'chat stream read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.conversation_threads t
    where t.id = p_thread_id
      and t.subject_id = p_subject_id
      and t.status in ('active', 'archived')
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_chat_thread_stream_thread_unavailable',
      message = 'chat thread is unavailable for this subject';
  end if;

  return query
  select
    m.id,
    m.sequence_no,
    m.sender_type,
    tc.character_id,
    case when m.redacted_at is null then m.body_text else null end,
    case when m.redacted_at is null then m.message_payload_jsonb else null end,
    m.message_schema_version,
    m.created_at,
    (m.redacted_at is not null),
    m.redacted_at
  from public.conversation_messages m
  left join public.conversation_thread_characters tc
    on tc.id = m.thread_character_id
   and tc.thread_id = m.thread_id
  where m.thread_id = p_thread_id
    and m.subject_id = p_subject_id
    and m.sequence_no > p_after_sequence_no
  order by m.sequence_no asc;
end;
$$;

revoke execute on function public.qry_chat_thread_stream_v1(uuid, uuid, bigint) from public;
