-- Watchtower-Track: security
-- Staged/no-install G3 atomic OFF cleanup: never SELECT or return body_text.
-- This is not an original Grant, derived provenance or positive Worker permit.
-- Not included in plan.mjs, production migration or runtime activation.
grant myeongha_seyeon_post_turn_owner to current_user;
grant create on schema public to myeongha_seyeon_post_turn_owner;

create function public.cmd_seyeon_post_turn_complete_off_without_text_v1(
  p_subject_id uuid, p_outbox_event_id uuid,
  p_lock_owner text, p_lease_expires_at timestamptz
)
returns table (
  outbox_event_id uuid, status text, processed_at timestamptz,
  reclaimed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $post_turn_off_cleanup$
declare
  v_row public.outbox_events%rowtype;
  v_claim record;
  v_done record;
  v_turn uuid;
  v_attempt uuid;
  v_user uuid;
  v_assistant uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_outbox_event_id is null or p_lock_owner is null
     or btrim(p_lock_owner)='' or p_lease_expires_at is null then
    raise exception using
      errcode='23514',
      constraint='seyeon_post_turn_off_cleanup_identity_invalid',
      message='OFF cleanup identity required';
  end if;

  -- This FOR UPDATE row lock spans admission, claim and completion.
  -- It prevents a simultaneous mode/checkpoint rewrite before the claim.
  select oe.* into v_row
  from public.outbox_events oe
  where oe.id=p_outbox_event_id
  for update;

  if not found
     or v_row.status not in ('pending','processing')
     or v_row.aggregate_type is distinct from 'chat_turn'
     or v_row.event_type is distinct from 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
     or v_row.event_schema_version is distinct from 'v1'
     or v_row.dedupe_key is distinct from 'seyeon-post-turn-v1'
     or v_row.payload_jsonb->>'schemaVersion'
          is distinct from 'seyeon-post-turn-analysis-request-v1'
     or v_row.payload_jsonb->>'subjectId' is distinct from p_subject_id::text
     or v_row.payload_jsonb->>'characterId' is distinct from 'seyeon'
     or v_row.payload_jsonb #>> '{snapshot,schemaVersion}'
          is distinct from 'seyeon-post-turn-analysis-snapshot-v1'
     or v_row.payload_jsonb #>> '{snapshot,mode}' is distinct from 'OFF'
     or v_row.payload_jsonb ? 'analysisCheckpoint'
     or v_row.payload_jsonb->>'snapshotHash' is null then
    raise exception using
      errcode='23514',
      constraint='seyeon_post_turn_off_cleanup_not_admitted',
      message='Only an uncheckpointed OFF analysis may be cleaned';
  end if;

  v_turn := (v_row.payload_jsonb->>'turnId')::uuid;
  v_attempt := (v_row.payload_jsonb->>'attemptId')::uuid;
  v_user := (v_row.payload_jsonb->>'userMessageId')::uuid;
  v_assistant := (v_row.payload_jsonb->>'assistantMessageId')::uuid;

  if v_row.aggregate_id is distinct from v_turn::text
     or v_row.payload_jsonb #>> '{snapshot,turnId}'
        is distinct from v_turn::text
     or v_row.payload_jsonb #>> '{snapshot,userMessageId}'
        is distinct from v_user::text
     or v_row.payload_jsonb #>> '{snapshot,assistantMessageId}'
        is distinct from v_assistant::text
     or not exists (
       select 1
       from public.chat_turns t
       join public.chat_turn_attempts a
         on a.id=v_attempt and a.turn_id=t.id and a.subject_id=t.subject_id
        and a.state='committed' and a.committed_message_id=v_assistant
       join public.conversation_messages um
         on um.id=v_user and um.subject_id=t.subject_id and um.turn_id=t.id
        and um.sender_type='user' and um.redacted_at is null
       join public.conversation_messages am
         on am.id=v_assistant and am.subject_id=t.subject_id and am.turn_id=t.id
        and am.sender_type='character' and am.redacted_at is null
       join public.conversation_thread_characters ctc
         on ctc.id=am.thread_character_id and ctc.thread_id=am.thread_id
        and ctc.character_id='seyeon'
       where t.id=v_turn and t.subject_id=p_subject_id
         and t.state in ('committed','delivered')
         and t.committed_attempt_id=v_attempt
         and t.committed_at is not null
     ) then
    raise exception using
      errcode='23514',
      constraint='seyeon_post_turn_off_cleanup_turn_invalid',
      message='OFF cleanup has no authoritative committed turn';
  end if;

  -- Claim+complete happen in this single owner transaction. No private
  -- message text or prompt material crosses the SQL-to-Node boundary.
  select * into strict v_claim from public.cmd_claim_outbox_event_v1(
    p_outbox_event_id,p_lock_owner,p_lease_expires_at
  );
  select * into strict v_done from public.cmd_complete_outbox_event_v1(
    p_outbox_event_id,p_lock_owner
  );
  if v_done.status is distinct from 'processed' then
    raise exception using
      errcode='23514',
      constraint='seyeon_post_turn_off_cleanup_complete_invalid',
      message='OFF cleanup completion failed';
  end if;
  return query select v_done.outbox_event_id,v_done.status,
                      v_done.processed_at,v_claim.reclaimed;
end
$post_turn_off_cleanup$;

alter function public.cmd_seyeon_post_turn_complete_off_without_text_v1(
  uuid,uuid,text,timestamptz
) owner to myeongha_seyeon_post_turn_owner;
revoke create on schema public from myeongha_seyeon_post_turn_owner;
revoke all on function public.cmd_seyeon_post_turn_complete_off_without_text_v1(
  uuid,uuid,text,timestamptz
) from public,anon,authenticated,service_role;
grant execute on function public.cmd_seyeon_post_turn_complete_off_without_text_v1(
  uuid,uuid,text,timestamptz
) to myeongha_api_executor;
revoke myeongha_seyeon_post_turn_owner from current_user;
