-- Forward-only S4/Commerce correction: event rows DO NOT contain a
-- target_status column (0080/1080 entitlement_events schema); that lifecycle
-- target exists solely in the private cmd_apply_entitlement_effect_v1 arguments
-- and payload, never in NEW from the AFTER INSERT trigger.
-- Keep the existing verified-source/event_type lineage. This correction
-- allows real PortOne Receipt -> revoke effects to enqueue cleanup without
-- rolling back a verified provider cancellation on missing-record error.
-- S4 Worker, privacy key erase, Production migrations and paid Reader remain
-- separately OFF/Owner-governed. No new role or public grants.
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
is 'S4 revocation/expiry queue source is canonical entitlement_events.event_type, not nonexistent target_status. Only verified Receipt/provider-origin events tied to protected Reader scope enqueue off-primary cleanup, preserving existing last-Grants Worker fence.';
