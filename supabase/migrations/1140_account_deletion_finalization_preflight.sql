-- Account deletion finalization read-only preflight.
--
-- P0-PR-01 is DECIDED, but destructive runtime remains unauthorized until the
-- FK-safe finalizer and hosted Auth cleanup boundary are implemented and proven.
--
-- This gate runs before the DB destructive finalizer. The finalizer must first
-- transition the Subject to deleted while preserving auth_user_id for retryable
-- hosted Auth cleanup; only then may hosted Auth deletion ON DELETE SET NULL run.
--
-- This function exposes booleans/counts only. It never returns auth.users.id,
-- outbox payloads, aggregate ids, or user content.
--
-- Current outbox producer inventory is guarded by
-- scripts/verify-account-deletion-finalization-preflight.mjs. If a new producer
-- or aggregate type appears, that verifier fails closed until this association
-- query is reviewed.

create or replace function public.internal_account_deletion_finalization_preflight_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_lock_owner text
)
returns table (
  subject_found boolean,
  subject_member boolean,
  subject_deletion_pending boolean,
  deletion_job_found boolean,
  deletion_job_account_running boolean,
  account_start_outbox_ready boolean,
  auth_mapping_present boolean,
  linked_outbox_count bigint,
  blocking_outbox_count bigint,
  db_preconditions_met boolean
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  with target as (
    select
      true as subject_found,
      (s.kind = 'member') as subject_member,
      (s.status = 'deletion_pending') as subject_deletion_pending,
      (dj.id is not null) as deletion_job_found,
      (dj.scope = 'account' and dj.status = 'running') as deletion_job_account_running,
      (s.auth_user_id is not null) as auth_mapping_present
    from public.subjects s
    left join public.data_deletion_jobs dj
      on dj.id = p_deletion_job_id
     and dj.subject_id = s.id
    where s.id = p_subject_id
  ),
  linked_outbox as (
    select
      oe.id,
      oe.aggregate_type,
      oe.aggregate_id,
      oe.event_type,
      oe.status,
      oe.lock_owner,
      oe.lease_expires_at
    from public.outbox_events oe
    where
      oe.payload_jsonb ->> 'subjectId' = p_subject_id::text
      or (
        oe.aggregate_type = 'chat_turn'
        and exists (
          select 1
          from public.chat_turns ct
          where ct.id::text = oe.aggregate_id
            and ct.subject_id = p_subject_id
        )
      )
      or (
        oe.aggregate_type = 'reading'
        and exists (
          select 1
          from public.readings r
          where r.id::text = oe.aggregate_id
            and r.subject_id = p_subject_id
        )
      )
      or (
        oe.aggregate_type = 'data_deletion_job'
        and exists (
          select 1
          from public.data_deletion_jobs dj
          where dj.id::text = oe.aggregate_id
            and dj.subject_id = p_subject_id
        )
      )
      or (
        oe.aggregate_type = 'entitlement'
        and exists (
          select 1
          from public.entitlements e
          where e.id::text = oe.aggregate_id
            and e.subject_id = p_subject_id
        )
      )
  ),
  rollup as (
    select
      count(*)::bigint as linked_outbox_count,
      count(*) filter (
        where lo.status <> 'processed'
          and not (
            lo.aggregate_type = 'data_deletion_job'
            and lo.aggregate_id = p_deletion_job_id::text
            and lo.event_type = 'ACCOUNT_DELETION_STARTED'
            and lo.status = 'processing'
            and lo.lock_owner = btrim(p_lock_owner)
            and lo.lease_expires_at > clock_timestamp()
          )
      )::bigint as blocking_outbox_count,
      count(*) filter (
        where lo.aggregate_type = 'data_deletion_job'
          and lo.aggregate_id = p_deletion_job_id::text
          and lo.event_type = 'ACCOUNT_DELETION_STARTED'
      )::bigint as account_start_outbox_count,
      bool_or(
        lo.aggregate_type = 'data_deletion_job'
        and lo.aggregate_id = p_deletion_job_id::text
        and lo.event_type = 'ACCOUNT_DELETION_STARTED'
        and lo.status = 'processing'
        and lo.lock_owner = btrim(p_lock_owner)
        and lo.lease_expires_at > clock_timestamp()
      ) as account_start_outbox_ready
    from linked_outbox lo
  )
  select
    coalesce(t.subject_found, false),
    coalesce(t.subject_member, false),
    coalesce(t.subject_deletion_pending, false),
    coalesce(t.deletion_job_found, false),
    coalesce(t.deletion_job_account_running, false),
    coalesce(r.account_start_outbox_count = 1 and r.account_start_outbox_ready, false),
    coalesce(t.auth_mapping_present, false),
    r.linked_outbox_count,
    r.blocking_outbox_count,
    coalesce(
      t.subject_member
      and t.subject_deletion_pending
      and t.deletion_job_found
      and t.deletion_job_account_running
      and t.auth_mapping_present
      and nullif(btrim(p_lock_owner), '') is not null
      and r.account_start_outbox_count = 1
      and r.account_start_outbox_ready
      and r.blocking_outbox_count = 0,
      false
    )
  from rollup r
  left join target t on true;
$$;

revoke all on function public.internal_account_deletion_finalization_preflight_v1(uuid, uuid, text) from public;
