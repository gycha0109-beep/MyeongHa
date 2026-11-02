-- Watchtower-Track: security
-- R40: bind *local mocked transport fingerprints* to original Grant, native
-- stage wire and SETTLED Cost Governor/Provider queue. This is NO actual
-- Provider delivery, no signed provenance and absolutely NO G2/HTTP permission.
\set ON_ERROR_STOP on
begin;
do $pre$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regclass('seyeon_positive_candidate.native_stage_lineage_r30') is null
    or to_regclass('seyeon_positive_candidate.synthetic_stage_results_r37') is null
    or to_regclass('public.seyeon_ai_provider_receipt_queue_v1') is null
  then raise exception 'R40 only installs in R30/R37 governed scratch database';
  end if;
end $pre$;

create table seyeon_positive_candidate.unverified_transport_lineage_r40(
  attempt_id uuid not null references public.chat_turn_attempts(id)
    on delete cascade,
  stage_index smallint not null check(stage_index between 0 and 4),
  purpose text not null check(purpose in (
    'integrity_classification','disclosure_classification',
    'turn_interpretation','dialogue_render','semantic_review'
  )),
  call_id uuid not null,
  native_wire_digest text not null
    check(native_wire_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  response_id text not null
    check(response_id ~ '^resp_r40_synthetic_[a-z0-9_-]{3,100}$'),
  response_body_digest text not null
    check(response_body_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  structured_output_digest text not null
    check(structured_output_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  origin_kind text not null default 'local_stub_transport_unverified'
    check(origin_kind='local_stub_transport_unverified'),
  provider_output_verified boolean not null default false
    check(provider_output_verified=false),
  output_guard_verified boolean not null default false
    check(output_guard_verified=false),
  admitted_at timestamptz not null default clock_timestamp(),
  primary key(attempt_id,stage_index),
  unique(attempt_id,call_id),
  unique(attempt_id,response_id),
  foreign key(attempt_id,stage_index)
    references seyeon_positive_candidate.synthetic_stage_results_r37(
      attempt_id,stage_index
    ) on delete cascade
);
-- Privacy/account deletion must still cascade; direct API writes are denied.
create trigger immutable_unverified_transport_lineage_r40
before update on seyeon_positive_candidate.unverified_transport_lineage_r40
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

create function seyeon_positive_candidate.record_unverified_transport_r40(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_stage integer,p_call uuid,p_native_wire_digest text,p_receipt jsonb
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $r40$
declare
  v_stage seyeon_positive_candidate.native_stage_lineage_r30%rowtype;
  v_local seyeon_positive_candidate.synthetic_stage_results_r37%rowtype;
  v_cost public.seyeon_ai_call_cost_events%rowtype;
  v_queue public.seyeon_ai_provider_receipt_queue_v1%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_original record;
  v_original_digest text;
  v_count integer:=0;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or p_stage not between 0 and 4 or p_call is null
    or p_receipt is null or jsonb_typeof(p_receipt) is distinct from 'object'
  then
    raise exception using errcode='23514',
      constraint='seyeon_r40_invalid_offline_transport';
  end if;
  -- Explicit fixed local-stub response ID. This Owner MUST NOT admit or
  -- claim a real OpenAI Provider response or an authenticated output.
  if (select count(*) from jsonb_object_keys(p_receipt))<>13
    or not (p_receipt ?& array[
      'schemaVersion','originKind','callId','purpose','providerKey',
      'modelKey','responseId','responseBodyDigest',
      'structuredOutputDigest','providerOutputVerified',
      'outputGuardVerified','permitsAtomicCommit','permitsHttpReveal'
    ])
    or p_receipt->>'schemaVersion' is distinct from
       'seyeon-unverified-transport-output-receipt-r39'
    or p_receipt->>'originKind' is distinct from
       'unverified_transport_bytes_only'
    or p_receipt->>'callId' is distinct from p_call::text
    or p_receipt->>'providerKey' is distinct from 'openai-responses'
    or p_receipt->>'modelKey' is distinct from 'seyeon-r35-offline'
    or p_receipt->>'responseId'
         !~ '^resp_r40_synthetic_[a-z0-9_-]{3,100}$'
    or p_receipt->>'responseBodyDigest'
         !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_receipt->>'structuredOutputDigest'
         !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_receipt->'providerOutputVerified' is distinct from 'false'::jsonb
    or p_receipt->'outputGuardVerified' is distinct from 'false'::jsonb
    or p_receipt->'permitsAtomicCommit' is distinct from 'false'::jsonb
    or p_receipt->'permitsHttpReveal' is distinct from 'false'::jsonb
  then
    raise exception using errcode='23514',
      constraint='seyeon_r40_transport_authority_forged';
  end if;
  -- Match existing lock order and same active original Memory + Grant.
  perform 1 from public.subjects s where s.id=p_subject and
    s.status='active' and s.merged_into_subject_id is null for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r40_subject_inactive';
  end if;
  perform 1 from public.conversation_threads t where t.id=p_thread
    and t.subject_id=p_subject and t.status='active' for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r40_thread_inactive';
  end if;
  perform 1 from public.chat_turns t where t.id=p_turn
    and t.thread_id=p_thread and t.subject_id=p_subject
    and t.state='context_ready' for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r40_turn_not_context_ready';
  end if;
  perform 1 from public.chat_turn_attempts a where a.id=p_attempt
    and a.turn_id=p_turn and a.subject_id=p_subject
    and a.state='running' for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_r40_attempt_not_running';
  end if;
  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
    where attempt_id=p_attempt order by ordinal for share
  loop
    if v_edge.ordinal<>v_count or v_count>=2
      or v_edge.record_kind<>'memory'
      or v_edge.record_type<>'shared_detail'
      or v_edge.schema_version<>'memory-v1'
    then
      raise exception using errcode='23514',
        constraint='seyeon_r40_original_source_invalid';
    end if;
    select g.granted_at,m.content_jsonb into v_original
    from public.record_access_grants g
    join public.memory_items m
      on m.id=g.memory_item_id and m.subject_id=g.subject_id
    where g.id=v_edge.original_grant_id
      and g.subject_id=p_subject and g.memory_item_id=v_edge.memory_id
      and g.grantee_character_id='seyeon'
      and g.revoked_at is null and m.revoked_at is null
      and m.source_kind='user_approved'
      and m.memory_type='shared_detail'
      and m.schema_version='memory-v1'
    for share of g,m;
    if not found then
      raise exception using errcode='23514',
        constraint='seyeon_r40_original_grant_revoked';
    end if;
    v_original_digest:='sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_original.content_jsonb::text,'UTF8')),'hex');
    if v_original.granted_at is distinct from v_edge.original_granted_at
      or v_original_digest is distinct from v_edge.pg_payload_digest
    then
      raise exception using errcode='23514',
        constraint='seyeon_r40_original_payload_changed';
    end if;
    v_count:=v_count+1;
  end loop;
  if v_count<>2 then
    raise exception using errcode='23514',
      constraint='seyeon_r40_original_count_invalid';
  end if;
  select * into v_stage
  from seyeon_positive_candidate.native_stage_lineage_r30 s
  where s.attempt_id=p_attempt and s.stage_index=p_stage for share;
  select * into v_local
  from seyeon_positive_candidate.synthetic_stage_results_r37 s
  where s.attempt_id=p_attempt and s.stage_index=p_stage for share;
  if v_stage.call_id is distinct from p_call
    or v_stage.native_wire_digest is distinct from p_native_wire_digest
    or v_stage.purpose is distinct from p_receipt->>'purpose'
    or v_local.call_id is distinct from v_stage.call_id
    or v_local.native_wire_digest is distinct from v_stage.native_wire_digest
    or v_local.purpose is distinct from v_stage.purpose
    or v_local.provider_dispatched is distinct from false
    or v_local.provider_output_verified is distinct from false
    or v_local.output_guard_verified is distinct from false
  then
    raise exception using errcode='23514',
      constraint='seyeon_r40_stage_wire_unbound';
  end if;
  select * into v_cost from public.seyeon_ai_call_cost_events e
  where e.call_id=p_call and e.subject_id=p_subject
    and e.turn_id=p_turn and e.attempt_id=p_attempt
    and e.purpose=v_stage.purpose and e.phase='chat' for share;
  select * into v_queue from public.seyeon_ai_provider_receipt_queue_v1 q
  where q.call_id=p_call and q.subject_id=p_subject
    and q.turn_id=p_turn and q.attempt_id=p_attempt
    and q.phase='chat' for share;
  if v_cost.call_id is null
    or v_cost.lifecycle_state is distinct from 'settled'
    or v_cost.outcome is distinct from 'response_received'
    or v_cost.cost_status is distinct from 'estimated'
    or v_cost.governor_receipt_pinned_at is null
    or v_cost.governor_output_cap_tokens is distinct from
       v_stage.output_ceiling_tokens
    or v_cost.governor_ceiling_micro_usd is null
    or v_cost.governor_effective_micro_usd is null
    or v_cost.governor_effective_micro_usd>
       v_cost.governor_ceiling_micro_usd
    or v_cost.event_jsonb->>'callId' is distinct from p_call::text
    or v_cost.event_jsonb->>'providerKey' is distinct from 'openai-responses'
    or v_cost.event_jsonb->>'modelKey' is distinct from 'seyeon-r35-offline'
    or v_cost.event_jsonb->>'outcome' is distinct from 'response_received'
    or v_queue.call_id is null or v_queue.acked_at is null
    or v_queue.provider_event is distinct from v_cost.event_jsonb
  then
    raise exception using errcode='23514',
      constraint='seyeon_r40_governed_cost_not_settled';
  end if;
  insert into seyeon_positive_candidate.unverified_transport_lineage_r40(
    attempt_id,stage_index,purpose,call_id,native_wire_digest,
    response_id,response_body_digest,structured_output_digest
  ) values(
    p_attempt,v_stage.stage_index,v_stage.purpose,p_call,
    v_stage.native_wire_digest,p_receipt->>'responseId',
    p_receipt->>'responseBodyDigest',
    p_receipt->>'structuredOutputDigest'
  );
  return jsonb_build_object(
    'status','isolated_mock_transport_fingerprint_unverified',
    'attemptId',p_attempt::text,'stageIndex',v_stage.stage_index,
    'purpose',v_stage.purpose,'callId',p_call::text,
    'nativeWireDigest',v_stage.native_wire_digest,
    'responseId',p_receipt->>'responseId',
    'responseBodyDigest',p_receipt->>'responseBodyDigest',
    'structuredOutputDigest',p_receipt->>'structuredOutputDigest',
    'providerOutputVerified',false,'outputGuardVerified',false,
    'permitsProvider',false,'permitsAtomicCommit',false,
    'permitsHttpReveal',false
  );
end $r40$;
revoke all on seyeon_positive_candidate.unverified_transport_lineage_r40
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function
  seyeon_positive_candidate.record_unverified_transport_r40(
    uuid,uuid,uuid,uuid,integer,uuid,text,jsonb
  ) from public,anon,authenticated,service_role;
grant execute on function
  seyeon_positive_candidate.record_unverified_transport_r40(
    uuid,uuid,uuid,uuid,integer,uuid,text,jsonb
  ) to myeongha_api_executor;
do $acl$
begin
  if has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.unverified_transport_lineage_r40','INSERT')
    or has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.unverified_transport_lineage_r40','SELECT')
    or has_table_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.unverified_transport_lineage_r40','DELETE')
    or has_function_privilege('public',
       'seyeon_positive_candidate.record_unverified_transport_r40(uuid,uuid,uuid,uuid,integer,uuid,text,jsonb)','EXECUTE')
    or not has_function_privilege('myeongha_api_executor',
       'seyeon_positive_candidate.record_unverified_transport_r40(uuid,uuid,uuid,uuid,integer,uuid,text,jsonb)','EXECUTE')
  then raise exception 'R40 unverified transport Owner ACL mismatch';
  end if;
end $acl$;
commit;
\echo 'PASS R40 immutable unverified mock transport lineage; no Provider/G2/Reveal approval'
