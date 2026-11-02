-- Watchtower-Track: security
-- R3/R25 G2 candidate: the REAL v2 -> v1 -> core Chat Commit + BOTH outboxes,
-- protected by exact original Grant, immutable DB SourceSet and the same Tx.
-- ONLY install in the isolated named CI PostgreSQL database.
-- Do NOT copy this 1640 trigger experiment into Production: Owner signoff,
-- SRC-25, full stage ancestry, DR and public Replay policy remain OPEN.
\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
     or current_setting('server_version_num')::integer < 150000
     or to_regprocedure('public.tr_seyeon_zero_source_pin_immutable_v1()') is null
     or to_regprocedure(
       'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)'
     ) is null then
    raise exception 'R3 positive real-v2 experiment requires the disposable reviewed baseline';
  end if;
end $guard$;

-- Inserted only by the DB-side SECURITY DEFINER G2 transaction after a
-- locked current-rights recheck. Never writable or readable by API executor.
create table seyeon_positive_candidate.actual_v2_commit_admissions_r3 (
  attempt_id uuid primary key references public.chat_turn_attempts(id),
  subject_id uuid not null references public.subjects(id),
  thread_id uuid not null references public.conversation_threads(id),
  turn_id uuid not null references public.chat_turns(id),
  source_selection_digest text not null
    check (source_selection_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  record_id uuid not null references public.memory_items(id),
  original_grant_id uuid not null references public.record_access_grants(id),
  pg_payload_digest text not null
    check (pg_payload_digest ~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'),
  source_count smallint not null check (source_count between 1 and 2),
  source_proof_jsonb jsonb not null,
  admitted_at timestamptz not null default clock_timestamp()
);
create trigger immutable_actual_v2_commit_admission_r3
before update or delete on seyeon_positive_candidate.actual_v2_commit_admissions_r3
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

-- We REPLACE the existing 1640 trigger FUNCTION only in a disposable DB.
-- Zero-source validation remains exactly the existing 1640 rule.
-- Positive transitions require a DB-issued, unforgeable-to-API admission row
-- from the SAME transaction, immutable pinned source ancestry, and a matching
-- validation proof; direct v1/v2 API EXECUTE will also be removed.
create or replace function public.tr_seyeon_zero_source_pin_immutable_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog,public,seyeon_positive_candidate
as $r3_trigger$
declare
  v_admit seyeon_positive_candidate.actual_v2_commit_admissions_r3%rowtype;
  v_pin seyeon_positive_candidate.attempt_source_pins%rowtype;
  v_expected jsonb;
begin
  if old.seyeon_personal_source_pin_jsonb is not null and
     (old.seyeon_personal_source_pin_jsonb is distinct from
         new.seyeon_personal_source_pin_jsonb or
      old.seyeon_personal_source_pinned_at is distinct from
         new.seyeon_personal_source_pinned_at) then
    raise exception using errcode='23514',
      constraint='seyeon_source_pin_immutable',
      message='Se-yeon attempt source pin cannot be changed';
  end if;
  if old.seyeon_personal_source_pin_jsonb is null and
     new.seyeon_personal_source_pin_jsonb is not null and
     (old.state <> 'running' or new.state <> 'running') then
    raise exception using errcode='23514',
      constraint='seyeon_source_pin_must_precede_generation',
      message='Se-yeon source pin must be stored during running state';
  end if;

  if old.state = 'validated' and new.state = 'committed'
     and new.planner_version = 'seyeon-production-chat-planner-v1' then
    if old.seyeon_personal_source_pin_jsonb is not null then
      -- The original 1640 zero-only branch is intentionally unchanged.
      if old.seyeon_personal_source_pin_jsonb #> '{zeroProof,records}' <>
           '[]'::jsonb or
         old.validation_result_jsonb -> 'personalRecordProvenance'
           is distinct from old.seyeon_personal_source_pin_jsonb -> 'zeroProof'
      then
        raise exception using errcode='23514',
          constraint='seyeon_commit_requires_original_zero_source_pin';
      end if;
    else
      -- A positive source without DB-owned same-Tx admission is NEVER a
      -- substitute for a zero Pin. Reject missing/forged/uncommitted mode.
      select * into v_admit
      from seyeon_positive_candidate.actual_v2_commit_admissions_r3
      where attempt_id=old.id and subject_id=old.subject_id;
      select * into v_pin
      from seyeon_positive_candidate.attempt_source_pins
      where attempt_id=old.id and subject_id=old.subject_id
        and state='pinned';
      if v_admit.attempt_id is null or v_pin.attempt_id is null
         or v_admit.turn_id is distinct from old.turn_id
         or v_admit.record_id is distinct from v_pin.original_memory_id
         or v_admit.original_grant_id is distinct from v_pin.original_grant_id
         or v_admit.pg_payload_digest is distinct from v_pin.original_raw_digest
         or v_admit.source_count not between 1 and 2
         or (select count(*) from seyeon_positive_candidate.source_edges_r1
             where attempt_id=old.id) <> v_admit.source_count then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r3_requires_db_original_grant_admission';
      end if;
      v_expected := v_admit.source_proof_jsonb;
      if jsonb_typeof(v_expected) is distinct from 'object'
         or v_expected->>'selectedSourcesDigest' is distinct from v_admit.source_selection_digest
         or (v_admit.source_count=1 and
             (v_expected->>'schemaVersion' is distinct from 'offline-positive-original-source-proof-r3'
              or v_expected->>'recordId' is distinct from v_admit.record_id::text
              or v_expected->>'originalGrantId' is distinct from v_admit.original_grant_id::text
              or v_expected->>'pgPayloadDigest' is distinct from v_admit.pg_payload_digest))
         or (v_admit.source_count=2 and
             (v_expected->>'schemaVersion' is distinct from 'offline-positive-two-original-source-proof-r25'
              or jsonb_typeof(v_expected->'sources') is distinct from 'array'
              or jsonb_array_length(v_expected->'sources')<>2
              or v_expected#>>'{sources,0,recordId}' is distinct from v_admit.record_id::text
              or v_expected#>>'{sources,0,originalGrantId}' is distinct from v_admit.original_grant_id::text
              or v_expected#>>'{sources,0,pgPayloadDigest}' is distinct from v_admit.pg_payload_digest))
      then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r25_admission_proof_mismatch';
      end if;
      if old.validation_result_jsonb -> 'personalRecordProvenance'
           is distinct from v_expected then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r3_validation_source_mismatch';
      end if;
    end if;
  end if;
  return new;
end $r3_trigger$;

-- The existing v2 remains the unchanged REAL production function;
-- this disposable wrapper is the only API-login positive Commit entrypoint.
-- Security order: Subject SHARE -> Thread UPDATE -> Turn UPDATE ->
-- Attempt UPDATE -> Source/Grant/Memory SHARE -> admission INSERT ->
-- *actual v2* -> core message + two outboxes, all ONE Postgres transaction.
create function seyeon_positive_candidate.commit_actual_v2_r3(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_message uuid,p_chat_outbox uuid,p_post_outbox uuid,
  p_snapshot jsonb,p_snapshot_hash text,p_selection_digest text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog,public,seyeon_positive_candidate
as $g2$
declare
  v_attempt record;
  v_pin seyeon_positive_candidate.attempt_source_pins%rowtype;
  v_set seyeon_positive_candidate.source_sets_r1%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_source record;
  v_expected jsonb;
  v_commit record;
  v_digest text;
  v_user_message_count bigint;
  v_user_message_id text;
  v_sources jsonb := '[]'::jsonb;
  v_expected_count integer;
  v_source_count integer := 0;
  v_wire record;
  v_cost record;
  v_provider_receipt record;
  v_stage record;
  v_stage_index integer:=0;
  v_previous_stage_wire text;
  v_has_wire boolean:=false;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_subject is null or p_thread is null or p_turn is null
    or p_attempt is null or p_message is null or
    p_chat_outbox is null or p_post_outbox is null
    or p_selection_digest is null
    or p_selection_digest !~ '^sha256:v1:[a-f0-9]{64}$' then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_request_invalid';
  end if;

  perform 1 from public.subjects s
  where s.id=p_subject and s.status='active'
    and s.merged_into_subject_id is null
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_subject_not_active';
  end if;
  perform 1 from public.conversation_threads th
  where th.id=p_thread and th.subject_id=p_subject and th.status='active'
  for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_thread_not_active';
  end if;
  perform 1 from public.chat_turns t
  where t.id=p_turn and t.thread_id=p_thread and t.subject_id=p_subject
    and t.state='validated'
  for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_turn_not_validated';
  end if;

  select a.id,a.state,a.planner_version,a.seyeon_personal_source_pin_jsonb,
         a.validation_result_jsonb
  into v_attempt
  from public.chat_turn_attempts a
  where a.id=p_attempt and a.subject_id=p_subject and a.turn_id=p_turn
  for update;
  if not found or v_attempt.state is distinct from 'validated'
    or v_attempt.planner_version is distinct from 'seyeon-production-chat-planner-v1'
    or v_attempt.seyeon_personal_source_pin_jsonb is not null then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_attempt_not_positive_validated';
  end if;

  -- G2 DB authority: a self-rehashed official Post-turn Snapshot must still
  -- name the actual persisted USER message of THIS Subject/Turn. Checking
  -- only caller-supplied Turn/Assistant IDs cannot establish this ancestry.
  -- The parent Thread/Turn/Attempt locks above remain held until COMMIT.
  select count(*), min(m.id::text)
    into v_user_message_count, v_user_message_id
  from public.conversation_messages m
  where m.turn_id=p_turn and m.subject_id=p_subject
    and m.sender_type='user';
  if v_user_message_count <> 1
    or jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot ->> 'turnId' is distinct from p_turn::text
    or p_snapshot ->> 'assistantMessageId' is distinct from p_message::text
    or p_snapshot ->> 'userMessageId' is distinct from v_user_message_id then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_snapshot_original_user_message_mismatch';
  end if;

  select * into v_pin from seyeon_positive_candidate.attempt_source_pins
  where attempt_id=p_attempt and subject_id=p_subject and thread_id=p_thread
    and turn_id=p_turn and state='pinned' and original_record_kind='memory'
  for update;
  select * into v_set from seyeon_positive_candidate.source_sets_r1
  where attempt_id=p_attempt and subject_id=p_subject and thread_id=p_thread
    and turn_id=p_turn and source_count between 1 and 2
    and selected_sources_digest=p_selection_digest
  for share;
  if v_pin.attempt_id is null or v_set.attempt_id is null
    or (select count(*) from seyeon_positive_candidate.source_edges_r1
        where attempt_id=p_attempt) <> v_set.source_count then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_missing_original_source_set';
  end if;
  v_expected_count := v_set.source_count;
  for v_edge in
    select * from seyeon_positive_candidate.source_edges_r1
    where attempt_id=p_attempt order by ordinal for share
  loop
    if v_edge.ordinal<>v_source_count or v_source_count>=v_expected_count
      or v_edge.record_kind<>'memory'
      or v_edge.record_type<>'shared_detail'
      or v_edge.schema_version<>'memory-v1' then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r25_invalid_original_edge';
    end if;
    select m.memory_type,m.schema_version,m.content_jsonb,g.granted_at
    into v_source
    from public.record_access_grants g
    join public.memory_items m
      on m.id=g.memory_item_id and m.subject_id=g.subject_id
    where g.id=v_edge.original_grant_id and g.subject_id=p_subject
      and g.memory_item_id=v_edge.memory_id
      and g.grantee_character_id='seyeon' and g.revoked_at is null
      and m.revoked_at is null and m.source_kind='user_approved'
      and m.memory_type='shared_detail' and m.schema_version='memory-v1'
    for share of g,m;
    if not found then
      if v_expected_count=1 then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r3_original_grant_revoked';
      end if;
      raise exception using errcode='23514',
        constraint='seyeon_offline_r25_original_grant_revoked';
    end if;
    v_digest:='sha256:pg-jsonb:v1:'||
      encode(sha256(convert_to(v_source.content_jsonb::text,'UTF8')),'hex');
    if v_source.granted_at is distinct from v_edge.original_granted_at
      or v_digest is distinct from v_edge.pg_payload_digest then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r25_original_source_changed';
    end if;
    if v_source_count=0 and
      (v_edge.memory_id is distinct from v_pin.original_memory_id
       or v_edge.original_grant_id is distinct from v_pin.original_grant_id
       or v_edge.pg_payload_digest is distinct from v_pin.original_raw_digest) then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r25_first_scalar_pin_mismatch';
    end if;
    v_sources:=v_sources||jsonb_build_array(jsonb_build_object(
      'recordId',v_edge.memory_id::text,
      'originalGrantId',v_edge.original_grant_id::text,
      'pgPayloadDigest',v_edge.pg_payload_digest
    ));
    v_source_count:=v_source_count+1;
  end loop;
  if v_source_count<>v_expected_count then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r25_incomplete_original_set';
  end if;
  if v_expected_count=1 then
    v_expected:=jsonb_build_object(
      'schemaVersion','offline-positive-original-source-proof-r3',
      'recordId',v_pin.original_memory_id::text,
      'originalGrantId',v_pin.original_grant_id::text,
      'selectedSourcesDigest',v_set.selected_sources_digest,
      'pgPayloadDigest',v_pin.original_raw_digest
    );
  else
    v_expected:=jsonb_build_object(
      'schemaVersion','offline-positive-two-original-source-proof-r25',
      'selectedSourcesDigest',v_set.selected_sources_digest,
      'sources',v_sources
    );
  end if;

  if v_attempt.validation_result_jsonb -> 'personalRecordProvenance'
      is distinct from v_expected then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_unbound_validation';
  end if;

  -- R28: a successful governed budget RESERVATION is NOT a dispatched
  -- Provider call and never G2 authority. The source/wire/cost seal is
  -- immutable and cannot be ignored when it exists on this Attempt.
  -- R28 is an isolated bridge; it deliberately stops before approving
  -- the other chat Provider stages (preflight/renderer/reviewer).
  select * into v_wire
  from seyeon_positive_candidate.governed_wire_reservations_r28 w
  where w.attempt_id=p_attempt and w.subject_id=p_subject
    and w.thread_id=p_thread and w.turn_id=p_turn
  for share;
  v_has_wire:=found;
  if v_has_wire or exists(
    select 1 from seyeon_positive_candidate.native_stage_lineage_r30 n
    where n.attempt_id=p_attempt
  ) or exists(
    select 1 from public.seyeon_ai_call_cost_events e
    where e.subject_id=p_subject and e.turn_id=p_turn
      and e.attempt_id=p_attempt and e.phase='chat'
      and e.governor_bucket_utc_date is not null
  ) then
    if not v_has_wire then
      -- Direct governed Start without the immutable source/wire seal
      -- must never be treated as ordinary legacy G2.
      raise exception using errcode='23514',
        constraint='seyeon_offline_r28_governed_cost_missing_wire_seal';
    end if;
    select * into v_cost from public.seyeon_ai_call_cost_events e
    where e.call_id=v_wire.call_id and e.subject_id=p_subject
      and e.turn_id=p_turn and e.attempt_id=p_attempt and e.phase='chat'
    for share;
    select * into v_provider_receipt
    from public.seyeon_ai_provider_receipt_queue_v1 q
    where q.call_id=v_wire.call_id and q.subject_id=p_subject
      and q.turn_id=p_turn and q.attempt_id=p_attempt and q.phase='chat'
    for share;
    if v_wire.source_count is distinct from v_expected_count
      or v_wire.selected_sources_digest is distinct from p_selection_digest
      or v_cost.call_id is null
      or v_cost.lifecycle_state is distinct from 'settled'
      or v_cost.cost_status is distinct from 'estimated'
      or v_cost.outcome is distinct from 'response_received'
      or v_cost.governor_receipt_pinned_at is null
      or v_cost.governor_bucket_utc_date is distinct from v_wire.reserved_bucket_utc_date
      or v_cost.governor_ceiling_micro_usd is distinct from v_wire.reserved_micro_usd
      or v_cost.governor_input_bound_tokens is distinct from v_wire.input_ceiling_tokens
      or v_cost.governor_output_cap_tokens is distinct from v_wire.output_ceiling_tokens
      or v_cost.estimated_cost_micro_usd is null
      or v_cost.governor_effective_micro_usd is null
      or v_cost.governor_effective_micro_usd>v_wire.reserved_micro_usd
      or v_cost.estimated_cost_micro_usd>v_wire.reserved_micro_usd
      or v_cost.price_version is distinct from v_cost.governor_price_version
      or v_cost.event_jsonb->>'callId' is distinct from v_wire.call_id::text
      or v_cost.event_jsonb->>'outcome' is distinct from 'response_received'
      or v_cost.event_jsonb->>'costStatus' is distinct from 'estimated'
      or v_cost.event_jsonb->>'httpStatus' is distinct from '200'
      or v_cost.event_jsonb->>'invoiceReconciled' is distinct from 'false'
      or v_cost.event_jsonb->>'estimatedCostMicroUsd'
           is distinct from v_cost.estimated_cost_micro_usd::text
      or v_cost.event_jsonb->>'inputTokens' is null
      or v_cost.event_jsonb->>'outputTokens' is null
      or v_cost.event_jsonb->>'cachedInputTokens' is null
      or v_cost.event_jsonb->>'reasoningTokens' is null
      or coalesce(v_cost.event_jsonb->>'inputTokens' ~ '^[0-9]{1,16}$',false)=false
      or coalesce(v_cost.event_jsonb->>'outputTokens' ~ '^[0-9]{1,16}$',false)=false
      or coalesce(v_cost.event_jsonb->>'cachedInputTokens' ~ '^[0-9]{1,16}$',false)=false
      or coalesce(v_cost.event_jsonb->>'reasoningTokens' ~ '^[0-9]{1,16}$',false)=false
      or (v_cost.event_jsonb->>'inputTokens')::numeric>v_wire.input_ceiling_tokens
      or (v_cost.event_jsonb->>'outputTokens')::numeric>v_wire.output_ceiling_tokens
      or (v_cost.event_jsonb->>'cachedInputTokens')::numeric>
           (v_cost.event_jsonb->>'inputTokens')::numeric
      or (v_cost.event_jsonb->>'reasoningTokens')::numeric>
           (v_cost.event_jsonb->>'outputTokens')::numeric
      or v_provider_receipt.call_id is null
      or v_provider_receipt.acked_at is null
      or v_provider_receipt.claim_token is not null
      or v_provider_receipt.claimed_until is not null
      or v_provider_receipt.price_version is distinct from v_cost.governor_price_version
      or v_provider_receipt.provider_event is distinct from v_cost.event_jsonb
    then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r28_governed_cost_unsettled';
    end if;
    -- R30 five-stage ordered native-wire lineage. A single interpreter
    -- cost receipt cannot substitute for the other four distinct call IDs.
    -- Each stage is still metadata-only and NEVER provider authorization.
    v_stage_index:=0;
    v_previous_stage_wire:=null;
    for v_stage in
      select * from seyeon_positive_candidate.native_stage_lineage_r30
      where attempt_id=p_attempt order by stage_index for share
    loop
      if v_stage.stage_index is distinct from v_stage_index
        or v_stage.source_count is distinct from 2
        or v_stage.selected_sources_digest is distinct from p_selection_digest
        or v_stage.output_ceiling_tokens is distinct from 256
        or v_stage.previous_wire_digest is distinct from v_previous_stage_wire
        or v_stage.purpose is distinct from
          (array['integrity_classification','disclosure_classification',
                 'turn_interpretation','dialogue_render','semantic_review'])[v_stage_index+1]
        or (v_stage_index=2 and (
          v_stage.call_id is distinct from v_wire.call_id
          or v_stage.native_wire_digest is distinct from v_wire.native_wire_digest
        ))
      then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r30_native_stage_lineage_invalid';
      end if;
      v_previous_stage_wire:=v_stage.native_wire_digest;
      v_stage_index:=v_stage_index+1;
    end loop;
    if v_stage_index<>5 then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r30_native_stage_lineage_incomplete';
    end if;
    if exists (
      select 1 from seyeon_positive_candidate.native_stage_lineage_r30 s
      left join public.seyeon_ai_call_cost_events c
        on c.call_id=s.call_id and c.subject_id=p_subject
        and c.turn_id=p_turn and c.attempt_id=p_attempt and c.phase='chat'
        and c.purpose=s.purpose
      left join public.seyeon_ai_provider_receipt_queue_v1 q
        on q.call_id=s.call_id and q.subject_id=p_subject
        and q.turn_id=p_turn and q.attempt_id=p_attempt and q.phase='chat'
      where s.attempt_id=p_attempt and (
        c.call_id is null or c.lifecycle_state is distinct from 'settled'
        or c.governor_receipt_pinned_at is null
        or c.cost_status is distinct from 'estimated'
        or c.outcome is distinct from 'response_received'
        or c.estimated_cost_micro_usd is null
        or c.governor_effective_micro_usd is null
        or c.governor_ceiling_micro_usd is null
        or c.governor_effective_micro_usd>c.governor_ceiling_micro_usd
        or c.governor_output_cap_tokens is distinct from s.output_ceiling_tokens
        or c.event_jsonb->>'callId' is distinct from s.call_id::text
        or c.event_jsonb->>'inputTokens' is null
        or c.event_jsonb->>'outputTokens' is null
        or coalesce(c.event_jsonb->>'inputTokens' ~ '^[0-9]{1,16}$',false)=false
        or coalesce(c.event_jsonb->>'outputTokens' ~ '^[0-9]{1,16}$',false)=false
        or (c.event_jsonb->>'inputTokens')::numeric>c.governor_input_bound_tokens
        or (c.event_jsonb->>'outputTokens')::numeric>c.governor_output_cap_tokens
        or q.call_id is null or q.acked_at is null
        or q.claim_token is not null
        or q.provider_event is distinct from c.event_jsonb
      )
    ) then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r30_all_stage_cost_settlement_unproven';
    end if;
    -- R37: all FIVE stage outcomes must have an exact immutable local
    -- observation tied to the same native Call, purpose, stage and wire.
    -- These are explicitly synthetic NO-PROVIDER/NO-OUTPUT-GUARD markers.
    -- Even when all five exist they MUST NOT authorize real Commit/Reveal.
    if (select count(*)
        from seyeon_positive_candidate.synthetic_stage_results_r37 r
        where r.attempt_id=p_attempt)<>5
      or exists(
        select 1
        from seyeon_positive_candidate.native_stage_lineage_r30 s
        left join seyeon_positive_candidate.synthetic_stage_results_r37 r
          on r.attempt_id=s.attempt_id
         and r.stage_index=s.stage_index
        where s.attempt_id=p_attempt and (
          r.attempt_id is null
          or r.call_id is distinct from s.call_id
          or r.purpose is distinct from s.purpose
          or r.native_wire_digest is distinct from s.native_wire_digest
          or r.synthetic_payload_digest
               !~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
          or r.origin_kind is distinct from 'local_synthetic_no_provider'
          or r.provider_dispatched is distinct from false
          or r.provider_output_verified is distinct from false
          or r.output_guard_verified is distinct from false
        )
      )
    then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r37_stage_result_lineage_incomplete';
    end if;
    -- R38: four independent NEGATIVE-only fixture probes must refer to
    -- the already sealed Interpreter / Renderer / Semantic Reviewer calls.
    -- These observations are NOT Provider responses or passing output guards.
    -- The fixture's local "rejected" field is never trusted as approval.
    if (select count(*)
        from seyeon_positive_candidate.guard_negative_probes_r38 p
        where p.attempt_id=p_attempt)<>4
      or exists (
        select 1
        from (values
          ('interpretation_unknown_reference',2,'turn_interpretation',
            'guardSeyeonTurnInterpretationV2'),
          ('renderer_unapproved_private_source',3,'dialogue_render',
            'admitSeyeonRendererDraftV2'),
          ('semantic_review_hash_mismatch',4,'semantic_review',
            'guardSeyeonRendererOutputV2'),
          ('semantic_review_rejected',4,'semantic_review',
            'guardSeyeonRendererOutputV2')
        ) expected(case_key,stage_index,purpose,guard_name)
        left join seyeon_positive_candidate.guard_negative_probes_r38 p
          on p.attempt_id=p_attempt
         and p.case_key=expected.case_key
        left join seyeon_positive_candidate.native_stage_lineage_r30 s
          on s.attempt_id=p_attempt
         and s.stage_index=expected.stage_index
        where p.attempt_id is null
          or p.stage_index is distinct from expected.stage_index
          or p.purpose is distinct from expected.purpose
          or p.guard_name is distinct from expected.guard_name
          or p.call_id is distinct from s.call_id
          or p.native_wire_digest is distinct from s.native_wire_digest
          or p.candidate_digest !~ '^sha256:v1:[0-9a-f]{64}$'
          or p.verdict is distinct from 'rejected'
          or p.origin_kind is distinct from
             'local_invalid_fixture_not_provider_output'
          or p.provider_dispatched is distinct from false
          or p.output_guard_verified is distinct from false
      )
    then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r38_negative_guard_probe_missing';
    end if;
    -- R40: even the extra digest-only transport receipts are NOT actual
    -- model provenance or output validation. Still, fail closed if one is
    -- absent, mismatched to the R30/R37 Call/Wire, or falsely marks PASS.
    if (select count(*)
        from seyeon_positive_candidate.unverified_transport_lineage_r40 r
        where r.attempt_id=p_attempt)<>5
      or exists (
        select 1
        from seyeon_positive_candidate.native_stage_lineage_r30 s
        left join seyeon_positive_candidate.unverified_transport_lineage_r40 r
          on r.attempt_id=s.attempt_id
         and r.stage_index=s.stage_index
        where s.attempt_id=p_attempt and (
          r.attempt_id is null
          or r.purpose is distinct from s.purpose
          or r.call_id is distinct from s.call_id
          or r.native_wire_digest is distinct from s.native_wire_digest
          or r.response_id !~ '^resp_r40_synthetic_[a-z0-9_-]{3,100}$'
          or r.response_body_digest
               !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
          or r.structured_output_digest
               !~ '^sha256:wire-utf8:v1:[a-f0-9]{64}$'
          or r.origin_kind is distinct from 'local_stub_transport_unverified'
          or r.provider_output_verified is distinct from false
          or r.output_guard_verified is distinct from false
        )
      )
    then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r40_unverified_transport_lineage_missing';
    end if;
    -- R41: one code-derived PUBLIC synthetic guard fixture must be
    -- linked to the three correct sealed native-stage Call IDs and source
    -- set, with all three unverified output SHA values matching the immutable
    -- CI-installed real-domain-guard fixture manifest. No client PASS flag
    -- or claim to real Provider origin is accepted.
    if (select count(*)
        from seyeon_positive_candidate.local_guard_fixture_lineage_r41 p
        where p.attempt_id=p_attempt)<>1
      or not exists (
        select 1
        from seyeon_positive_candidate.local_guard_fixture_lineage_r41 p
        join seyeon_positive_candidate.local_guard_fixture_manifest_r41 m
          on m.manifest_id='seyeon-r41-code-derived-public-guard-v1'
        join seyeon_positive_candidate.native_stage_lineage_r30 i
          on i.attempt_id=p.attempt_id and i.stage_index=2
        join seyeon_positive_candidate.native_stage_lineage_r30 r
          on r.attempt_id=p.attempt_id and r.stage_index=3
        join seyeon_positive_candidate.native_stage_lineage_r30 s
          on s.attempt_id=p.attempt_id and s.stage_index=4
        join seyeon_positive_candidate.unverified_transport_lineage_r40 ui
          on ui.attempt_id=p.attempt_id and ui.stage_index=2
        join seyeon_positive_candidate.unverified_transport_lineage_r40 ur
          on ur.attempt_id=p.attempt_id and ur.stage_index=3
        join seyeon_positive_candidate.unverified_transport_lineage_r40 us
          on us.attempt_id=p.attempt_id and us.stage_index=4
        where p.attempt_id=p_attempt and (
          p.selected_sources_digest is not distinct from p_selection_digest
          and p.interpretation_call_id is not distinct from i.call_id
          and p.renderer_call_id is not distinct from r.call_id
          and p.semantic_review_call_id is not distinct from s.call_id
          and p.guarded_envelope_digest is not distinct from m.guarded_envelope_digest
          and ui.structured_output_digest is not distinct from
             m.interpretation_output_digest
          and ur.structured_output_digest is not distinct from
             m.renderer_output_digest
          and us.structured_output_digest is not distinct from
             m.semantic_review_output_digest
          and p.origin_kind is not distinct from 'code_authored_local_fixture_no_provider'
          and p.provider_dispatched is not distinct from false
          and p.provider_output_verified is not distinct from false
          and p.output_guard_verified is not distinct from false
        )
      )
    then raise exception using errcode='23514',
      constraint='seyeon_offline_r41_local_guard_fixture_lineage_missing';
    end if;
    -- R42: even a complete DB-authorized local Guard witness is not
    -- a genuine model output. Still insist that its nonce-bound MAC is
    -- authentic to the named disposable DB, within its expiry, and
    -- tied to this exact original Member subject and R41 attempt.
    -- No client-supplied "passed" Boolean, MAC or replay token is read.
    if not coalesce(
      seyeon_positive_candidate.verify_local_guard_seal_r42(
        p_subject,p_attempt
      ),false
    ) then
      raise exception using errcode='23514',
        constraint='seyeon_offline_r42_db_issued_local_seal_missing';
    end if;
    -- R37/R38/R40/R41/R42 only prove synthetic, DB-internal accounting:
    -- actual Provider provenance, real Character Guard PASS, user consent
    -- and the authorizing private Preflight remain absent.
    -- The real assistant answer and Outbox ALWAYS remain blocked.
    raise exception using errcode='23514',
      constraint='seyeon_offline_r28_complete_provider_lineage_not_approved';
  end if;

  insert into seyeon_positive_candidate.actual_v2_commit_admissions_r3(
    attempt_id,subject_id,thread_id,turn_id,source_selection_digest,
    record_id,original_grant_id,pg_payload_digest,source_count,source_proof_jsonb
  ) values(p_attempt,p_subject,p_thread,p_turn,v_set.selected_sources_digest,
           v_pin.original_memory_id,v_pin.original_grant_id,v_pin.original_raw_digest,
           v_expected_count,v_expected);

  select * into strict v_commit
  from public.cmd_commit_seyeon_chat_turn_runtime_v2(
    p_subject,p_thread,p_turn,p_attempt,p_message,p_chat_outbox,
    p_post_outbox,p_snapshot,p_snapshot_hash
  );
  if v_commit.turn_id is distinct from p_turn
     or v_commit.attempt_id is distinct from p_attempt
     or v_commit.assistant_message_id is distinct from p_message
     or v_commit.post_turn_outbox_event_id is distinct from p_post_outbox
     or v_commit.replayed is distinct from false then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_real_v2_result_mismatch';
  end if;
  return jsonb_build_object(
    'turnId',v_commit.turn_id::text,
    'attemptId',v_commit.attempt_id::text,
    'assistantMessageId',v_commit.assistant_message_id::text,
    'postTurnOutboxEventId',v_commit.post_turn_outbox_event_id::text,
    'replayed',false
  );
end $g2$;

-- Restrict BOTH old wrapper routes for this disposable candidate;
-- the G2 owner wrapper above alone can invoke the unchanged real v2.
revoke execute on function public.cmd_commit_seyeon_chat_turn_runtime_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text
) from myeongha_api_executor;
revoke all on seyeon_positive_candidate.actual_v2_commit_admissions_r3
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function seyeon_positive_candidate.commit_actual_v2_r3(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.commit_actual_v2_r3(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text
) to myeongha_api_executor;

do $acl$
begin
  if has_function_privilege('myeongha_api_executor',
      'public.cmd_commit_seyeon_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE')
    or has_table_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.actual_v2_commit_admissions_r3','INSERT')
    or has_function_privilege('public',
      'seyeon_positive_candidate.commit_actual_v2_r3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text)','EXECUTE')
  then
    raise exception 'offline actual v2 candidate accidentally leaked direct Commit capability';
  end if;
end $acl$;
commit;
\echo 'PASS: disposable G2 actual v2 atomic original Grant admission + zero-only-preserving 1640 candidate installed; Production untouched'
