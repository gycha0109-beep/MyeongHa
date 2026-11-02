-- Watchtower-Track: security
-- R41: deterministic authored PUBLIC fixture, NEVER actual Provider output or
-- user-facing Character Guard PASS. Named scratch DB ONLY; no operating grant.
\set ON_ERROR_STOP on
begin;
do $pre$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regclass('seyeon_positive_candidate.unverified_transport_lineage_r40') is null
    or to_regclass('seyeon_positive_candidate.interpreter_static_authority_manifest_r36') is null
  then raise exception 'R41 requires scratch R36/R40 sealed fixtures';
  end if;
end $pre$;

create table seyeon_positive_candidate.local_guard_fixture_manifest_r41(
  manifest_id text primary key
    check(manifest_id='seyeon-r41-code-derived-public-guard-v1'),
  interpretation_output_digest text not null,
  renderer_output_digest text not null,
  semantic_review_output_digest text not null,
  renderer_utterance_hash text not null,
  guarded_envelope_digest text not null,
  installed_at timestamptz not null default clock_timestamp(),
  check(interpretation_output_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  check(renderer_output_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  check(semantic_review_output_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  check(renderer_utterance_hash ~ '^sha256:v1:[a-f0-9]{64}$'),
  check(guarded_envelope_digest ~ '^sha256:v1:[a-f0-9]{64}$')
);
create trigger immutable_local_guard_fixture_manifest_r41
before update or delete on seyeon_positive_candidate.local_guard_fixture_manifest_r41
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

create function seyeon_positive_candidate.install_local_guard_fixture_manifest_r41(
  p_interpretation text,p_renderer text,p_review text,
  p_utterance text,p_envelope text
)
returns boolean language plpgsql security invoker
set search_path=pg_catalog,public,seyeon_positive_candidate
as $install$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or session_user<>'postgres' or current_user<>'postgres'
    or p_interpretation !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_renderer !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_review !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_utterance !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_envelope !~ '^sha256:v1:[a-f0-9]{64}$'
    or (select count(*) from
       seyeon_positive_candidate.interpreter_static_authority_manifest_r36)<>1
  then
    raise exception using errcode='23514',
      constraint='seyeon_r41_untrusted_fixture_installer';
  end if;
  insert into seyeon_positive_candidate.local_guard_fixture_manifest_r41(
    manifest_id,interpretation_output_digest,renderer_output_digest,
    semantic_review_output_digest,renderer_utterance_hash,guarded_envelope_digest
  ) values (
    'seyeon-r41-code-derived-public-guard-v1',
    p_interpretation,p_renderer,p_review,p_utterance,p_envelope
  );
  return true;
end $install$;

create table seyeon_positive_candidate.local_guard_fixture_lineage_r41(
  attempt_id uuid primary key references public.chat_turn_attempts(id)
    on delete cascade,
  selected_sources_digest text not null
    check(selected_sources_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  interpretation_call_id uuid not null,
  renderer_call_id uuid not null,
  semantic_review_call_id uuid not null,
  guarded_envelope_digest text not null
    check(guarded_envelope_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  origin_kind text not null default 'code_authored_local_fixture_no_provider'
    check(origin_kind='code_authored_local_fixture_no_provider'),
  provider_dispatched boolean not null default false
    check(provider_dispatched=false),
  provider_output_verified boolean not null default false
    check(provider_output_verified=false),
  output_guard_verified boolean not null default false
    check(output_guard_verified=false),
  created_at timestamptz not null default clock_timestamp()
);
create trigger immutable_local_guard_fixture_lineage_r41
before update on seyeon_positive_candidate.local_guard_fixture_lineage_r41
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

-- The restricted RPC may only witness the exact preinstalled PUBLIC fixture.
-- A forged Boolean PASS or user-supplied validator name grants no authority.
create function seyeon_positive_candidate.record_local_guard_fixture_r41(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_selected_digest text,p_interpreter_call uuid,p_renderer_call uuid,
  p_reviewer_call uuid,p_guarded_envelope_digest text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $record$
declare
  v_manifest seyeon_positive_candidate.local_guard_fixture_manifest_r41%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_original record;
  v_stage seyeon_positive_candidate.native_stage_lineage_r30%rowtype;
  v_output seyeon_positive_candidate.unverified_transport_lineage_r40%rowtype;
  v_cost public.seyeon_ai_call_cost_events%rowtype;
  v_queue public.seyeon_ai_provider_receipt_queue_v1%rowtype;
  v_i smallint;
  v_count integer:=0;
  v_call uuid;
  v_expected_digest text;
  v_original_digest text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or p_selected_digest !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_guarded_envelope_digest !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_interpreter_call is null or p_renderer_call is null
    or p_reviewer_call is null
    or p_interpreter_call=p_renderer_call
    or p_interpreter_call=p_reviewer_call
    or p_renderer_call=p_reviewer_call
  then raise exception using errcode='23514',
    constraint='seyeon_r41_invalid_fixture_claim';
  end if;
  -- Exact same active Subject -> Thread -> Turn -> Attempt lock order.
  perform 1 from public.subjects s where s.id=p_subject
    and s.status='active' and s.merged_into_subject_id is null for share;
  if not found then raise exception using errcode='23514',
    constraint='seyeon_r41_subject_inactive'; end if;
  perform 1 from public.conversation_threads t where t.id=p_thread
    and t.subject_id=p_subject and t.status='active' for share;
  if not found then raise exception using errcode='23514',
    constraint='seyeon_r41_thread_inactive'; end if;
  perform 1 from public.chat_turns t where t.id=p_turn
    and t.thread_id=p_thread and t.subject_id=p_subject
    and t.state='context_ready' for share;
  if not found then raise exception using errcode='23514',
    constraint='seyeon_r41_turn_not_context_ready'; end if;
  perform 1 from public.chat_turn_attempts a where a.id=p_attempt
    and a.turn_id=p_turn and a.subject_id=p_subject and a.state='running'
    for share;
  if not found then raise exception using errcode='23514',
    constraint='seyeon_r41_attempt_not_running'; end if;
  -- A new Grant after revocation cannot replace the exact original Grant.
  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
    where attempt_id=p_attempt order by ordinal for share
  loop
    if v_count>=2 or v_edge.ordinal<>v_count
      or v_edge.record_kind<>'memory'
      or v_edge.record_type<>'shared_detail'
      or v_edge.schema_version<>'memory-v1'
    then raise exception using errcode='23514',
      constraint='seyeon_r41_original_source_invalid'; end if;
    select g.granted_at,m.content_jsonb into v_original
    from public.record_access_grants g
    join public.memory_items m on m.id=g.memory_item_id
      and m.subject_id=g.subject_id
    where g.id=v_edge.original_grant_id and g.subject_id=p_subject
      and g.memory_item_id=v_edge.memory_id
      and g.grantee_character_id='seyeon'
      and g.revoked_at is null and m.revoked_at is null
      and m.source_kind='user_approved'
      and m.memory_type='shared_detail' and m.schema_version='memory-v1'
    for share of g,m;
    if not found then raise exception using errcode='23514',
      constraint='seyeon_r41_original_grant_revoked'; end if;
    v_original_digest:='sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_original.content_jsonb::text,'UTF8')),'hex');
    if v_original.granted_at is distinct from v_edge.original_granted_at
      or v_original_digest is distinct from v_edge.pg_payload_digest
    then raise exception using errcode='23514',
      constraint='seyeon_r41_original_payload_changed'; end if;
    v_count:=v_count+1;
  end loop;
  if v_count<>2 then raise exception using errcode='23514',
    constraint='seyeon_r41_original_count_invalid'; end if;
  select * into v_manifest
  from seyeon_positive_candidate.local_guard_fixture_manifest_r41
  where manifest_id='seyeon-r41-code-derived-public-guard-v1' for share;
  if not found or p_guarded_envelope_digest is distinct from
       v_manifest.guarded_envelope_digest
  then raise exception using errcode='23514',
    constraint='seyeon_r41_code_manifest_mismatch'; end if;
  -- A local mock digest is not a positive validation. Require each of
  -- three original Call IDs to match R30/R40, the pinned source set, and
  -- a SETTLED, ACKED Cost receipt, all under row locks.
  for v_i in 2..4 loop
    v_call:=case v_i when 2 then p_interpreter_call
      when 3 then p_renderer_call else p_reviewer_call end;
    v_expected_digest:=case v_i
      when 2 then v_manifest.interpretation_output_digest
      when 3 then v_manifest.renderer_output_digest
      else v_manifest.semantic_review_output_digest end;
    select * into v_stage
    from seyeon_positive_candidate.native_stage_lineage_r30 s
    where s.attempt_id=p_attempt and s.stage_index=v_i for share;
    if not found or v_stage.call_id is distinct from v_call
      or v_stage.selected_sources_digest is distinct from p_selected_digest
    then raise exception using errcode='23514',
      constraint='seyeon_r41_stage_call_unbound'; end if;
    select * into v_output
    from seyeon_positive_candidate.unverified_transport_lineage_r40 r
    where r.attempt_id=p_attempt and r.stage_index=v_i for share;
    if not found or v_output.call_id is distinct from v_stage.call_id
      or v_output.purpose is distinct from v_stage.purpose
      or v_output.native_wire_digest is distinct from v_stage.native_wire_digest
      or v_output.structured_output_digest is distinct from v_expected_digest
      or v_output.origin_kind is distinct from 'local_stub_transport_unverified'
      or v_output.provider_output_verified is distinct from false
      or v_output.output_guard_verified is distinct from false
    then raise exception using errcode='23514',
      constraint='seyeon_r41_mock_output_digest_unbound'; end if;
    select * into v_cost from public.seyeon_ai_call_cost_events c
    where c.call_id=v_call and c.subject_id=p_subject
      and c.turn_id=p_turn and c.attempt_id=p_attempt
      and c.phase='chat' and c.purpose=v_stage.purpose for share;
    select * into v_queue from public.seyeon_ai_provider_receipt_queue_v1 q
    where q.call_id=v_call and q.subject_id=p_subject
      and q.turn_id=p_turn and q.attempt_id=p_attempt and q.phase='chat'
      for share;
    if v_cost.call_id is null
      or v_cost.lifecycle_state is distinct from 'settled'
      or v_cost.cost_status is distinct from 'estimated'
      or v_cost.outcome is distinct from 'response_received'
      or v_cost.governor_receipt_pinned_at is null
      or v_queue.call_id is null or v_queue.acked_at is null
      or v_queue.provider_event is distinct from v_cost.event_jsonb
    then raise exception using errcode='23514',
      constraint='seyeon_r41_cost_receipt_not_settled'; end if;
  end loop;
  insert into seyeon_positive_candidate.local_guard_fixture_lineage_r41(
    attempt_id,selected_sources_digest,interpretation_call_id,
    renderer_call_id,semantic_review_call_id,guarded_envelope_digest
  ) values(
    p_attempt,p_selected_digest,p_interpreter_call,
    p_renderer_call,p_reviewer_call,p_guarded_envelope_digest
  );
  return jsonb_build_object(
    'status','isolated_code_authored_guard_fixture_fingerprints_matched',
    'attemptId',p_attempt::text,
    'selectedSourcesDigest',p_selected_digest,
    'interpretationCallId',p_interpreter_call::text,
    'rendererCallId',p_renderer_call::text,
    'semanticReviewCallId',p_reviewer_call::text,
    'guardedEnvelopeDigest',p_guarded_envelope_digest,
    'providerDispatched',false,'providerOutputVerified',false,
    'outputGuardVerified',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
end $record$;
