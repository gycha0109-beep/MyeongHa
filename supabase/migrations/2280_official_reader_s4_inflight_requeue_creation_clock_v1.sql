-- DB Owner #2301 / S4: complete the creation-clock correction from 2270.
-- The enqueue trigger rotates ID + created_at when a COMPLETED job receives
-- a later event. A different event may instead arrive while the FIRST job
-- is still claimed/db_erased. The existing finalizers rotate ID in that case,
-- but previously carried forward the old creation clock. That made the
-- new Privacy 24-hour deletion obligation appear older than its event.
--
-- Reset created_at ONLY when requeue_after_completion is true; never hide
-- the age of the original pending/claimed/db_erased job. Keep the existing
-- S1/lease/body-ID/last-right checks and system-only EXECUTE ACL unchanged.
-- No new data class, no public permission, no Production DB deploy.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_finish_official_reader_paid_answer_purge_v1(
  p_job_id uuid,
  p_worker text,
  p_external_fence_id text,
  p_original_body_ids uuid[]
)
returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_purge_finish_exact$
declare j public.official_reader_paid_answer_purge_jobs_v1%rowtype;
begin
  if p_job_id is null or p_worker is null
     or pg_catalog.length(p_worker) not between 1 and 256
     or p_external_fence_id is null
     or pg_catalog.length(p_external_fence_id) not between 1 and 256
     or p_original_body_ids is null
     or pg_catalog.array_ndims(p_original_body_ids) is distinct from 1
     or pg_catalog.array_length(p_original_body_ids,1) not between 1 and 50000
     or pg_catalog.array_position(p_original_body_ids,null) is not null
     or pg_catalog.current_setting('transaction_isolation')<>'read committed'
  then
    raise exception using errcode='23514',
      constraint='reader_exact_purge_finish_arguments_invalid',
      message='Protected Reader purge completion needs exact original IDs';
  end if;

  select * into j
  from public.official_reader_paid_answer_purge_jobs_v1
  where id=p_job_id and status='db_erased'
    and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp()
  for update;
  if not found
     or j.external_fence_id is distinct from p_external_fence_id
     or j.body_count is distinct from pg_catalog.array_length(p_original_body_ids,1)
     or j.body_count is distinct from (
       select pg_catalog.count(distinct id)::integer
       from pg_catalog.unnest(p_original_body_ids) as x(id)
     ) then
    raise exception using errcode='23514',
      constraint='reader_exact_purge_finish_manifest_mismatch',
      message='Reader purge manifest or Worker claim changed';
  end if;

  if exists (
    select 1 from public.official_reader_paid_answer_bodies b
    where b.id=any(p_original_body_ids)
  ) then
    raise exception using errcode='23514',
      constraint='reader_exact_purge_finish_original_body_still_present',
      message='Reader purge original encrypted answer is still present';
  end if;

  update public.official_reader_paid_answer_purge_jobs_v1
  set status=case when j.requeue_after_completion then 'pending'
                  else 'completed' end,
      id=case when j.requeue_after_completion
              then pg_catalog.gen_random_uuid() else id end,
      available_at=case when j.requeue_after_completion
                        then pg_catalog.clock_timestamp() else available_at end,
      external_fence_id=case when j.requeue_after_completion
                            then null else external_fence_id end,
      body_count=case when j.requeue_after_completion
                      then null else body_count end,
      keys_erased_at=case when j.requeue_after_completion
                          then null else pg_catalog.clock_timestamp() end,
      -- A concurrent later revocation creates a NEW queue obligation.
      -- Preserve created_at for the original job if no new job is opened.
      created_at=case when j.requeue_after_completion
                      then pg_catalog.clock_timestamp() else created_at end,
      requeue_after_completion=false,
      lock_owner=null, lease_expires_at=null,
      updated_at=pg_catalog.clock_timestamp()
  where id=p_job_id and status='db_erased'
    and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp();
  if not found then
    raise exception using errcode='40001',
      constraint='reader_exact_purge_finish_concurrent_claim',
      message='Reader purge ownership changed before completion';
  end if;
  return true;
end
$reader_purge_finish_exact$;

create or replace function public.internal_finish_empty_official_reader_paid_answer_purge_v1(
  p_job_id uuid,p_worker text
)
returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_empty_purge_finish$
declare
  j public.official_reader_paid_answer_purge_jobs_v1%rowtype;
  v_state text;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',
      constraint='reader_empty_purge_read_committed_required',
      message='Reader purge completion requires READ COMMITTED';
  end if;
  -- Read scope first, without a row lock. The provider lifecycle trigger
  -- already takes Reader S1 BEFORE updating this queue row.
  select * into j
  from public.official_reader_paid_answer_purge_jobs_v1
  where id=p_job_id and status='claimed' and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp();
  if not found then
    raise exception using errcode='P0001',
      constraint='reader_empty_purge_claim_missing',
      message='Reader purge requires a claimed job';
  end if;

  perform pg_catalog.set_config('myeongha.subject_id',j.subject_id::text,true);
  select q.scope_state into v_state
  from public.internal_qry_official_reader_locked_bundle_scope_v1(
    j.subject_id,j.official_reading_id,j.reader_character_id
  ) q;
  perform 1 from public.official_reader_paid_answer_purge_jobs_v1 live
  where live.id=p_job_id and live.subject_id=j.subject_id
    and live.official_reading_id=j.official_reading_id
    and live.reader_character_id=j.reader_character_id
    and live.lock_owner=p_worker and live.status='claimed'
    and live.lease_expires_at>pg_catalog.clock_timestamp()
  for update;
  if not found then
    raise exception using errcode='40001',
      constraint='reader_empty_purge_claim_changed_after_s1',
      message='Reader cleanup claim changed under S1';
  end if;
  if v_state is distinct from 'no_active_grant'
     or exists (
       select 1 from public.official_reader_paid_answer_bodies b
       where b.subject_id=j.subject_id
         and b.official_reading_id=j.official_reading_id
         and b.reader_character_id=j.reader_character_id
     ) then
    raise exception using errcode='P0001',
      constraint='reader_empty_purge_scope_not_empty',
      message='Reader cleanup cannot close an occupied or entitled scope';
  end if;

  update public.official_reader_paid_answer_purge_jobs_v1
  set status=case when j.requeue_after_completion then 'pending'
                  else 'completed' end,
      id=case when j.requeue_after_completion
              then pg_catalog.gen_random_uuid() else id end,
      available_at=case when j.requeue_after_completion
                        then pg_catalog.clock_timestamp() else available_at end,
      -- A concurrent later revocation creates a NEW queue obligation.
      -- Preserve created_at for the original job if no new job is opened.
      created_at=case when j.requeue_after_completion
                      then pg_catalog.clock_timestamp() else created_at end,
      requeue_after_completion=false,
      lock_owner=null,lease_expires_at=null,
      updated_at=pg_catalog.clock_timestamp()
  where id=p_job_id
    and status='claimed'
    and lock_owner=p_worker
    and lease_expires_at>pg_catalog.clock_timestamp();
  if not found then
    raise exception using errcode='40001',
      constraint='reader_empty_purge_completion_claim_lost',
      message='Reader empty purge lost its claimed lease before completion';
  end if;
  return true;
end
$reader_empty_purge_finish$;

comment on function public.internal_finish_official_reader_paid_answer_purge_v1(
  uuid,text,text,uuid[]
) is 'S4 protected purge finalizer. Newly requeued jobs receive a new UUID and created_at; original running job age is preserved until completion, with exact deleted-body and lease checks unchanged.';

comment on function public.internal_finish_empty_official_reader_paid_answer_purge_v1(
  uuid,text
) is 'S4 empty purge finalizer. A newly requeued event resets job UUID and created_at without granting paid Reader rights or changing original job age before completion.';
