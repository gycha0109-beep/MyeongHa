-- Watchtower-Track: security
-- R21: TWO exact original Memories -> immutable R1 Parent/Edges + first
-- original attempt pin + REAL ContextReady in ONE disposable PostgreSQL TX.
-- This does not authorize any Provider, actual Production migration or Reveal.
\set ON_ERROR_STOP on
begin;
do $guard$
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
     or current_setting('server_version_num')::integer < 150000
     or to_regprocedure(
       'seyeon_positive_candidate.pin_and_context_ready_r4(uuid,uuid,uuid,uuid,jsonb,text)'
     ) is null then
    raise exception 'R21 refuses non-disposable or missing R2 baseline';
  end if;
end $guard$;

create function seyeon_positive_candidate.pin_two_and_context_ready_r21(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_sources jsonb,p_selection_digest text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $r21$
declare
  v_first jsonb;
  v_first_memory uuid;
  v_first_grant uuid;
  v_turn_state text;
  v_attempt_state text;
  v_set seyeon_positive_candidate.source_sets_r1%rowtype;
  v_pin seyeon_positive_candidate.attempt_source_pins%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_current record;
  v_pg_digest text;
  v_count integer := 0;
  v_replayed boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
     or p_subject is null or p_thread is null or p_turn is null
     or p_attempt is null or p_selection_digest is null
     or p_selection_digest !~ '^sha256:v1:[a-f0-9]{64}$'
     or jsonb_typeof(p_sources) is distinct from 'array'
     or jsonb_array_length(p_sources) <> 2 then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_request_invalid';
  end if;
  v_first := p_sources->0;
  if jsonb_typeof(v_first) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(v_first)) <> 2
    or nullif(v_first->>'recordId','') is null
    or nullif(v_first->>'grantId','') is null then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_first_source_invalid';
  end if;
  v_first_memory := (v_first->>'recordId')::uuid;
  v_first_grant := (v_first->>'grantId')::uuid;

  -- Preserve the existing subject -> thread -> turn -> attempt lock order.
  perform 1 from public.subjects s
    where s.id=p_subject and s.kind='member' and s.status='active'
      and s.merged_into_subject_id is null for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_subject_inactive';
  end if;
  perform 1 from public.conversation_threads th
    where th.id=p_thread and th.subject_id=p_subject
      and th.status='active' for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_thread_inactive';
  end if;
  select t.state into v_turn_state from public.chat_turns t
    where t.id=p_turn and t.thread_id=p_thread and t.subject_id=p_subject
    for update;
  if not found or v_turn_state is distinct from 'planned' then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_turn_not_planned';
  end if;
  select a.state into v_attempt_state from public.chat_turn_attempts a
    where a.id=p_attempt and a.turn_id=p_turn and a.subject_id=p_subject
      and a.planner_version='seyeon-production-chat-planner-v1'
      and a.seyeon_personal_source_pin_jsonb is null for update;
  if not found or v_attempt_state is distinct from 'running' then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_attempt_not_running';
  end if;
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(
    p_subject,p_thread
  );

  if not seyeon_positive_candidate.pin_source_set_r1(
    p_subject,p_thread,p_turn,p_attempt,p_sources,p_selection_digest
  ) then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_two_sources_refused';
  end if;
  -- Legacy scalar attempt pin is a FIRST-source cross-check only. The
  -- immutable R1 two-edge SourceSet contains BOTH current original Grants.
  -- Do NOT treat this scalar as a full two-source G2/Reveal authorization.
  if not seyeon_positive_candidate.pin_before_model_v1(
    p_subject,p_thread,p_turn,p_attempt,v_first_memory,v_first_grant
  ) then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_first_original_pin_refused';
  end if;
  select * into v_set from seyeon_positive_candidate.source_sets_r1
    where attempt_id=p_attempt and subject_id=p_subject
      and thread_id=p_thread and turn_id=p_turn
      and source_count=2 and selected_sources_digest=p_selection_digest
    for share;
  select * into v_pin from seyeon_positive_candidate.attempt_source_pins
    where attempt_id=p_attempt and subject_id=p_subject
      and thread_id=p_thread and turn_id=p_turn and state='pinned'
      and original_memory_id=v_first_memory
      and original_grant_id=v_first_grant
    for share;
  if v_set.attempt_id is null or v_pin.attempt_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_parent_or_first_pin_missing';
  end if;

  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
      where attempt_id=p_attempt order by ordinal for share
  loop
    if v_edge.ordinal <> v_count or v_count >= 2
       or v_edge.record_kind <> 'memory'
       or v_edge.record_type <> 'shared_detail'
       or v_edge.schema_version <> 'memory-v1' then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r21_edge_shape_mismatch';
    end if;
    select m.memory_type,m.schema_version,m.content_jsonb,g.granted_at
      into v_current
      from public.record_access_grants g
      join public.memory_items m
        on m.id=g.memory_item_id and m.subject_id=g.subject_id
      where g.id=v_edge.original_grant_id
        and g.subject_id=p_subject and g.memory_item_id=v_edge.memory_id
        and g.grantee_character_id='seyeon' and g.revoked_at is null
        and m.revoked_at is null and m.source_kind='user_approved'
      for share of g,m;
    if not found
       or v_current.memory_type is distinct from v_edge.record_type
       or v_current.schema_version is distinct from v_edge.schema_version
       or v_current.granted_at is distinct from v_edge.original_granted_at then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r21_original_grant_invalid';
    end if;
    v_pg_digest := 'sha256:pg-jsonb:v1:' ||
      encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex');
    if v_pg_digest is distinct from v_edge.pg_payload_digest then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r21_original_content_changed';
    end if;
    if v_count=0 and (v_edge.memory_id is distinct from v_first_memory
       or v_edge.original_grant_id is distinct from v_first_grant
       or v_edge.pg_payload_digest is distinct from v_pin.original_raw_digest)
    then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r21_first_pin_not_same_edge';
    end if;
    v_count := v_count+1;
  end loop;
  if v_count<>2 then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_missing_second_original';
  end if;

  v_replayed := public.cmd_mark_chat_turn_context_ready_v1(
    p_subject,p_turn,p_attempt
  );
  if v_replayed or not exists(
    select 1 from public.chat_turns where id=p_turn
      and subject_id=p_subject and state='context_ready'
  ) then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r21_context_ready_not_atomic';
  end if;
  return jsonb_build_object(
    'attemptId',p_attempt::text,'selectedSourcesDigest',p_selection_digest,
    'originalSourceCount',2,'contextReady',true,
    'permitsProvider',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
end $r21$;

revoke all on function seyeon_positive_candidate.pin_two_and_context_ready_r21(
  uuid,uuid,uuid,uuid,jsonb,text
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.pin_two_and_context_ready_r21(
  uuid,uuid,uuid,uuid,jsonb,text
) to myeongha_api_executor;
do $acl$
begin
  if has_function_privilege('public',
      'seyeon_positive_candidate.pin_two_and_context_ready_r21(uuid,uuid,uuid,uuid,jsonb,text)',
      'EXECUTE')
   or has_function_privilege('service_role',
      'seyeon_positive_candidate.pin_two_and_context_ready_r21(uuid,uuid,uuid,uuid,jsonb,text)',
      'EXECUTE')
   or not has_function_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.pin_two_and_context_ready_r21(uuid,uuid,uuid,uuid,jsonb,text)',
      'EXECUTE') then
    raise exception 'R21 scratch only executor ACL mismatch';
  end if;
end $acl$;
commit;
\echo 'PASS R21 two original Grants and actual ContextReady candidate installed in disposable PG'
