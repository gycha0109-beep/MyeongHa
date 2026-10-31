-- Watchtower-Track: security
-- SOURCE CANDIDATE ONLY. DO NOT APPLY AS A PRODUCTION MIGRATION.
-- This revision belongs to section 59 S4/G2 and is intentionally held outside
-- supabase/migrations until positive Source owner approval and DB race proof.
-- The previous reviewed G2 migration baseline stays byte-identical.
-- Watchtower-Track: security
-- S4/G2: original Grant revalidation directly on the actual
-- chat_turn_attempts validated -> committed transition. A separate
-- SELECT-before-COMMIT is not considered authoritative.
-- No new subject-linked tables or unowned deletion graph.
-- SOURCE ONLY / protected positive model and HTTP remain DISABLED.
begin;

-- Existing trigger runs on EVERY Commit path, including legacy direct
-- callers. The positive branch cannot be bypassed by skipping the wrapper.
create or replace function public.tr_seyeon_zero_source_pin_immutable_v1()
returns trigger
language plpgsql security invoker
set search_path=pg_catalog, public
as $pin_trigger$
declare
  v_positive jsonb;
  v_memory record;
  v_current_digest text;
  v_recent jsonb;
  v_recent_message jsonb;
  v_current_user record;
begin
  if old.seyeon_personal_source_pin_jsonb is not null and
     (old.seyeon_personal_source_pin_jsonb is distinct from
        new.seyeon_personal_source_pin_jsonb or
      old.seyeon_personal_source_pinned_at is distinct from
        new.seyeon_personal_source_pinned_at) then
    raise exception using errcode='23514',
      constraint='seyeon_source_pin_immutable',
      message='Se-yeon attempt source Pin cannot be changed';
  end if;
  if old.seyeon_personal_source_pin_jsonb is null and
     new.seyeon_personal_source_pin_jsonb is not null and
     (old.state <> 'running' or new.state <> 'running') then
    raise exception using errcode='23514',
      constraint='seyeon_source_pin_must_precede_generation',
      message='Se-yeon source Pin must precede model generation';
  end if;

  if old.state='validated' and new.state='committed' and
     new.planner_version='seyeon-production-chat-planner-v1' then
    if old.seyeon_personal_source_pin_jsonb #> '{zeroProof,records}'
          = '[]'::jsonb then
      -- Preserve 1640 zero-only acceptance exactly.
      if old.validation_result_jsonb -> 'personalRecordProvenance'
            is distinct from
            old.seyeon_personal_source_pin_jsonb -> 'zeroProof' then
        raise exception using errcode='23514',
          constraint='seyeon_commit_requires_original_zero_source_pin',
          message='Se-yeon zero Commit requires exact pinned provenance';
      end if;
    else
      v_positive:=old.seyeon_personal_source_pin_jsonb -> 'positiveProof';
      if old.seyeon_personal_source_pin_jsonb is null
         or jsonb_typeof(v_positive) is distinct from 'object'
         or (select count(*) from jsonb_object_keys(
              old.seyeon_personal_source_pin_jsonb
            ))<>1
         or v_positive ->> 'schemaVersion' is distinct from
              'seyeon-positive-original-memory-source-pin-v1'
         or v_positive ->> 'subjectId' is distinct from old.subject_id::text
         or v_positive ->> 'turnId' is distinct from old.turn_id::text
         or v_positive ->> 'attemptId' is distinct from old.id::text
         or v_positive ->> 'characterId' is distinct from 'seyeon'
         or v_positive ->> 'recordKind' is distinct from 'memory'
         or old.validation_result_jsonb -> 'personalRecordProvenance'
              is distinct from v_positive
      then
        raise exception using errcode='23514',
          constraint='seyeon_positive_g2_missing_original_pin',
          message='Positive Commit requires exact original immutable Pin';
      end if;

      -- If the new G1 recent-message certificate exists, recheck the
      -- exact original User text under this same actual Commit TX.
      -- Legacy staged positive attempts without the new certificate
      -- remain held by their existing distinct source policy.
      v_recent:=nullif(to_jsonb(old)->'seyeon_recent_source_pin_jsonb','null'::jsonb);
      if v_recent is not null then
        v_recent_message:=v_recent->'sources'->0;
        if v_recent->>'schemaVersion' is distinct from
             'seyeon-g1-recent-model-source-pin-v1'
           or v_recent->>'subjectId' is distinct from old.subject_id::text
           or v_recent->>'turnId' is distinct from old.turn_id::text
           or v_recent->>'attemptId' is distinct from old.id::text
           or v_recent->>'threadId' is distinct from v_positive->>'threadId'
           or jsonb_typeof(v_recent->'sources') is distinct from 'array'
           or jsonb_array_length(v_recent->'sources')<>1
           or v_recent_message->>'role' is distinct from 'user'
           or (v_recent_message->>'dbContentHash') is null
           or (v_recent_message->>'dbBodySha256')
               !~ '^sha256:v1:[a-f0-9]{64}$'
        then
          raise exception using errcode='23514',
            constraint='seyeon_positive_g2_recent_source_pin_invalid',
            message='G2 current User source certificate is invalid';
        end if;
        select msg.id,msg.body_text,msg.content_hash
          into v_current_user
        from public.conversation_messages msg
        where msg.id=(v_recent_message->>'messageId')::uuid
          and msg.subject_id=old.subject_id
          and msg.thread_id=(v_recent->>'threadId')::uuid
          and msg.turn_id=old.turn_id
          and msg.sender_type='user'
          and msg.redacted_at is null and msg.body_text is not null
        for share of msg;
        if not found or
           v_current_user.content_hash is distinct from
             v_recent_message->>'dbContentHash'
           or 'sha256:v1:'||
             encode(sha256(convert_to(v_current_user.body_text,'UTF8')),'hex')
               is distinct from v_recent_message->>'dbBodySha256' then
          raise exception using errcode='23514',
            constraint='seyeon_positive_g2_recent_source_changed',
            message='Original User message changed since model Pin';
        end if;
      end if;

      perform 1
        from public.seyeon_positive_source_type_registry_v1 reg
      where reg.record_kind='memory' and reg.enabled
        and reg.record_type=v_positive ->> 'recordType'
        and reg.schema_version=v_positive ->> 'recordSchemaVersion'
        and reg.projector_version=v_positive ->> 'projectorVersion'
      -- This is a CURRENT permission, not a former approval snapshot.
      -- Hold the enabled type contract under a row SHARE lock across
      -- the same actual v2 assistant+Outbox Commit transaction. Disabling
      -- inference after G1 must not race past a stale G2 registry read.
      for share of reg;
      if not found then
        raise exception using errcode='23514',
          constraint='seyeon_positive_g2_type_unregistered',
          message='Positive Memory type no longer has an active contract';
      end if;

      -- Lock the very same original Grant and Memory inside the Commit TX,
      -- rejecting revoke/regrant or altered source content (not "any grant").
      perform seyeon_private.lock_original_memory_grant_v1(
        old.subject_id,(v_positive->>'recordId')::uuid,
        (v_positive->>'originalGrantId')::uuid
      );
      select m.content_jsonb,g.granted_at into v_memory
      from public.record_access_grants g
      join public.memory_items m
        on m.id=g.memory_item_id and m.subject_id=g.subject_id
      where g.id=(v_positive->>'originalGrantId')::uuid
        and g.subject_id=old.subject_id
        and g.memory_item_id=(v_positive->>'recordId')::uuid
        and g.life_fact_id is null
        and g.grantee_character_id='seyeon'
        and g.grant_reason='user_choice' and g.revoked_at is null
        and m.revoked_at is null and m.source_kind='user_approved'
        and m.memory_type=v_positive->>'recordType'
        and m.schema_version=v_positive->>'recordSchemaVersion'
      ;
      if not found or v_memory.granted_at::text is distinct from
            (v_positive->>'originalGrantedAt')::timestamptz::text then
        raise exception using errcode='23514',
          constraint='seyeon_positive_g2_original_grant_revoked',
          message='Current original Grant and Memory do not match G1';
      end if;
      v_current_digest:='sha256:pg-jsonb:v1:'||
        encode(sha256(convert_to(v_memory.content_jsonb::text,'UTF8')),'hex');
      if v_current_digest is distinct from
           v_positive ->> 'originalPgJsonbDigest' then
        raise exception using errcode='23514',
          constraint='seyeon_positive_g2_source_payload_changed',
          message='Original source changed between Pin and Commit';
      end if;
    end if;
  end if;
  return new;
end
$pin_trigger$;

-- Keep the original 1640 trigger's SECURITY INVOKER boundary. The
-- existing Chat SEC-DEFINER Commit runs it as the restricted runtime
-- owner; test-only positive schema functions retain their own ACL.
create function public.cmd_commit_seyeon_positive_chat_turn_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_user_message_id uuid,
  p_message_id uuid,p_chat_outbox_event_id uuid,
  p_post_turn_outbox_event_id uuid,p_post_turn_snapshot_jsonb jsonb,
  p_post_turn_snapshot_hash text,p_selected_sources_digest text,
  p_final_model_context_digest text
)
returns table(
  turn_id uuid,attempt_id uuid,assistant_message_id uuid,
  sequence_no bigint,committed_at timestamptz,
  post_turn_outbox_event_id uuid,replayed boolean
)
language plpgsql security definer
set search_path=pg_catalog, public
as $g2$
declare
  v_positive jsonb;
  v_validated_provenance jsonb;
  v_commit record;
  v_original_user_message_id text;
  v_original_user_count bigint;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_turn_id is null or p_attempt_id is null
     or p_user_message_id is null or p_message_id is null or p_chat_outbox_event_id is null
     or p_post_turn_outbox_event_id is null
     or p_selected_sources_digest is null
     or p_final_model_context_digest is null
     or p_selected_sources_digest !~ '^sha256:v1:[a-f0-9]{64}$'
     or p_final_model_context_digest !~ '^sha256:v1:[a-f0-9]{64}$'
  then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g2_invalid_correlation',
      message='G2 requires original validated source identity';
  end if;
  -- Canonical lock order matches existing chat flow. Trigger still
  -- independently locks/rechecks Record+Grant during the actual Commit.
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  perform 1 from public.chat_turns t
  where t.id=p_turn_id and t.thread_id=p_thread_id
    and t.subject_id=p_subject_id and t.state='validated'
  for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g2_turn_invalid',
      message='Positive G2 requires original validated Turn';
  end if;

  -- The Post-turn Snapshot must belong to THIS DB-original User message,
  -- not another message with an attacker-recalculated snapshot SHA.
  -- The parent Turn FOR UPDATE above serializes dependent inserts.
  -- This owner intentionally has SELECT but no UPDATE privilege on
  -- conversation_messages; do not expand ACL just to read the original ID.
  -- Existing DB receiver/Commit functions own that Message's lifecycle.
  select msg.id::text into v_original_user_message_id
  from public.conversation_messages msg
  where msg.subject_id=p_subject_id and msg.thread_id=p_thread_id
    and msg.turn_id=p_turn_id and msg.sender_type='user'
    and msg.redacted_at is null;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g2_original_user_message_mismatch',
      message='Positive G2 requires the DB-original User message';
  end if;
  select count(*) into v_original_user_count
  from public.conversation_messages msg
  where msg.subject_id=p_subject_id and msg.thread_id=p_thread_id
    and msg.turn_id=p_turn_id and msg.sender_type='user'
    and msg.redacted_at is null;
  if v_original_user_count <> 1
     or v_original_user_message_id is distinct from p_user_message_id::text
     or jsonb_typeof(p_post_turn_snapshot_jsonb) is distinct from 'object'
     or p_post_turn_snapshot_jsonb->>'turnId' is distinct from p_turn_id::text
     or p_post_turn_snapshot_jsonb->>'assistantMessageId'
         is distinct from p_message_id::text
     or p_post_turn_snapshot_jsonb->>'userMessageId'
         is distinct from v_original_user_message_id then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g2_original_user_message_mismatch',
      message='Positive G2 Snapshot is not bound to the DB-original User message';
  end if;

  -- The Attempt's immutable G1 Pin must be precisely the one validated
  -- by its model/renderer stage. A source hash alone does not bind a G1
  -- original Grant, Record, Character, or current Attempt to this Commit.
  -- Keep the Attempt FOR UPDATE held through the v2 Commit/Outbox.
  select a.seyeon_personal_source_pin_jsonb -> 'positiveProof',
         a.validation_result_jsonb -> 'personalRecordProvenance'
    into v_positive, v_validated_provenance
  from public.chat_turn_attempts a
  where a.id=p_attempt_id and a.subject_id=p_subject_id
    and a.turn_id=p_turn_id and a.state='validated'
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pinned_at is not null
    and a.seyeon_personal_source_pin_jsonb
      = jsonb_build_object(
          'positiveProof',
          a.seyeon_personal_source_pin_jsonb -> 'positiveProof'
        )
  for update;
  if not found or jsonb_typeof(v_positive) is distinct from 'object'
     or v_validated_provenance is distinct from v_positive
     or v_positive ->> 'schemaVersion' is distinct from
       'seyeon-positive-original-memory-source-pin-v1'
     or v_positive ->> 'subjectId' is distinct from p_subject_id::text
     or v_positive ->> 'threadId' is distinct from p_thread_id::text
     or v_positive ->> 'turnId' is distinct from p_turn_id::text
     or v_positive ->> 'attemptId' is distinct from p_attempt_id::text
     or v_positive ->> 'characterId' is distinct from 'seyeon'
     or v_positive ->> 'recordKind' is distinct from 'memory'
     or v_positive ->> 'selectedSourcesDigest'
       is distinct from p_selected_sources_digest
     or v_positive ->> 'finalModelContextDigest'
       is distinct from p_final_model_context_digest then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g2_model_source_mismatch',
      message='Positive G2 cannot change original exact model sources';
  end if;

  -- Existing v2 Commit performs the assistant and both Outbox writes in
  -- THIS invocation. Trigger protects all commit paths against bypass.
  select * into strict v_commit
  from public.cmd_commit_seyeon_chat_turn_runtime_v2(
    p_subject_id,p_thread_id,p_turn_id,p_attempt_id,p_message_id,
    p_chat_outbox_event_id,p_post_turn_outbox_event_id,
    p_post_turn_snapshot_jsonb,p_post_turn_snapshot_hash
  );
  if v_commit.replayed is distinct from false then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g2_replay_unauthorized',
      message='No historical Positive Commit may be reauthorized';
  end if;
  -- A successful v2 call is not a license to return a Commit receipt from
  -- another Turn, Attempt, Assistant or post-turn Outbox. A mismatch rolls
  -- back the assistant and both Outbox writes in this SAME transaction.
  if v_commit.turn_id is distinct from p_turn_id
     or v_commit.attempt_id is distinct from p_attempt_id
     or v_commit.assistant_message_id is distinct from p_message_id
     or v_commit.post_turn_outbox_event_id
          is distinct from p_post_turn_outbox_event_id
     or v_commit.sequence_no is null or v_commit.sequence_no < 1
     or v_commit.committed_at is null then
    raise exception using errcode='23514',
      constraint='seyeon_positive_g2_commit_receipt_mismatch',
      message='Positive G2 DB Commit receipt lost the pinned source identity';
  end if;
  return query select v_commit.turn_id,v_commit.attempt_id,
    v_commit.assistant_message_id,v_commit.sequence_no,
    v_commit.committed_at,v_commit.post_turn_outbox_event_id,false;
end
$g2$;

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_commit_seyeon_positive_chat_turn_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text
) owner to myeongha_seyeon_chat_runtime_owner;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke all on function public.cmd_commit_seyeon_positive_chat_turn_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text
) from public,anon,authenticated,service_role;

-- Complete function ACL changes before dropping temporary owner authority.
revoke myeongha_seyeon_chat_runtime_owner from current_user;

-- No EXECUTE to the API login. Until the authorized type/codec and G3
-- contracts exist, positive Provider/HTTP remain impossible.
commit;
