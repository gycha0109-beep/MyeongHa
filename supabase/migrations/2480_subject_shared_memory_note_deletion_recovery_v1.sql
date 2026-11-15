-- Watchtower-Track: character-memory
-- Owner-approved 2026-11-10; only note UUID, Subject UUID, deletion timestamp.
-- No plaintext, no new backup retention, no Production activation.
create table public.subject_shared_memory_delete_events_v1 (
  item_id uuid primary key,
  subject_id uuid not null,
  deleted_at timestamptz not null
);
create index subject_shared_memory_delete_event_clock_v1
  on public.subject_shared_memory_delete_events_v1 (deleted_at, item_id);
revoke all on public.subject_shared_memory_delete_events_v1 from public;
do $roles$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor','myeongha_system_executor')
  loop
    execute pg_catalog.format('revoke all on public.subject_shared_memory_delete_events_v1 from %I', v_role);
  end loop;
end
$roles$;

-- The public trigger stays SECURITY INVOKER, per the existing catalog guard.
-- A narrowly callable SECURITY DEFINER helper writes the private event only
-- from inside an actual trigger, not from an arbitrary API SQL invocation.
-- Metadata insertion and the physical DELETE share one PostgreSQL transaction.
create function public.internal_record_shared_memory_note_deletion_v1(
  p_item_id uuid, p_subject_id uuid
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $record_metadata$
begin
  if pg_catalog.pg_trigger_depth() < 1 or
     p_item_id is null or p_subject_id is null then
    raise exception using errcode = '42501',
      message = 'shared-memory deletion metadata requires a database trigger';
  end if;
  insert into public.subject_shared_memory_delete_events_v1(item_id,subject_id,deleted_at)
    values(p_item_id,p_subject_id,pg_catalog.clock_timestamp());
end
$record_metadata$;
revoke all on function public.internal_record_shared_memory_note_deletion_v1(uuid,uuid) from public;
-- Only member-owned DELETE uses the API executor. Account finalization
-- already runs as the privileged finalizer owner, not as system executor.
-- Keep the system executor public-function allowlist fixed at five.
grant execute on function public.internal_record_shared_memory_note_deletion_v1(uuid,uuid)
  to myeongha_api_executor;

create function public.tr_record_shared_memory_note_deletion_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp
as $record$
begin
  perform public.internal_record_shared_memory_note_deletion_v1(old.id,old.subject_id);
  return old;
end
$record$;
revoke all on function public.tr_record_shared_memory_note_deletion_v1() from public;
create trigger record_shared_memory_note_deletion_v1
after delete on public.subject_shared_memory_items_v1
for each row execute function public.tr_record_shared_memory_note_deletion_v1();

-- Privileged restore-only invocation. No runtime/API/worker EXECUTE permission.
create function public.internal_replay_shared_memory_note_deletion_v1(
  p_subject_id uuid, p_item_id uuid, p_deleted_at timestamptz
)
returns bigint language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp
as $replay$
declare
  v_status text;
  v_item_owner uuid;
  v_event_owner uuid;
  v_event_time timestamptz;
  v_count bigint;
begin
  if p_subject_id is null or p_item_id is null or p_deleted_at is null
     or p_deleted_at > pg_catalog.clock_timestamp()
  then
    raise exception using errcode = '23514', message = 'invalid shared-memory note recovery event';
  end if;
  select status into v_status from public.subjects where id=p_subject_id for update;
  if v_status is null or v_status not in ('active','deletion_pending','deleted') then
    raise exception using errcode = '23514', message = 'shared-memory note recovery subject unavailable';
  end if;
  select subject_id into v_item_owner from public.subject_shared_memory_items_v1
    where id=p_item_id for update;
  if v_item_owner is not null and v_item_owner <> p_subject_id then
    raise exception using errcode = '23514', message = 'shared-memory note recovery cross-subject conflict';
  end if;
  select subject_id,deleted_at into v_event_owner,v_event_time
    from public.subject_shared_memory_delete_events_v1 where item_id=p_item_id for update;
  if v_event_owner is not null and
     (v_event_owner <> p_subject_id
      or pg_catalog.date_trunc('milliseconds',v_event_time) <> p_deleted_at
      or v_item_owner is not null)
  then
    raise exception using errcode = '23514', message = 'shared-memory note recovery marker conflict';
  end if;
  delete from public.subject_shared_memory_items_v1
    where id=p_item_id and subject_id=p_subject_id;
  get diagnostics v_count = row_count;
  if v_count = 1 then
    -- Trigger wrote a new timestamp. Preserve exact original source time.
    update public.subject_shared_memory_delete_events_v1
      set deleted_at=p_deleted_at where item_id=p_item_id and subject_id=p_subject_id;
  elsif v_event_owner is null then
    -- Item may have been created and then deleted after backup.
    insert into public.subject_shared_memory_delete_events_v1(item_id,subject_id,deleted_at)
      values(p_item_id,p_subject_id,p_deleted_at);
  end if;
  if exists(select 1 from public.subject_shared_memory_items_v1 where id=p_item_id)
     or not exists (
       select 1 from public.subject_shared_memory_delete_events_v1
       where item_id=p_item_id and subject_id=p_subject_id
         and pg_catalog.date_trunc('milliseconds',deleted_at)=p_deleted_at
     )
  then
    raise exception using errcode = '23514', message = 'shared-memory note recovery non-resurrection failed';
  end if;
  return 1;
end
$replay$;
revoke all on function public.internal_replay_shared_memory_note_deletion_v1(uuid,uuid,timestamptz) from public;
do $roles$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role','myeongha_api_executor','myeongha_system_executor')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_replay_shared_memory_note_deletion_v1(uuid,uuid,timestamptz) from %I', v_role);
  end loop;
end
$roles$;
