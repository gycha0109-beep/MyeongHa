-- Watchtower-Track: security
-- W81 G1 explicit SOURCE-SELECTION admission, NOT paid/Provider activation.
-- SOURCE ONLY; this S0 function is absent from Production migrations.
-- No API EXECUTE grant; model dispatch, Commit and Reveal remain denied.
begin;
alter table public.chat_turn_attempts
 add column if not exists seyeon_historical_g1_source_admission_jsonb jsonb;

create function seyeon_private.reject_historical_g1_source_admission_mutation_s0_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public
as $admission_immutable$
begin
 if old.seyeon_historical_g1_source_admission_jsonb is not null
    and new.seyeon_historical_g1_source_admission_jsonb
      is distinct from old.seyeon_historical_g1_source_admission_jsonb then
   raise exception using errcode='23514',
     constraint='seyeon_historical_g1_source_admission_immutable',
     message='G1 source admission is immutable';
 end if;
 if old.seyeon_historical_g1_source_admission_jsonb is null
    and new.seyeon_historical_g1_source_admission_jsonb is not null
    and (current_user is distinct from 'myeongha_seyeon_chat_runtime_owner'
      or old.state is distinct from 'running'
      or new.state is distinct from 'running'
      or old.seyeon_historical_final_context_seal_jsonb is null
      or old.seyeon_personal_source_pin_jsonb is null) then
    raise exception using errcode='23514',
      constraint='seyeon_historical_g1_source_admission_requires_owner',
      message='G1 original source admission must follow owner-verified pre-model seal';
 end if;
 return new;
end
$admission_immutable$;
create trigger seyeon_historical_g1_source_admission_immutable_s0_v1
before update on public.chat_turn_attempts for each row
execute function seyeon_private.reject_historical_g1_source_admission_mutation_s0_v1();

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;
create function seyeon_private.cmd_admit_historical_g1_model_sources_s0_v1(
 p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
 p_exact_final_context_digest text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=on
as $admit_history_sources$
declare
 v_candidate jsonb;
 v_seal jsonb;
 v_audit jsonb;
 v_admission jsonb;
 v_count integer;
begin
 perform public.assert_myeongha_subject_context_v1(p_subject_id);
 if p_thread_id is null or p_turn_id is null or p_attempt_id is null
    or p_exact_final_context_digest !~ '^sha256:v1:[a-f0-9]{64}$' then
   raise exception using errcode='42501',
     constraint='seyeon_historical_g1_admission_input_invalid',
     message='Historical G1 admission input invalid';
 end if;
 perform seyeon_private.lock_memory_subject_v1(p_subject_id);
 select a.seyeon_personal_source_pin_jsonb->'historicalCandidateProof',
        a.seyeon_historical_final_context_seal_jsonb
 into v_candidate,v_seal
 from public.chat_turns t
 join public.chat_turn_attempts a
    on a.id=p_attempt_id and a.turn_id=t.id
    and a.subject_id=t.subject_id
 where t.id=p_turn_id and t.subject_id=p_subject_id
   and t.thread_id=p_thread_id and t.state='context_ready'
   and a.state='running'
   and a.planner_version='seyeon-production-chat-planner-v1'
   and a.seyeon_personal_source_pinned_at is not null
   and a.seyeon_historical_g1_source_admission_jsonb is null
   and a.seyeon_personal_source_pin_jsonb=
       jsonb_build_object('historicalCandidateProof',
          a.seyeon_personal_source_pin_jsonb->'historicalCandidateProof')
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
    or v_candidate->>'recordKind' is distinct from 'memory'
    or v_candidate->>'characterId' is distinct from 'seyeon'
    or v_seal->>'finalModelContextDigest'
       is distinct from p_exact_final_context_digest
    or v_candidate->>'expectedFinalModelContextDigest'
       is distinct from p_exact_final_context_digest
    or v_seal->>'preModelContextDigest'
       is distinct from v_candidate->>'preModelContextDigest'
    or v_seal->>'candidatePgJsonbDigest' is distinct from
       'sha256:pg-jsonb:v1:'||
       encode(sha256(convert_to(v_candidate::text,'UTF8')),'hex')
    or v_seal->>'originalsCurrentAtSeal' is distinct from 'true'
    or v_candidate->>'authorizesModel' is distinct from 'false'
    or v_candidate->>'permitsAtomicCommit' is distinct from 'false'
    or v_candidate->>'permitsHttpReveal' is distinct from 'false'
    or v_seal->>'authorizesModel' is distinct from 'false'
    or v_seal->>'permitsAtomicCommit' is distinct from 'false'
    or v_seal->>'permitsHttpReveal' is distinct from 'false'
 then
   raise exception using errcode='42501',
     constraint='seyeon_historical_g1_admission_source_mismatch',
     message='Original historical source or final Context seal mismatched';
 end if;
 v_count:=(v_candidate->>'historicalSourceCount')::integer;
 if v_count < 1 or v_count>23
    or v_seal->>'historicalSourceCount' is distinct from v_count::text
 then
   raise exception using errcode='42501',
     constraint='seyeon_historical_g1_admission_window_invalid',
     message='Historical source window incomplete';
 end if;

 -- A model-source type must be explicitly approved, not merely projected.
 -- The registry is empty/default-disabled outside the isolated test fixture.
 perform 1 from public.seyeon_positive_source_type_registry_v1 reg
 where reg.record_kind='memory' and reg.enabled
   and reg.record_type=v_candidate->>'recordType'
   and reg.schema_version=v_candidate->>'recordSchemaVersion'
   and reg.projector_version=v_candidate->>'projectorVersion'
 for share of reg;
 if not found then
   raise exception using errcode='42501',
     constraint='seyeon_historical_g1_model_source_type_unapproved',
     message='Historical model source type is not approved';
 end if;

 -- Canonical exact originals and prior Assistant's original Grant are
 -- rechecked in the SAME transaction that persists source eligibility.
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
     constraint='seyeon_historical_g1_admission_originals_revoked',
     message='Historical original source authority is no longer current';
 end if;

 v_admission:=jsonb_build_object(
   'schemaVersion','seyeon-g1-historical-source-admission-s0-v1',
   'subjectId',p_subject_id::text,'threadId',p_thread_id::text,
   'turnId',p_turn_id::text,'attemptId',p_attempt_id::text,
   'characterId','seyeon',
   'recordKind','memory',
   'recordId',v_candidate->>'recordId',
   'originalGrantId',v_candidate->>'originalGrantId',
   'recordType',v_candidate->>'recordType',
   'recordSchemaVersion',v_candidate->>'recordSchemaVersion',
   'projectorVersion',v_candidate->>'projectorVersion',
   'originalPgJsonbDigest',v_candidate->>'originalPgJsonbDigest',
   'selectedSourcesDigest',v_candidate->>'selectedSourcesDigest',
   'projectedMemoryDigest',v_candidate->>'projectedMemoryDigest',
   'historicalSourceCensusDigest',v_candidate->>'historicalSourceCensusDigest',
   'historicalAssistantOriginalSourcesDigest',
      v_candidate->>'historicalAssistantOriginalSourcesDigest',
   'historicalSourceCount',v_count,
   'candidatePgJsonbDigest',v_seal->>'candidatePgJsonbDigest',
   'finalModelContextDigest',p_exact_final_context_digest,
   'originalsCurrentAtAdmission',true,
   'authorizesSourceSelection',true,
   'permitsModelDispatch',false,
   'permitsAtomicCommit',false,
   'permitsHttpReveal',false
 );
 update public.chat_turn_attempts a
 set seyeon_historical_g1_source_admission_jsonb=v_admission
 where a.id=p_attempt_id and a.turn_id=p_turn_id
   and a.subject_id=p_subject_id and a.state='running'
   and a.seyeon_historical_g1_source_admission_jsonb is null;
 if not found then
   raise exception using errcode='42501',
     constraint='seyeon_historical_g1_admission_write_failed',
     message='Historical G1 admission could not be stored';
 end if;
 -- Source eligibility DOES NOT imply Provider/Commit/Reveal release.
 return v_admission;
end
$admit_history_sources$;
alter function seyeon_private.cmd_admit_historical_g1_model_sources_s0_v1(
 uuid,uuid,uuid,uuid,text
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.cmd_admit_historical_g1_model_sources_s0_v1(
 uuid,uuid,uuid,uuid,text
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
