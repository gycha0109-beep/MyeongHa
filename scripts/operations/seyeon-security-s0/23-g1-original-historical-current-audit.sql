-- Watchtower-Track: security
-- G1/G2 S0 historical ORIGINALS audit-only recheck. Not a Commit, model
-- admission, HTTP Reveal, public migration, or post-read authorization.
begin;
grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.qry_recheck_historical_candidate_originals_s0_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=on
as $historical_audit$
declare
  v_proof jsonb;
  v_sources jsonb;
  v_observed jsonb:='[]'::jsonb;
  v_assistant_origins jsonb:='[]'::jsonb;
  v_old_pin jsonb;
  v_row record;
  v_prior record;
  v_memory record;
  v_n integer:=0;
  v_required integer;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  select a.seyeon_personal_source_pin_jsonb->'historicalCandidateProof'
    into v_proof
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.id=p_attempt_id and a.turn_id=t.id and a.subject_id=t.subject_id
  where t.id=p_turn_id and t.subject_id=p_subject_id
    and t.thread_id=p_thread_id and t.state='context_ready'
    and a.state='running' and a.seyeon_personal_source_pinned_at is not null
    and a.seyeon_personal_source_pin_jsonb=
      jsonb_build_object('historicalCandidateProof',
                         a.seyeon_personal_source_pin_jsonb->'historicalCandidateProof')
  for share of t,a;
  if not found or jsonb_typeof(v_proof) is distinct from 'object'
     or v_proof->>'schemaVersion' is distinct from
         'seyeon-g1-historical-source-candidate-v4'
     or v_proof->>'subjectId' is distinct from p_subject_id::text
     or v_proof->>'threadId' is distinct from p_thread_id::text
     or v_proof->>'turnId' is distinct from p_turn_id::text
     or v_proof->>'attemptId' is distinct from p_attempt_id::text
     or v_proof->>'characterId' is distinct from 'seyeon'
     or v_proof->>'recordKind' is distinct from 'memory'
     or v_proof->>'authorizesModel' is distinct from 'false'
     or v_proof->>'permitsAtomicCommit' is distinct from 'false'
     or v_proof->>'permitsHttpReveal' is distinct from 'false'
     or v_proof->>'currentUserMessageId' is null
     or v_proof->>'originalGrantId' is null
     or v_proof->>'recordId' is null
     or v_proof->>'originalPgJsonbDigest'
         !~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
     or v_proof->>'currentUserTextDigest'
         !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
     or v_proof->>'expectedFinalModelContextDigest'
         !~ '^sha256:v1:[a-f0-9]{64}$'
     or jsonb_typeof(v_proof->'historicalSources') is distinct from 'array'
     or jsonb_typeof(v_proof->'historicalAssistantOriginalSources')
        is distinct from 'array'
  then
    raise exception using errcode='42501',
      constraint='seyeon_history_recheck_candidate_invalid',
      message='Historical original source candidate is unavailable';
  end if;

  v_sources:=v_proof->'historicalSources';
  v_required:=jsonb_array_length(v_sources)+1;
  if v_required<2 or v_required>24
     or v_proof->>'historicalSourceCount' is distinct from
        (v_required-1)::text
     or v_proof->>'historicalSourceCensusDigest' is distinct from
        'sha256:pg-jsonb:v1:'||
        encode(sha256(convert_to(v_sources::text,'UTF8')),'hex')
  then
    raise exception using errcode='42501',
      constraint='seyeon_history_recheck_window_invalid',
      message='Historical original source window is unavailable';
  end if;

  -- The existing G0 owner locks every historical User/Assistant and all
  -- original Grants, not replacement Grants. No historic text is returned.
  for v_row in select * from
    public.qry_seyeon_g0_current_source_recent_messages_v1(
      p_subject_id,p_thread_id,
      (v_proof->>'currentUserMessageId')::uuid,v_required
    ) order by sequence_no
  loop
    v_n:=v_n+1;
    if v_n=v_required then
      if v_row.message_id::text is distinct from
           v_proof->>'currentUserMessageId'
         or v_row.sender_type is distinct from 'user'
         or 'sha256:wire-utf8:v1:'||
           encode(sha256(convert_to(v_row.body_text,'UTF8')),'hex')
           is distinct from v_proof->>'currentUserTextDigest'
      then
        raise exception using errcode='42501',
          constraint='seyeon_history_recheck_current_user_changed',
          message='Historical original current User changed';
      end if;
    else
      v_observed:=v_observed||jsonb_build_array(jsonb_build_object(
        'messageId',v_row.message_id::text,
        'role',case when v_row.sender_type='user' then 'user' else 'assistant' end,
        'textDigest','sha256:wire-utf8:v1:'||
          encode(sha256(convert_to(v_row.body_text,'UTF8')),'hex')
      ));
      if v_row.sender_type='character' then
        select a.seyeon_personal_source_pin_jsonb->'positiveProof' as pin,
               a.id as attempt_id,m.turn_id as turn_id
          into v_prior
        from public.conversation_messages m
        join public.chat_turns t on t.id=m.turn_id
        join public.chat_turn_attempts a on a.id=t.committed_attempt_id
        where m.id=v_row.message_id and m.subject_id=p_subject_id
          and m.thread_id=p_thread_id and m.sender_type='character'
          and m.redacted_at is null and t.state in ('committed','delivered')
          and a.state='committed' and a.committed_message_id=m.id
        for share of m,t,a;
        if not found or jsonb_typeof(v_prior.pin) is distinct from 'object'
           or v_prior.pin->>'threadId' is distinct from p_thread_id::text
           or v_prior.pin->>'subjectId' is distinct from p_subject_id::text
           or v_prior.pin->>'turnId' is distinct from v_prior.turn_id::text
           or v_prior.pin->>'attemptId' is distinct from v_prior.attempt_id::text
        then
          raise exception using errcode='42501',
            constraint='seyeon_history_recheck_original_assistant_changed',
            message='Historical original Assistant source changed';
        end if;
        v_old_pin:=v_prior.pin;
        v_assistant_origins:=v_assistant_origins||jsonb_build_array(
          jsonb_build_object(
            'messageId',v_row.message_id::text,
            'turnId',v_prior.turn_id::text,
            'attemptId',v_prior.attempt_id::text,
            'originalUserMessageId',v_old_pin->>'currentUserMessageId',
            'originalUserTextDigest',v_old_pin->>'currentUserTextDigest',
            'recordId',v_old_pin->>'recordId',
            'originalGrantId',v_old_pin->>'originalGrantId',
            'originalGrantedAt',v_old_pin->>'originalGrantedAt',
            'originalPgJsonbDigest',v_old_pin->>'originalPgJsonbDigest',
            'recordType',v_old_pin->>'recordType',
            'recordSchemaVersion',v_old_pin->>'recordSchemaVersion',
            'projectorVersion',v_old_pin->>'projectorVersion'
          )
        );
      end if;
    end if;
  end loop;

  if v_n<>v_required or v_observed is distinct from v_sources
     or v_assistant_origins is distinct from
        v_proof->'historicalAssistantOriginalSources'
     or v_proof->>'historicalAssistantOriginalSourcesDigest' is distinct from
       'sha256:pg-jsonb:v1:'||
       encode(sha256(convert_to(v_assistant_origins::text,'UTF8')),'hex')
  then
    raise exception using errcode='42501',
      constraint='seyeon_history_recheck_manifest_changed',
      message='Historical source manifest is no longer original';
  end if;

  perform seyeon_private.lock_original_memory_grant_v1(
    p_subject_id,(v_proof->>'recordId')::uuid,
    (v_proof->>'originalGrantId')::uuid
  );
  select g.granted_at,m.content_jsonb,m.memory_type,m.schema_version
    into v_memory
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=(v_proof->>'originalGrantId')::uuid
    and g.subject_id=p_subject_id
    and m.id=(v_proof->>'recordId')::uuid
    -- The private source lock above already checks pending withdrawal.
    -- Its definer intentionally cannot SELECT the internal withdrawal column.
    and g.revoked_at is null and m.revoked_at is null;
  if not found or v_memory.memory_type is distinct from
       v_proof->>'recordType'
     or v_memory.schema_version is distinct from
       v_proof->>'recordSchemaVersion'
     or v_memory.granted_at::text is distinct from
       (v_proof->>'originalGrantedAt')::timestamptz::text
     or 'sha256:pg-jsonb:v1:'||
       encode(sha256(convert_to(v_memory.content_jsonb::text,'UTF8')),'hex')
       is distinct from v_proof->>'originalPgJsonbDigest'
  then
    raise exception using errcode='42501',
      constraint='seyeon_history_recheck_original_memory_changed',
      message='Historical selected Memory source changed';
  end if;

  -- Even a PASS is only a current-origin AUDIT under this transaction's
  -- locks. Never advertise Model/Commit/Reveal readiness.
  return jsonb_build_object(
    'schemaVersion','seyeon-historical-current-originals-audit-s0-v1',
    'historicalSourceCount',v_required-1,
    'originalsCurrentForAudit',true,
    'authorizesModel',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
end
$historical_audit$;

alter function seyeon_private.qry_recheck_historical_candidate_originals_s0_v1(
  uuid,uuid,uuid,uuid
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.qry_recheck_historical_candidate_originals_s0_v1(
  uuid,uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
