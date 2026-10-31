-- Watchtower-Track: security
-- S0-only UC-06 pre-model authority. No original text is returned.
-- The paid Planner may run only after exact Member/Turn/User/Se-yeon
-- source text is checked against committed DB rows. The Producer repeats
-- DB provenance checks after the model (no stale-read authorization).
-- This is not a G0/G3 Reveal permission or production migration.
begin;

create function seyeon_private.qry_seyeon_planner_pre_model_source_v1(
  p_subject_id uuid,p_turn_id uuid,p_user_message_id uuid,
  p_assistant_message_id uuid,p_user_text text,p_assistant_text text
)
returns table(source_ready boolean)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $planner_pre_model$
begin
  if p_subject_id is null or p_turn_id is null
     or p_user_message_id is null or p_assistant_message_id is null
     or p_user_message_id=p_assistant_message_id
     or nullif(btrim(p_user_text),'') is null
     or nullif(btrim(p_assistant_text),'') is null then
    return;
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  -- The type registry is an Owner-only synthetic admission; Production OFF.
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
    where reg.record_kind='memory'
      and reg.record_type='conversation_recall'
      and reg.schema_version='v1'
      and reg.projector_version='seyeon-conversation-recall-projector-v1'
      and reg.writable_enabled
    for share of reg;
  if not found then return; end if;

  -- Check exact *current committed original* text, not a caller-supplied
  -- snapshot or model-provided quote. No source body leaves this function.
  perform 1
  from public.chat_turns t
  join public.conversation_threads th
    on th.id=t.thread_id and th.subject_id=t.subject_id
  join public.conversation_messages um
    on um.id=p_user_message_id and um.turn_id=t.id
       and um.thread_id=t.thread_id and um.subject_id=t.subject_id
  join public.conversation_messages am
    on am.id=p_assistant_message_id and am.turn_id=t.id
       and am.thread_id=t.thread_id and am.subject_id=t.subject_id
  join public.conversation_thread_characters tc
    on tc.id=am.thread_character_id and tc.thread_id=t.thread_id
  where t.id=p_turn_id and t.subject_id=p_subject_id
    and t.state in ('committed','delivered') and t.committed_at is not null
    and th.thread_type='single_character' and th.status='active'
    and th.deleted_at is null
    and um.sender_type='user' and um.redacted_at is null
    and um.body_text=p_user_text
    and am.sender_type='character' and am.redacted_at is null
    and am.body_text=p_assistant_text
    and tc.character_id='seyeon' and tc.role='primary'
    and tc.joined_at<=t.committed_at and tc.left_at is null
  for share of t,um,am,tc;
  if not found then return; end if;
  return query select true;
end
$planner_pre_model$;

revoke all on function seyeon_private.qry_seyeon_planner_pre_model_source_v1(
  uuid,uuid,uuid,uuid,text,text
) from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function seyeon_private.qry_seyeon_planner_pre_model_source_v1(
  uuid,uuid,uuid,uuid,text,text
) to myeongha_seyeon_chat_runtime_owner;

commit;
