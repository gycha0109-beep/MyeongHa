-- Account deletion start transaction authority.
--
-- Implements SERVER_COMMAND_TRANSACTION_SPEC §20 first transaction only:
-- active member -> deletion_pending, account deletion job running, share/device revocation,
-- scheduled notification cancellation, capability-entry blocking, and outbox atomically.
--
-- Destructive erase/finalization, auth mapping removal, retention duration, and standalone
-- Birth/Target deletion remain outside this migration (P0-PR-01 / SRC-06).
-- P0-AUTH-01 remains unresolved: SECURITY INVOKER + PUBLIC EXECUTE revoked.

create or replace function public.ct_require_active_subject_for_new_capability()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_status text;
begin
  select s.status
    into v_subject_status
  from public.subjects s
  where s.id = new.subject_id;

  if v_subject_status is distinct from 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_new_capability_requires_active_subject',
      message = 'new AI/Saju capability work requires an active subject';
  end if;

  return new;
end;
$$;

-- These guards block new logical/transport work after account deletion enters
-- deletion_pending without rewriting or deleting already-persisted provenance.
create constraint trigger ct_chat_turn_subject_active
  after insert on public.chat_turns
  deferrable initially immediate
  for each row execute function public.ct_require_active_subject_for_new_capability();

create constraint trigger ct_chat_turn_attempt_subject_active
  after insert on public.chat_turn_attempts
  deferrable initially immediate
  for each row execute function public.ct_require_active_subject_for_new_capability();

create constraint trigger ct_reading_session_subject_active
  after insert on public.reading_sessions
  deferrable initially immediate
  for each row execute function public.ct_require_active_subject_for_new_capability();

create constraint trigger ct_reading_subject_active
  after insert on public.readings
  deferrable initially immediate
  for each row execute function public.ct_require_active_subject_for_new_capability();

create constraint trigger ct_reading_execution_attempt_subject_active
  after insert on public.reading_execution_attempts
  deferrable initially immediate
  for each row execute function public.ct_require_active_subject_for_new_capability();

create or replace function public.cmd_start_account_deletion_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_request_dedupe_key text,
  p_outbox_event_id uuid
)
returns table (
  deletion_job_id uuid,
  deletion_job_status text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_kind text;
  v_subject_status text;
  v_existing_job_id uuid;
  v_existing_scope text;
  v_existing_key text;
  v_existing_status text;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_deletion_job_id is null or p_outbox_event_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_account_delete_ids_required',
      message = 'subject, deletion job, and outbox ids are required';
  end if;

  if p_request_dedupe_key is null or btrim(p_request_dedupe_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_account_delete_dedupe_required',
      message = 'account deletion request dedupe key is required';
  end if;

  -- Lifecycle command lock order begins at the canonical subject.
  select s.kind, s.status
    into v_subject_kind, v_subject_status
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_account_delete_subject_not_found',
      message = 'account subject was not found';
  end if;

  -- Exact request replay is authoritative even after the subject has already moved to
  -- deletion_pending. Account scope is semantically fixed, so request_dedupe_key is
  -- sufficient for this endpoint-specific command; no generic deletion request shape is invented.
  select dj.id, dj.scope, dj.request_dedupe_key, dj.status
    into v_existing_job_id, v_existing_scope, v_existing_key, v_existing_status
  from public.data_deletion_jobs dj
  where dj.subject_id = p_subject_id
    and dj.request_dedupe_key = p_request_dedupe_key;

  if found then
    if v_existing_scope is distinct from 'account' then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_account_delete_idempotency_conflict',
        message = 'deletion request dedupe key already represents a different deletion scope';
    end if;

    return query select v_existing_job_id, v_existing_status, true;
    return;
  end if;

  -- A caller-proposed job id cannot be silently rebound to another command.
  select dj.id, dj.scope, dj.request_dedupe_key, dj.status
    into v_existing_job_id, v_existing_scope, v_existing_key, v_existing_status
  from public.data_deletion_jobs dj
  where dj.id = p_deletion_job_id;

  if found then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_account_delete_job_replay_conflict',
      message = 'deletion job id already represents another request';
  end if;

  if v_subject_kind is distinct from 'member' or v_subject_status is distinct from 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_account_delete_subject_ineligible',
      message = 'account deletion start requires an active member subject';
  end if;

  insert into public.data_deletion_jobs(
    id,
    subject_id,
    scope,
    target_resource_type,
    target_resource_id,
    request_dedupe_key,
    status,
    retention_exceptions_jsonb,
    requested_at,
    started_at,
    completed_at,
    error_code
  ) values (
    p_deletion_job_id,
    p_subject_id,
    'account',
    null,
    null,
    p_request_dedupe_key,
    'running',
    null,
    v_now,
    v_now,
    null,
    null
  );

  update public.subjects s
  set status = 'deletion_pending',
      updated_at = v_now
  where s.id = p_subject_id;

  update public.share_artifacts sa
  set status = 'revoked',
      revoked_at = coalesce(sa.revoked_at, v_now)
  where sa.subject_id = p_subject_id
    and sa.status = 'active';

  -- Revocation is the immediate authorization boundary. Encrypted credential material is
  -- not physically purged here; destructive retention handling belongs to later phases.
  update public.device_installations di
  set revoked_at = v_now
  where di.subject_id = p_subject_id
    and di.revoked_at is null;

  -- Only future/scheduled notification authority is cancelled here. Read/expired items and
  -- already-running provider attempt provenance are not rewritten.
  update public.notifications n
  set status = 'cancelled'
  where n.subject_id = p_subject_id
    and n.status in ('queued', 'ready');

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
    'data_deletion_job',
    p_deletion_job_id::text,
    'ACCOUNT_DELETION_STARTED',
    'v1',
    'account-delete-start-v1',
    jsonb_build_object(
      'deletionJobId', p_deletion_job_id,
      'subjectId', p_subject_id,
      'scope', 'account'
    ),
    'pending',
    0,
    v_now,
    v_now
  );

  return query select p_deletion_job_id, 'running'::text, false;
end;
$$;

revoke all on function public.cmd_start_account_deletion_v1(uuid, uuid, text, uuid) from public;
