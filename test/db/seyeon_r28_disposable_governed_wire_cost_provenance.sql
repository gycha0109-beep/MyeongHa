-- Watchtower-Track: security
-- R28: DB-owned origin/cost provenance for a model request reserved in G4.
-- NOT Provider dispatch, usage settlement, G2 authority, Production migration.
\set ON_ERROR_STOP on
begin;
do $precondition$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer<150000
    or to_regprocedure('seyeon_positive_candidate.inspect_pinned_raw_source_r20(uuid,uuid,uuid,uuid)') is null
    or to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)') is null
  then raise exception 'R28 refuses non-disposable DB or uninstalled source/cost baseline';
  end if;
end $precondition$;

-- No memory body, wire body, prompt or provider output is persisted here.
-- An immutable hash is CORRELATION only; not a grant or a wire signature.
create table seyeon_positive_candidate.governed_wire_reservations_r28 (
  call_id uuid primary key references public.seyeon_ai_call_cost_events(call_id),
  subject_id uuid not null references public.subjects(id),
  thread_id uuid not null references public.conversation_threads(id),
  turn_id uuid not null references public.chat_turns(id),
  attempt_id uuid not null references public.chat_turn_attempts(id),
  purpose text not null check (purpose='turn_interpretation'),
  source_count smallint not null check (source_count between 1 and 2),
  selected_sources_digest text not null
    check (selected_sources_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  final_model_context_digest text not null
    check (final_model_context_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  native_wire_digest text not null
    check (native_wire_digest ~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'),
  input_ceiling_tokens bigint not null check (input_ceiling_tokens>0),
  output_ceiling_tokens bigint not null check (output_ceiling_tokens>0),
  reserved_micro_usd bigint not null check (reserved_micro_usd>0),
  reserved_bucket_utc_date date not null,
  sealed_at timestamptz not null default clock_timestamp(),
  unique(attempt_id,purpose)
);
create trigger immutable_governed_wire_reservation_r28
before update or delete on seyeon_positive_candidate.governed_wire_reservations_r28
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

create function seyeon_positive_candidate.seal_governed_wire_cost_r28(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,p_call uuid,
  p_selected_digest text,p_context_digest text,p_wire_digest text,
  p_input_ceiling bigint,p_output_ceiling bigint,p_reserved_micro_usd bigint,
  p_bucket_utc_date date
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $seal$
declare
  v_set seyeon_positive_candidate.source_sets_r1%rowtype;
  v_attempt record;
  v_cost public.seyeon_ai_call_cost_events%rowtype;
  v_current record;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_seen integer:=0;
  v_digest text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or p_subject is null or p_thread is null or p_turn is null
    or p_attempt is null or p_call is null
    or p_selected_digest !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_context_digest !~ '^sha256:v1:[a-f0-9]{64}$'
    or p_wire_digest !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
    or p_input_ceiling is null or p_input_ceiling<1
    or p_output_ceiling is null or p_output_ceiling<1
    or p_reserved_micro_usd is null or p_reserved_micro_usd<1
    or p_bucket_utc_date is null
  then
    raise exception using errcode='23514',
      constraint='seyeon_r28_disposable_invalid_seal';
  end if;
  -- R20 inspector already acquired the same original locks earlier in THIS
  -- Subject transaction. Independently reject a forgery of its identifiers.
  perform 1 from public.subjects s
  where s.id=p_subject and s.status='active'
    and s.merged_into_subject_id is null for share;
  if not found then
    raise exception using errcode='23514',constraint='seyeon_r28_subject_unavailable';
  end if;
  select a.state as attempt_state,t.state as turn_state
  into v_attempt
  from public.chat_turn_attempts a
  join public.chat_turns t on t.id=a.turn_id and t.subject_id=a.subject_id
  join public.conversation_threads th
    on th.id=t.thread_id and th.subject_id=t.subject_id
  where a.id=p_attempt and a.subject_id=p_subject and a.turn_id=p_turn
    and t.thread_id=p_thread and th.status='active'
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pin_jsonb is null
  for share of a,t,th;
  if not found or v_attempt.attempt_state is distinct from 'running'
    or v_attempt.turn_state not in ('planned','context_ready') then
    raise exception using errcode='23514',constraint='seyeon_r28_attempt_not_running';
  end if;
  select * into v_set
  from seyeon_positive_candidate.source_sets_r1 s
  where s.attempt_id=p_attempt and s.subject_id=p_subject
    and s.thread_id=p_thread and s.turn_id=p_turn
    and s.source_count between 1 and 2
    and s.selected_sources_digest=p_selected_digest for share;
  if not found then
    raise exception using errcode='23514',constraint='seyeon_r28_source_set_mismatch';
  end if;
  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
    where attempt_id=p_attempt order by ordinal for share
  loop
    if v_edge.ordinal<>v_seen or v_edge.record_kind<>'memory'
      or v_edge.record_type<>'shared_detail'
      or v_edge.schema_version<>'memory-v1' then
      raise exception using errcode='23514',constraint='seyeon_r28_invalid_original_edge';
    end if;
    select m.content_jsonb,g.granted_at into v_current
    from public.record_access_grants g
    join public.memory_items m on m.id=g.memory_item_id
      and m.subject_id=g.subject_id
    where g.id=v_edge.original_grant_id and g.subject_id=p_subject
      and g.memory_item_id=v_edge.memory_id
      and g.grantee_character_id='seyeon' and g.revoked_at is null
      and m.revoked_at is null and m.source_kind='user_approved'
      and m.memory_type=v_edge.record_type
      and m.schema_version=v_edge.schema_version
    for share of g,m;
    if not found then
      raise exception using errcode='23514',constraint='seyeon_r28_original_grant_revoked';
    end if;
    v_digest:='sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex');
    if v_digest is distinct from v_edge.pg_payload_digest
      or v_current.granted_at is distinct from v_edge.original_granted_at then
      raise exception using errcode='23514',constraint='seyeon_r28_original_changed';
    end if;
    v_seen:=v_seen+1;
  end loop;
  if v_seen<>v_set.source_count then
    raise exception using errcode='23514',constraint='seyeon_r28_incomplete_source_set';
  end if;
  -- Same transaction as the existing authoritative Cost Governor Start;
  -- missing, disputed, replayed or incomplete reservation is not a seal.
  select * into v_cost from public.seyeon_ai_call_cost_events e
  where e.call_id=p_call and e.subject_id=p_subject
    and e.thread_id=p_thread and e.turn_id=p_turn and e.attempt_id=p_attempt
    and e.phase='chat' and e.purpose='turn_interpretation'
    and e.provider_key='openai-responses' and e.model_key='seyeon-r35-offline'
    and e.lifecycle_state='started' and e.governor_receipt_pinned_at is not null
    and e.governor_ceiling_micro_usd=p_reserved_micro_usd
    and e.governor_input_bound_tokens=p_input_ceiling
    and e.governor_output_cap_tokens=p_output_ceiling
    and e.governor_bucket_utc_date=p_bucket_utc_date
  for share;
  if not found then
    raise exception using errcode='23514',constraint='seyeon_r28_cost_reservation_unproven';
  end if;
  insert into seyeon_positive_candidate.governed_wire_reservations_r28(
    call_id,subject_id,thread_id,turn_id,attempt_id,purpose,source_count,
    selected_sources_digest,final_model_context_digest,native_wire_digest,
    input_ceiling_tokens,output_ceiling_tokens,reserved_micro_usd,
    reserved_bucket_utc_date
  ) values (
    p_call,p_subject,p_thread,p_turn,p_attempt,'turn_interpretation',
    v_set.source_count,p_selected_digest,p_context_digest,p_wire_digest,
    p_input_ceiling,p_output_ceiling,p_reserved_micro_usd,p_bucket_utc_date
  );
  return jsonb_build_object(
    'callId',p_call::text,'sourceCount',v_set.source_count,
    'selectedSourcesDigest',p_selected_digest,
    'finalModelContextDigest',p_context_digest,
    'nativeWireDigest',p_wire_digest,
    'reservedMicroUsd',p_reserved_micro_usd::text,
    'bucketUtcDate',p_bucket_utc_date::text,
    'sealed',true,'permitsProvider',false,'permitsAtomicCommit',false
  );
end $seal$;

revoke all on seyeon_positive_candidate.governed_wire_reservations_r28
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function seyeon_positive_candidate.seal_governed_wire_cost_r28(
  uuid,uuid,uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,date
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.seal_governed_wire_cost_r28(
  uuid,uuid,uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,date
) to myeongha_api_executor;
do $acl$
begin
  if has_table_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.governed_wire_reservations_r28','SELECT')
    or has_table_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.governed_wire_reservations_r28','INSERT')
    or has_function_privilege('public',
      'seyeon_positive_candidate.seal_governed_wire_cost_r28(uuid,uuid,uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,date)',
      'EXECUTE')
  then raise exception 'R28 ledger provenance ACL unexpectedly exposed'; end if;
end $acl$;
commit;
\echo 'PASS: disposable G4 native wire/canonical original source to cost reservation is immutable; no Provider authority'
