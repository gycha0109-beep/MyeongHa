-- Watchtower-Track: security
-- G3 historical first-Reveal source review ONLY; NO text, grant, or HTTP API.
-- A successful current-original review is never a first/streaming/replay permit.
begin;
grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.qry_review_historical_first_reveal_originals_s0_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_purpose text,p_expected_user_message_id uuid,
  p_expected_assistant_message_id uuid,
  p_expected_post_turn_outbox_event_id uuid,p_expected_client_turn_id text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=on
as $g3_historical_review$
declare
  v_candidate jsonb;
  v_seal jsonb;
  v_admission jsonb;
  v_audit jsonb;
  v_count integer;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_turn_id is null or p_attempt_id is null
     or p_purpose not in ('audit_only','first') or p_purpose is null then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g3_replay_never_authorized',
      message='Historical first Reveal and replay authorization unavailable';
  end if;
  -- Subject before Turn/Attempt, then registry/Grant/previous original
  -- User+Assistant rows. This is a DB-only review: it can never hand a
  -- cached or original assistant body to a socket or HTTP Fetch handler.
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  select a.seyeon_personal_source_pin_jsonb->'historicalCandidateProof',
         a.seyeon_historical_final_context_seal_jsonb,
         a.seyeon_historical_g1_source_admission_jsonb
    into v_candidate,v_seal,v_admission
  from public.chat_turns t
  join public.chat_turn_attempts a on a.id=p_attempt_id
    and a.turn_id=t.id and a.subject_id=t.subject_id
  where t.id=p_turn_id and t.subject_id=p_subject_id
    and t.thread_id=p_thread_id
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pinned_at is not null
    and a.seyeon_personal_source_pin_jsonb=
      jsonb_build_object('historicalCandidateProof',
         a.seyeon_personal_source_pin_jsonb->'historicalCandidateProof')
    and (
      -- audit_only proves the actual G1 immutable candidate+original
      -- records are still current without pretending a Commit happened.
      (p_purpose='audit_only' and t.state='context_ready'
       and a.state='running')
      or
      -- Actual FIRST Reveal requires committed provenance, no prior
      -- delivery/receipt, the same original Client Turn and exact
      -- User/Assistant locators. A delivered or replayed Turn is rejected.
      (p_purpose='first' and t.state='committed'
       and t.delivered_at is null and t.committed_at is not null
       and t.committed_attempt_id=a.id
       and a.state='committed'
       and a.seyeon_positive_delivery_issued_at is null
       and t.client_turn_id=p_expected_client_turn_id
       and p_expected_client_turn_id is not null
       and p_expected_client_turn_id=btrim(p_expected_client_turn_id)
       and length(p_expected_client_turn_id) between 1 and 256
       and a.committed_message_id=p_expected_assistant_message_id)
    )
  for update of t,a;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g3_original_commit_required',
      message='Historical first Reveal current Commit/source not available';
  end if;

  if jsonb_typeof(v_candidate) is distinct from 'object'
     or jsonb_typeof(v_seal) is distinct from 'object'
     or jsonb_typeof(v_admission) is distinct from 'object'
     or v_candidate->>'schemaVersion' is distinct from
       'seyeon-g1-historical-source-candidate-v4'
     or v_seal->>'schemaVersion' is distinct from
       'seyeon-g1-historical-final-context-seal-s0-v1'
     or v_admission->>'schemaVersion' is distinct from
       'seyeon-g1-historical-source-admission-s0-v1'
     or v_candidate->>'subjectId' is distinct from p_subject_id::text
     or v_candidate->>'threadId' is distinct from p_thread_id::text
     or v_candidate->>'turnId' is distinct from p_turn_id::text
     or v_candidate->>'attemptId' is distinct from p_attempt_id::text
     or v_candidate->>'currentUserMessageId' is distinct from
        case when p_purpose='first'
          then p_expected_user_message_id::text
          else v_candidate->>'currentUserMessageId' end
     or v_admission->>'recordId' is distinct from v_candidate->>'recordId'
     or v_admission->>'originalGrantId' is distinct from
        v_candidate->>'originalGrantId'
     or v_admission->>'originalPgJsonbDigest' is distinct from
        v_candidate->>'originalPgJsonbDigest'
     or (select count(*) from jsonb_object_keys(v_admission))<>25
     or v_candidate->>'characterId' is distinct from 'seyeon'
     or v_admission->>'characterId' is distinct from 'seyeon'
     or v_admission->>'subjectId' is distinct from p_subject_id::text
     or v_admission->>'threadId' is distinct from p_thread_id::text
     or v_admission->>'turnId' is distinct from p_turn_id::text
     or v_admission->>'attemptId' is distinct from p_attempt_id::text
     or v_admission->>'recordKind' is distinct from 'memory'
     or v_admission->>'recordType' is distinct from
        v_candidate->>'recordType'
     or v_admission->>'recordSchemaVersion' is distinct from
        v_candidate->>'recordSchemaVersion'
     or v_admission->>'projectorVersion' is distinct from
        v_candidate->>'projectorVersion'
     or v_admission->>'projectedMemoryDigest' is distinct from
        v_candidate->>'projectedMemoryDigest'
     or v_admission->>'selectedSourcesDigest' is distinct from
        v_candidate->>'selectedSourcesDigest'
     or v_admission->>'historicalAssistantOriginalSourcesDigest'
        is distinct from
        v_candidate->>'historicalAssistantOriginalSourcesDigest'
     or v_admission->>'historicalSourceCensusDigest' is distinct from
        v_candidate->>'historicalSourceCensusDigest'
     or v_admission->>'candidatePgJsonbDigest' is distinct from
        v_seal->>'candidatePgJsonbDigest'
     or v_admission->>'finalModelContextDigest' is distinct from
        v_seal->>'finalModelContextDigest'
     or v_seal->>'candidatePgJsonbDigest' is distinct from
        'sha256:pg-jsonb:v1:'||
        encode(sha256(convert_to(v_candidate::text,'UTF8')),'hex')
     or v_admission->>'originalsCurrentAtAdmission' is distinct from 'true'
     or v_seal->>'originalsCurrentAtSeal' is distinct from 'true'
     or v_candidate->>'authorizesModel' is distinct from 'false'
     or v_candidate->>'permitsAtomicCommit' is distinct from 'false'
     or v_seal->>'authorizesModel' is distinct from 'false'
     or v_seal->>'permitsAtomicCommit' is distinct from 'false'
     or v_admission->>'authorizesSourceSelection' is distinct from 'true'
     or v_admission->>'permitsModelDispatch' is distinct from 'false'
     or v_admission->>'permitsAtomicCommit' is distinct from 'false'
     or v_admission->>'permitsHttpReveal' is distinct from 'false'
     or v_candidate->>'permitsHttpReveal' is distinct from 'false'
     or v_seal->>'permitsHttpReveal' is distinct from 'false'
  then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g3_original_pin_mismatch',
      message='Historical G3 immutable source and final Context mismatch';
  end if;
  v_count:=(v_candidate->>'historicalSourceCount')::integer;
  if v_count<1 or v_count>23
     or v_seal->>'historicalSourceCount' is distinct from v_count::text
     or v_admission->>'historicalSourceCount' is distinct from v_count::text
  then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g3_source_window_invalid',
      message='Historical G3 exact provenance window invalid';
  end if;

  if p_purpose='first' then
    -- Bind the actual G2 post-Turn Outbox and committed assistant exactly.
    -- This is NOT a receipt for a previously delivered/replayed answer.
    perform 1 from public.conversation_messages assistant
    join public.outbox_events oe
      on oe.id=p_expected_post_turn_outbox_event_id
    where assistant.id=p_expected_assistant_message_id
      and assistant.subject_id=p_subject_id
      and assistant.thread_id=p_thread_id
      and assistant.turn_id=p_turn_id
      and assistant.sender_type='character'
      and assistant.redacted_at is null
      and assistant.body_text is not null
      and oe.aggregate_type='chat_turn'
      and oe.aggregate_id=p_turn_id::text
      and oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
      and oe.event_schema_version='v1'
      and oe.dedupe_key='seyeon-post-turn-v1'
      and oe.payload_jsonb->>'subjectId'=p_subject_id::text
      and oe.payload_jsonb->>'characterId'='seyeon'
      and oe.payload_jsonb->>'turnId'=p_turn_id::text
      and oe.payload_jsonb->>'attemptId'=p_attempt_id::text
      and oe.payload_jsonb->>'userMessageId'
          =p_expected_user_message_id::text
      and oe.payload_jsonb->>'assistantMessageId'
          =p_expected_assistant_message_id::text
    for share of assistant,oe;
    if not found then
      raise exception using errcode='42501',
        constraint='seyeon_historical_g3_commit_receipt_missing',
        message='Historical G3 original committed message receipt missing';
    end if;
  end if;
  -- An old admission is NOT a current permission. Lock the exact
  -- Memory type, schema and projector again at the G3 review boundary.
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
  where reg.record_kind='memory' and reg.enabled
    and reg.record_type=v_candidate->>'recordType'
    and reg.schema_version=v_candidate->>'recordSchemaVersion'
    and reg.projector_version=v_candidate->>'projectorVersion'
  for share of reg;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g3_source_type_disabled',
      message='Historical source type disabled before first Reveal';
  end if;
  -- Locks all original old Users/Assistants and original Grantees' Memory
  -- grants, rejecting deletion/redaction/revoke/replacement Grant.
  v_audit:=seyeon_private.qry_recheck_historical_candidate_originals_s0_v1(
    p_subject_id,p_thread_id,p_turn_id,p_attempt_id
  );
  if jsonb_typeof(v_audit) is distinct from 'object'
     or v_audit->>'schemaVersion' is distinct from
        'seyeon-historical-current-originals-audit-s0-v1'
     or v_audit->>'historicalSourceCount' is distinct from v_count::text
     or v_audit->>'originalsCurrentForAudit' is distinct from 'true'
     or v_audit->>'authorizesModel' is distinct from 'false'
     or v_audit->>'permitsAtomicCommit' is distinct from 'false'
     or v_audit->>'permitsHttpReveal' is distinct from 'false'
  then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g3_original_grant_revoked',
      message='Historical original source rights invalid at G3';
  end if;
  -- The result can NEVER be used as permission to release private text.
  -- No serialized assistant text, HTTP stream, delivery/replay marker,
  -- Provider, output row, state update or right-issuing flag exists here.
  return jsonb_build_object(
    'schemaVersion','seyeon-g3-historical-current-originals-review-s0-v1',
    'historicalSourceCount',v_count,
    'originalsCurrentForReview',true,
    'authorizesFirstReveal',false,
    'authorizesCommittedReplay',false,
    'permitsStreaming',false,
    'permitsHttpReveal',false
  );
end
$g3_historical_review$;

alter function seyeon_private.qry_review_historical_first_reveal_originals_s0_v1(
  uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.qry_review_historical_first_reveal_originals_s0_v1(
  uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
