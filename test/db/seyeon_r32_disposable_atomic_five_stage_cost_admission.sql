-- Watchtower-Track: security
-- R32: atomic original Grant, real native wire, existing Cost Governor
-- reservation for FIVE synthetic, offline-only model stages.
-- No Provider dispatch, real model output, production authorization or G2.
\set ON_ERROR_STOP on
begin;
do $guard$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regprocedure('seyeon_positive_candidate.claim_two_original_stage_wire_r30(uuid,uuid,uuid,uuid,text,uuid,text,text,text)') is null
    or to_regprocedure('seyeon_positive_candidate.seal_governed_wire_cost_r28(uuid,uuid,uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,date)') is null
    or to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)') is null
  then raise exception 'R32 only installs after isolated R28, R30 and DB Cost Governor';
  end if;
end $guard$;

-- A single restricted RPC controls the FIVE stage order/Grant readback and
-- actual DB budget reservation. Rollback of ANY step removes both the R30
-- stage marker and the Governor budget debit.
create function seyeon_positive_candidate.claim_governed_stage_r32(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_purpose text,p_call uuid,p_selected_digest text,p_context_digest text,
  p_native_request_digest text,p_wire text,p_policy text,p_rate text,
  p_input_bound bigint
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $claim$
declare
  v_stage jsonb;
  v_start record;
  v_seal jsonb;
  v_wire_digest text;
  v_bytes bigint;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or p_policy is null or p_rate is null or p_input_bound is null
    or p_input_bound<1 or p_context_digest is null
    or p_context_digest !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_wire is null or octet_length(p_wire) not between 1 and 65536
  then
    raise exception using errcode='23514',
      constraint='seyeon_r32_invalid_admission';
  end if;
  -- R30 owns the source-to-native-wire proof, exact stage order and
  -- current Grant/Memory SHARE locks. A forged new Call ID or changed body
  -- receives no implicit replay permission.
  v_stage:=seyeon_positive_candidate.claim_two_original_stage_wire_r30(
    p_subject,p_thread,p_turn,p_attempt,p_purpose,p_call,
    p_selected_digest,p_native_request_digest,p_wire
  );
  if jsonb_typeof(v_stage) is distinct from 'object'
    or v_stage->>'callId' is distinct from p_call::text
    or v_stage->>'purpose' is distinct from p_purpose
    or v_stage->>'selectedSourcesDigest' is distinct from p_selected_digest
    or v_stage->>'sourceCount' is distinct from '2'
    or v_stage->'permitsProvider' is distinct from 'false'::jsonb
  then
    raise exception using errcode='23514',
      constraint='seyeon_r32_unbound_native_stage';
  end if;
  v_wire_digest:=v_stage->>'nativeWireDigest';
  v_bytes:=octet_length(p_wire);
  -- Actual immutable policy/rate, per-Subject cap, UTC global budget,
  -- attempt/call uniqueness, and cost ledger receipt remain in existing DB.
  select * into strict v_start
  from public.cmd_governed_start_seyeon_ai_call_v1(
    p_subject,p_turn,p_attempt,'chat',p_call,p_purpose,
    'openai-responses','seyeon-r35-offline',p_policy,p_rate,
    p_input_bound,256,v_bytes
  );
  if v_start.call_id is distinct from p_call
     or v_start.ceiling_micro_usd is null
     or v_start.ceiling_micro_usd<1
     or v_start.bucket_utc_date is null
  then
    raise exception using errcode='23514',
      constraint='seyeon_r32_unbound_cost_reservation';
  end if;
  if p_purpose='turn_interpretation' then
    -- For Interpreter alone, keep the existing R28 final model Context
    -- marker in the SAME transaction. No R28 duplicate or orphan cost.
    v_seal:=seyeon_positive_candidate.seal_governed_wire_cost_r28(
      p_subject,p_thread,p_turn,p_attempt,p_call,
      p_selected_digest,p_context_digest,v_wire_digest,
      p_input_bound,256,v_start.ceiling_micro_usd,v_start.bucket_utc_date
    );
    if v_seal->>'callId' is distinct from p_call::text
      or v_seal->>'nativeWireDigest' is distinct from v_wire_digest
      or v_seal->>'finalModelContextDigest' is distinct from p_context_digest
      or v_seal->'sealed' is distinct from 'true'::jsonb
      or v_seal->'permitsProvider' is distinct from 'false'::jsonb
    then
      raise exception using errcode='23514',
        constraint='seyeon_r32_unbound_interpreter_cost_seal';
    end if;
  end if;
  return jsonb_build_object(
    'status','disposable_stage_and_cost_reserved_without_dispatch',
    'attemptId',p_attempt::text,'purpose',p_purpose,
    'stageIndex',v_stage->'stageIndex','callId',p_call::text,
    'nativeWireDigest',v_wire_digest,
    'previousWireDigest',v_stage->'previousWireDigest',
    'selectedSourcesDigest',p_selected_digest,
    'inputCeilingTokens',p_input_bound,
    'outputCeilingTokens',256,
    'reservedMicroUsd',v_start.ceiling_micro_usd::text,
    'bucketUtcDate',v_start.bucket_utc_date::text,
    'interpreterContextSealed',p_purpose='turn_interpretation',
    'permitsProvider',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
end $claim$;

revoke all on function seyeon_positive_candidate.claim_governed_stage_r32(
  uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,bigint
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.claim_governed_stage_r32(
  uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,bigint
) to myeongha_api_executor;
do $acl$
begin
  if has_function_privilege('public',
      'seyeon_positive_candidate.claim_governed_stage_r32(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,bigint)','EXECUTE')
    or not has_function_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.claim_governed_stage_r32(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,bigint)','EXECUTE')
    or has_table_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.native_stage_lineage_r30','INSERT')
  then raise exception 'R32 restricted governed stage claim ACL failed'; end if;
end $acl$;
commit;
\echo 'PASS R32 five-stage native cost owner is disposable-only; no Provider permission'
