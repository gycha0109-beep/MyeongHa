-- Crash-safe account deletion worker resume/completion authority.
--
-- This migration closes only the persisted phase decision and successful completion ACK
-- after the hosted Supabase Auth user has been deleted.
--
-- It intentionally does NOT authorize a runtime worker identity and does NOT invent any
-- outbox failure/retry/backoff/dead-letter policy (SRC-30 remains open).
--
-- Persisted worker phases:
--   deletion_pending + no DB marker + Auth mapping present
--     -> db_finalization_required
--   deleted + DB marker + Auth mapping present
--     -> auth_deletion_required
--   deleted + DB marker + Auth mapping absent
--     -> completion_ack_required
--   completed job + processed ACCOUNT_DELETION_STARTED
--     -> completed
--
-- The resume query exposes auth_user_id only through this internal, closed function so a
-- server-side worker can recover the durable hosted-Auth target after a crash.
--
-- The completion command atomically marks the deletion job completed and completes the
-- already-claimed ACCOUNT_DELETION_STARTED outbox row. Failure of either mutation rolls
-- the whole transaction back.

create or replace function public.internal_account_deletion_resume_state_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_lock_owner text
)
returns table (
  deletion_job_id uuid,
  subject_id uuid,
  phase text,
  auth_user_id uuid,
  db_finalized_at timestamptz,
  completed_at timestamptz,
  outbox_event_id uuid,
  outbox_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $account_deletion_resume$
declare
  v_owner text;
  v_subject_kind text;
  v_subject_status text;
  v_auth_user_id uuid;
  v_job_scope text;
  v_job_status text;
  v_policy_version text;
  v_db_finalized_at timestamptz;
  v_completed_at timestamptz;
  v_outbox_id uuid;
  v_outbox_status text;
  v_outbox_owner text;
  v_outbox_lease_expires_at timestamptz;
  v_outbox_processed_at timestamptz;
  v_phase text;
begin
  if p_subject_id is null or p_deletion_job_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_resume_ids_required',
      message = 'account deletion resume requires subject and deletion job ids';
  end if;

  if p_lock_owner is null or btrim(p_lock_owner) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_resume_owner_required',
      message = 'account deletion resume requires a worker lock owner';
  end if;
  v_owner := btrim(p_lock_owner);

  select s.kind, s.status, s.auth_user_id
    into v_subject_kind, v_subject_status, v_auth_user_id
  from public.subjects s
  where s.id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'account_deletion_resume_subject_not_found',
      message = 'account deletion resume Subject was not found';
  end if;

  select
    dj.scope,
    dj.status,
    dj.finalization_policy_version,
    dj.db_finalized_at,
    dj.completed_at
    into
      v_job_scope,
      v_job_status,
      v_policy_version,
      v_db_finalized_at,
      v_completed_at
  from public.data_deletion_jobs dj
  where dj.id = p_deletion_job_id
    and dj.subject_id = p_subject_id;

  if not found or v_job_scope is distinct from 'account' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_resume_job_mismatch',
      message = 'account deletion resume requires the exact account deletion job';
  end if;

  select
    oe.id,
    oe.status,
    oe.lock_owner,
    oe.lease_expires_at,
    oe.processed_at
    into
      v_outbox_id,
      v_outbox_status,
      v_outbox_owner,
      v_outbox_lease_expires_at,
      v_outbox_processed_at
  from public.outbox_events oe
  where oe.aggregate_type = 'data_deletion_job'
    and oe.aggregate_id = p_deletion_job_id::text
    and oe.event_type = 'ACCOUNT_DELETION_STARTED'
    and oe.event_schema_version = 'v1'
    and oe.dedupe_key = 'account-delete-start-v1';

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_resume_outbox_missing',
      message = 'account deletion resume requires the exact ACCOUNT_DELETION_STARTED outbox event';
  end if;

  if v_job_status = 'completed' then
    if v_subject_kind is distinct from 'member'
       or v_subject_status is distinct from 'deleted'
       or v_auth_user_id is not null
       or v_policy_version is distinct from 'account-deletion-finalization-v1'
       or v_db_finalized_at is null
       or v_completed_at is null
       or v_outbox_status is distinct from 'processed'
       or v_outbox_processed_at is null
       or v_outbox_owner is distinct from v_owner then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_resume_completed_state_invalid',
        message = 'completed account deletion state is inconsistent';
    end if;
    v_phase := 'completed';
  elsif v_job_status = 'running' then
    if v_outbox_status is distinct from 'processing'
       or v_outbox_owner is distinct from v_owner
       or v_outbox_lease_expires_at is null
       or v_outbox_lease_expires_at <= clock_timestamp() then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_resume_active_lease_required',
        message = 'account deletion resume requires the current unexpired worker lease';
    end if;

    if v_subject_kind is distinct from 'member' then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_resume_member_required',
        message = 'account deletion resume requires a member Subject';
    end if;

    if v_subject_status = 'deletion_pending'
       and v_auth_user_id is not null
       and v_policy_version is null
       and v_db_finalized_at is null
       and v_completed_at is null then
      v_phase := 'db_finalization_required';
    elsif v_subject_status = 'deleted'
       and v_policy_version = 'account-deletion-finalization-v1'
       and v_db_finalized_at is not null
       and v_completed_at is null
       and v_auth_user_id is not null then
      v_phase := 'auth_deletion_required';
    elsif v_subject_status = 'deleted'
       and v_policy_version = 'account-deletion-finalization-v1'
       and v_db_finalized_at is not null
       and v_completed_at is null
       and v_auth_user_id is null then
      v_phase := 'completion_ack_required';
    else
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_resume_state_invalid',
        message = 'account deletion persisted phase is inconsistent';
    end if;
  else
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_resume_job_state_invalid',
      message = 'account deletion resume requires a running or completed account job';
  end if;

  return query
  select
    p_deletion_job_id,
    p_subject_id,
    v_phase,
    v_auth_user_id,
    v_db_finalized_at,
    v_completed_at,
    v_outbox_id,
    v_outbox_status;
end;
$account_deletion_resume$;

revoke all on function public.internal_account_deletion_resume_state_v1(uuid, uuid, text) from public;

create or replace function public.internal_complete_account_deletion_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_lock_owner text
)
returns table (
  completed boolean,
  replayed boolean,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $account_deletion_complete$
declare
  v_now timestamptz := clock_timestamp();
  v_owner text;
  v_subject_kind text;
  v_subject_status text;
  v_auth_user_id uuid;
  v_job_scope text;
  v_job_status text;
  v_policy_version text;
  v_db_finalized_at timestamptz;
  v_completed_at timestamptz;
  v_outbox_id uuid;
  v_outbox_status text;
  v_outbox_owner text;
  v_outbox_lease_expires_at timestamptz;
  v_outbox_processed_at timestamptz;
  v_outbox_replayed boolean;
begin
  if p_subject_id is null or p_deletion_job_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_complete_ids_required',
      message = 'account deletion completion requires subject and deletion job ids';
  end if;

  if p_lock_owner is null or btrim(p_lock_owner) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_complete_owner_required',
      message = 'account deletion completion requires a worker lock owner';
  end if;
  v_owner := btrim(p_lock_owner);

  -- Preserve the same lock order as the DB finalizer: Subject -> deletion job -> outbox.
  select s.kind, s.status, s.auth_user_id
    into v_subject_kind, v_subject_status, v_auth_user_id
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'account_deletion_complete_subject_not_found',
      message = 'account deletion completion Subject was not found';
  end if;

  select
    dj.scope,
    dj.status,
    dj.finalization_policy_version,
    dj.db_finalized_at,
    dj.completed_at
    into
      v_job_scope,
      v_job_status,
      v_policy_version,
      v_db_finalized_at,
      v_completed_at
  from public.data_deletion_jobs dj
  where dj.id = p_deletion_job_id
    and dj.subject_id = p_subject_id
  for update;

  if not found or v_job_scope is distinct from 'account' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_complete_job_mismatch',
      message = 'account deletion completion requires the exact account deletion job';
  end if;

  select
    oe.id,
    oe.status,
    oe.lock_owner,
    oe.lease_expires_at,
    oe.processed_at
    into
      v_outbox_id,
      v_outbox_status,
      v_outbox_owner,
      v_outbox_lease_expires_at,
      v_outbox_processed_at
  from public.outbox_events oe
  where oe.aggregate_type = 'data_deletion_job'
    and oe.aggregate_id = p_deletion_job_id::text
    and oe.event_type = 'ACCOUNT_DELETION_STARTED'
    and oe.event_schema_version = 'v1'
    and oe.dedupe_key = 'account-delete-start-v1'
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_complete_outbox_missing',
      message = 'account deletion completion requires the exact ACCOUNT_DELETION_STARTED outbox event';
  end if;

  if v_subject_kind is distinct from 'member'
     or v_subject_status is distinct from 'deleted'
     or v_auth_user_id is not null
     or v_policy_version is distinct from 'account-deletion-finalization-v1'
     or v_db_finalized_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_complete_post_auth_state_required',
      message = 'account deletion completion requires proven DB finalization and completed hosted Auth cleanup';
  end if;

  if v_job_status = 'completed' then
    if v_completed_at is null
       or v_outbox_status is distinct from 'processed'
       or v_outbox_processed_at is null
       or v_outbox_owner is distinct from v_owner then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_complete_replay_state_invalid',
        message = 'account deletion completion replay state is inconsistent';
    end if;

    return query select true, true, v_completed_at;
    return;
  end if;

  if v_job_status is distinct from 'running'
     or v_completed_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_complete_job_state_invalid',
      message = 'account deletion completion requires the running finalized account job';
  end if;

  if v_outbox_status is distinct from 'processing'
     or v_outbox_owner is distinct from v_owner
     or v_outbox_lease_expires_at is null
     or v_outbox_lease_expires_at <= v_now then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_complete_active_lease_required',
      message = 'account deletion completion requires the current unexpired worker lease';
  end if;

  select c.replayed
    into v_outbox_replayed
  from public.cmd_complete_outbox_event_v1(v_outbox_id, v_owner) c;

  if v_outbox_replayed is distinct from false then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_complete_outbox_unexpected_replay',
      message = 'running account deletion cannot complete from an already-processed outbox event';
  end if;

  update public.data_deletion_jobs dj
  set status = 'completed',
      completed_at = v_now,
      error_code = null
  where dj.id = p_deletion_job_id
    and dj.subject_id = p_subject_id;

  return query select true, false, v_now;
end;
$account_deletion_complete$;

revoke all on function public.internal_complete_account_deletion_v1(uuid, uuid, text) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_account_deletion_resume_state_v1(uuid,uuid,text) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_complete_account_deletion_v1(uuid,uuid,text) from %I',
      v_role
    );
  END LOOP;
END
$$;
