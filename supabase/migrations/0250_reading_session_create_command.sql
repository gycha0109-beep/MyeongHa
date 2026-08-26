-- MyeongHa Reading Session create persistence authority.
--
-- This command implements SERVER_COMMAND_TRANSACTION_SPEC §15 prepare semantics only:
-- pin the current immutable Birth revision(s), validate domain/character capability,
-- create one reading_session and logical reading attempt_no=1, and advance the session
-- current pointer atomically. It does NOT create a transport execution attempt or call
-- the external Saju engine; transport prepare/finalize remains §16.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.cmd_create_reading_session_v1(
  p_subject_id uuid,
  p_reading_session_id uuid,
  p_reading_id uuid,
  p_request_idempotency_key text,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb,
  p_saju_domain text,
  p_source_birth_profile_id uuid,
  p_target_birth_profile_id uuid,
  p_source_turn_id uuid,
  p_requested_thread_character_id uuid,
  p_requested_character_id text,
  p_requested_character_content_bundle_id uuid
)
returns table (
  reading_session_id uuid,
  reading_id uuid,
  attempt_no integer,
  source_birth_revision_id uuid,
  target_birth_revision_id uuid,
  domain_capability_version text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_existing_reading_id uuid;
  v_existing_session_id uuid;
  v_existing_attempt_no integer;
  v_existing_request_hash text;
  v_existing_source_revision_id uuid;
  v_existing_target_revision_id uuid;
  v_existing_capability_version text;
  v_source_revision_id uuid;
  v_target_revision_id uuid;
  v_source_profile_kind text;
  v_target_profile_kind text;
  v_domain_availability text;
  v_domain_capability_version text;
  v_character_can_initiate boolean;
  v_source_turn_bundle_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_reading_session_id is null or p_reading_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_create_ids_required',
      message = 'reading session and reading ids are required';
  end if;

  if p_request_idempotency_key is null or btrim(p_request_idempotency_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_create_idempotency_required',
      message = 'reading idempotency key is required';
  end if;

  if p_request_hash is null or btrim(p_request_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_create_request_hash_required',
      message = 'canonical reading request hash is required';
  end if;

  if p_request_contract_version is null or btrim(p_request_contract_version) = ''
     or p_request_snapshot_jsonb is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_create_request_snapshot_required',
      message = 'reading request contract version and snapshot are required';
  end if;

  if p_saju_domain is null or btrim(p_saju_domain) = ''
     or p_source_birth_profile_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_create_domain_source_required',
      message = 'Saju domain and source birth profile are required';
  end if;

  if (p_requested_character_id is null) <> (p_requested_character_content_bundle_id is null) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_create_character_pair',
      message = 'requested character and content bundle must be supplied together';
  end if;

  if p_requested_thread_character_id is not null
     and (p_source_turn_id is null or p_requested_character_id is null) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_create_participation_shape',
      message = 'thread character participation requires a source turn and requested character';
  end if;

  if p_source_turn_id is null and p_requested_thread_character_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_create_participation_shape',
      message = 'thread character participation requires a source turn';
  end if;

  -- API idempotency authority is global per subject for logical readings.
  select r.id,
         r.reading_session_id,
         r.attempt_no,
         r.request_hash,
         rs.source_birth_revision_id,
         rs.target_birth_revision_id,
         rs.domain_capability_version
    into v_existing_reading_id,
         v_existing_session_id,
         v_existing_attempt_no,
         v_existing_request_hash,
         v_existing_source_revision_id,
         v_existing_target_revision_id,
         v_existing_capability_version
  from public.readings r
  join public.reading_sessions rs
    on rs.id = r.reading_session_id
   and rs.subject_id = r.subject_id
  where r.subject_id = p_subject_id
    and r.request_idempotency_key = p_request_idempotency_key;

  if found then
    if v_existing_request_hash is distinct from p_request_hash then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_reading_create_idempotency_conflict',
        message = 'reading idempotency key already exists with a different canonical request hash';
    end if;

    return query
      select v_existing_session_id,
             v_existing_reading_id,
             v_existing_attempt_no,
             v_existing_source_revision_id,
             v_existing_target_revision_id,
             v_existing_capability_version,
             true;
    return;
  end if;

  -- Lock all requested Birth aggregate roots in stable UUID order before resolving their
  -- immutable current revisions. This avoids source/target reverse-order deadlocks.
  perform 1
  from public.birth_profiles bp
  where bp.subject_id = p_subject_id
    and bp.id in (p_source_birth_profile_id, p_target_birth_profile_id)
  order by bp.id
  for update;

  select bp.current_revision_id, bp.profile_kind
    into v_source_revision_id, v_source_profile_kind
  from public.birth_profiles bp
  where bp.id = p_source_birth_profile_id
    and bp.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_reading_create_source_profile_not_found',
      message = 'source birth profile was not found for this subject';
  end if;

  if v_source_revision_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_reading_create_source_profile_not_ready',
      message = 'source birth profile has no current immutable revision';
  end if;

  if v_source_profile_kind is distinct from 'self' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_session_profile_cardinality',
      message = 'reading source birth profile must be the self profile';
  end if;

  if p_target_birth_profile_id is not null then
    if p_target_birth_profile_id = p_source_birth_profile_id then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_session_profile_cardinality',
        message = 'source and target birth profiles must be distinct';
    end if;

    select bp.current_revision_id, bp.profile_kind
      into v_target_revision_id, v_target_profile_kind
    from public.birth_profiles bp
    where bp.id = p_target_birth_profile_id
      and bp.subject_id = p_subject_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        constraint = 'cmd_reading_create_target_profile_not_found',
        message = 'target birth profile was not found for this subject';
    end if;

    if v_target_revision_id is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_reading_create_target_profile_not_ready',
        message = 'target birth profile has no current immutable revision';
    end if;
  end if;

  if p_saju_domain = 'compatibility' then
    if p_target_birth_profile_id is null or v_target_profile_kind is distinct from 'target' then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_session_profile_cardinality',
        message = 'compatibility reading requires one target birth profile';
    end if;
  elsif p_target_birth_profile_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_session_profile_cardinality',
      message = 'non-compatibility reading must not pin a target birth profile';
  end if;

  select sdr.availability, sdr.capability_version
    into v_domain_availability, v_domain_capability_version
  from public.saju_domain_runtime sdr
  where sdr.saju_domain = p_saju_domain;

  if v_domain_availability is null or v_domain_availability = 'unavailable' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_session_domain_available',
      message = 'reading session domain is not operationally available';
  end if;

  if p_source_turn_id is not null then
    select ct.resolved_content_bundle_id
      into v_source_turn_bundle_id
    from public.chat_turns ct
    where ct.id = p_source_turn_id
      and ct.subject_id = p_subject_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        constraint = 'cmd_reading_create_source_turn_not_found',
        message = 'source chat turn was not found for this subject';
    end if;

    if p_requested_character_content_bundle_id is not null
       and v_source_turn_bundle_id is distinct from p_requested_character_content_bundle_id then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_reading_create_source_turn_bundle_conflict',
        message = 'requested character bundle must match source turn content authority';
    end if;
  end if;

  if p_requested_character_id is not null then
    select cc.can_initiate
      into v_character_can_initiate
    from public.character_capabilities cc
    where cc.content_bundle_id = p_requested_character_content_bundle_id
      and cc.character_id = p_requested_character_id
      and cc.saju_domain = p_saju_domain;

    if v_character_can_initiate is distinct from true then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_character_capability',
        message = 'requested character cannot initiate this Saju domain';
    end if;

    if p_source_turn_id is not null and p_requested_thread_character_id is null then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_character_participation',
        message = 'character-triggered chat reading requires exact thread participation';
    end if;
  end if;

  -- The unique (subject_id, request_idempotency_key) constraint is the final race
  -- authority. If another worker commits the same logical command first, this block is
  -- rolled back and the winner is replayed instead of leaving an orphan session.
  begin
    insert into public.reading_sessions(
      id,
      subject_id,
      saju_domain,
      domain_capability_version,
      source_birth_revision_id,
      target_birth_revision_id,
      state,
      next_attempt_no,
      current_reading_id,
      created_at,
      updated_at
    ) values (
      p_reading_session_id,
      p_subject_id,
      p_saju_domain,
      v_domain_capability_version,
      v_source_revision_id,
      v_target_revision_id,
      'active',
      1,
      null,
      v_now,
      v_now
    );

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
      p_saju_domain,
      1,
      null,
      p_source_turn_id,
      p_requested_thread_character_id,
      p_requested_character_id,
      p_requested_character_content_bundle_id,
      'pending',
      p_request_idempotency_key,
      p_request_hash,
      p_request_contract_version,
      p_request_snapshot_jsonb,
      1,
      null,
      v_now,
      null
    );

    update public.reading_sessions rs
    set current_reading_id = p_reading_id,
        next_attempt_no = 2,
        updated_at = v_now
    where rs.id = p_reading_session_id
      and rs.subject_id = p_subject_id;

  exception when unique_violation then
    select r.id,
           r.reading_session_id,
           r.attempt_no,
           r.request_hash,
           rs.source_birth_revision_id,
           rs.target_birth_revision_id,
           rs.domain_capability_version
      into v_existing_reading_id,
           v_existing_session_id,
           v_existing_attempt_no,
           v_existing_request_hash,
           v_existing_source_revision_id,
           v_existing_target_revision_id,
           v_existing_capability_version
    from public.readings r
    join public.reading_sessions rs
      on rs.id = r.reading_session_id
     and rs.subject_id = r.subject_id
    where r.subject_id = p_subject_id
      and r.request_idempotency_key = p_request_idempotency_key;

    if not found then
      raise;
    end if;

    if v_existing_request_hash is distinct from p_request_hash then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_reading_create_idempotency_conflict',
        message = 'reading idempotency key already exists with a different canonical request hash';
    end if;

    return query
      select v_existing_session_id,
             v_existing_reading_id,
             v_existing_attempt_no,
             v_existing_source_revision_id,
             v_existing_target_revision_id,
             v_existing_capability_version,
             true;
    return;
  end;

  return query
    select p_reading_session_id,
           p_reading_id,
           1,
           v_source_revision_id,
           v_target_revision_id,
           v_domain_capability_version,
           false;
end;
$$;

revoke all on function public.cmd_create_reading_session_v1(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, uuid,
  uuid, uuid, text, uuid
) from public;
