-- S4: keep the safe paid Reader record in the MEMBER Chat stream, but
-- exclude it from the shared Reader/Se-yeon AI context/summary input path.
-- This is a forward-only change to the existing 1280 function, NOT a new
-- public Reader scope, user-facing text search index, or S5 production grant.
-- The source 1960 marker is system-only, has a fixed safe text/hash and
-- no payload; protected answer plaintext is never in conversation_messages.
-- The eligible Chat stream (0520/0950) still returns the safe marker.
-- Existing API EXECUTE and RLS are unchanged, and no live DB is modified.
-- Watchtower-Track: db-authority-core

create or replace function public.qry_reader_context_recent_messages_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_limit integer
)
returns table (
  message_id uuid,
  sequence_no bigint,
  sender_type text,
  character_id text,
  body_text text,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null
     or p_thread_id is null
     or p_limit is null
     or p_limit <= 0 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reader_context_recent_messages_input_required',
      message = 'Reader recent-message context requires subject, thread, and positive server-owned limit';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if not exists (
    select 1
    from public.conversation_threads t
    where t.id = p_thread_id
      and t.subject_id = p_subject_id
      and t.status in ('active', 'archived')
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_reader_context_recent_messages_thread_unavailable',
      message = 'Reader recent-message thread is unavailable for this subject';
  end if;

  return query
  select
    x.message_id,
    x.sequence_no,
    x.sender_type,
    x.character_id,
    x.body_text,
    x.created_at
  from (
    select
      m.id as message_id,
      m.sequence_no,
      m.sender_type,
      tc.character_id,
      m.body_text,
      m.created_at
    from public.conversation_messages m
    left join public.conversation_thread_characters tc
      on tc.id = m.thread_character_id
     and tc.thread_id = m.thread_id
    where m.subject_id = p_subject_id
      and m.thread_id = p_thread_id
      and m.redacted_at is null
      and m.body_text is not null
      -- S5 persists the paid answer only in its private ciphertext table.
      -- This system marker remains visible in the normal Chat stream but
      -- NEVER becomes an LLM, Memory, summary, retrieval, or search input.
      -- Query only existing API-granted sender/body columns. The S5 fixed
      -- message is a SYSTEM-only text; user-authored identical prose stays
      -- in ordinary context. Do not widen content_hash SELECT privileges.
      and not (
        m.sender_type='system'
        and m.body_text='유료 해설 기록이 있습니다.'
      )
    order by m.sequence_no desc
    limit p_limit
  ) x
  order by x.sequence_no asc;
end;
$$;

comment on function public.qry_reader_context_recent_messages_v1(uuid,uuid,integer)
is 'Server Reader and Se-yeon current Subject thread window. Redacted messages and system S5 paid-answer safe markers are excluded BEFORE applying the context limit; only ordinary visible Chat text may enter AI Memory/search/summary context. The Chat UI stream keeps its safe marker.';
