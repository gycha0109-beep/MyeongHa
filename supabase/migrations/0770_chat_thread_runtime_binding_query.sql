-- Owner-authorized active chat-thread runtime binding projection.
--
-- This query supplies the server-side Character Room adapter with the exact
-- thread-pinned content release/bundle and active participants. Browser callers
-- must never choose these identities themselves.
--
-- P0-AUTH-01 remains unresolved. The function is SECURITY INVOKER and EXECUTE is
-- revoked from PUBLIC. This migration does not choose or grant an API database
-- execution identity.

create or replace function public.qry_chat_thread_runtime_binding_v1(
  p_subject_id uuid,
  p_thread_id uuid
)
returns table (
  thread_id uuid,
  status text,
  active_content_release_id uuid,
  active_content_bundle_id uuid,
  content_revision bigint,
  participant_character_ids text[]
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_eligible boolean;
  v_thread public.conversation_threads%rowtype;
  v_participant_character_ids text[];
begin
  if p_subject_id is null or p_thread_id is null then
    raise exception using
      errcode = '22004',
      constraint = 'qry_chat_thread_runtime_binding_input_required',
      message = 'chat thread runtime binding requires subject and thread identities';
  end if;

  select exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) into v_subject_eligible;

  if not v_subject_eligible then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_chat_thread_runtime_binding_subject_ineligible',
      message = 'subject is not eligible for chat thread runtime binding';
  end if;

  select ct.*
    into v_thread
  from public.conversation_threads ct
  where ct.id = p_thread_id
    and ct.subject_id = p_subject_id
    and ct.status = 'active'
    and ct.thread_type in ('single_character', 'multi_character')
    and ct.active_content_release_id is not null
    and ct.active_content_bundle_id is not null;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_chat_thread_runtime_binding_thread_unavailable',
      message = 'active chat thread runtime binding is unavailable for this subject';
  end if;

  select array_agg(
    ctc.character_id
    order by case ctc.role when 'primary' then 0 else 1 end, ctc.character_id
  )
    into v_participant_character_ids
  from public.conversation_thread_characters ctc
  where ctc.thread_id = v_thread.id
    and ctc.content_bundle_id = v_thread.active_content_bundle_id
    and ctc.left_at is null;

  if coalesce(cardinality(v_participant_character_ids), 0) = 0 then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_chat_thread_runtime_binding_participants_unavailable',
      message = 'active chat thread has no participants in its active content bundle';
  end if;

  return query
    select
      v_thread.id,
      v_thread.status,
      v_thread.active_content_release_id,
      v_thread.active_content_bundle_id,
      v_thread.content_revision,
      v_participant_character_ids;
end;
$$;

revoke execute on function public.qry_chat_thread_runtime_binding_v1(uuid, uuid) from public;
