-- Watchtower-Track: security
-- S0 read-only original message offer. Never a history/Replay permission.
-- No HTTP mount, no ordinary API EXECUTE, no model use, no message text returned.
-- Installed in disposable PG17/PG18 only; registry defaults to empty.
begin;

create function seyeon_private.qry_seyeon_original_message_offer_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_message_id uuid
)
returns table(
  thread_id uuid,
  turn_id uuid,
  message_id uuid
)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $offer$
begin
  if p_subject_id is null or p_thread_id is null or p_message_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_original_message_offer_identity_required',
      message='Original Message offer requires exact IDs';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- Never consult private Message text if the exact S0 source type is
  -- unapproved. This registry is EMPTY in production and after isolated install.
  perform 1 from public.seyeon_positive_source_type_registry_v1 r
  where r.record_kind='memory'
    and r.record_type='conversation_recall'
    and r.schema_version='v1'
    and r.projector_version='seyeon-conversation-recall-projector-v1'
    and r.writable_enabled;
  if not found then
    return;
  end if;

  -- This does not grant historical Reveal. The calling Node port MUST verify
  -- an independently authorized, already-revealed exact user Message before
  -- executing the RPC. Do not infer an offer from a metadata-only Chat shell.
  return query
  select t.thread_id,t.id,m.id
  from public.chat_turns t
  join public.conversation_threads th
    on th.id=t.thread_id and th.subject_id=t.subject_id
  join public.conversation_messages m
    on m.turn_id=t.id and m.thread_id=t.thread_id
       and m.subject_id=t.subject_id
  where t.subject_id=p_subject_id and t.thread_id=p_thread_id
    and t.state in ('committed','delivered')
    and t.committed_at is not null
    and th.thread_type='single_character'
    and th.status in ('active','archived')
    and m.id=p_message_id
    and m.sender_type='user'
    and m.redacted_at is null
    and m.body_text is not null
    and length(m.body_text) between 1 and 4000
    and m.body_text=btrim(m.body_text)
    and m.body_text !~ '[[:cntrl:]]'
    and position(chr(127) in m.body_text)=0
    and (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0)
         from regexp_split_to_table(m.body_text,'') as ch)<=4000
    and exists(
      select 1 from public.conversation_thread_characters tc
      where tc.thread_id=t.thread_id
        and tc.character_id='seyeon'
        and tc.role='primary'
        and tc.joined_at<=t.committed_at
        and (tc.left_at is null or tc.left_at>=t.committed_at)
    )
  limit 1;
end
$offer$;

revoke all on function seyeon_private.qry_seyeon_original_message_offer_v1(
  uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function seyeon_private.qry_seyeon_original_message_offer_v1(
  uuid,uuid,uuid
) to myeongha_seyeon_chat_runtime_owner;

-- No UserMessage/body, no Grant, no public API route, no historical Reveal.
commit;
