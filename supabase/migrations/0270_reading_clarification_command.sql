-- MyeongHa Reading clarification append authority.
--
-- Implements SERVER_COMMAND_TRANSACTION_SPEC §15 Clarification and the API contract
-- identity `idempotencyKey + expectedCurrentReadingId` at the DB transaction boundary.
-- ClarificationAnswerV1 validation remains an application-boundary prerequisite; the DB
-- stores only the already-validated canonical request snapshot/hash.
--
-- A clarification is a NEW logical readings row. It is never a transport retry.
-- The parent ProductReadingResponse must already be an immutable successful response with
-- semantic state `needs_clarification`. If a pinned Birth profile has advanced since the
-- session began, clarification is fail-closed and a new session/recalculation is required.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.cmd_append_reading_clarification_v1(
  p_subject_id uuid,
  p_reading_session_id uuid,
  p_expected_current_reading_id uuid,
  p_reading_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb
)
returns table (
  reading_session_id uuid,
  reading_id uuid,
  parent_reading_id uuid,
  attempt_no integer,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_session_state text;
  v_session_domain text;
  v_session_next_attempt_no integer;
  v_session_current_reading_id uuid;
  v_source_birth_revision_id uuid;
  v_target_birth_revision_id uuid;
  v_source_profile_current_revision_id uuid;
  v_target_profile_current_revision_id uuid;
  v_parent_execution_status text;
  v_parent_attempt_no integer;
  v_parent_response_state text;
  v_existing_session_id uuid;
  v_existing_parent_id uuid;
  v_existing_attempt_no integer;
  v_existing_hash text;
  v_existing_contract_version text;
  v_existing_snapshot jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null
     or p_reading_session_id is null
     or p_expected_current_reading_id is null
     or p_reading_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_clarification_identity_required',
      message = 'clarification subject/session/current/reading identity is required';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_request_hash is null or btrim(p_request_hash) = ''
     or p_request_contract_version is null or btrim(p_request_contract_version) = ''
     or p_request_snapshot_jsonb is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_clarification_request_required',
      message = 'validated clarification request identity/hash/snapshot is required';
  end if;

  -- Session root serializes current-pointer and logical attempt allocation.
  select rs.state,
         rs.saju_domain,
         rs.next_attempt_no,
         rs.current_reading_id,
         rs.source_birth_revision_id,
         rs.target_birth_revision_id
    into v_session_state,
         v_session_domain,
         v_session_next_attempt_no,
         v_session_current_reading_id,
         v_source_birth_revision_id,
         v_target_birth_revision_id
  from public.reading_sessions rs
  where rs.id = p_reading_session_id
    and rs.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_reading_clarification_session_not_found',
      message = 'reading session was not found for this subject';
  end if;

  -- Response-loss replay is evaluated after locking the aggregate but before stale-current
  -- rejection, because a successful prior append necessarily moved current_reading_id.
  select r.reading_session_id,
         r.parent_reading_id,
         r.attempt_no,
         r.request_hash,
         r.request_contract_version,
         r.request_snapshot_jsonb
    into v_existing_session_id,
         v_existing_parent_id,
         v_existing_attempt_no,
         v_existing_hash,
         v_existing_contract_version,
         v_existing_snapshot
  from public.readings r
  where r.subject_id = p_subject_id
    and r.request_idempotency_key = p_idempotency_key;

  if found then
    if v_existing_session_id is distinct from p_reading_session_id
       or v_existing_parent_id is distinct from p_expected_current_reading_id
       or v_existing_hash is distinct from p_request_hash
       or v_existing_contract_version is distinct from p_request_contract_version
       or v_existing_snapshot is distinct from p_request_snapshot_jsonb then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_reading_clarification_idempotency_conflict',
        message = 'clarification idempotency key already represents a different canonical request';
    end if;

    return query
      select p_reading_session_id,
             r.id,
             r.parent_reading_id,
             r.attempt_no,
             true
      from public.readings r
      where r.subject_id = p_subject_id
        and r.request_idempotency_key = p_idempotency_key;
    return;
  end if;

  if v_session_state <> 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_clarification_session_terminal',
      message = 'only an active reading session can append a clarification';
  end if;

  if v_session_current_reading_id is distinct from p_expected_current_reading_id then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_reading_clarification_stale_current',
      message = 'reading session current reading does not match expectedCurrentReadingId';
  end if;

  select r.execution_status, r.attempt_no
    into v_parent_execution_status, v_parent_attempt_no
  from public.readings r
  where r.id = p_expected_current_reading_id
    and r.reading_session_id = p_reading_session_id
    and r.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_reading_clarification_parent_not_found',
      message = 'expected current reading was not found in this session';
  end if;

  if v_parent_execution_status <> 'succeeded' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_clarification_parent_not_succeeded',
      message = 'clarification parent must have a successful immutable ProductReadingResponse';
  end if;

  select rr.product_response_state
    into v_parent_response_state
  from public.reading_refs rr
  where rr.reading_id = p_expected_current_reading_id
    and rr.subject_id = p_subject_id;

  if not found or v_parent_response_state <> 'needs_clarification' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_clarification_not_requested',
      message = 'current ProductReadingResponse does not require clarification';
  end if;

  -- Session Birth pins are immutable, but user profiles can advance. A clarification must
  -- not silently combine answers with obsolete birth input authority.
  select bp.current_revision_id
    into v_source_profile_current_revision_id
  from public.birth_profile_revisions bpr
  join public.birth_profiles bp
    on bp.id = bpr.birth_profile_id
   and bp.subject_id = bpr.subject_id
  where bpr.id = v_source_birth_revision_id
    and bpr.subject_id = p_subject_id;

  if v_source_profile_current_revision_id is distinct from v_source_birth_revision_id then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_reading_clarification_birth_stale',
      message = 'source Birth profile changed after this reading session was pinned';
  end if;

  if v_target_birth_revision_id is not null then
    select bp.current_revision_id
      into v_target_profile_current_revision_id
    from public.birth_profile_revisions bpr
    join public.birth_profiles bp
      on bp.id = bpr.birth_profile_id
     and bp.subject_id = bpr.subject_id
    where bpr.id = v_target_birth_revision_id
      and bpr.subject_id = p_subject_id;

    if v_target_profile_current_revision_id is distinct from v_target_birth_revision_id then
      raise exception using
        errcode = '40001',
        constraint = 'cmd_reading_clarification_birth_stale',
        message = 'target Birth profile changed after this reading session was pinned';
    end if;
  end if;

  -- The existing partial UNIQUE(parent_reading_id) is the final branch authority. This
  -- explicit check produces a stable command error before attempting the insert.
  if exists (
    select 1
    from public.readings child
    where child.parent_reading_id = p_expected_current_reading_id
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_reading_clarification_parent_already_extended',
      message = 'current reading already has a clarification child';
  end if;

  if v_session_next_attempt_no <= v_parent_attempt_no then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_clarification_allocator_invalid',
      message = 'reading session clarification allocator is not ahead of the current parent';
  end if;

  insert into public.readings(
    id,
    reading_session_id,
    subject_id,
    saju_domain,
    attempt_no,
    parent_reading_id,
    source_turn_id,
    requested_thread_character_id,
    requested_character_id,
    requested_character_content_bundle_id,
    execution_status,
    request_idempotency_key,
    request_hash,
    request_contract_version,
    request_snapshot_jsonb,
    next_execution_attempt_no,
    committed_execution_attempt_id,
    created_at,
    completed_at
  ) values (
    p_reading_id,
    p_reading_session_id,
    p_subject_id,
    v_session_domain,
    v_session_next_attempt_no,
    p_expected_current_reading_id,
    null,
    null,
    null,
    null,
    'pending',
    p_idempotency_key,
    p_request_hash,
    p_request_contract_version,
    p_request_snapshot_jsonb,
    1,
    null,
    v_now,
    null
  );

  update public.reading_sessions rs
  set next_attempt_no = v_session_next_attempt_no + 1,
      current_reading_id = p_reading_id,
      updated_at = v_now
  where rs.id = p_reading_session_id
    and rs.subject_id = p_subject_id;

  return query
    select p_reading_session_id,
           p_reading_id,
           p_expected_current_reading_id,
           v_session_next_attempt_no,
           false;
end;
$$;

revoke all on function public.cmd_append_reading_clarification_v1(
  uuid, uuid, uuid, uuid, text, text, text, jsonb
) from public;
