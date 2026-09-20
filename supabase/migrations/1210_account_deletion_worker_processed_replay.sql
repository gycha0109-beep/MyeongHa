-- Account-deletion worker processed-event replay convergence.
--
-- The generic outbox claim command intentionally rejects processed rows. The concrete
-- account-deletion runtime, however, must be able to recover from a lost response after
-- completion ACK. This event-specific wrapper therefore permits only a read-only replay
-- of an already-processed ACCOUNT_DELETION_STARTED event when the exact same lock owner
-- completed it. No generic retry/backoff/dead-letter semantics are introduced.

create or replace function public.internal_claim_account_deletion_outbox_v1(
  p_outbox_event_id uuid,
  p_lock_owner text,
  p_lease_expires_at timestamptz
)
returns table (
  outbox_event_id uuid,
  subject_id uuid,
  deletion_job_id uuid,
  reclaimed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $account_deletion_claim$
declare
  v_event public.outbox_events%rowtype;
  v_subject_id uuid;
  v_deletion_job_id uuid;
  v_payload_subject_text text;
  v_payload_job_text text;
  v_owner text;
  v_reclaimed boolean := false;
begin
  if p_outbox_event_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_worker_claim_event_id_required',
      message = 'account deletion worker claim requires an outbox event id';
  end if;
  if p_lock_owner is null or btrim(p_lock_owner) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_worker_claim_owner_required',
      message = 'account deletion worker claim requires a lock owner';
  end if;
  v_owner := btrim(p_lock_owner);

  select oe.*
    into v_event
  from public.outbox_events oe
  where oe.id = p_outbox_event_id
  for update;

  if found and v_event.status = 'processed' then
    if v_event.processed_at is null
       or v_event.lock_owner is distinct from v_owner then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_worker_claim_processed_replay_owner',
        message = 'processed account deletion event replay requires the completing worker owner';
    end if;
    -- Read-only replay: do not rewrite lock/lease/processed timestamps.
    v_reclaimed := false;
  else
    select c.reclaimed
      into v_reclaimed
    from public.cmd_claim_outbox_event_v1(
      p_outbox_event_id,
      v_owner,
      p_lease_expires_at
    ) c;

    select oe.*
      into v_event
    from public.outbox_events oe
    where oe.id = p_outbox_event_id;
  end if;

  if v_event.aggregate_type is distinct from 'data_deletion_job'
     or v_event.event_type is distinct from 'ACCOUNT_DELETION_STARTED'
     or v_event.event_schema_version is distinct from 'v1'
     or v_event.dedupe_key is distinct from 'account-delete-start-v1'
     or pg_catalog.jsonb_typeof(v_event.payload_jsonb) is distinct from 'object'
     or v_event.payload_jsonb ->> 'scope' is distinct from 'account' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_worker_claim_event_contract_mismatch',
      message = 'worker claim requires the exact ACCOUNT_DELETION_STARTED event contract';
  end if;

  v_payload_subject_text := v_event.payload_jsonb ->> 'subjectId';
  v_payload_job_text := v_event.payload_jsonb ->> 'deletionJobId';

  if v_payload_subject_text is null
     or v_payload_job_text is null
     or btrim(v_payload_subject_text) = ''
     or btrim(v_payload_job_text) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_worker_claim_payload_identity_required',
      message = 'account deletion outbox payload requires subjectId and deletionJobId';
  end if;

  begin
    v_subject_id := v_payload_subject_text::uuid;
    v_deletion_job_id := v_payload_job_text::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_worker_claim_payload_identity_invalid',
        message = 'account deletion outbox payload identities must be UUIDs';
  end;

  if v_event.aggregate_id is distinct from v_deletion_job_id::text then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_worker_claim_aggregate_mismatch',
      message = 'account deletion outbox aggregate id must match deletionJobId';
  end if;

  return query
  select
    v_event.id,
    v_subject_id,
    v_deletion_job_id,
    v_reclaimed;
end;
$account_deletion_claim$;

revoke all on function public.internal_claim_account_deletion_outbox_v1(uuid, text, timestamptz) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN (
      'anon',
      'authenticated',
      'service_role',
      'myeongha_api_executor',
      'myeongha_runtime',
      'myeongha_worker_runtime'
    )
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_claim_account_deletion_outbox_v1(uuid,text,timestamptz) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.internal_claim_account_deletion_outbox_v1(uuid, text, timestamptz)
  to myeongha_system_executor;
