-- MyeongHa DDL draft: cross-row integrity that cannot be expressed as simple CHECK/FK.
-- External calls and unrelated side effects are forbidden in these triggers.

create or replace function public.ct_validate_subject_merge_edge()
returns trigger
language plpgsql
as $$
declare
  target_kind text;
  target_status text;
  incoming_count bigint;
begin
  if new.status = 'merged' then
    select kind, status
      into target_kind, target_status
      from public.subjects
      where id = new.merged_into_subject_id;

    if target_kind is distinct from 'member'
       or target_status not in ('active', 'deletion_pending') then
      raise exception using
        errcode = '23514',
        constraint = 'ct_subject_merge_target_valid',
        message = 'merged subject must point directly to an active/deletion_pending member';
    end if;
  end if;

  select count(*) into incoming_count
  from public.subjects
  where merged_into_subject_id = new.id
    and status = 'merged';

  if incoming_count > 0
     and (new.kind <> 'member' or new.status not in ('active', 'deletion_pending')) then
    raise exception using
      errcode = '23514',
      constraint = 'ct_subject_merge_target_valid',
      message = 'canonical merge target cannot become non-member, merged, or deleted';
  end if;

  return new;
end;
$$;

create constraint trigger ct_subject_merge_target_valid
  after insert or update of kind, status, merged_into_subject_id
  on public.subjects
  deferrable initially deferred
  for each row execute function public.ct_validate_subject_merge_edge();

create or replace function public.ct_validate_subject_merge_job_parties()
returns trigger
language plpgsql
as $$
declare
  guest_kind text;
  guest_status text;
  member_kind text;
  member_status text;
begin
  select kind, status into guest_kind, guest_status
  from public.subjects where id = new.guest_subject_id;

  select kind, status into member_kind, member_status
  from public.subjects where id = new.member_subject_id;

  if guest_kind is distinct from 'guest' or guest_status is distinct from 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_subject_merge_job_parties_valid',
      message = 'merge job guest must be an active guest';
  end if;

  if member_kind is distinct from 'member'
     or member_status not in ('active', 'deletion_pending') then
    raise exception using
      errcode = '23514',
      constraint = 'ct_subject_merge_job_parties_valid',
      message = 'merge job member must be active/deletion_pending member';
  end if;

  return new;
end;
$$;

create constraint trigger ct_subject_merge_job_parties_valid
  after insert or update of guest_subject_id, member_subject_id
  on public.subject_merge_jobs
  deferrable initially deferred
  for each row execute function public.ct_validate_subject_merge_job_parties();

create or replace function public.ct_validate_target_profile_kind()
returns trigger
language plpgsql
as $$
declare
  actual_kind text;
begin
  select profile_kind into actual_kind
  from public.birth_profiles
  where id = new.birth_profile_id and subject_id = new.subject_id;

  if actual_kind is distinct from 'target' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_target_profile_kind',
      message = 'target_person_profiles must reference a target birth profile';
  end if;

  return new;
end;
$$;

create constraint trigger ct_target_profile_kind
  after insert or update of subject_id, birth_profile_id
  on public.target_person_profiles
  deferrable initially deferred
  for each row execute function public.ct_validate_target_profile_kind();

create or replace function public.ct_validate_life_fact_supersession()
returns trigger
language plpgsql
as $$
declare
  parent_type text;
  cycle_found boolean;
begin
  if new.supersedes_fact_id is null then
    return new;
  end if;

  select fact_type into parent_type
  from public.life_facts
  where id = new.supersedes_fact_id and subject_id = new.subject_id;

  if parent_type is distinct from new.fact_type then
    raise exception using
      errcode = '23514',
      constraint = 'ct_life_fact_supersession_integrity',
      message = 'life fact supersession must preserve fact_type';
  end if;

  with recursive lineage(id, supersedes_fact_id) as (
    select id, supersedes_fact_id
    from public.life_facts
    where id = new.supersedes_fact_id and subject_id = new.subject_id
    union
    select lf.id, lf.supersedes_fact_id
    from public.life_facts lf
    join lineage l on lf.id = l.supersedes_fact_id
    where lf.subject_id = new.subject_id
  )
  select exists(select 1 from lineage where id = new.id)
    into cycle_found;

  if cycle_found then
    raise exception using
      errcode = '23514',
      constraint = 'ct_life_fact_supersession_integrity',
      message = 'life fact supersession cycle is not allowed';
  end if;

  return new;
end;
$$;

create constraint trigger ct_life_fact_supersession_integrity
  after insert or update of subject_id, fact_type, supersedes_fact_id
  on public.life_facts
  deferrable initially deferred
  for each row execute function public.ct_validate_life_fact_supersession();

create or replace function public.ct_validate_memory_proposal_source_character()
returns trigger
language plpgsql
as $$
declare
  source_sender text;
  source_character text;
begin
  if new.source_message_id is null then
    return new;
  end if;

  select m.sender_type, tc.character_id
    into source_sender, source_character
  from public.conversation_messages m
  left join public.conversation_thread_characters tc
    on tc.id = m.thread_character_id and tc.thread_id = m.thread_id
  where m.id = new.source_message_id
    and m.turn_id = new.source_turn_id
    and m.subject_id = new.subject_id;

  if source_sender = 'character' and source_character is distinct from new.character_id then
    raise exception using
      errcode = '23514',
      constraint = 'ct_memory_proposal_source_character',
      message = 'memory proposal character must match its source character message';
  end if;

  return new;
end;
$$;

create constraint trigger ct_memory_proposal_source_character
  after insert or update of character_id, source_turn_id, source_message_id, subject_id
  on public.memory_proposals
  deferrable initially deferred
  for each row execute function public.ct_validate_memory_proposal_source_character();

create or replace function public.ct_validate_memory_item_source_character()
returns trigger
language plpgsql
as $$
declare
  source_sender text;
  source_character text;
begin
  if new.source_message_id is null or new.source_kind <> 'user_approved' then
    return new;
  end if;

  select m.sender_type, tc.character_id
    into source_sender, source_character
  from public.conversation_messages m
  left join public.conversation_thread_characters tc
    on tc.id = m.thread_character_id and tc.thread_id = m.thread_id
  where m.id = new.source_message_id
    and m.subject_id = new.subject_id;

  if source_sender = 'character'
     and source_character is distinct from new.created_by_character_id then
    raise exception using
      errcode = '23514',
      constraint = 'ct_memory_item_source_character',
      message = 'memory creator character must match its source character message';
  end if;

  return new;
end;
$$;

create constraint trigger ct_memory_item_source_character
  after insert or update of source_kind, source_message_id, created_by_character_id, subject_id
  on public.memory_items
  deferrable initially deferred
  for each row execute function public.ct_validate_memory_item_source_character();

create or replace function public.ct_validate_reading_session_authority()
returns trigger
language plpgsql
as $$
declare
  runtime_availability text;
  runtime_capability_version text;
  source_kind text;
  target_kind text;
begin
  select availability, capability_version
    into runtime_availability, runtime_capability_version
  from public.saju_domain_runtime
  where saju_domain = new.saju_domain;

  if runtime_availability is null or runtime_availability = 'unavailable' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_session_domain_available',
      message = 'reading session domain is not operationally available';
  end if;

  if runtime_capability_version is distinct from new.domain_capability_version then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_session_domain_capability_pin',
      message = 'reading session capability version must match runtime authority at session start';
  end if;

  select bp.profile_kind into source_kind
  from public.birth_profile_revisions br
  join public.birth_profiles bp on bp.id = br.birth_profile_id and bp.subject_id = br.subject_id
  where br.id = new.source_birth_revision_id and br.subject_id = new.subject_id;

  if new.target_birth_revision_id is not null then
    select bp.profile_kind into target_kind
    from public.birth_profile_revisions br
    join public.birth_profiles bp on bp.id = br.birth_profile_id and bp.subject_id = br.subject_id
    where br.id = new.target_birth_revision_id and br.subject_id = new.subject_id;
  end if;

  if source_kind is distinct from 'self' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_session_profile_cardinality',
      message = 'reading source birth revision must belong to the self profile';
  end if;

  if new.saju_domain = 'compatibility' then
    if new.target_birth_revision_id is null or target_kind is distinct from 'target' then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_session_profile_cardinality',
        message = 'compatibility reading requires one target birth revision';
    end if;
  elsif new.target_birth_revision_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_session_profile_cardinality',
      message = 'non-compatibility reading must not pin a target birth revision';
  end if;

  return new;
end;
$$;

create constraint trigger ct_reading_session_authority
  after insert or update of subject_id, saju_domain, domain_capability_version,
    source_birth_revision_id, target_birth_revision_id
  on public.reading_sessions
  deferrable initially deferred
  for each row execute function public.ct_validate_reading_session_authority();

create or replace function public.tr_reading_session_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.subject_id, old.saju_domain, old.domain_capability_version, old.source_birth_revision_id, old.target_birth_revision_id)
     is distinct from
     row(new.subject_id, new.saju_domain, new.domain_capability_version, new.source_birth_revision_id, new.target_birth_revision_id) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_reading_session_identity_immutable',
      message = 'reading session identity and pinned birth revisions are immutable';
  end if;
  return new;
end;
$$;

create trigger tr_reading_session_identity_immutable
  before update on public.reading_sessions
  for each row execute function public.tr_reading_session_identity_immutable();

create or replace function public.ct_validate_reading_request_authority()
returns trigger
language plpgsql
as $$
declare
  source_thread_id uuid;
  participant_thread_id uuid;
  participant_character_id text;
  participant_bundle_id uuid;
  participant_joined_at timestamptz;
  participant_left_at timestamptz;
  source_turn_created_at timestamptz;
  capability_can_initiate boolean;
  session_current_reading_id uuid;
  parent_attempt_no integer;
begin
  if new.requested_character_id is not null then
    select can_initiate into capability_can_initiate
    from public.character_capabilities
    where content_bundle_id = new.requested_character_content_bundle_id
      and character_id = new.requested_character_id
      and saju_domain = new.saju_domain;

    if capability_can_initiate is distinct from true then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_character_capability',
        message = 'requested character cannot initiate this Saju domain';
    end if;
  end if;

  if new.source_turn_id is not null and new.requested_character_id is not null
     and new.requested_thread_character_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_character_participation',
      message = 'character-triggered chat reading requires exact thread participation';
  end if;

  if new.requested_thread_character_id is not null then
    select ct.thread_id, ct.character_id, ct.content_bundle_id, ct.joined_at, ct.left_at
      into participant_thread_id, participant_character_id, participant_bundle_id,
           participant_joined_at, participant_left_at
    from public.conversation_thread_characters ct
    where ct.id = new.requested_thread_character_id;

    select thread_id, created_at into source_thread_id, source_turn_created_at
    from public.chat_turns
    where id = new.source_turn_id and subject_id = new.subject_id;

    if participant_thread_id is distinct from source_thread_id
       or participant_character_id is distinct from new.requested_character_id
       or participant_bundle_id is distinct from new.requested_character_content_bundle_id
       or participant_joined_at > source_turn_created_at
       or (participant_left_at is not null and participant_left_at < source_turn_created_at) then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_character_participation',
        message = 'requested character participation does not match source turn authority';
    end if;
  end if;

  select current_reading_id into session_current_reading_id
  from public.reading_sessions where id = new.reading_session_id and subject_id = new.subject_id;

  if new.parent_reading_id is null then
    if new.attempt_no <> 1 then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_clarification_chain',
        message = 'first logical reading attempt must have attempt_no 1';
    end if;
  else
    select attempt_no into parent_attempt_no
    from public.readings
    where id = new.parent_reading_id
      and reading_session_id = new.reading_session_id
      and subject_id = new.subject_id;

    if parent_attempt_no is null
       or parent_attempt_no >= new.attempt_no
       or session_current_reading_id is distinct from new.parent_reading_id then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_clarification_chain',
        message = 'clarification attempt must extend the current prior reading without branching';
    end if;
  end if;

  return new;
end;
$$;

create constraint trigger ct_reading_request_authority
  after insert on public.readings
  deferrable initially deferred
  for each row execute function public.ct_validate_reading_request_authority();

create or replace function public.tr_reading_request_identity_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(old.reading_session_id, old.subject_id, old.saju_domain, old.attempt_no,
         old.parent_reading_id, old.source_turn_id, old.requested_thread_character_id,
         old.requested_character_id, old.requested_character_content_bundle_id,
         old.request_idempotency_key, old.request_hash, old.request_contract_version,
         old.request_snapshot_jsonb)
     is distinct from
     row(new.reading_session_id, new.subject_id, new.saju_domain, new.attempt_no,
         new.parent_reading_id, new.source_turn_id, new.requested_thread_character_id,
         new.requested_character_id, new.requested_character_content_bundle_id,
         new.request_idempotency_key, new.request_hash, new.request_contract_version,
         new.request_snapshot_jsonb) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_reading_request_identity_immutable',
      message = 'logical reading request identity is immutable';
  end if;
  return new;
end;
$$;

create trigger tr_reading_request_identity_immutable
  before update on public.readings
  for each row execute function public.tr_reading_request_identity_immutable();

create or replace function public.tr_birth_revision_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_birth_revision_immutable',
    message = 'birth profile revisions are append-only';
end;
$$;

create trigger tr_birth_revision_immutable
  before update or delete on public.birth_profile_revisions
  for each row execute function public.tr_birth_revision_immutable();

create or replace function public.tr_terminal_reading_execution_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' or old.state <> 'running' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_terminal_reading_execution_immutable',
      message = 'terminal reading execution attempts are immutable';
  end if;
  return new;
end;
$$;

create trigger tr_terminal_reading_execution_immutable
  before update or delete on public.reading_execution_attempts
  for each row execute function public.tr_terminal_reading_execution_immutable();

create or replace function public.ct_validate_reading_finalize()
returns trigger
language plpgsql
as $$
declare
  rid uuid;
  reading_status text;
  committed_attempt uuid;
  session_id uuid;
  owner_id uuid;
  ref_count bigint;
  ref_attempt uuid;
  ref_engine_key text;
  ref_engine_version text;
  ref_source_hash text;
  ref_target_hash text;
  exec_state text;
  exec_engine_key text;
  exec_engine_version text;
  expected_source_hash text;
  expected_target_hash text;
begin
  if tg_table_name = 'reading_refs' then
    rid := case when tg_op = 'DELETE' then old.reading_id else new.reading_id end;
  elsif tg_table_name = 'reading_execution_attempts' then
    rid := case when tg_op = 'DELETE' then old.reading_id else new.reading_id end;
  else
    rid := case when tg_op = 'DELETE' then old.id else new.id end;
  end if;

  select execution_status, committed_execution_attempt_id, reading_session_id, subject_id
    into reading_status, committed_attempt, session_id, owner_id
  from public.readings where id = rid;

  if reading_status is null then
    return null;
  end if;

  select count(*), max(execution_attempt_id), max(saju_engine_key), max(saju_engine_version),
         max(source_birth_input_hash), max(target_birth_input_hash)
    into ref_count, ref_attempt, ref_engine_key, ref_engine_version,
         ref_source_hash, ref_target_hash
  from public.reading_refs where reading_id = rid;

  if reading_status = 'succeeded' then
    if ref_count <> 1 or committed_attempt is null or ref_attempt is distinct from committed_attempt then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_finalize',
        message = 'succeeded reading requires exactly one ref for the committed execution attempt';
    end if;

    select state, saju_engine_key, resolved_engine_version
      into exec_state, exec_engine_key, exec_engine_version
    from public.reading_execution_attempts
    where id = committed_attempt and reading_id = rid and subject_id = owner_id;

    if exec_state is distinct from 'succeeded'
       or exec_engine_key is distinct from ref_engine_key
       or exec_engine_version is distinct from ref_engine_version then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_finalize',
        message = 'reading ref engine provenance must equal the successful committed execution attempt';
    end if;

    select src.input_hash, tgt.input_hash
      into expected_source_hash, expected_target_hash
    from public.reading_sessions rs
    join public.birth_profile_revisions src on src.id = rs.source_birth_revision_id and src.subject_id = rs.subject_id
    left join public.birth_profile_revisions tgt on tgt.id = rs.target_birth_revision_id and tgt.subject_id = rs.subject_id
    where rs.id = session_id and rs.subject_id = owner_id;

    if ref_source_hash is distinct from expected_source_hash
       or ref_target_hash is distinct from expected_target_hash then
      raise exception using
        errcode = '23514',
        constraint = 'ct_reading_finalize',
        message = 'reading ref birth input hashes must equal the revisions pinned by the session';
    end if;
  elsif ref_count <> 0 then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_finalize',
      message = 'non-succeeded reading cannot own a ProductReadingResponse ref';
  end if;

  return null;
end;
$$;

create constraint trigger ct_reading_finalize_from_reading
  after insert or update of execution_status, committed_execution_attempt_id
  on public.readings
  deferrable initially deferred
  for each row execute function public.ct_validate_reading_finalize();

create constraint trigger ct_reading_finalize_from_ref
  after insert or update or delete on public.reading_refs
  deferrable initially deferred
  for each row execute function public.ct_validate_reading_finalize();

create constraint trigger ct_reading_finalize_from_execution
  after update of state, saju_engine_key, resolved_engine_version
  on public.reading_execution_attempts
  deferrable initially deferred
  for each row execute function public.ct_validate_reading_finalize();

create or replace function public.tr_reading_ref_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_reading_ref_immutable',
    message = 'reading refs are immutable ProductReadingResponse provenance';
end;
$$;

create trigger tr_reading_ref_immutable
  before update or delete on public.reading_refs
  for each row execute function public.tr_reading_ref_immutable();

create or replace function public.ct_validate_grounding_source()
returns trigger
language plpgsql
as $$
declare
  reading_status text;
  ref_count bigint;
begin
  select execution_status into reading_status
  from public.readings where id = new.reading_id and subject_id = new.subject_id;
  select count(*) into ref_count
  from public.reading_refs where reading_id = new.reading_id and subject_id = new.subject_id;

  if reading_status is distinct from 'succeeded' or ref_count <> 1 then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reading_grounding_source_valid',
      message = 'grounding requires a succeeded reading with exactly one immutable response ref';
  end if;
  return new;
end;
$$;

create constraint trigger ct_reading_grounding_source_valid
  after insert on public.reading_groundings
  deferrable initially deferred
  for each row execute function public.ct_validate_grounding_source();

create or replace function public.tr_reading_grounding_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_reading_grounding_immutable',
    message = 'reading groundings are immutable projections';
end;
$$;

create trigger tr_reading_grounding_immutable
  before update or delete on public.reading_groundings
  for each row execute function public.tr_reading_grounding_immutable();
