-- Watchtower-Track: security
-- W48 isolated S0 only: positive historical evidence is NOT a model/Commit/Reveal grant.
begin;
grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.cmd_pin_seyeon_historical_source_candidate_s0_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_current_user_id uuid,p_original_memory_id uuid,p_original_grant_id uuid,
  p_record_type text,p_schema_version text,p_projector_version text,
  p_current_user_digest text,p_original_pg_digest text,
  p_selected_sources_digest text,p_projected_memory_digest text,
  p_pre_model_context_digest text,
  p_expected_final_model_context_digest text,p_expected_historical jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public
as $history_pin$
declare
  v_user record;
  v_original record;
  v_source_turn_id uuid;
  v_row record;
  v_n integer:=0;
  v_current_count integer;
  v_required integer;
  v_history jsonb:='[]'::jsonb;
  v_assistant_originals jsonb:='[]'::jsonb;
  v_assistant_pin jsonb;
  v_assistant_attempt uuid;
  v_assistant_user record;
  v_proof jsonb;
  v_replayed boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_turn_id is null or p_attempt_id is null
    or p_current_user_id is null or p_original_memory_id is null
    or p_original_grant_id is null
    or nullif(btrim(p_record_type),'') is null
    or nullif(btrim(p_schema_version),'') is null
    or nullif(btrim(p_projector_version),'') is null
    or p_current_user_digest !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_original_pg_digest !~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
    or p_selected_sources_digest !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_projected_memory_digest !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_pre_model_context_digest !~ '^sha256:v1:[a-f0-9]{64}    or jsonb_typeof(p_expected_historical) is distinct from 'array'
    or jsonb_array_length(p_expected_historical) not between 1 and 23 then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_invalid',
      message='Historical context candidate requires exact bounded original sources';
  end if;
  v_required:=jsonb_array_length(p_expected_historical)+1;
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
    where reg.record_kind='memory' and reg.enabled
      and reg.record_type=p_record_type and reg.schema_version=p_schema_version
      and reg.projector_version=p_projector_version
    for share of reg;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_type_disabled';
  end if;

  perform 1 from public.chat_turns t
    where t.id=p_turn_id and t.subject_id=p_subject_id
      and t.thread_id=p_thread_id and t.state='planned'
    for update of t;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_turn_invalid';
  end if;
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(
    p_subject_id,p_thread_id
  );
  perform 1 from public.chat_turn_attempts a
    where a.id=p_attempt_id and a.subject_id=p_subject_id
      and a.turn_id=p_turn_id and a.state='running'
      and a.planner_version='seyeon-production-chat-planner-v1'
      and a.seyeon_personal_source_pin_jsonb is null
    for update of a;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_attempt_invalid';
  end if;

  select count(*) into v_current_count
  from public.conversation_messages m
  where m.subject_id=p_subject_id and m.thread_id=p_thread_id
    and m.turn_id=p_turn_id;
  if v_current_count<>1 then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_current_count';
  end if;
  perform seyeon_private.lock_memory_source_message_v1(
    p_subject_id,p_turn_id,p_current_user_id
  );
  select m.id,m.body_text into v_user
  from public.conversation_messages m
  where m.id=p_current_user_id and m.subject_id=p_subject_id
    and m.thread_id=p_thread_id and m.turn_id=p_turn_id
    and m.sender_type='user' and m.thread_character_id is null
    and m.character_content_bundle_id is null and m.redacted_at is null
    and m.body_text is not null and length(btrim(m.body_text))>0
    and nullif(btrim(m.content_hash),'') is not null;
  if not found or p_current_user_digest is distinct from
      'sha256:wire-utf8:v1:'||
      encode(sha256(convert_to(v_user.body_text,'UTF8')),'hex') then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_current_user_changed';
  end if;

  -- G0 owner rechecks every selected source's original authority and Grant.
  -- The full window is compared in one transaction, not a filtered subset.
  for v_row in select * from
    public.qry_seyeon_g0_current_source_recent_messages_v1(
      p_subject_id,p_thread_id,p_current_user_id,v_required
    ) order by sequence_no
  loop
    v_n:=v_n+1;
    select m.turn_id into v_source_turn_id
    from public.conversation_messages m
    where m.id=v_row.message_id and m.subject_id=p_subject_id
      and m.thread_id=p_thread_id;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_history_candidate_source_missing';
    end if;
    perform seyeon_private.lock_memory_source_message_v1(
      p_subject_id,v_source_turn_id,v_row.message_id
    );
    perform 1 from public.conversation_messages m
      where m.id=v_row.message_id and m.subject_id=p_subject_id
        and m.thread_id=p_thread_id and m.turn_id=v_source_turn_id
        and m.redacted_at is null and m.body_text=v_row.body_text;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_history_candidate_source_changed';
    end if;
    if v_n=v_required then
      if v_row.message_id is distinct from p_current_user_id
        or v_row.sender_type is distinct from 'user'
        or v_row.character_id is not null
        or v_row.body_text is distinct from v_user.body_text then
        raise exception using errcode='23514',
          constraint='seyeon_history_candidate_current_not_final';
      end if;
    else
      if v_row.message_id=p_current_user_id
        or (v_row.sender_type='user' and v_row.character_id is not null)
        or (v_row.sender_type='character'
          and v_row.character_id is distinct from 'seyeon')
        or v_row.sender_type not in ('user','character') then
        raise exception using errcode='23514',
          constraint='seyeon_history_candidate_unauthorized_source';
      end if;
      v_history:=v_history||jsonb_build_array(jsonb_build_object(
        'messageId',v_row.message_id::text,
        'role',case when v_row.sender_type='user' then 'user' else 'assistant' end,
        'textDigest','sha256:wire-utf8:v1:'||
          encode(sha256(convert_to(v_row.body_text,'UTF8')),'hex')
      ));
      -- G1 evidence only: persist the DB-owned original Memory/Grant chain
      -- for each *verified* historical Assistant. The G0 reader above
      -- already locks/checks the exact old Grant, never a replacement.
      -- Historical User rows have no inferred personal-record provenance.
      if v_row.sender_type='character' then
        select a.seyeon_personal_source_pin_jsonb->'positiveProof',a.id
          into v_assistant_pin,v_assistant_attempt
        from public.conversation_messages m
        join public.chat_turns t
          on t.id=m.turn_id and t.subject_id=m.subject_id
          and t.thread_id=m.thread_id and t.committed_at is not null
          and t.state in ('committed','delivered')
        join public.chat_turn_attempts a
          on a.id=t.committed_attempt_id and a.turn_id=t.id
          and a.subject_id=t.subject_id and a.state='committed'
          and a.committed_message_id=m.id
        where m.id=v_row.message_id and m.subject_id=p_subject_id
          and m.thread_id=p_thread_id and m.turn_id=v_source_turn_id
          and m.sender_type='character' and m.redacted_at is null
          and a.seyeon_personal_source_pinned_at is not null
          and a.seyeon_personal_source_pin_jsonb=jsonb_build_object(
            'positiveProof',a.seyeon_personal_source_pin_jsonb->'positiveProof')
          and a.validation_result_jsonb->'personalRecordProvenance'
            =a.seyeon_personal_source_pin_jsonb->'positiveProof';
        if not found or jsonb_typeof(v_assistant_pin) is distinct from 'object'
          or v_assistant_pin->>'subjectId' is distinct from p_subject_id::text
          or v_assistant_pin->>'threadId' is distinct from p_thread_id::text
          or v_assistant_pin->>'turnId' is distinct from v_source_turn_id::text
          or v_assistant_pin->>'attemptId' is distinct from v_assistant_attempt::text
          or v_assistant_pin->>'characterId' is distinct from 'seyeon'
          or v_assistant_pin->>'recordKind' is distinct from 'memory'
          or v_assistant_pin->>'recordId' is null
          or v_assistant_pin->>'originalGrantId' is null
          -- G0 has already locked this exact old Grant and compared its
          -- real granted_at, but the historical G1 lineage must retain the
          -- same issuance instant for downstream exact-authority proofs.
          or v_assistant_pin->>'originalGrantedAt' is null
          or v_assistant_pin->>'originalGrantedAt' !~
            '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          or v_assistant_pin->>'currentUserMessageId'
            !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
          or v_assistant_pin->>'currentUserTextDigest'
            !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
          or v_assistant_pin->>'originalPgJsonbDigest'
            !~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
          or v_assistant_pin->>'historicalSourceCount' is distinct from '0'
        then
          raise exception using errcode='23514',
            constraint='seyeon_history_candidate_assistant_original_missing';
        end if;
        -- A historical Assistant's claimed original User must still be the
        -- committed Member-authored message from that SAME Turn. A digest
        -- copied from a former positiveProof alone is not original authority.
        perform seyeon_private.assert_current_original_member_user_message_v1(
          p_subject_id,p_thread_id,
          (v_assistant_pin->>'currentUserMessageId')::uuid
        );
        select m.id,m.body_text into v_assistant_user
        from public.conversation_messages m
        where m.id=(v_assistant_pin->>'currentUserMessageId')::uuid
          and m.subject_id=p_subject_id and m.thread_id=p_thread_id
          and m.turn_id=v_source_turn_id and m.sender_type='user'
          and m.thread_character_id is null
          and m.character_content_bundle_id is null
          and m.redacted_at is null and m.body_text is not null
          and nullif(btrim(m.content_hash),'') is not null;
        if not found or v_assistant_pin->>'currentUserTextDigest'
          is distinct from 'sha256:wire-utf8:v1:'||
            encode(sha256(convert_to(v_assistant_user.body_text,'UTF8')),'hex')
        then
          raise exception using errcode='23514',
            constraint='seyeon_history_candidate_assistant_user_origin_changed';
        end if;
        v_assistant_originals:=v_assistant_originals||jsonb_build_array(
          jsonb_build_object(
            'messageId',v_row.message_id::text,
            'turnId',v_source_turn_id::text,
            'attemptId',v_assistant_attempt::text,
            'originalUserMessageId',v_assistant_pin->>'currentUserMessageId',
            'originalUserTextDigest',v_assistant_pin->>'currentUserTextDigest',
            'recordId',v_assistant_pin->>'recordId',
            'originalGrantId',v_assistant_pin->>'originalGrantId',
            'originalGrantedAt',v_assistant_pin->>'originalGrantedAt',
            'originalPgJsonbDigest',v_assistant_pin->>'originalPgJsonbDigest',
            'recordType',v_assistant_pin->>'recordType',
            'recordSchemaVersion',v_assistant_pin->>'recordSchemaVersion',
            'projectorVersion',v_assistant_pin->>'projectorVersion'
          )
        );
      end if;
    end if;
  end loop;
  if v_n<>v_required or v_history is distinct from p_expected_historical then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_manifest_mismatch';
  end if;

  perform seyeon_private.lock_original_memory_grant_v1(
    p_subject_id,p_original_memory_id,p_original_grant_id
  );
  select g.granted_at,m.content_jsonb into v_original
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=p_original_grant_id and g.subject_id=p_subject_id
    and g.memory_item_id=p_original_memory_id and g.life_fact_id is null
    and g.grantee_character_id='seyeon' and g.grant_reason='user_choice'
    -- The private lock above already verifies pending withdrawal under SHARE;
    -- this SELECT-only owner cannot read the internal withdrawal timestamp.
    and g.revoked_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type=p_record_type and m.schema_version=p_schema_version;
  if not found or p_original_pg_digest is distinct from
    'sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_original.content_jsonb::text,'UTF8')),'hex') then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_original_grant_changed';
  end if;

  -- Deliberately NOT 'positiveProof'. Existing G2/G3 reject this shape.
  v_proof:=jsonb_build_object(
    'schemaVersion','seyeon-g1-historical-source-candidate-v4',
    'subjectId',p_subject_id::text,'threadId',p_thread_id::text,
    'turnId',p_turn_id::text,'attemptId',p_attempt_id::text,
    'characterId','seyeon','currentUserMessageId',v_user.id::text,
    'currentUserTextDigest',p_current_user_digest,
    'recordKind','memory','recordId',p_original_memory_id::text,
    'originalGrantId',p_original_grant_id::text,
    'originalGrantedAt',v_original.granted_at,
    'recordType',p_record_type,'recordSchemaVersion',p_schema_version,
    'projectorVersion',p_projector_version,
    'originalPgJsonbDigest',p_original_pg_digest,
    'selectedSourcesDigest',p_selected_sources_digest,
    'projectedMemoryDigest',p_projected_memory_digest,
    'preModelContextDigest',p_pre_model_context_digest,
    'expectedFinalModelContextDigest',p_expected_final_model_context_digest,
    'historicalSourceCount',jsonb_array_length(v_history),
    'historicalSources',v_history,
    'historicalSourceCensusDigest','sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_history::text,'UTF8')),'hex'),
    'historicalAssistantOriginalSources',v_assistant_originals,
    'historicalAssistantOriginalSourcesDigest','sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_assistant_originals::text,'UTF8')),'hex'),
    'authorizesModel',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
  update public.chat_turn_attempts
  set seyeon_personal_source_pin_jsonb=
        jsonb_build_object('historicalCandidateProof',v_proof),
      seyeon_personal_source_pinned_at=clock_timestamp()
  where id=p_attempt_id and subject_id=p_subject_id
    and turn_id=p_turn_id and state='running';
  v_replayed:=public.cmd_mark_chat_turn_context_ready_v1(
    p_subject_id,p_turn_id,p_attempt_id
  );
  if v_replayed then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_unexpected_replay';
  end if;
  return v_proof;
end
$history_pin$;

alter function seyeon_private.cmd_pin_seyeon_historical_source_candidate_s0_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,
  text,text,text,text,text,text,text,text,text,jsonb
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.cmd_pin_seyeon_historical_source_candidate_s0_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,
  text,text,text,text,text,text,text,text,text,jsonb
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;

    or p_expected_final_model_context_digest !~ '^sha256:v1:[a-f0-9]{64}    or jsonb_typeof(p_expected_historical) is distinct from 'array'
    or jsonb_array_length(p_expected_historical) not between 1 and 23 then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_invalid',
      message='Historical context candidate requires exact bounded original sources';
  end if;
  v_required:=jsonb_array_length(p_expected_historical)+1;
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
    where reg.record_kind='memory' and reg.enabled
      and reg.record_type=p_record_type and reg.schema_version=p_schema_version
      and reg.projector_version=p_projector_version
    for share of reg;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_type_disabled';
  end if;

  perform 1 from public.chat_turns t
    where t.id=p_turn_id and t.subject_id=p_subject_id
      and t.thread_id=p_thread_id and t.state='planned'
    for update of t;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_turn_invalid';
  end if;
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(
    p_subject_id,p_thread_id
  );
  perform 1 from public.chat_turn_attempts a
    where a.id=p_attempt_id and a.subject_id=p_subject_id
      and a.turn_id=p_turn_id and a.state='running'
      and a.planner_version='seyeon-production-chat-planner-v1'
      and a.seyeon_personal_source_pin_jsonb is null
    for update of a;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_attempt_invalid';
  end if;

  select count(*) into v_current_count
  from public.conversation_messages m
  where m.subject_id=p_subject_id and m.thread_id=p_thread_id
    and m.turn_id=p_turn_id;
  if v_current_count<>1 then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_current_count';
  end if;
  perform seyeon_private.lock_memory_source_message_v1(
    p_subject_id,p_turn_id,p_current_user_id
  );
  select m.id,m.body_text into v_user
  from public.conversation_messages m
  where m.id=p_current_user_id and m.subject_id=p_subject_id
    and m.thread_id=p_thread_id and m.turn_id=p_turn_id
    and m.sender_type='user' and m.thread_character_id is null
    and m.character_content_bundle_id is null and m.redacted_at is null
    and m.body_text is not null and length(btrim(m.body_text))>0
    and nullif(btrim(m.content_hash),'') is not null;
  if not found or p_current_user_digest is distinct from
      'sha256:wire-utf8:v1:'||
      encode(sha256(convert_to(v_user.body_text,'UTF8')),'hex') then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_current_user_changed';
  end if;

  -- G0 owner rechecks every selected source's original authority and Grant.
  -- The full window is compared in one transaction, not a filtered subset.
  for v_row in select * from
    public.qry_seyeon_g0_current_source_recent_messages_v1(
      p_subject_id,p_thread_id,p_current_user_id,v_required
    ) order by sequence_no
  loop
    v_n:=v_n+1;
    select m.turn_id into v_source_turn_id
    from public.conversation_messages m
    where m.id=v_row.message_id and m.subject_id=p_subject_id
      and m.thread_id=p_thread_id;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_history_candidate_source_missing';
    end if;
    perform seyeon_private.lock_memory_source_message_v1(
      p_subject_id,v_source_turn_id,v_row.message_id
    );
    perform 1 from public.conversation_messages m
      where m.id=v_row.message_id and m.subject_id=p_subject_id
        and m.thread_id=p_thread_id and m.turn_id=v_source_turn_id
        and m.redacted_at is null and m.body_text=v_row.body_text;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_history_candidate_source_changed';
    end if;
    if v_n=v_required then
      if v_row.message_id is distinct from p_current_user_id
        or v_row.sender_type is distinct from 'user'
        or v_row.character_id is not null
        or v_row.body_text is distinct from v_user.body_text then
        raise exception using errcode='23514',
          constraint='seyeon_history_candidate_current_not_final';
      end if;
    else
      if v_row.message_id=p_current_user_id
        or (v_row.sender_type='user' and v_row.character_id is not null)
        or (v_row.sender_type='character'
          and v_row.character_id is distinct from 'seyeon')
        or v_row.sender_type not in ('user','character') then
        raise exception using errcode='23514',
          constraint='seyeon_history_candidate_unauthorized_source';
      end if;
      v_history:=v_history||jsonb_build_array(jsonb_build_object(
        'messageId',v_row.message_id::text,
        'role',case when v_row.sender_type='user' then 'user' else 'assistant' end,
        'textDigest','sha256:wire-utf8:v1:'||
          encode(sha256(convert_to(v_row.body_text,'UTF8')),'hex')
      ));
      -- G1 evidence only: persist the DB-owned original Memory/Grant chain
      -- for each *verified* historical Assistant. The G0 reader above
      -- already locks/checks the exact old Grant, never a replacement.
      -- Historical User rows have no inferred personal-record provenance.
      if v_row.sender_type='character' then
        select a.seyeon_personal_source_pin_jsonb->'positiveProof',a.id
          into v_assistant_pin,v_assistant_attempt
        from public.conversation_messages m
        join public.chat_turns t
          on t.id=m.turn_id and t.subject_id=m.subject_id
          and t.thread_id=m.thread_id and t.committed_at is not null
          and t.state in ('committed','delivered')
        join public.chat_turn_attempts a
          on a.id=t.committed_attempt_id and a.turn_id=t.id
          and a.subject_id=t.subject_id and a.state='committed'
          and a.committed_message_id=m.id
        where m.id=v_row.message_id and m.subject_id=p_subject_id
          and m.thread_id=p_thread_id and m.turn_id=v_source_turn_id
          and m.sender_type='character' and m.redacted_at is null
          and a.seyeon_personal_source_pinned_at is not null
          and a.seyeon_personal_source_pin_jsonb=jsonb_build_object(
            'positiveProof',a.seyeon_personal_source_pin_jsonb->'positiveProof')
          and a.validation_result_jsonb->'personalRecordProvenance'
            =a.seyeon_personal_source_pin_jsonb->'positiveProof';
        if not found or jsonb_typeof(v_assistant_pin) is distinct from 'object'
          or v_assistant_pin->>'subjectId' is distinct from p_subject_id::text
          or v_assistant_pin->>'threadId' is distinct from p_thread_id::text
          or v_assistant_pin->>'turnId' is distinct from v_source_turn_id::text
          or v_assistant_pin->>'attemptId' is distinct from v_assistant_attempt::text
          or v_assistant_pin->>'characterId' is distinct from 'seyeon'
          or v_assistant_pin->>'recordKind' is distinct from 'memory'
          or v_assistant_pin->>'recordId' is null
          or v_assistant_pin->>'originalGrantId' is null
          -- G0 has already locked this exact old Grant and compared its
          -- real granted_at, but the historical G1 lineage must retain the
          -- same issuance instant for downstream exact-authority proofs.
          or v_assistant_pin->>'originalGrantedAt' is null
          or v_assistant_pin->>'originalGrantedAt' !~
            '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          or v_assistant_pin->>'currentUserMessageId'
            !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
          or v_assistant_pin->>'currentUserTextDigest'
            !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
          or v_assistant_pin->>'originalPgJsonbDigest'
            !~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
          or v_assistant_pin->>'historicalSourceCount' is distinct from '0'
        then
          raise exception using errcode='23514',
            constraint='seyeon_history_candidate_assistant_original_missing';
        end if;
        -- A historical Assistant's claimed original User must still be the
        -- committed Member-authored message from that SAME Turn. A digest
        -- copied from a former positiveProof alone is not original authority.
        perform seyeon_private.assert_current_original_member_user_message_v1(
          p_subject_id,p_thread_id,
          (v_assistant_pin->>'currentUserMessageId')::uuid
        );
        select m.id,m.body_text into v_assistant_user
        from public.conversation_messages m
        where m.id=(v_assistant_pin->>'currentUserMessageId')::uuid
          and m.subject_id=p_subject_id and m.thread_id=p_thread_id
          and m.turn_id=v_source_turn_id and m.sender_type='user'
          and m.thread_character_id is null
          and m.character_content_bundle_id is null
          and m.redacted_at is null and m.body_text is not null
          and nullif(btrim(m.content_hash),'') is not null;
        if not found or v_assistant_pin->>'currentUserTextDigest'
          is distinct from 'sha256:wire-utf8:v1:'||
            encode(sha256(convert_to(v_assistant_user.body_text,'UTF8')),'hex')
        then
          raise exception using errcode='23514',
            constraint='seyeon_history_candidate_assistant_user_origin_changed';
        end if;
        v_assistant_originals:=v_assistant_originals||jsonb_build_array(
          jsonb_build_object(
            'messageId',v_row.message_id::text,
            'turnId',v_source_turn_id::text,
            'attemptId',v_assistant_attempt::text,
            'originalUserMessageId',v_assistant_pin->>'currentUserMessageId',
            'originalUserTextDigest',v_assistant_pin->>'currentUserTextDigest',
            'recordId',v_assistant_pin->>'recordId',
            'originalGrantId',v_assistant_pin->>'originalGrantId',
            'originalGrantedAt',v_assistant_pin->>'originalGrantedAt',
            'originalPgJsonbDigest',v_assistant_pin->>'originalPgJsonbDigest',
            'recordType',v_assistant_pin->>'recordType',
            'recordSchemaVersion',v_assistant_pin->>'recordSchemaVersion',
            'projectorVersion',v_assistant_pin->>'projectorVersion'
          )
        );
      end if;
    end if;
  end loop;
  if v_n<>v_required or v_history is distinct from p_expected_historical then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_manifest_mismatch';
  end if;

  perform seyeon_private.lock_original_memory_grant_v1(
    p_subject_id,p_original_memory_id,p_original_grant_id
  );
  select g.granted_at,m.content_jsonb into v_original
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=p_original_grant_id and g.subject_id=p_subject_id
    and g.memory_item_id=p_original_memory_id and g.life_fact_id is null
    and g.grantee_character_id='seyeon' and g.grant_reason='user_choice'
    -- The private lock above already verifies pending withdrawal under SHARE;
    -- this SELECT-only owner cannot read the internal withdrawal timestamp.
    and g.revoked_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type=p_record_type and m.schema_version=p_schema_version;
  if not found or p_original_pg_digest is distinct from
    'sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_original.content_jsonb::text,'UTF8')),'hex') then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_original_grant_changed';
  end if;

  -- Deliberately NOT 'positiveProof'. Existing G2/G3 reject this shape.
  v_proof:=jsonb_build_object(
    'schemaVersion','seyeon-g1-historical-source-candidate-v3',
    'subjectId',p_subject_id::text,'threadId',p_thread_id::text,
    'turnId',p_turn_id::text,'attemptId',p_attempt_id::text,
    'characterId','seyeon','currentUserMessageId',v_user.id::text,
    'currentUserTextDigest',p_current_user_digest,
    'recordKind','memory','recordId',p_original_memory_id::text,
    'originalGrantId',p_original_grant_id::text,
    'originalGrantedAt',v_original.granted_at,
    'recordType',p_record_type,'recordSchemaVersion',p_schema_version,
    'projectorVersion',p_projector_version,
    'originalPgJsonbDigest',p_original_pg_digest,
    'selectedSourcesDigest',p_selected_sources_digest,
    'projectedMemoryDigest',p_projected_memory_digest,
    'preModelContextDigest',p_pre_model_context_digest,
    'historicalSourceCount',jsonb_array_length(v_history),
    'historicalSources',v_history,
    'historicalSourceCensusDigest','sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_history::text,'UTF8')),'hex'),
    'historicalAssistantOriginalSources',v_assistant_originals,
    'historicalAssistantOriginalSourcesDigest','sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_assistant_originals::text,'UTF8')),'hex'),
    'authorizesModel',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
  update public.chat_turn_attempts
  set seyeon_personal_source_pin_jsonb=
        jsonb_build_object('historicalCandidateProof',v_proof),
      seyeon_personal_source_pinned_at=clock_timestamp()
  where id=p_attempt_id and subject_id=p_subject_id
    and turn_id=p_turn_id and state='running';
  v_replayed:=public.cmd_mark_chat_turn_context_ready_v1(
    p_subject_id,p_turn_id,p_attempt_id
  );
  if v_replayed then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_unexpected_replay';
  end if;
  return v_proof;
end
$history_pin$;

alter function seyeon_private.cmd_pin_seyeon_historical_source_candidate_s0_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,
  text,text,text,text,text,text,text,text,jsonb
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.cmd_pin_seyeon_historical_source_candidate_s0_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,
  text,text,text,text,text,text,text,text,jsonb
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;

    or jsonb_typeof(p_expected_historical) is distinct from 'array'
    or jsonb_array_length(p_expected_historical) not between 1 and 23 then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_invalid',
      message='Historical context candidate requires exact bounded original sources';
  end if;
  v_required:=jsonb_array_length(p_expected_historical)+1;
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
    where reg.record_kind='memory' and reg.enabled
      and reg.record_type=p_record_type and reg.schema_version=p_schema_version
      and reg.projector_version=p_projector_version
    for share of reg;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_type_disabled';
  end if;

  perform 1 from public.chat_turns t
    where t.id=p_turn_id and t.subject_id=p_subject_id
      and t.thread_id=p_thread_id and t.state='planned'
    for update of t;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_turn_invalid';
  end if;
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(
    p_subject_id,p_thread_id
  );
  perform 1 from public.chat_turn_attempts a
    where a.id=p_attempt_id and a.subject_id=p_subject_id
      and a.turn_id=p_turn_id and a.state='running'
      and a.planner_version='seyeon-production-chat-planner-v1'
      and a.seyeon_personal_source_pin_jsonb is null
    for update of a;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_attempt_invalid';
  end if;

  select count(*) into v_current_count
  from public.conversation_messages m
  where m.subject_id=p_subject_id and m.thread_id=p_thread_id
    and m.turn_id=p_turn_id;
  if v_current_count<>1 then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_current_count';
  end if;
  perform seyeon_private.lock_memory_source_message_v1(
    p_subject_id,p_turn_id,p_current_user_id
  );
  select m.id,m.body_text into v_user
  from public.conversation_messages m
  where m.id=p_current_user_id and m.subject_id=p_subject_id
    and m.thread_id=p_thread_id and m.turn_id=p_turn_id
    and m.sender_type='user' and m.thread_character_id is null
    and m.character_content_bundle_id is null and m.redacted_at is null
    and m.body_text is not null and length(btrim(m.body_text))>0
    and nullif(btrim(m.content_hash),'') is not null;
  if not found or p_current_user_digest is distinct from
      'sha256:wire-utf8:v1:'||
      encode(sha256(convert_to(v_user.body_text,'UTF8')),'hex') then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_current_user_changed';
  end if;

  -- G0 owner rechecks every selected source's original authority and Grant.
  -- The full window is compared in one transaction, not a filtered subset.
  for v_row in select * from
    public.qry_seyeon_g0_current_source_recent_messages_v1(
      p_subject_id,p_thread_id,p_current_user_id,v_required
    ) order by sequence_no
  loop
    v_n:=v_n+1;
    select m.turn_id into v_source_turn_id
    from public.conversation_messages m
    where m.id=v_row.message_id and m.subject_id=p_subject_id
      and m.thread_id=p_thread_id;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_history_candidate_source_missing';
    end if;
    perform seyeon_private.lock_memory_source_message_v1(
      p_subject_id,v_source_turn_id,v_row.message_id
    );
    perform 1 from public.conversation_messages m
      where m.id=v_row.message_id and m.subject_id=p_subject_id
        and m.thread_id=p_thread_id and m.turn_id=v_source_turn_id
        and m.redacted_at is null and m.body_text=v_row.body_text;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_history_candidate_source_changed';
    end if;
    if v_n=v_required then
      if v_row.message_id is distinct from p_current_user_id
        or v_row.sender_type is distinct from 'user'
        or v_row.character_id is not null
        or v_row.body_text is distinct from v_user.body_text then
        raise exception using errcode='23514',
          constraint='seyeon_history_candidate_current_not_final';
      end if;
    else
      if v_row.message_id=p_current_user_id
        or (v_row.sender_type='user' and v_row.character_id is not null)
        or (v_row.sender_type='character'
          and v_row.character_id is distinct from 'seyeon')
        or v_row.sender_type not in ('user','character') then
        raise exception using errcode='23514',
          constraint='seyeon_history_candidate_unauthorized_source';
      end if;
      v_history:=v_history||jsonb_build_array(jsonb_build_object(
        'messageId',v_row.message_id::text,
        'role',case when v_row.sender_type='user' then 'user' else 'assistant' end,
        'textDigest','sha256:wire-utf8:v1:'||
          encode(sha256(convert_to(v_row.body_text,'UTF8')),'hex')
      ));
      -- G1 evidence only: persist the DB-owned original Memory/Grant chain
      -- for each *verified* historical Assistant. The G0 reader above
      -- already locks/checks the exact old Grant, never a replacement.
      -- Historical User rows have no inferred personal-record provenance.
      if v_row.sender_type='character' then
        select a.seyeon_personal_source_pin_jsonb->'positiveProof',a.id
          into v_assistant_pin,v_assistant_attempt
        from public.conversation_messages m
        join public.chat_turns t
          on t.id=m.turn_id and t.subject_id=m.subject_id
          and t.thread_id=m.thread_id and t.committed_at is not null
          and t.state in ('committed','delivered')
        join public.chat_turn_attempts a
          on a.id=t.committed_attempt_id and a.turn_id=t.id
          and a.subject_id=t.subject_id and a.state='committed'
          and a.committed_message_id=m.id
        where m.id=v_row.message_id and m.subject_id=p_subject_id
          and m.thread_id=p_thread_id and m.turn_id=v_source_turn_id
          and m.sender_type='character' and m.redacted_at is null
          and a.seyeon_personal_source_pinned_at is not null
          and a.seyeon_personal_source_pin_jsonb=jsonb_build_object(
            'positiveProof',a.seyeon_personal_source_pin_jsonb->'positiveProof')
          and a.validation_result_jsonb->'personalRecordProvenance'
            =a.seyeon_personal_source_pin_jsonb->'positiveProof';
        if not found or jsonb_typeof(v_assistant_pin) is distinct from 'object'
          or v_assistant_pin->>'subjectId' is distinct from p_subject_id::text
          or v_assistant_pin->>'threadId' is distinct from p_thread_id::text
          or v_assistant_pin->>'turnId' is distinct from v_source_turn_id::text
          or v_assistant_pin->>'attemptId' is distinct from v_assistant_attempt::text
          or v_assistant_pin->>'characterId' is distinct from 'seyeon'
          or v_assistant_pin->>'recordKind' is distinct from 'memory'
          or v_assistant_pin->>'recordId' is null
          or v_assistant_pin->>'originalGrantId' is null
          -- G0 has already locked this exact old Grant and compared its
          -- real granted_at, but the historical G1 lineage must retain the
          -- same issuance instant for downstream exact-authority proofs.
          or v_assistant_pin->>'originalGrantedAt' is null
          or v_assistant_pin->>'originalGrantedAt' !~
            '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          or v_assistant_pin->>'currentUserMessageId'
            !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
          or v_assistant_pin->>'currentUserTextDigest'
            !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
          or v_assistant_pin->>'originalPgJsonbDigest'
            !~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
          or v_assistant_pin->>'historicalSourceCount' is distinct from '0'
        then
          raise exception using errcode='23514',
            constraint='seyeon_history_candidate_assistant_original_missing';
        end if;
        -- A historical Assistant's claimed original User must still be the
        -- committed Member-authored message from that SAME Turn. A digest
        -- copied from a former positiveProof alone is not original authority.
        perform seyeon_private.assert_current_original_member_user_message_v1(
          p_subject_id,p_thread_id,
          (v_assistant_pin->>'currentUserMessageId')::uuid
        );
        select m.id,m.body_text into v_assistant_user
        from public.conversation_messages m
        where m.id=(v_assistant_pin->>'currentUserMessageId')::uuid
          and m.subject_id=p_subject_id and m.thread_id=p_thread_id
          and m.turn_id=v_source_turn_id and m.sender_type='user'
          and m.thread_character_id is null
          and m.character_content_bundle_id is null
          and m.redacted_at is null and m.body_text is not null
          and nullif(btrim(m.content_hash),'') is not null;
        if not found or v_assistant_pin->>'currentUserTextDigest'
          is distinct from 'sha256:wire-utf8:v1:'||
            encode(sha256(convert_to(v_assistant_user.body_text,'UTF8')),'hex')
        then
          raise exception using errcode='23514',
            constraint='seyeon_history_candidate_assistant_user_origin_changed';
        end if;
        v_assistant_originals:=v_assistant_originals||jsonb_build_array(
          jsonb_build_object(
            'messageId',v_row.message_id::text,
            'turnId',v_source_turn_id::text,
            'attemptId',v_assistant_attempt::text,
            'originalUserMessageId',v_assistant_pin->>'currentUserMessageId',
            'originalUserTextDigest',v_assistant_pin->>'currentUserTextDigest',
            'recordId',v_assistant_pin->>'recordId',
            'originalGrantId',v_assistant_pin->>'originalGrantId',
            'originalGrantedAt',v_assistant_pin->>'originalGrantedAt',
            'originalPgJsonbDigest',v_assistant_pin->>'originalPgJsonbDigest',
            'recordType',v_assistant_pin->>'recordType',
            'recordSchemaVersion',v_assistant_pin->>'recordSchemaVersion',
            'projectorVersion',v_assistant_pin->>'projectorVersion'
          )
        );
      end if;
    end if;
  end loop;
  if v_n<>v_required or v_history is distinct from p_expected_historical then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_manifest_mismatch';
  end if;

  perform seyeon_private.lock_original_memory_grant_v1(
    p_subject_id,p_original_memory_id,p_original_grant_id
  );
  select g.granted_at,m.content_jsonb into v_original
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=p_original_grant_id and g.subject_id=p_subject_id
    and g.memory_item_id=p_original_memory_id and g.life_fact_id is null
    and g.grantee_character_id='seyeon' and g.grant_reason='user_choice'
    -- The private lock above already verifies pending withdrawal under SHARE;
    -- this SELECT-only owner cannot read the internal withdrawal timestamp.
    and g.revoked_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type=p_record_type and m.schema_version=p_schema_version;
  if not found or p_original_pg_digest is distinct from
    'sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_original.content_jsonb::text,'UTF8')),'hex') then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_original_grant_changed';
  end if;

  -- Deliberately NOT 'positiveProof'. Existing G2/G3 reject this shape.
  v_proof:=jsonb_build_object(
    'schemaVersion','seyeon-g1-historical-source-candidate-v3',
    'subjectId',p_subject_id::text,'threadId',p_thread_id::text,
    'turnId',p_turn_id::text,'attemptId',p_attempt_id::text,
    'characterId','seyeon','currentUserMessageId',v_user.id::text,
    'currentUserTextDigest',p_current_user_digest,
    'recordKind','memory','recordId',p_original_memory_id::text,
    'originalGrantId',p_original_grant_id::text,
    'originalGrantedAt',v_original.granted_at,
    'recordType',p_record_type,'recordSchemaVersion',p_schema_version,
    'projectorVersion',p_projector_version,
    'originalPgJsonbDigest',p_original_pg_digest,
    'selectedSourcesDigest',p_selected_sources_digest,
    'projectedMemoryDigest',p_projected_memory_digest,
    'preModelContextDigest',p_pre_model_context_digest,
    'historicalSourceCount',jsonb_array_length(v_history),
    'historicalSources',v_history,
    'historicalSourceCensusDigest','sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_history::text,'UTF8')),'hex'),
    'historicalAssistantOriginalSources',v_assistant_originals,
    'historicalAssistantOriginalSourcesDigest','sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_assistant_originals::text,'UTF8')),'hex'),
    'authorizesModel',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
  update public.chat_turn_attempts
  set seyeon_personal_source_pin_jsonb=
        jsonb_build_object('historicalCandidateProof',v_proof),
      seyeon_personal_source_pinned_at=clock_timestamp()
  where id=p_attempt_id and subject_id=p_subject_id
    and turn_id=p_turn_id and state='running';
  v_replayed:=public.cmd_mark_chat_turn_context_ready_v1(
    p_subject_id,p_turn_id,p_attempt_id
  );
  if v_replayed then
    raise exception using errcode='23514',
      constraint='seyeon_history_candidate_unexpected_replay';
  end if;
  return v_proof;
end
$history_pin$;

alter function seyeon_private.cmd_pin_seyeon_historical_source_candidate_s0_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,
  text,text,text,text,text,text,text,text,jsonb
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.cmd_pin_seyeon_historical_source_candidate_s0_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,
  text,text,text,text,text,text,text,text,jsonb
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
