-- Watchtower-Track: security
-- W77 isolated G2 same-transaction original-source guard. NOT authorization.
-- Runs from the actual raw v2 validated->committed transition's trigger
-- while locks remain held. The transition STILL raises S0 HOLD after this.
begin;
grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.assert_historical_g2_sealed_originals_s0_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid
) returns void language plpgsql security definer
set search_path=pg_catalog,public set row_security=on
as $historical_g2_guard$
declare
  v_turn_state text;
  v_attempt_state text;
  v_candidate jsonb;
  v_seal jsonb;
  v_source_admission jsonb;
  v_validation jsonb;
  v_generation_id uuid;
  v_output_guard_id uuid;
  v_generated_hash text;
  v_audit jsonb;
  v_count integer;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  -- Canonical lock order: Subject -> Turn -> Attempt -> original history /
  -- Memory and Grant locks in the G0 owner audit. This same transaction
  -- must be the one that attempts the real v2 Commit; an earlier API SELECT
  -- or detached audit receipt NEVER constitutes G2 authorization.
  select t.state,a.state,a.seyeon_personal_source_pin_jsonb
           ->'historicalCandidateProof',
         a.seyeon_historical_final_context_seal_jsonb,
         a.seyeon_historical_g1_source_admission_jsonb,
         a.validation_result_jsonb,
         a.generation_ai_execution_log_id,
         a.validation_ai_execution_log_id,
         a.generated_content_hash
    into v_turn_state,v_attempt_state,v_candidate,v_seal,v_source_admission,
         v_validation,v_generation_id,v_output_guard_id,v_generated_hash
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.turn_id=t.id and a.subject_id=t.subject_id
    and a.id=p_attempt_id
  where t.subject_id=p_subject_id and t.thread_id=p_thread_id
    and t.id=p_turn_id and
    ((t.state='context_ready' and a.state='running') or
     (t.state='validated' and a.state='validated'))
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pin_jsonb=
      jsonb_build_object(
        'historicalCandidateProof',
        a.seyeon_personal_source_pin_jsonb->'historicalCandidateProof'
      )
    and a.seyeon_personal_source_pinned_at is not null
  for update of t,a;
  if not found
     or jsonb_typeof(v_candidate) is distinct from 'object'
     or jsonb_typeof(v_seal) is distinct from 'object'
     or v_candidate->>'schemaVersion' is distinct from
        'seyeon-g1-historical-source-candidate-v4'
     or v_seal->>'schemaVersion' is distinct from
        'seyeon-g1-historical-final-context-seal-s0-v1'
     or v_candidate->>'subjectId' is distinct from p_subject_id::text
     or v_candidate->>'threadId' is distinct from p_thread_id::text
     or v_candidate->>'turnId' is distinct from p_turn_id::text
     or v_candidate->>'attemptId' is distinct from p_attempt_id::text
     or v_seal->>'subjectId' is distinct from p_subject_id::text
     or v_seal->>'threadId' is distinct from p_thread_id::text
     or v_seal->>'turnId' is distinct from p_turn_id::text
     or v_seal->>'attemptId' is distinct from p_attempt_id::text
     or (select count(*) from jsonb_object_keys(v_seal))<>13
     or v_seal->>'candidatePgJsonbDigest' is distinct from
       'sha256:pg-jsonb:v1:'||
       encode(sha256(convert_to(v_candidate::text,'UTF8')),'hex')
     or v_seal->>'finalModelContextDigest' is distinct from
        v_candidate->>'expectedFinalModelContextDigest'
     or v_seal->>'preModelContextDigest' is distinct from
        v_candidate->>'preModelContextDigest'
     or v_seal->>'originalsCurrentAtSeal' is distinct from 'true'
     or v_candidate->>'authorizesModel' is distinct from 'false'
     or v_candidate->>'permitsAtomicCommit' is distinct from 'false'
     or v_candidate->>'permitsHttpReveal' is distinct from 'false'
     or v_seal->>'authorizesModel' is distinct from 'false'
     or v_seal->>'permitsAtomicCommit' is distinct from 'false'
     or v_seal->>'permitsHttpReveal' is distinct from 'false'
  then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g2_exact_seal_required',
      message='G2 historical original candidate or sealed Context unavailable';
  end if;

  -- A future positive historic model authorization must bind the exact
  -- G1 final Context into immutable validated results before Commit.
  -- No such validated authorization is issued in S0, so synthetic jumps
  -- cannot borrow an old running Context seal as a model receipt.
  if v_attempt_state='validated' and (
       -- A future positive historical Commit must have a DB-issued source
       -- admission bound to the exact immutable G1 candidate and final seal.
       -- This admission itself NEVER allows Provider/Commit/Reveal.
       jsonb_typeof(v_source_admission) is distinct from 'object'
       or v_source_admission->>'schemaVersion' is distinct from
          'seyeon-g1-historical-source-admission-s0-v1'
       or (select count(*) from jsonb_object_keys(v_source_admission))<>25
       or v_source_admission->>'characterId' is distinct from 'seyeon'
       or v_source_admission->>'subjectId' is distinct from p_subject_id::text
       or v_source_admission->>'threadId' is distinct from p_thread_id::text
       or v_source_admission->>'turnId' is distinct from p_turn_id::text
       or v_source_admission->>'attemptId' is distinct from p_attempt_id::text
       or v_source_admission->>'originalGrantId' is distinct from
          v_candidate->>'originalGrantId'
       or v_source_admission->>'recordId' is distinct from
          v_candidate->>'recordId'
       or v_source_admission->>'recordKind' is distinct from 'memory'
       or v_source_admission->>'recordType' is distinct from
          v_candidate->>'recordType'
       or v_source_admission->>'recordSchemaVersion' is distinct from
          v_candidate->>'recordSchemaVersion'
       or v_source_admission->>'projectorVersion' is distinct from
          v_candidate->>'projectorVersion'
       or v_source_admission->>'projectedMemoryDigest' is distinct from
          v_candidate->>'projectedMemoryDigest'
       or v_source_admission->>'selectedSourcesDigest' is distinct from
          v_candidate->>'selectedSourcesDigest'
       or v_source_admission->>'historicalAssistantOriginalSourcesDigest'
          is distinct from
          v_candidate->>'historicalAssistantOriginalSourcesDigest'
       or v_source_admission->>'historicalSourceCensusDigest' is distinct from
          v_candidate->>'historicalSourceCensusDigest'
       or v_source_admission->>'historicalSourceCount' is distinct from
          v_candidate->>'historicalSourceCount'
       or v_source_admission->>'originalsCurrentAtAdmission' is distinct from 'true'
       or v_source_admission->>'originalPgJsonbDigest' is distinct from
          v_candidate->>'originalPgJsonbDigest'
       or v_source_admission->>'candidatePgJsonbDigest' is distinct from
          v_seal->>'candidatePgJsonbDigest'
       or v_source_admission->>'finalModelContextDigest' is distinct from
          v_seal->>'finalModelContextDigest'
       or v_source_admission->>'authorizesSourceSelection' is distinct from 'true'
       or v_source_admission->>'permitsModelDispatch' is distinct from 'false'
       or v_source_admission->>'permitsAtomicCommit' is distinct from 'false'
       or v_source_admission->>'permitsHttpReveal' is distinct from 'false'
       or jsonb_typeof(v_validation) is distinct from 'object'
       or v_validation->>'schemaVersion' is distinct from
          'seyeon-production-chat-validation-v1'
       or v_validation->>'passed' is distinct from 'true'
       or v_generated_hash is null
       or v_generated_hash !~ '^sha256:v1:[a-f0-9]{64}$'
       or v_validation->>'generatedContentHash'
          is distinct from v_generated_hash
       or v_validation->>'historicalFinalModelContextDigest'
          is distinct from v_seal->>'finalModelContextDigest'
       or v_validation->>'historicalCandidatePgJsonbDigest'
          is distinct from v_seal->>'candidatePgJsonbDigest'
       -- A caller-controlled validation JSON document cannot substitute
       -- for durable DB-written Renderer and Output Guard stage records.
       -- Neither stage log alone proves G1 Interpreter source admission.
       or v_generation_id is null or v_output_guard_id is null
       or not exists (
         select 1 from public.ai_execution_logs generation
         where generation.id=v_generation_id
           and generation.subject_id=p_subject_id
           and generation.turn_id=p_turn_id
           and generation.turn_attempt_id=p_attempt_id
           and generation.character_id='seyeon'
           and generation.stage='renderer'
           and generation.status='success'
           and generation.output_ref_jsonb->>'generatedContentHash'
             is not distinct from v_generated_hash
       )
       or not exists (
         select 1 from public.ai_execution_logs output_guard
         where output_guard.id=v_output_guard_id
           and output_guard.subject_id=p_subject_id
           and output_guard.turn_id=p_turn_id
           and output_guard.turn_attempt_id=p_attempt_id
           and output_guard.character_id='seyeon'
           and output_guard.stage='output_guard'
           and output_guard.status='success'
           and output_guard.output_ref_jsonb->>'generatedContentHash'
             is not distinct from v_generated_hash
       )
     ) then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g2_validated_model_receipt_required',
      message='G2 requires exact immutable validated historical model evidence';
  end if;

  v_count:=(v_candidate->>'historicalSourceCount')::integer;
  if v_count < 1 or v_count>23
     or v_seal->>'historicalSourceCount' is distinct from v_count::text then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g2_window_invalid',
      message='G2 historical originals are incomplete';
  end if;
  -- A G1 SOURCE admission is not a permanent entitlement. The exact
  -- original Memory type/schema/projector must remain enabled AT G2 Commit.
  -- This SHARE lock is retained with the Turn/Attempt and original Grant
  -- locks in this very DB transaction. Disabling a source type cannot race
  -- through the native v2 Commit after an earlier G1 admission.
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
  where reg.record_kind='memory' and reg.enabled
    and reg.record_type=v_candidate->>'recordType'
    and reg.schema_version=v_candidate->>'recordSchemaVersion'
    and reg.projector_version=v_candidate->>'projectorVersion'
  for share of reg;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g2_source_type_disabled',
      message='Historical original model source type is no longer enabled at Commit';
  end if;

  -- The G0 audit compares the COMPLETE original User/Assistant window,
  -- previous Assistant's original User/Record/Grant and selected Memory.
  -- Subject, Turn, Attempt and each original remain locked until COMMIT.
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
     or v_audit->>'permitsHttpReveal' is distinct from 'false' then
    raise exception using errcode='42501',
      constraint='seyeon_historical_g2_originals_current_required',
      message='G2 historical exact original source authorization changed';
  end if;
  -- THIS is only an original-source assertion. Model/Commit/Reveal are
  -- unconditionally held by the surrounding existing S0 trigger.
end
$historical_g2_guard$;

-- This wrapper is a same-transaction G2 proof-of-integration path only.
-- It MUST NOT be executable by the API, and the existing v2 transition
-- trigger still blocks every historicalCandidateProof unconditionally.
-- Guard and raw commit either succeed/rollback together; there is no
-- SELECT-before-COMMIT split across separate Owner transactions.
create function seyeon_private.cmd_attempt_historical_same_tx_commit_hold_s0_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_message_id uuid,p_chat_outbox_event_id uuid,
  p_post_turn_outbox_event_id uuid,p_post_turn_snapshot_jsonb jsonb,
  p_post_turn_snapshot_hash text
) returns table(
  turn_id uuid,attempt_id uuid,assistant_message_id uuid,
  sequence_no bigint,committed_at timestamptz,
  post_turn_outbox_event_id uuid,replayed boolean
) language plpgsql security definer
set search_path=pg_catalog,public set row_security=on
as $historical_g2_tx$
begin
  -- This first call takes and holds every original source lock.
  perform seyeon_private.assert_historical_g2_sealed_originals_s0_v1(
    p_subject_id,p_thread_id,p_turn_id,p_attempt_id
  );
  -- An impossible positive source is never silently promoted to G2 rights.
  -- Raw v2 retains its historical candidate rejection even if all
  -- exact-original checks pass, so no assistant/outbox can be committed.
  return query select * from public.cmd_commit_seyeon_chat_turn_runtime_v2(
    p_subject_id,p_thread_id,p_turn_id,p_attempt_id,p_message_id,
    p_chat_outbox_event_id,p_post_turn_outbox_event_id,
    p_post_turn_snapshot_jsonb,p_post_turn_snapshot_hash
  );
  raise exception using errcode='42501',
    constraint='seyeon_historical_g2_s0_commit_unconditionally_held',
    message='Historical G2 source audit never authorizes Commit';
end
$historical_g2_tx$;

alter function seyeon_private.cmd_attempt_historical_same_tx_commit_hold_s0_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.cmd_attempt_historical_same_tx_commit_hold_s0_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text
) from public,anon,authenticated,service_role,myeongha_api_executor;

alter function seyeon_private.assert_historical_g2_sealed_originals_s0_v1(
  uuid,uuid,uuid,uuid
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.assert_historical_g2_sealed_originals_s0_v1(
  uuid,uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
