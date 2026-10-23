-- Forward-only S4 account/Reader Privacy: when a completed cleanup scope
-- receives a NEW legitimate revoke/expiry event, it is a NEW deletion job
-- (the enqueue trigger already rotates id). Reset created_at ONLY with the
-- new job so the 24-hour erasure objective is timed against the right event.
-- Preserve the old creation clock for pending/claimed/db_erased jobs.
--
-- Rebuild from the canonical 2150 event_type-based trigger. Do not resurrect
-- the removed entitlement_events.target_status reference from 2050.
-- No new tables, grants, public endpoints, Production deployment, or release.
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
      subject_id,official_reading_id,reader_character_id,last_event_id
    ) values (
      v_scope.subject_id,v_scope.official_reading_id,
      v_scope.reader_character_id,new.id
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
          then pg_catalog.clock_timestamp()
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


comment on function public.internal_enqueue_official_reader_paid_answer_purge_v1()
is 'Reader protected purge queue: a later verified revoke/expiry reopens a completed scope with a new job UUID AND new created_at for 24h Privacy monitoring. Pending/claimed/db_erased job creation time remains immutable. Still Owner-governed and PUBLIC OFF.';
