-- Watchtower-Track: security
-- Scoped G3 first-response foundation: ONLY the first zero-source, no-derived
-- Seyeon Member Turn. Never authorizes positive Grants, historical chat,
-- committed replay without a fresh lock, Reader material or streaming.
-- This function is not mounted on the deployed Vercel Fetch route.
begin;

-- This narrowly scoped SECURITY DEFINER requires the existing Postgres table
-- owner to see *all* historical rows: RLS-filtered absence is NOT evidence.
do $preflight$
begin
  if current_user <> 'postgres'
     or pg_catalog.to_regprocedure(
       'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.assert_myeongha_subject_context_v1(uuid)'
     ) is null
  then
    raise exception 'Locked zero-source Reveal requires existing authoritative PostgreSQL owner and Seyeon scope functions';
  end if;
end
$preflight$;

create function public.qry_seyeon_locked_first_zero_source_reveal_v1(
  p_subject_id uuid, p_thread_id uuid, p_turn_id uuid, p_attempt_id uuid
) returns table (assistant_text text)
language plpgsql security definer
set search_path=pg_catalog,public
set row_security=off
as $first_zero_reveal$
begin
  if p_subject_id is null or p_thread_id is null
     or p_turn_id is null or p_attempt_id is null then
    return;
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(
    p_subject_id,p_thread_id
  );

  -- Hold the canonical Subject, Turn, immutable Attempt and exact committed
  -- assistant message until the caller finishes the controlled Node send.
  -- All absence checks run as the trusted table owner with RLS disabled:
  -- invisible rows must never be mistaken for "no derived sources".
  return query
  select msg.body_text
  from public.subjects subj
  join public.chat_turns t
    on t.subject_id=subj.id
  join public.chat_turn_attempts a
    on a.subject_id=t.subject_id and a.turn_id=t.id
  join public.conversation_messages msg
    on msg.id=a.committed_message_id
   and msg.turn_id=t.id and msg.thread_id=t.thread_id
   and msg.subject_id=t.subject_id
  where subj.id=p_subject_id
    and subj.kind='member'
    and subj.status='active'
    and subj.merged_into_subject_id is null
    and t.id=p_turn_id
    and t.thread_id=p_thread_id
    and t.state in ('committed','delivered')
    and t.committed_attempt_id=p_attempt_id
    -- The canonical DB participant set must be exactly one active Seyeon.
    -- Caller-supplied Character text can never establish this scope.
    and exists (
      select 1 from public.conversation_thread_characters sc
      where sc.thread_id=p_thread_id
        and sc.character_id='seyeon' and sc.left_at is null
    )
    and not exists (
      select 1 from public.conversation_thread_characters other_sc
      where other_sc.thread_id=p_thread_id
        and other_sc.left_at is null
        and other_sc.character_id <> 'seyeon'
    )
    and a.id=p_attempt_id
    and a.state='committed'
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pinned_at is not null
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'schemaVersion'
        ='seyeon-attempt-zero-personal-proof-v1'
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'recordState'
        ='explicit_zero_admitted'
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'characterId'
        ='seyeon'
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'subjectId'
        =p_subject_id::text
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'threadId'
        =p_thread_id::text
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'turnId'
        =p_turn_id::text
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'attemptId'
        =p_attempt_id::text
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->'records'='[]'::jsonb
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->'recordCount'='0'::jsonb
    and a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'unsupportedSchemaCount'='0'
    and a.seyeon_personal_source_pin_jsonb->'exactModelSourceSelection'->'selectedSources'='[]'::jsonb
    and a.seyeon_personal_source_pin_jsonb->'exactModelSourceSelection'->>'selectedMemoryCount'='0'
    and a.validation_result_jsonb->'personalRecordProvenance'
      =a.seyeon_personal_source_pin_jsonb->'zeroProof'
    and msg.sender_type='character'
    and msg.redacted_at is null
    and msg.body_text is not null
    and length(btrim(msg.body_text))>0
    and msg.body_text=a.generated_body_text
    -- Exactly one User + one committed Assistant message; NO prior context.
    and (
      select count(*) from public.conversation_messages previous
      where previous.subject_id=p_subject_id
        and previous.thread_id=p_thread_id
    )=2
    and exists (
      select 1 from public.conversation_messages own_message
      where own_message.subject_id=p_subject_id
        and own_message.thread_id=p_thread_id
        and own_message.turn_id=p_turn_id
        and own_message.sender_type='user'
        and own_message.redacted_at is null
    )
    and not exists (
      select 1 from public.conversation_messages other
      where other.subject_id=p_subject_id
        and other.thread_id=p_thread_id
        and other.turn_id is distinct from p_turn_id
    )
    -- Prior relationship/revision content is always HOLD until exact derived
    -- lineage and original Grant authority become first-class in the DB.
    and not exists (
      select 1 from public.relationship_events h
      where h.subject_id=p_subject_id and h.character_id='seyeon'
    )
    and not exists (
      select 1 from public.relationship_event_records h
      where h.subject_id=p_subject_id and h.character_id='seyeon'
    )
    and not exists (
      select 1 from public.relationship_history_entries h
      where h.subject_id=p_subject_id and h.character_id='seyeon'
    )
  for share of subj,t,a,msg;
end
$first_zero_reveal$;

-- The runtime uses this only inside its canonical Member Subject transaction.
-- No public/authenticated/service_role capability and no raw table SELECT.
revoke all on function public.qry_seyeon_locked_first_zero_source_reveal_v1(
  uuid,uuid,uuid,uuid
) from public;
do $revoke_direct$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
      where rolname in ('anon','authenticated','service_role') loop
    execute format(
      'revoke all on function public.qry_seyeon_locked_first_zero_source_reveal_v1(uuid,uuid,uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$revoke_direct$;
grant execute on function public.qry_seyeon_locked_first_zero_source_reveal_v1(
  uuid,uuid,uuid,uuid
) to myeongha_api_executor;

comment on function public.qry_seyeon_locked_first_zero_source_reveal_v1(
  uuid,uuid,uuid,uuid
) is 'Zero-source-only first Member turn, locked read for Node socket handoff; G3 positive/historical/Vercel Fetch HOLD';

commit;
