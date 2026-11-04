-- Watchtower-Track: security
-- S0 G1 immutable historical final-Context AGREEMENT, not admission.
-- SOURCE ONLY / disposable installation; not a Production migration.
begin;

alter table public.chat_turn_attempts
  add column if not exists seyeon_historical_final_context_seal_jsonb jsonb;

create function seyeon_private.reject_historical_final_context_seal_mutation_s0_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public
as $seal_immutable$
begin
  if old.seyeon_historical_final_context_seal_jsonb is not null
     and new.seyeon_historical_final_context_seal_jsonb
       is distinct from old.seyeon_historical_final_context_seal_jsonb then
    raise exception using errcode='23514',
      constraint='seyeon_g1_historical_final_context_seal_immutable',
      message='Historical final model Context seal is immutable';
  end if;
  if old.seyeon_historical_final_context_seal_jsonb is null
     and new.seyeon_historical_final_context_seal_jsonb is not null
     and (old.state is distinct from 'running'
       or new.state is distinct from 'running'
       or old.seyeon_personal_source_pin_jsonb is null
       or old.seyeon_personal_source_pin_jsonb
          <>jsonb_build_object(
             'historicalCandidateProof',
             old.seyeon_personal_source_pin_jsonb->'historicalCandidateProof')) then
    raise exception using errcode='23514',
      constraint='seyeon_g1_historical_final_seal_requires_candidate',
      message='Historical final Context seal requires immutable running candidate';
  end if;
  return new;
end
$seal_immutable$;

create trigger seyeon_g1_historical_final_context_seal_immutable_s0_v1
before update on public.chat_turn_attempts for each row
execute function seyeon_private.reject_historical_final_context_seal_mutation_s0_v1();

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.cmd_seal_historical_final_context_s0_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_actual_final_context_digest text,p_pre_model_context_digest text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=on
as $historical_final_seal$
declare
  v_proof jsonb;
  v_audit jsonb;
  v_seal jsonb;
  v_count integer;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_turn_id is null or p_attempt_id is null
     or p_actual_final_context_digest
        !~ '^sha256:v1:[a-f0-9]{64}$'
     or p_pre_model_context_digest
        !~ '^sha256:v1:[a-f0-9]{64}$' then
    raise exception using errcode='42501',
      constraint='seyeon_history_final_context_input_invalid',
      message='Historical final model Context digest invalid';
  end if;
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  select a.seyeon_personal_source_pin_jsonb->'historicalCandidateProof'
    into v_proof
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.id=p_attempt_id and a.turn_id=t.id and a.subject_id=t.subject_id
  where t.id=p_turn_id and t.subject_id=p_subject_id
    and t.thread_id=p_thread_id and t.state='context_ready'
    and a.state='running'
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pinned_at is not null
    and a.seyeon_historical_final_context_seal_jsonb is null
    and a.seyeon_personal_source_pin_jsonb=
       jsonb_build_object('historicalCandidateProof',
                         a.seyeon_personal_source_pin_jsonb->'historicalCandidateProof')
  for update of t,a;
  if not found or jsonb_typeof(v_proof) is distinct from 'object'
     or v_proof->>'schemaVersion' is distinct from
       'seyeon-g1-historical-source-candidate-v4'
     or v_proof->>'subjectId' is distinct from p_subject_id::text
     or v_proof->>'threadId' is distinct from p_thread_id::text
     or v_proof->>'turnId' is distinct from p_turn_id::text
     or v_proof->>'attemptId' is distinct from p_attempt_id::text
     or v_proof->>'expectedFinalModelContextDigest'
          is distinct from p_actual_final_context_digest
     or v_proof->>'preModelContextDigest'
          is distinct from p_pre_model_context_digest
     or v_proof->>'authorizesModel' is distinct from 'false'
     or v_proof->>'permitsAtomicCommit' is distinct from 'false'
     or v_proof->>'permitsHttpReveal' is distinct from 'false'
  then
    raise exception using errcode='42501',
      constraint='seyeon_history_final_context_candidate_mismatch',
      message='Historical candidate and final Context differ';
  end if;
  v_count:=(v_proof->>'historicalSourceCount')::integer;
  if v_count < 1 or v_count>23 then
    raise exception using errcode='42501',
      constraint='seyeon_history_final_context_count_invalid',
      message='Historical Context window invalid';
  end if;

  -- Recheck every historical original and the exact original Memory Grant
  -- while the same DB transaction retains canonical Subject and Attempt locks.
  -- This is ONLY an audit before a future G1 positive source authority.
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
      constraint='seyeon_history_final_context_originals_not_current',
      message='Historical Context original authority is unavailable';
  end if;

  v_seal:=jsonb_build_object(
    'schemaVersion','seyeon-g1-historical-final-context-seal-s0-v1',
    'subjectId',p_subject_id::text,
    'threadId',p_thread_id::text,
    'turnId',p_turn_id::text,
    'attemptId',p_attempt_id::text,
    'candidatePgJsonbDigest','sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_proof::text,'UTF8')),'hex'),
    'finalModelContextDigest',p_actual_final_context_digest,
    'preModelContextDigest',p_pre_model_context_digest,
    'historicalSourceCount',v_count,
    'originalsCurrentAtSeal',true,
    'authorizesModel',false,
    'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
  update public.chat_turn_attempts a
  set seyeon_historical_final_context_seal_jsonb=v_seal
  where a.id=p_attempt_id and a.turn_id=p_turn_id
    and a.subject_id=p_subject_id and a.state='running'
    and a.seyeon_historical_final_context_seal_jsonb is null;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_history_final_context_write_failed',
      message='Historical final Context seal could not be persisted';
  end if;
  -- Never transition Attempt or Call Provider or return Model/Commit/Reveal grants.
  return v_seal;
end
$historical_final_seal$;

alter function seyeon_private.cmd_seal_historical_final_context_s0_v1(
  uuid,uuid,uuid,uuid,text,text
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.cmd_seal_historical_final_context_s0_v1(
  uuid,uuid,uuid,uuid,text,text
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
