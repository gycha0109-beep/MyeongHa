-- MyeongHa Reading transport persistence authority.
--
-- Implements SERVER_COMMAND_TRANSACTION_SPEC §16 at the DB transaction boundary only.
-- The real Saju adapter/request mapping remains blocked by SRC-08 and MUST run outside
-- these transactions. ProductReadingResponse schema validation is an application-boundary
-- prerequisite; this migration persists only already-validated response provenance and
-- enforces DB-owned execution/input/ref invariants.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.cmd_prepare_reading_transport_attempt_v1(
  p_subject_id uuid,
  p_reading_id uuid,
  p_execution_attempt_id uuid,
  p_transport_key text,
  p_saju_engine_key text,
  p_requested_engine_version text
)
returns table (
  execution_attempt_id uuid,
  execution_attempt_no integer,
  attempt_state text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_reading_status text;
  v_next_attempt_no integer;
  v_existing_reading_id uuid;
  v_existing_subject_id uuid;
  v_existing_attempt_no integer;
  v_existing_state text;
  v_existing_transport_key text;
  v_existing_engine_key text;
  v_existing_requested_version text;
  v_running_attempt_id uuid;
  v_previous_state text;
  v_now timestamptz := clock_timestamp();
begin
  if p_execution_attempt_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_attempt_id_required',
      message = 'reading transport execution attempt id is required';
  end if;

  if p_transport_key is null or btrim(p_transport_key) = ''
     or p_saju_engine_key is null or btrim(p_saju_engine_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_identity_required',
      message = 'transport key and Saju engine key are required';
  end if;

  -- Exact execution-attempt replay is checked before allocation. A terminal exact replay
  -- returns its authoritative state; a genuine retry must use a new execution_attempt_id.
  select rea.reading_id,
         rea.subject_id,
         rea.execution_attempt_no,
         rea.state,
         rea.transport_key,
         rea.saju_engine_key,
         rea.requested_engine_version
    into v_existing_reading_id,
         v_existing_subject_id,
         v_existing_attempt_no,
         v_existing_state,
         v_existing_transport_key,
         v_existing_engine_key,
         v_existing_requested_version
  from public.reading_execution_attempts rea
  where rea.id = p_execution_attempt_id;

  if found then
    if v_existing_reading_id is distinct from p_reading_id
       or v_existing_subject_id is distinct from p_subject_id
       or v_existing_transport_key is distinct from p_transport_key
       or v_existing_engine_key is distinct from p_saju_engine_key
       or v_existing_requested_version is distinct from p_requested_engine_version then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_reading_transport_attempt_replay_conflict',
        message = 'execution attempt id already represents a different transport request';
    end if;

    return query
      select p_execution_attempt_id,
             v_existing_attempt_no,
             v_existing_state,
             true;
    return;
  end if;

  -- Reading is the allocator/serialization authority for transport retries.
  select r.execution_status, r.next_execution_attempt_no
    into v_reading_status, v_next_attempt_no
  from public.readings r
  where r.id = p_reading_id
    and r.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_reading_transport_reading_not_found',
      message = 'reading was not found for this subject';
  end if;

  if v_reading_status not in ('pending', 'running') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_reading_terminal',
      message = 'terminal logical reading cannot allocate another transport attempt';
  end if;

  select rea.id
    into v_running_attempt_id
  from public.reading_execution_attempts rea
  where rea.reading_id = p_reading_id
    and rea.subject_id = p_subject_id
    and rea.state = 'running'
  order by rea.execution_attempt_no desc
  limit 1;

  if found then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_attempt_in_flight',
      message = 'another transport attempt is already running for this reading';
  end if;

  if v_reading_status = 'running' then
    select rea.state
      into v_previous_state
    from public.reading_execution_attempts rea
    where rea.reading_id = p_reading_id
      and rea.subject_id = p_subject_id
      and rea.execution_attempt_no = v_next_attempt_no - 1;

    if v_previous_state is distinct from 'failed_retryable' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_reading_transport_retry_not_eligible',
        message = 'running reading can allocate a new transport attempt only after failed_retryable';
    end if;
  end if;

  insert into public.reading_execution_attempts(
    id,
    reading_id,
    subject_id,
    execution_attempt_no,
    state,
    transport_key,
    saju_engine_key,
    requested_engine_version,
    resolved_engine_version,
    external_request_ref,
    started_at,
    finished_at,
    error_code
  ) values (
    p_execution_attempt_id,
    p_reading_id,
    p_subject_id,
    v_next_attempt_no,
    'running',
    p_transport_key,
    p_saju_engine_key,
    p_requested_engine_version,
    null,
    null,
    v_now,
    null,
    null
  );

  update public.readings r
  set next_execution_attempt_no = v_next_attempt_no + 1,
      execution_status = 'running'
  where r.id = p_reading_id
    and r.subject_id = p_subject_id;

  return query
    select p_execution_attempt_id,
           v_next_attempt_no,
           'running'::text,
           false;
end;
$$;

create or replace function public.cmd_finalize_reading_transport_failure_v1(
  p_subject_id uuid,
  p_reading_id uuid,
  p_execution_attempt_id uuid,
  p_retryable boolean,
  p_error_code text,
  p_external_request_ref text
)
returns table (
  execution_attempt_id uuid,
  execution_attempt_no integer,
  attempt_state text,
  reading_state text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_reading_status text;
  v_next_attempt_no integer;
  v_attempt_no integer;
  v_attempt_state text;
  v_attempt_error_code text;
  v_attempt_external_ref text;
  v_target_state text;
  v_now timestamptz := clock_timestamp();
begin
  if p_retryable is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_failure_retryability_required',
      message = 'transport failure retryability classification is required';
  end if;

  if p_error_code is null or btrim(p_error_code) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_failure_code_required',
      message = 'transport failure error code is required';
  end if;

  v_target_state := case when p_retryable then 'failed_retryable' else 'failed_final' end;

  select r.execution_status, r.next_execution_attempt_no
    into v_reading_status, v_next_attempt_no
  from public.readings r
  where r.id = p_reading_id
    and r.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_reading_transport_reading_not_found',
      message = 'reading was not found for this subject';
  end if;

  select rea.execution_attempt_no,
         rea.state,
         rea.error_code,
         rea.external_request_ref
    into v_attempt_no,
         v_attempt_state,
         v_attempt_error_code,
         v_attempt_external_ref
  from public.reading_execution_attempts rea
  where rea.id = p_execution_attempt_id
    and rea.reading_id = p_reading_id
    and rea.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_reading_transport_attempt_not_found',
      message = 'reading transport attempt was not found for this reading';
  end if;

  if v_attempt_state <> 'running' then
    if v_attempt_state is distinct from v_target_state
       or v_attempt_error_code is distinct from p_error_code
       or v_attempt_external_ref is distinct from p_external_request_ref then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_reading_transport_failure_replay_conflict',
        message = 'terminal transport attempt does not match this failure result';
    end if;

    return query
      select p_execution_attempt_id,
             v_attempt_no,
             v_attempt_state,
             v_reading_status,
             true;
    return;
  end if;

  if v_reading_status <> 'running'
     or v_attempt_no <> v_next_attempt_no - 1 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_attempt_not_current',
      message = 'only the current running transport attempt can be finalized';
  end if;

  update public.reading_execution_attempts rea
  set state = v_target_state,
      external_request_ref = p_external_request_ref,
      finished_at = v_now,
      error_code = p_error_code
  where rea.id = p_execution_attempt_id;

  if not p_retryable then
    update public.readings r
    set execution_status = 'failed',
        completed_at = v_now
    where r.id = p_reading_id
      and r.subject_id = p_subject_id;

    v_reading_status := 'failed';
  end if;

  return query
    select p_execution_attempt_id,
           v_attempt_no,
           v_target_state,
           v_reading_status,
           false;
end;
$$;

create or replace function public.cmd_finalize_reading_transport_success_v1(
  p_subject_id uuid,
  p_reading_id uuid,
  p_execution_attempt_id uuid,
  p_outbox_event_id uuid,
  p_external_request_ref text,
  p_resolved_engine_version text,
  p_external_reading_ref text,
  p_source_birth_input_hash text,
  p_target_birth_input_hash text,
  p_reading_contract_version text,
  p_product_response_state text,
  p_required_action_jsonb jsonb,
  p_clarifications_jsonb jsonb,
  p_calculation_ambiguity_jsonb jsonb,
  p_response_snapshot_jsonb jsonb,
  p_response_hash text
)
returns table (
  reading_id uuid,
  execution_attempt_id uuid,
  response_hash text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_reading_status text;
  v_next_attempt_no integer;
  v_reading_session_id uuid;
  v_committed_attempt_id uuid;
  v_attempt_no integer;
  v_attempt_state text;
  v_attempt_engine_key text;
  v_existing_response_hash text;
  v_expected_source_hash text;
  v_expected_target_hash text;
  v_now timestamptz := clock_timestamp();
begin
  if p_outbox_event_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_outbox_id_required',
      message = 'reading finalize outbox id is required';
  end if;

  if p_resolved_engine_version is null or btrim(p_resolved_engine_version) = ''
     or p_source_birth_input_hash is null or btrim(p_source_birth_input_hash) = ''
     or p_reading_contract_version is null or btrim(p_reading_contract_version) = ''
     or p_product_response_state is null or btrim(p_product_response_state) = ''
     or p_response_snapshot_jsonb is null
     or p_response_hash is null or btrim(p_response_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_response_provenance_required',
      message = 'validated ProductReadingResponse provenance is incomplete';
  end if;

  select r.execution_status,
         r.next_execution_attempt_no,
         r.reading_session_id,
         r.committed_execution_attempt_id
    into v_reading_status,
         v_next_attempt_no,
         v_reading_session_id,
         v_committed_attempt_id
  from public.readings r
  where r.id = p_reading_id
    and r.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_reading_transport_reading_not_found',
      message = 'reading was not found for this subject';
  end if;

  if v_reading_status = 'succeeded' then
    if v_committed_attempt_id is distinct from p_execution_attempt_id then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_reading_transport_success_replay_conflict',
        message = 'reading already succeeded with a different committed transport attempt';
    end if;

    select rr.response_hash
      into v_existing_response_hash
    from public.reading_refs rr
    where rr.reading_id = p_reading_id
      and rr.subject_id = p_subject_id
      and rr.execution_attempt_id = p_execution_attempt_id;

    if v_existing_response_hash is distinct from p_response_hash then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_reading_transport_success_replay_conflict',
        message = 'reading already succeeded with a different ProductReadingResponse hash';
    end if;

    return query
      select p_reading_id,
             p_execution_attempt_id,
             v_existing_response_hash,
             true;
    return;
  end if;

  if v_reading_status <> 'running' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_reading_terminal',
      message = 'only a running logical reading can finalize transport success';
  end if;

  select rea.execution_attempt_no,
         rea.state,
         rea.saju_engine_key
    into v_attempt_no,
         v_attempt_state,
         v_attempt_engine_key
  from public.reading_execution_attempts rea
  where rea.id = p_execution_attempt_id
    and rea.reading_id = p_reading_id
    and rea.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_reading_transport_attempt_not_found',
      message = 'reading transport attempt was not found for this reading';
  end if;

  if v_attempt_state <> 'running'
     or v_attempt_no <> v_next_attempt_no - 1 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_transport_attempt_not_current',
      message = 'only the current running transport attempt can finalize success';
  end if;

  select src.input_hash, tgt.input_hash
    into v_expected_source_hash, v_expected_target_hash
  from public.reading_sessions rs
  join public.birth_profile_revisions src
    on src.id = rs.source_birth_revision_id
   and src.subject_id = rs.subject_id
  left join public.birth_profile_revisions tgt
    on tgt.id = rs.target_birth_revision_id
   and tgt.subject_id = rs.subject_id
  where rs.id = v_reading_session_id
    and rs.subject_id = p_subject_id;

  if v_expected_source_hash is distinct from p_source_birth_input_hash
     or v_expected_target_hash is distinct from p_target_birth_input_hash then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_finalize',
      message = 'ProductReadingResponse input hashes must equal the immutable Birth revisions pinned by the session';
  end if;

  update public.reading_execution_attempts rea
  set state = 'succeeded',
      resolved_engine_version = p_resolved_engine_version,
      external_request_ref = p_external_request_ref,
      finished_at = v_now,
      error_code = null
  where rea.id = p_execution_attempt_id;

  insert into public.reading_refs(
    reading_id,
    subject_id,
    execution_attempt_id,
    saju_engine_key,
    external_reading_ref,
    source_birth_input_hash,
    target_birth_input_hash,
    saju_engine_version,
    reading_contract_version,
    product_response_state,
    required_action_jsonb,
    clarifications_jsonb,
    calculation_ambiguity_jsonb,
    response_snapshot_jsonb,
    response_hash,
    created_at
  ) values (
    p_reading_id,
    p_subject_id,
    p_execution_attempt_id,
    v_attempt_engine_key,
    p_external_reading_ref,
    p_source_birth_input_hash,
    p_target_birth_input_hash,
    p_resolved_engine_version,
    p_reading_contract_version,
    p_product_response_state,
    p_required_action_jsonb,
    p_clarifications_jsonb,
    p_calculation_ambiguity_jsonb,
    p_response_snapshot_jsonb,
    p_response_hash,
    v_now
  );

  update public.readings r
  set execution_status = 'succeeded',
      committed_execution_attempt_id = p_execution_attempt_id,
      completed_at = v_now
  where r.id = p_reading_id
    and r.subject_id = p_subject_id;

  insert into public.outbox_events(
    id,
    aggregate_type,
    aggregate_id,
    event_type,
    event_schema_version,
    dedupe_key,
    payload_jsonb,
    status,
    attempt_count,
    available_at,
    created_at
  ) values (
    p_outbox_event_id,
    'reading',
    p_reading_id::text,
    'READING_FINALIZED',
    'v1',
    'transport-success-v1',
    jsonb_build_object(
      'readingId', p_reading_id,
      'executionAttemptId', p_execution_attempt_id,
      'responseHash', p_response_hash,
      'productResponseState', p_product_response_state
    ),
    'pending',
    0,
    v_now,
    v_now
  );

  return query
    select p_reading_id,
           p_execution_attempt_id,
           p_response_hash,
           false;
end;
$$;

revoke all on function public.cmd_prepare_reading_transport_attempt_v1(
  uuid, uuid, uuid, text, text, text
) from public;

revoke all on function public.cmd_finalize_reading_transport_failure_v1(
  uuid, uuid, uuid, boolean, text, text
) from public;

revoke all on function public.cmd_finalize_reading_transport_success_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, text
) from public;
