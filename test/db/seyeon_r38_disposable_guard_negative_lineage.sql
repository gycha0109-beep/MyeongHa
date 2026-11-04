-- Watchtower-Track: security
-- R38 is a NEGATIVE-ONLY local audit of real authored guard experiments.
-- Executor metadata cannot prove any guard ran or any Provider emitted output.
-- This table NEVER grants Chat Commit/Reveal or production output authority.
\set ON_ERROR_STOP on
begin;
do $pre$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regclass('seyeon_positive_candidate.synthetic_stage_results_r37') is null
  then raise exception 'R38 needs scratch DB + R37 local stage results';
  end if;
end $pre$;

create table seyeon_positive_candidate.guard_negative_probes_r38(
  attempt_id uuid not null references public.chat_turn_attempts(id)
    on delete cascade,
  case_key text not null check (case_key in (
    'interpretation_unknown_reference','renderer_unapproved_private_source',
    'semantic_review_hash_mismatch','semantic_review_rejected'
  )),
  stage_index smallint not null check(stage_index between 2 and 4),
  purpose text not null check(purpose in (
    'turn_interpretation','dialogue_render','semantic_review'
  )),
  call_id uuid not null,
  native_wire_digest text not null
    check(native_wire_digest ~ '^sha256:wire-utf8:v1:[0-9a-f]{64}$'),
  guard_name text not null check(guard_name in (
    'guardSeyeonTurnInterpretationV2',
    'admitSeyeonRendererDraftV2',
    'guardSeyeonRendererOutputV2'
  )),
  candidate_digest text not null
    check(candidate_digest ~ '^sha256:v1:[0-9a-f]{64}$'),
  verdict text not null default 'rejected' check(verdict='rejected'),
  origin_kind text not null default 'local_invalid_fixture_not_provider_output'
    check(origin_kind='local_invalid_fixture_not_provider_output'),
  provider_dispatched boolean not null default false
    check(provider_dispatched=false),
  output_guard_verified boolean not null default false
    check(output_guard_verified=false),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(attempt_id,case_key),
  foreign key(attempt_id,stage_index)
    references seyeon_positive_candidate.synthetic_stage_results_r37(
      attempt_id,stage_index
    ) on delete cascade
);
create trigger immutable_guard_negative_probes_r38
before update on seyeon_positive_candidate.guard_negative_probes_r38
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

create function seyeon_positive_candidate.record_guard_negative_probe_r38(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_case text,p_stage_index integer,p_purpose text,p_call uuid,
  p_wire_digest text,p_guard_name text,p_candidate_digest text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $r38$
declare
  v_stage seyeon_positive_candidate.native_stage_lineage_r30%rowtype;
  v_result seyeon_positive_candidate.synthetic_stage_results_r37%rowtype;
  v_index integer;
  v_purpose text;
  v_guard text;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_current record;
  v_count integer:=0;
  v_pg_digest text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or p_candidate_digest is null
    or p_candidate_digest !~ '^sha256:v1:[0-9a-f]{64}$'
  then
    raise exception using errcode='23514',
      constraint='seyeon_r38_invalid_negative_probe';
  end if;
  v_index:=case p_case
    when 'interpretation_unknown_reference' then 2
    when 'renderer_unapproved_private_source' then 3
    when 'semantic_review_hash_mismatch' then 4
    when 'semantic_review_rejected' then 4
    else null end;
  v_purpose:=case v_index
    when 2 then 'turn_interpretation'
    when 3 then 'dialogue_render'
    when 4 then 'semantic_review'
    else null end;
  v_guard:=case p_case
    when 'interpretation_unknown_reference'
      then 'guardSeyeonTurnInterpretationV2'
    when 'renderer_unapproved_private_source'
      then 'admitSeyeonRendererDraftV2'
    when 'semantic_review_hash_mismatch'
      then 'guardSeyeonRendererOutputV2'
    when 'semantic_review_rejected'
      then 'guardSeyeonRendererOutputV2'
    else null end;
  if v_index is null or v_index<>p_stage_index or
    v_purpose is distinct from p_purpose
    or v_guard is distinct from p_guard_name then
    raise exception using errcode='23514',
      constraint='seyeon_r38_negative_probe_scope_forged';
  end if;
  perform 1 from public.subjects s where s.id=p_subject
    and s.status='active' and s.merged_into_subject_id is null for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r38_subject_not_active';
  end if;
  perform 1 from public.conversation_threads t where t.id=p_thread
    and t.subject_id=p_subject and t.status='active' for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r38_thread_not_active';
  end if;
  perform 1 from public.chat_turns t where t.id=p_turn
    and t.thread_id=p_thread and t.subject_id=p_subject
    and t.state='context_ready' for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r38_turn_not_context_ready';
  end if;
  perform 1 from public.chat_turn_attempts a
    where a.id=p_attempt and a.turn_id=p_turn
      and a.subject_id=p_subject and a.state='running'
    for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r38_attempt_not_running';
  end if;
  -- Each negative probe is tied to the R37 no-provider stage marker and
  -- its exact R30 native request. No caller can switch Attempt/Call/Stage.
  select * into v_stage
  from seyeon_positive_candidate.native_stage_lineage_r30
  where attempt_id=p_attempt and stage_index=p_stage_index
  for share;
  select * into v_result
  from seyeon_positive_candidate.synthetic_stage_results_r37
  where attempt_id=p_attempt and stage_index=p_stage_index
  for share;
  if v_stage.call_id is distinct from p_call
    or v_stage.purpose is distinct from p_purpose
    or v_stage.native_wire_digest is distinct from p_wire_digest
    or v_result.call_id is distinct from v_stage.call_id
    or v_result.purpose is distinct from v_stage.purpose
    or v_result.native_wire_digest is distinct from v_stage.native_wire_digest
    or v_result.origin_kind is distinct from 'local_synthetic_no_provider'
    or v_result.provider_dispatched is distinct from false
    or v_result.provider_output_verified is distinct from false
    or v_result.output_guard_verified is distinct from false then
    raise exception using errcode='23514',
      constraint='seyeon_r38_negative_probe_wire_or_result_unbound';
  end if;
  -- Same Subject->...->Original Grant locks as the earlier G4/G5 owners.
  -- Re-grant cannot rescue a formerly pinned exact original.
  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
    where attempt_id=p_attempt order by ordinal for share
  loop
    if v_edge.ordinal<>v_count or v_count>=2
      or v_edge.record_kind<>'memory' or
      v_edge.record_type<>'shared_detail' or
      v_edge.schema_version<>'memory-v1' then
      raise exception using errcode='23514',
        constraint='seyeon_r38_original_source_invalid';
    end if;
    select m.content_jsonb,g.granted_at into v_current
    from public.record_access_grants g
    join public.memory_items m on m.id=g.memory_item_id
      and m.subject_id=g.subject_id
    where g.id=v_edge.original_grant_id
      and g.subject_id=p_subject
      and g.memory_item_id=v_edge.memory_id
      and g.grantee_character_id='seyeon'
      and g.revoked_at is null and m.revoked_at is null
      and m.source_kind='user_approved'
      and m.memory_type='shared_detail'
      and m.schema_version='memory-v1'
    for share of g,m;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_r38_original_grant_revoked';
    end if;
    v_pg_digest:='sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex');
    if v_pg_digest is distinct from v_edge.pg_payload_digest
      or v_current.granted_at is distinct from v_edge.original_granted_at then
      raise exception using errcode='23514',
        constraint='seyeon_r38_original_payload_changed';
    end if;
    v_count:=v_count+1;
  end loop;
  if v_count<>2 then
    raise exception using errcode='23514',
      constraint='seyeon_r38_original_count_invalid';
  end if;
  insert into seyeon_positive_candidate.guard_negative_probes_r38(
    attempt_id,case_key,stage_index,purpose,call_id,
    native_wire_digest,guard_name,candidate_digest
  ) values (
    p_attempt,p_case,p_stage_index,p_purpose,p_call,
    p_wire_digest,p_guard_name,p_candidate_digest
  );
  return jsonb_build_object(
    'status','isolated_local_invalid_fixture_rejected_not_provider_output',
    'attemptId',p_attempt::text,'caseKey',p_case,
    'stageIndex',p_stage_index,'purpose',p_purpose,'callId',p_call::text,
    'nativeWireDigest',p_wire_digest,'candidateDigest',p_candidate_digest,
    'guardName',p_guard_name,
    'verdict','rejected',
    'providerDispatched',false,'outputGuardVerified',false,
    'permitsProvider',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
end $r38$;
revoke all on seyeon_positive_candidate.guard_negative_probes_r38
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function
  seyeon_positive_candidate.record_guard_negative_probe_r38(
    uuid,uuid,uuid,uuid,text,integer,text,uuid,text,text,text
  ) from public,anon,authenticated,service_role;
grant execute on function
  seyeon_positive_candidate.record_guard_negative_probe_r38(
    uuid,uuid,uuid,uuid,text,integer,text,uuid,text,text,text
  ) to myeongha_api_executor;
do $acl$
begin
  if has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.guard_negative_probes_r38','INSERT')
    or has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.guard_negative_probes_r38','SELECT')
    or has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.guard_negative_probes_r38','UPDATE')
    or has_function_privilege('public',
       'seyeon_positive_candidate.record_guard_negative_probe_r38(uuid,uuid,uuid,uuid,text,integer,text,uuid,text,text,text)','EXECUTE')
    or not has_function_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.record_guard_negative_probe_r38(uuid,uuid,uuid,uuid,text,integer,text,uuid,text,text,text)','EXECUTE')
  then
    raise exception 'R38 local negative-only guard owner ACL failed';
  end if;
end $acl$;
commit;
\echo 'PASS R38 negative-only guard probe audit; no output approval or G2/Reveal authority'
