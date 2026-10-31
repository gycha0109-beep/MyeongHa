-- Watchtower-Track: security
-- S0 disposable-only G3 direct Node replay of an already DELIVERED
-- first Se-yeon assistant message. Not a general History, Reader, or proxy
-- authorization. This RPC neither creates nor substitutes a Grant.
begin;

create function seyeon_private.qry_seyeon_first_original_assistant_replay_s0_v1(
  p_subject_id uuid, p_thread_id uuid, p_assistant_message_id uuid
) returns table(assistant_text text)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $replay$
declare
  v_text text;
begin
  if p_subject_id is null or p_thread_id is null
     or p_assistant_message_id is null then return; end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  -- Lock the real first-turn parents before the absence tests; one request
  -- cannot turn a replay into a new context window or a different character.
  perform 1 from public.conversation_threads th
  where th.id=p_thread_id and th.subject_id=p_subject_id
    and th.thread_type='single_character'
    and th.status='active' and th.deleted_at is null
  for update of th;
  if not found then return; end if;

  select m.body_text into v_text
  from public.conversation_messages m
  join public.chat_turns t
    on t.id=m.turn_id and t.thread_id=m.thread_id
   and t.subject_id=m.subject_id
  join public.chat_turn_attempts a
    on a.id=t.committed_attempt_id and a.turn_id=t.id
   and a.subject_id=t.subject_id
  join public.conversation_thread_characters c
    on c.id=m.thread_character_id and c.thread_id=m.thread_id
  where m.id=p_assistant_message_id and m.subject_id=p_subject_id
    and m.thread_id=p_thread_id
    and m.sender_type='character' and m.redacted_at is null
    and m.body_text is not null and length(btrim(m.body_text))>0
    and m.body_text=a.generated_body_text
    and t.state='delivered' and t.delivered_at is not null
    and t.committed_at is not null and t.committed_attempt_id=a.id
    and a.state='committed' and a.committed_message_id=m.id
    and a.seyeon_positive_delivery_issued_at is null
    and a.seyeon_positive_delivery_receipt_hash is null
    and c.character_id='seyeon' and c.role='primary'
    and c.left_at is null
  for share of m,t,a,c;
  if not found then return; end if;

  -- The first Node send's one-original-Memory scope only. Never replay a
  -- later turn or a message that could have used unpinned prior context.
  if (select count(*) from public.conversation_messages m
      where m.subject_id=p_subject_id and m.thread_id=p_thread_id)<>2
     or (select count(*) from public.conversation_messages u
        where u.subject_id=p_subject_id and u.thread_id=p_thread_id
          and u.turn_id=(select m.turn_id from public.conversation_messages m
                         where m.id=p_assistant_message_id)
          and u.sender_type='user' and u.redacted_at is null)<>1
     or exists(select 1 from public.conversation_thread_characters c
        where c.thread_id=p_thread_id and c.left_at is null
          and c.character_id<>'seyeon')
     or exists(select 1 from public.relationship_events r
        where r.subject_id=p_subject_id and r.character_id='seyeon')
     or exists(select 1 from public.relationship_event_records r
        where r.subject_id=p_subject_id and r.character_id='seyeon')
     or exists(select 1 from public.relationship_history_entries r
        where r.subject_id=p_subject_id and r.character_id='seyeon')
  then return; end if;

  -- DB-owned original Grant ID/record digest and current withdrawal status:
  -- the same exact committed Attempt's positiveProof, never a fresh regrant.
  perform seyeon_private.assert_current_original_assistant_lineage_v1(
    p_subject_id,p_thread_id,p_assistant_message_id
  );

  -- The original Grant/Memory SHARE locks remain held through Node finish
  -- by the caller's still-live canonical Member transaction.
  return query select v_text;
end
$replay$;

revoke all on function
  seyeon_private.qry_seyeon_first_original_assistant_replay_s0_v1(uuid,uuid,uuid)
from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function
  seyeon_private.qry_seyeon_first_original_assistant_replay_s0_v1(uuid,uuid,uuid)
to myeongha_seyeon_chat_runtime_owner;

commit;
