-- Watchtower-Track: security
begin;
-- G0-D3 original Member-authored User text from an already committed,
-- canonical DB Turn. This is ORIGINAL chat input, not a claim that the
-- User text is free of quoted / copied derived personal content.
-- The owning Subject/Thread and durable Receive/Commit bind the source.
-- Staged S0 source only, no automatic Production migration.

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.assert_current_original_member_user_message_v1(
  p_subject_id uuid,p_thread_id uuid,p_user_message_id uuid
) returns void
language plpgsql security definer
set search_path=pg_catalog,public
as $user_origin$
declare
  v_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_user_message_id is null then
    raise exception using errcode='42501',
      constraint='seyeon_g0_user_origin_identity_invalid',
      message='Current original Member source is unavailable';
  end if;

  -- Exact message + committed Turn, same subject and thread, one canonical
  -- Member-authored User input. Never derive this authority from message
  -- prose, model sources, a user-provided SourceRef or an Event field.
  select msg.id into v_id
  from public.conversation_messages msg
  join public.chat_turns t
    on t.id=msg.turn_id and t.thread_id=msg.thread_id
   and t.subject_id=msg.subject_id
  join public.conversation_threads thread
    on thread.id=msg.thread_id and thread.subject_id=msg.subject_id
  where msg.id=p_user_message_id and msg.subject_id=p_subject_id
    and msg.thread_id=p_thread_id and msg.sender_type='user'
    and msg.turn_id is not null and msg.thread_character_id is null
    and msg.character_content_bundle_id is null
    and msg.body_text is not null and msg.redacted_at is null
    and nullif(btrim(msg.content_hash),'') is not null
    and t.state in ('committed','delivered')
    and t.committed_attempt_id is not null and t.committed_at is not null
    and nullif(btrim(t.client_turn_id),'') is not null
    and nullif(btrim(t.request_hash),'') is not null
    and nullif(btrim(t.request_contract_version),'') is not null
    and jsonb_typeof(t.request_snapshot_jsonb)='object'
    and thread.status in ('active','archived')
  for share of msg,t,thread;

  if v_id is distinct from p_user_message_id then
    raise exception using errcode='42501',
      constraint='seyeon_g0_user_origin_unverifiable',
      message='Current original Member source is unavailable';
  end if;
end
$user_origin$;

alter function seyeon_private.assert_current_original_member_user_message_v1(
  uuid,uuid,uuid
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.assert_current_original_member_user_message_v1(
  uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
