-- Watchtower-Track: security
-- R2/G1 disposable pre-commit: real core ContextReady and exact DB Original Grant/SourceSet.
-- Deliberately excludes every G3 Reveal/Replay/History function.
--
-- ONLY the named disposable PostgreSQL CI fixture. NOT a migration.
-- No Production direct Execute, API route, user/LLM data or G0 permission.
\set ON_ERROR_STOP on
begin;
do $guard$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer < 150000
    or to_regprocedure(
      'seyeon_positive_candidate.commit_actual_v2_r3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text)'
    ) is null or to_regprocedure(
      'public.cmd_mark_chat_turn_context_ready_v1(uuid,uuid,uuid)'
    ) is null then
    raise exception 'G1-only R2 preparatory candidate refuses non-disposable or missing R3 baseline';
  end if;
end $guard$;

-- A single owner-issued SQL RPC performs DB original SourceSet + Original
-- Grant Pin + REAL core context_ready as ONE PostgreSQL transaction.
-- We must lock Subject -> Turn -> Attempt before nested operations:
-- avoids inversion against the existing zero-only 1640 Turn-then-Attempt path.
create function seyeon_positive_candidate.pin_and_context_ready_r4(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_sources jsonb,p_selection_digest text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $g1$
declare
  v_one jsonb;
  v_memory uuid;
  v_grant uuid;
  v_turn_state text;
  v_attempt_state text;
  v_set seyeon_positive_candidate.source_sets_r1%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_pin seyeon_positive_candidate.attempt_source_pins%rowtype;
  v_replayed boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_subject is null or p_thread is null or p_turn is null
    or p_attempt is null
    or p_selection_digest is null
    or p_selection_digest !~ '^sha256:v1:[a-f0-9]{64}$'
    or jsonb_typeof(p_sources) is distinct from 'array'
    or jsonb_array_length(p_sources)<>1 then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_request_invalid';
  end if;
  v_one:=p_sources->0;
  if jsonb_typeof(v_one) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(v_one))<>2
    or nullif(v_one->>'recordId','') is null
    or nullif(v_one->>'grantId','') is null then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_source_shape_invalid';
  end if;
  v_memory:=(v_one->>'recordId')::uuid;
  v_grant:=(v_one->>'grantId')::uuid;

  perform 1 from public.subjects s
  where s.id=p_subject and s.status='active'
    and s.merged_into_subject_id is null
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_subject_inactive';
  end if;

  perform 1 from public.conversation_threads th
  where th.id=p_thread and th.subject_id=p_subject and th.status='active'
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_thread_inactive';
  end if;
  select t.state into v_turn_state from public.chat_turns t
  where t.id=p_turn and t.thread_id=p_thread and t.subject_id=p_subject
  for update;
  if not found or v_turn_state is distinct from 'planned' then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_turn_not_planned';
  end if;
  select a.state into v_attempt_state from public.chat_turn_attempts a
  where a.id=p_attempt and a.turn_id=p_turn and a.subject_id=p_subject
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pin_jsonb is null
  for update;
  if not found or v_attempt_state is distinct from 'running' then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_attempt_not_running';
  end if;
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(
    p_subject,p_thread
  );

  if not seyeon_positive_candidate.pin_source_set_r1(
      p_subject,p_thread,p_turn,p_attempt,p_sources,p_selection_digest
    ) then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_original_source_set_refused';
  end if;
  if not seyeon_positive_candidate.pin_before_model_v1(
      p_subject,p_thread,p_turn,p_attempt,v_memory,v_grant
    ) then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_original_grant_refused';
  end if;

  select * into v_set
  from seyeon_positive_candidate.source_sets_r1
  where attempt_id=p_attempt and subject_id=p_subject and turn_id=p_turn
    and thread_id=p_thread and source_count=1
    and selected_sources_digest=p_selection_digest
  for share;
  select * into v_edge
  from seyeon_positive_candidate.source_edges_r1
  where attempt_id=p_attempt and ordinal=0 and record_kind='memory'
    and memory_id=v_memory and original_grant_id=v_grant
  for share;
  select * into v_pin
  from seyeon_positive_candidate.attempt_source_pins
  where attempt_id=p_attempt and subject_id=p_subject
    and thread_id=p_thread and turn_id=p_turn and state='pinned'
    and original_memory_id=v_memory and original_grant_id=v_grant
  for share;
  if v_set.attempt_id is null or v_edge.attempt_id is null
    or v_pin.attempt_id is null
    or v_edge.pg_payload_digest is distinct from v_pin.original_raw_digest
    or (select count(*) from seyeon_positive_candidate.source_edges_r1
        where attempt_id=p_attempt)<>1 then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_original_ancestry_mismatch';
  end if;

  v_replayed:=public.cmd_mark_chat_turn_context_ready_v1(
    p_subject,p_turn,p_attempt
  );
  if v_replayed then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_unexpected_context_replay';
  end if;
  if not exists(
    select 1 from public.chat_turns
    where id=p_turn and subject_id=p_subject and state='context_ready'
  ) then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r4_g1_not_context_ready';
  end if;

  return jsonb_build_object(
    'turnId',p_turn::text,
    'attemptId',p_attempt::text,
    'selectedSourcesDigest',v_set.selected_sources_digest,
    'recordId',v_edge.memory_id::text,
    'originalGrantId',v_edge.original_grant_id::text,
    'pgPayloadDigest',v_edge.pg_payload_digest,
    'contextReady',true
  );
end $g1$;

-- Positive G1 source writes MUST enter through atomic Owner command only.
-- The legacy 1640 Zero-only RPC is intentionally left unchanged and can
-- still serve old zero-source Attempts. The R1 XOR trigger remains installed.
revoke execute on function seyeon_positive_candidate.pin_source_set_r1(
  uuid,uuid,uuid,uuid,jsonb,text
) from myeongha_api_executor;
revoke execute on function seyeon_positive_candidate.pin_before_model_v1(
  uuid,uuid,uuid,uuid,uuid,uuid
) from myeongha_api_executor;
revoke all on function seyeon_positive_candidate.pin_and_context_ready_r4(
  uuid,uuid,uuid,uuid,jsonb,text
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.pin_and_context_ready_r4(
  uuid,uuid,uuid,uuid,jsonb,text
) to myeongha_api_executor;


commit;
\echo 'PASS offline G1 exact SourceSet+Original Grant and core ContextReady, G3 Reveal was NOT installed'
