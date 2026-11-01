-- Watchtower-Track: security
-- R37 records LOCAL SYNTHETIC STAGE OUTCOMES, never model responses.
-- Deletion on privacy/Attempt cascade is allowed; direct API DELETE is not.
-- These metadata are NOT evidence that any Provider ran, responded or passed
-- Character/semantic output guards. They can NEVER authorize G2 or Reveal.
\set ON_ERROR_STOP on
begin;
do $pre$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regclass('seyeon_positive_candidate.native_stage_lineage_r30') is null
    or to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)') is null
  then raise exception 'R37 requires the isolated R30 and existing Cost Governor';
  end if;
end $pre$;

create table seyeon_positive_candidate.synthetic_stage_results_r37(
  attempt_id uuid not null references public.chat_turn_attempts(id) on delete cascade,
  stage_index smallint not null check (stage_index between 0 and 4),
  purpose text not null check (purpose in (
    'integrity_classification','disclosure_classification',
    'turn_interpretation','dialogue_render','semantic_review'
  )),
  call_id uuid not null,
  native_wire_digest text not null
    check (native_wire_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  synthetic_payload_digest text not null
    check (synthetic_payload_digest ~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'),
  origin_kind text not null default 'local_synthetic_no_provider'
    check (origin_kind='local_synthetic_no_provider'),
  provider_dispatched boolean not null default false
    check (provider_dispatched=false),
  provider_output_verified boolean not null default false
    check (provider_output_verified=false),
  output_guard_verified boolean not null default false
    check (output_guard_verified=false),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (attempt_id,stage_index),
  unique (attempt_id,call_id),
  foreign key (attempt_id,stage_index)
    references seyeon_positive_candidate.native_stage_lineage_r30(
      attempt_id,stage_index
    ) on delete cascade
);
create trigger immutable_synthetic_stage_results_r37
before update on seyeon_positive_candidate.synthetic_stage_results_r37
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

create function seyeon_positive_candidate.record_synthetic_stage_result_r37(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_purpose text,p_call uuid,p_payload jsonb
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $r37$
declare
  v_stage seyeon_positive_candidate.native_stage_lineage_r30%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_current record;
  v_count integer:=0;
  v_digest text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
  then
    raise exception using errcode='23514',
      constraint='seyeon_r37_invalid_synthetic_result';
  end if;
  -- Lock ordering follows G1/G4: Subject -> Thread -> Turn -> Attempt.
  perform 1 from public.subjects s where s.id=p_subject
    and s.status='active' and s.merged_into_subject_id is null for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r37_subject_not_active';
  end if;
  perform 1 from public.conversation_threads th
    where th.id=p_thread and th.subject_id=p_subject and th.status='active'
    for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r37_thread_not_active';
  end if;
  perform 1 from public.chat_turns t
    where t.id=p_turn and t.subject_id=p_subject
      and t.thread_id=p_thread and t.state='context_ready'
    for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r37_turn_not_context_ready';
  end if;
  perform 1 from public.chat_turn_attempts a
    where a.id=p_attempt and a.subject_id=p_subject
      and a.turn_id=p_turn and a.state='running'
    for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r37_attempt_not_running';
  end if;
  select * into v_stage
  from seyeon_positive_candidate.native_stage_lineage_r30
  where attempt_id=p_attempt and purpose=p_purpose and call_id=p_call
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r37_stage_receipt_not_found';
  end if;
  -- Re-lock BOTH exact original Grants and original Memory JSONB before
  -- writing a new local result. A previously paid reservation or newer
  -- replacement Grant cannot resurrect an already revoked original.
  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
    where attempt_id=p_attempt order by ordinal for share
  loop
    if v_edge.ordinal<>v_count or v_count>=2
      or v_edge.record_kind<>'memory'
      or v_edge.record_type<>'shared_detail'
      or v_edge.schema_version<>'memory-v1' then
      raise exception using errcode='23514',
        constraint='seyeon_r37_original_source_invalid';
    end if;
    select g.granted_at,m.content_jsonb
      into v_current
    from public.record_access_grants g
    join public.memory_items m
      on m.id=g.memory_item_id and m.subject_id=g.subject_id
    where g.id=v_edge.original_grant_id and g.subject_id=p_subject
      and g.memory_item_id=v_edge.memory_id
      and g.grantee_character_id='seyeon'
      and g.revoked_at is null and m.revoked_at is null
      and m.source_kind='user_approved'
      and m.memory_type='shared_detail'
      and m.schema_version='memory-v1'
    for share of g,m;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_r37_original_grant_revoked';
    end if;
    v_digest:='sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex');
    if v_current.granted_at is distinct from v_edge.original_granted_at
      or v_digest is distinct from v_edge.pg_payload_digest then
      raise exception using errcode='23514',
        constraint='seyeon_r37_original_source_changed';
    end if;
    v_count:=v_count+1;
  end loop;
  if v_count<>2 then
    raise exception using errcode='23514',
      constraint='seyeon_r37_original_source_count_mismatch';
  end if;
  -- A prior output marker must exist before advancing; no gap in locally
  -- observed attempts, but a marker cannot prove an actual Model output.
  if v_stage.stage_index>0 and not exists (
    select 1 from seyeon_positive_candidate.synthetic_stage_results_r37 r
    where r.attempt_id=p_attempt
      and r.stage_index=v_stage.stage_index-1
  ) then
    raise exception using errcode='23514',
      constraint='seyeon_r37_previous_stage_result_missing';
  end if;
  perform 1 from public.seyeon_ai_call_cost_events e
  where e.call_id=p_call and e.subject_id=p_subject
    and e.turn_id=p_turn and e.attempt_id=p_attempt
    and e.phase='chat' and e.purpose=p_purpose
    and e.lifecycle_state='started'
    and e.governor_receipt_pinned_at is not null
    and e.governor_output_cap_tokens=v_stage.output_ceiling_tokens
    and e.governor_ceiling_micro_usd>0
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r37_governed_reservation_not_found';
  end if;
  if (select count(*) from jsonb_object_keys(p_payload))<>9
    or not (p_payload ?& array[
      'schemaVersion','attemptId','stageIndex','purpose','callId',
      'nativeWireDigest','providerDispatched','outputGuardVerified','result'
    ])
    or p_payload->>'schemaVersion' is distinct from 'seyeon-r37-synthetic-stage-result-v1'
    or p_payload->>'attemptId' is distinct from p_attempt::text
    or p_payload->'stageIndex' is distinct from to_jsonb(v_stage.stage_index)
    or p_payload->>'purpose' is distinct from p_purpose
    or p_payload->>'callId' is distinct from p_call::text
    or p_payload->>'nativeWireDigest' is distinct from v_stage.native_wire_digest
    or p_payload->'providerDispatched' is distinct from 'false'::jsonb
    or p_payload->'outputGuardVerified' is distinct from 'false'::jsonb
    or p_payload->'result' is distinct from
       '{"kind":"no_provider_output","verified":false}'::jsonb
  then
    raise exception using errcode='23514',
      constraint='seyeon_r37_synthetic_result_authority_forged';
  end if;
  v_digest:='sha256:pg-jsonb:v1:'||
    encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  insert into seyeon_positive_candidate.synthetic_stage_results_r37(
    attempt_id,stage_index,purpose,call_id,native_wire_digest,
    synthetic_payload_digest
  ) values(
    p_attempt,v_stage.stage_index,p_purpose,p_call,
    v_stage.native_wire_digest,v_digest
  );
  return jsonb_build_object(
    'status','isolated_synthetic_no_provider_output',
    'attemptId',p_attempt::text,'stageIndex',v_stage.stage_index,
    'purpose',p_purpose,'callId',p_call::text,
    'syntheticPayloadDigest',v_digest,
    'providerDispatched',false,'providerOutputVerified',false,
    'outputGuardVerified',false,
    'permitsProvider',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
end $r37$;
revoke all on seyeon_positive_candidate.synthetic_stage_results_r37
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function
  seyeon_positive_candidate.record_synthetic_stage_result_r37(
    uuid,uuid,uuid,uuid,text,uuid,jsonb
  ) from public,anon,authenticated,service_role;
grant execute on function
  seyeon_positive_candidate.record_synthetic_stage_result_r37(
    uuid,uuid,uuid,uuid,text,uuid,jsonb
  ) to myeongha_api_executor;
do $acl$
begin
  if has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.synthetic_stage_results_r37','INSERT')
    or has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.synthetic_stage_results_r37','SELECT')
    or has_function_privilege('public',
       'seyeon_positive_candidate.record_synthetic_stage_result_r37(uuid,uuid,uuid,uuid,text,uuid,jsonb)','EXECUTE')
    or not has_function_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.record_synthetic_stage_result_r37(uuid,uuid,uuid,uuid,text,uuid,jsonb)','EXECUTE')
  then
    raise exception 'R37 stage result owner/Executor ACL mismatch';
  end if;
end $acl$;
commit;
\echo 'PASS R37 immutable local synthetic result markers; zero Provider and G2 authority'
