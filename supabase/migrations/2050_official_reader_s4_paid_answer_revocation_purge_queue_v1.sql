-- S4: durable Reader paid-content cleanup queue.
-- Enqueue in the SAME existing Commerce Grant lifecycle transaction.
-- A failed off-primary key vault NEVER rolls back a verified refund. Paid
-- read is already denied by current Entitlement independently of this queue.
-- Do not apply on Production until recovery #1941 and accepted S4 migration.
-- Watchtower-Track: db-authority-core

create table public.official_reader_paid_answer_purge_jobs_v1 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  subject_id uuid not null,
  official_reading_id uuid not null,
  reader_character_id text not null,
  status text not null default 'pending',
  last_event_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  available_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  lock_owner text,
  lease_expires_at timestamptz,
  external_fence_id text,
  body_count integer,
  keys_erased_at timestamptz,
  constraint reader_paid_answer_purge_job_scope_unique
    unique(subject_id,official_reading_id,reader_character_id),
  constraint reader_paid_answer_purge_job_subject_fk
    foreign key(subject_id) references public.subjects(id),
  constraint reader_paid_answer_purge_job_reading_fk
    foreign key(official_reading_id,subject_id)
    references public.standard_reading_official_bindings(reading_id,subject_id),
  constraint reader_paid_answer_purge_job_event_fk
    foreign key(last_event_id) references public.entitlement_events(id),
  constraint reader_paid_answer_purge_job_status_check
    check(status in ('pending','claimed','db_erased','completed')),
  constraint reader_paid_answer_purge_job_lock_check
    check((lock_owner is null)=(lease_expires_at is null)),
  constraint reader_paid_answer_purge_job_count_check
    check(body_count is null or body_count>0),
  constraint reader_paid_answer_purge_job_fence_check
    check(external_fence_id is null or pg_catalog.length(external_fence_id) between 1 and 256)
);
create index official_reader_paid_answer_purge_pending_idx
  on public.official_reader_paid_answer_purge_jobs_v1(status,available_at,id);
alter table public.official_reader_paid_answer_purge_jobs_v1
  enable row level security;
alter table public.official_reader_paid_answer_purge_jobs_v1
  force row level security;
revoke all on table public.official_reader_paid_answer_purge_jobs_v1 from public;

-- Trigger is tied to canonical 1080 Entitlement EVENT, not the webhook,
-- browser, or cached purchase state. An event is persisted after the Grant
-- CAS, so Reader refund and cleanup discovery commit atomically.
create or replace function public.internal_enqueue_official_reader_paid_answer_purge_v1()
returns trigger
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $reader_paid_purge_enqueue$
declare v_scope record;
begin
  if new.event_type not in ('revoked','expired')
     or new.source_type not in ('provider_event','system','admin')
     or new.grant_id is null then
    return new;
  end if;

  -- Reader binds are immutable origin, but current purchase validation is
  -- independent. This trigger schedules only scopes WITH protected bodies.
  for v_scope in
    select distinct a.subject_id,a.official_reading_id,a.reader_character_id
    from public.entitlement_grants g
    join public.standard_reading_reader_access_grants a
      on a.entitlement_grant_id=g.id and a.subject_id=g.subject_id
    where g.id=new.grant_id and g.subject_id=new.subject_id
      and g.grant_source_type='purchase'
      and exists (
        select 1 from public.official_reader_paid_answer_bodies b
        where b.subject_id=a.subject_id
          and b.official_reading_id=a.official_reading_id
          and b.reader_character_id=a.reader_character_id
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

revoke all on function public.internal_enqueue_official_reader_paid_answer_purge_v1()
from public;

create trigger official_reader_paid_answer_purge_entitlement_event_v1
after insert on public.entitlement_events
for each row
execute function public.internal_enqueue_official_reader_paid_answer_purge_v1();

comment on table public.official_reader_paid_answer_purge_jobs_v1 is
'Internal S4 deferred protected Reader content cleanup queue. Entitlement revoke remains atomic independently; this table is never itself a current-Grant or public-read authority.';
