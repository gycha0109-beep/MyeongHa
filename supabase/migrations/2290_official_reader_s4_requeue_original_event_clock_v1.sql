-- DB Owner #2301 / forward-only S4 cleanup deadline authority.
-- 2270/2280 correctly rotate Job UUID and reset clock for new cleanup
-- obligations. They were using WORKER completion timestamp when a later
-- revoke arrived during a prior purge. Worker/key-store downtime could
-- therefore conceal an actual 24-hour erasure target breach.
--
-- Use the durable original entitlement_events.created_at: directly from
-- NEW in the enqueue trigger, or the exact queued last_event_id at finalizer.
-- Existing running job keeps its original clock; independent later events
-- start with their OWN event clock. Fail closed on missing/wrong-source event.
-- No new permission, endpoint, data class or Production database deployment.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_enqueue_official_reader_paid_answer_purge_v1()
returns trigger
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_paid_purge_enqueue$
declare v_scope record;
begin
  if new.event_type not in ('revoked','expired')
     or new.source_type not in ('receipt','provider_event')
     or new.grant_id is null then
    return new;
  end if;

  -- Reader binds are immutable origin, but current purchase validation is
  -- independent. This trigger schedules only scopes WITH protected bodies.
  for v_scope in
    select distinct a.subject_id,a.official_reading_id,a.reader_character_id
    from public.entitlement_grants g
    cross join lateral (
      -- Current Reader access may already have been unbound by cancellation.
      -- The retained paid answer's immutable originating Grant captures
      -- that older scope without restoring access or trusting client data.
      select bound.subject_id,bound.official_reading_id,bound.reader_character_id
      from public.standard_reading_reader_access_grants bound
      where bound.entitlement_grant_id=g.id and bound.subject_id=g.subject_id
      union
      select historical.subject_id,historical.official_reading_id,
             historical.reader_character_id
      from public.official_reader_paid_answer_bodies historical
      where historical.originating_entitlement_grant_id=g.id
        and historical.subject_id=g.subject_id
    ) a
    where g.id=new.grant_id and g.subject_id=new.subject_id
      and g.grant_source_type='purchase'
      and exists (
        select 1 from public.official_reader_paid_answer_bodies body
        where body.subject_id=a.subject_id
          and body.official_reading_id=a.official_reading_id
          and body.reader_character_id=a.reader_character_id
      )
    order by a.subject_id,a.official_reading_id,a.reader_character_id
  loop
    insert into public.official_reader_paid_answer_purge_jobs_v1 (
      subject_id,official_reading_id,reader_character_id,last_event_id,created_at
    ) values (
      v_scope.subject_id,v_scope.official_reading_id,
      v_scope.reader_character_id,new.id,new.created_at
    )
    on conflict on constraint reader_paid_answer_purge_job_scope_unique
    do update set
      requeue_after_completion=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then false
        when public.official_reader_paid_answer_purge_jobs_v1.status
          in ('claimed','db_erased')
          and public.official_reader_paid_answer_purge_jobs_v1.last_event_id
            is distinct from excluded.last_event_id
          then true
        else public.official_reader_paid_answer_purge_jobs_v1.requeue_after_completion
      end,
      last_event_id=excluded.last_event_id,
      -- Completed scopes may be re-enqueued after a later independent
      -- refund/expiry. The new Job UUID is a NEW deletion obligation;
      -- do not inherit the previous job's creation time when tracking
      -- the Privacy Owner's 24h erasure objective. Active claims keep
      -- their original clock so an in-flight job cannot hide its age.
      created_at=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then new.created_at
        else public.official_reader_paid_answer_purge_jobs_v1.created_at
      end,
      updated_at=pg_catalog.clock_timestamp(),
      available_at=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then pg_catalog.clock_timestamp()
        else public.official_reader_paid_answer_purge_jobs_v1.available_at
      end,
      id=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then pg_catalog.gen_random_uuid()
        else public.official_reader_paid_answer_purge_jobs_v1.id
      end,
      status=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then 'pending'
        else public.official_reader_paid_answer_purge_jobs_v1.status
      end,
      external_fence_id=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then null
        else public.official_reader_paid_answer_purge_jobs_v1.external_fence_id
      end,
      body_count=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then null
        else public.official_reader_paid_answer_purge_jobs_v1.body_count
      end,
      keys_erased_at=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then null
        else public.official_reader_paid_answer_purge_jobs_v1.keys_erased_at
      end,
      lock_owner=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then null
        else public.official_reader_paid_answer_purge_jobs_v1.lock_owner
      end,
      lease_expires_at=case
        when public.official_reader_paid_answer_purge_jobs_v1.status='completed'
          then null
        else public.official_reader_paid_answer_purge_jobs_v1.lease_expires_at
      end;
  end loop;
  return new;
end
$reader_paid_purge_enqueue$;

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
declare
  j public.official_reader_paid_answer_purge_jobs_v1%rowtype;
  v_requeue_event_created_at timestamptz;
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

  -- This new deletion obligation begins at its canonical entitlement
  -- event, NOT at eventual Worker completion after any key-store outage.
  -- Its original event belongs to this same Subject and has a real
  -- refund/expiry lineage, or the finalization fails closed.
  if j.requeue_after_completion then
    select e.created_at into v_requeue_event_created_at
    from public.entitlement_events e
    where e.id=j.last_event_id
      and e.subject_id=j.subject_id
      and e.event_type in ('revoked','expired')
      and e.source_type in ('receipt','provider_event');
    if not found or v_requeue_event_created_at is null
       or v_requeue_event_created_at>pg_catalog.clock_timestamp() then
      raise exception using errcode='23514',
        constraint='reader_purge_requeue_source_event_unavailable',
        message='Reader purge requeue requires its original verified event';
    end if;
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
                      then v_requeue_event_created_at else created_at end,
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
  v_requeue_event_created_at timestamptz;
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

  -- This new deletion obligation begins at its canonical entitlement
  -- event, NOT at eventual Worker completion after any key-store outage.
  -- Its original event belongs to this same Subject and has a real
  -- refund/expiry lineage, or the finalization fails closed.
  if j.requeue_after_completion then
    select e.created_at into v_requeue_event_created_at
    from public.entitlement_events e
    where e.id=j.last_event_id
      and e.subject_id=j.subject_id
      and e.event_type in ('revoked','expired')
      and e.source_type in ('receipt','provider_event');
    if not found or v_requeue_event_created_at is null
       or v_requeue_event_created_at>pg_catalog.clock_timestamp() then
      raise exception using errcode='23514',
        constraint='reader_purge_requeue_source_event_unavailable',
        message='Reader purge requeue requires its original verified event';
    end if;
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
                      then v_requeue_event_created_at else created_at end,
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

comment on function public.internal_enqueue_official_reader_paid_answer_purge_v1()
is 'S4 protected purge: creation time for new deletion jobs comes from their canonical entitlement event, never an asynchronous Worker or webhook replay timestamp.';

comment on function public.internal_finish_official_reader_paid_answer_purge_v1(uuid,text,text,uuid[])
is 'S4 exact purge: when a later verified event requeues a completed job, the new job created_at is the original event timestamp, preserving erasure SLA age across delayed finalization.';

comment on function public.internal_finish_empty_official_reader_paid_answer_purge_v1(uuid,text)
is 'S4 empty purge: a concurrently queued verified event retains its original event timestamp after prior job completion; stale/missing events deny completion.';
