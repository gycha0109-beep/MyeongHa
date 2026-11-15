-- Watchtower-Track: character-memory
-- Four-Character independent published release opening, NOT publication.
-- This operation is intentionally NOT auto-installed by PR merge.
-- It never creates Character canon, releases, bundles, or user messages.
-- Existing Seyeon/default-release behavior and ownership/RLS stay intact.
begin;
set local lock_timeout = '5s';

do $preflight$
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::int < 170000
     or not exists (
       select 1 from pg_catalog.pg_proc p
       where p.oid='public.cmd_open_member_single_character_thread_v1(uuid,text,uuid,uuid)'::regprocedure
         and p.prosecdef
         and pg_catalog.pg_get_userbyid(p.proowner)='myeongha_chat_thread_open_owner'
         and has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')
         and not has_function_privilege('anon',p.oid,'EXECUTE')
         and not has_function_privilege('authenticated',p.oid,'EXECUTE')
         and not has_function_privilege('service_role',p.oid,'EXECUTE')
     )
  then
    raise exception 'four-character independent chat-open production authority preflight failed';
  end if;
end $preflight$;

-- The legacy insert policy remains intact for the active default release.
-- PostgreSQL permissive INSERT policies are OR-combined; this additional
-- owner-only slice admits a non-default release only when it is actually
-- publishing at least one of the four approved independently routed Characters.
-- The SECURITY DEFINER command above/below still picks exactly one release
-- for the requested Character, and no API role receives table INSERT.
drop policy if exists conversation_threads_chat_thread_open_independent_insert_v1
  on public.conversation_threads;
create policy conversation_threads_chat_thread_open_independent_insert_v1
on public.conversation_threads
for insert
to myeongha_chat_thread_open_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and thread_type = 'single_character'
  and status = 'active'
  and deleted_at is null
  and active_content_release_id is not null
  and active_content_bundle_id is not null
  and exists (
    select 1
    from public.content_releases cr
    join public.content_bundles cb
      on cb.id = cr.content_bundle_id
     and cb.retired_at is null
    join public.character_runtime_catalog crc
      on crc.content_bundle_id = cr.content_bundle_id
    join public.characters c
      on c.character_id = crc.character_id
     and c.retired_at is null
    where cr.id = active_content_release_id
      and cr.content_bundle_id = active_content_bundle_id
      and cr.status = 'active'
      and cr.is_default = false
      and crc.character_id in ('baekheon','yeoul','rahyeon','taegyeom')
      and crc.enabled is true
      and crc.availability = 'available'
      and (crc.release_at is null or crc.release_at <= clock_timestamp())
      and (crc.retire_at is null or crc.retire_at > clock_timestamp())
  )
);

create or replace function public.cmd_open_member_single_character_thread_v1(
  p_subject_id uuid,
  p_character_id text,
  p_thread_id uuid,
  p_thread_character_id uuid
)
returns table (
  thread_id uuid,
  thread_character_id uuid,
  created boolean,
  active_content_release_id uuid,
  active_content_bundle_id uuid,
  character_id text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_subject_kind text;
  v_subject_status text;
  v_subject_merge_target uuid;
  v_default_count bigint;
  v_independent_release_count bigint;
  v_character_published boolean;
  v_release_id uuid;
  v_bundle_id uuid;
  v_bundle_retired_at timestamptz;
  v_character_retired_at timestamptz;
  v_availability text;
  v_enabled boolean;
  v_release_at timestamptz;
  v_retire_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_existing_count bigint;
  v_existing_thread_id uuid;
  v_existing_thread_character_id uuid;
  v_existing_role text;
  v_existing_release_id uuid;
  v_existing_bundle_id uuid;
  v_existing_participant_bundle_id uuid;
  v_active_participant_count bigint;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_character_id is null or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'member_character_thread_character_required',
      message = 'character id is required';
  end if;

  if p_thread_id is null or p_thread_character_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'member_character_thread_candidate_ids_required',
      message = 'candidate thread and participation ids are required';
  end if;

  -- Serialize all open/create attempts for this canonical Member. The lock is held
  -- until the surrounding transaction commits, so a concurrent retry re-reads the
  -- thread created by the first transaction rather than creating a duplicate.
  select s.kind, s.status, s.merged_into_subject_id
  into v_subject_kind, v_subject_status, v_subject_merge_target
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      constraint = 'member_character_thread_subject_exists',
      message = 'subject was not found';
  end if;

  if v_subject_kind is distinct from 'member'
     or v_subject_status is distinct from 'active'
     or v_subject_merge_target is not null then
    raise exception using
      errcode = '23514',
      constraint = 'member_character_thread_active_member_required',
      message = 'Character thread open requires an active canonical Member subject';
  end if;

  select count(*)
  into v_default_count
  from public.content_releases cr
  where cr.status = 'active'
    and cr.is_default = true;

  if v_default_count <> 1 then
    raise exception using
      errcode = '23514',
      constraint = 'member_character_thread_active_default_required',
      message = 'exactly one active default content release is required';
  end if;

  select cr.id, cr.content_bundle_id
  into strict v_release_id, v_bundle_id
  from public.content_releases cr
  where cr.status = 'active'
    and cr.is_default = true;

  select cb.retired_at
  into v_bundle_retired_at
  from public.content_bundles cb
  where cb.id = v_bundle_id;

  if not found or v_bundle_retired_at is not null then
    raise exception using
      errcode = '23514',
      constraint = 'member_character_thread_active_bundle_required',
      message = 'active default release must reference a non-retired content bundle';
  end if;

  select c.retired_at,
         crc.availability,
         crc.enabled,
         crc.release_at,
         crc.retire_at
  into v_character_retired_at,
       v_availability,
       v_enabled,
       v_release_at,
       v_retire_at
  from public.characters c
  join public.character_runtime_catalog crc
    on crc.character_id = c.character_id
   and crc.content_bundle_id = v_bundle_id
  where c.character_id = p_character_id;

  -- Keep the active default release authoritative for every Character that
  -- is actually published in it. Only the four requested non-Se-yeon
  -- Characters can use an independently activated non-default release.
  -- Never choose a client-provided bundle or silently prefer one of many.
  v_character_published := found;
  if not v_character_published
     and p_character_id in ('baekheon','yeoul','rahyeon','taegyeom') then
    select count(*)
    into v_independent_release_count
    from public.content_releases cr
    join public.content_bundles cb
      on cb.id = cr.content_bundle_id
     and cb.retired_at is null
    join public.character_runtime_catalog crc
      on crc.content_bundle_id = cr.content_bundle_id
     and crc.character_id = p_character_id
    join public.characters c
      on c.character_id = crc.character_id
     and c.retired_at is null
    where cr.status = 'active'
      and cr.is_default = false
      and crc.enabled is true
      and crc.availability = 'available'
      and (crc.release_at is null or crc.release_at <= v_now)
      and (crc.retire_at is null or crc.retire_at > v_now);

    if v_independent_release_count > 1 then
      raise exception using
        errcode = '23514',
        constraint = 'member_character_thread_independent_release_ambiguous',
        message = 'more than one active independently published release exists for this Character';
    end if;

    if v_independent_release_count = 1 then
      select cr.id, cr.content_bundle_id,
             c.retired_at, crc.availability, crc.enabled,
             crc.release_at, crc.retire_at
      into strict v_release_id, v_bundle_id,
                  v_character_retired_at, v_availability,
                  v_enabled, v_release_at, v_retire_at
      from public.content_releases cr
      join public.content_bundles cb
        on cb.id = cr.content_bundle_id
       and cb.retired_at is null
      join public.character_runtime_catalog crc
        on crc.content_bundle_id = cr.content_bundle_id
       and crc.character_id = p_character_id
      join public.characters c
        on c.character_id = crc.character_id
       and c.retired_at is null
      where cr.status = 'active'
        and cr.is_default = false
        and crc.enabled is true
        and crc.availability = 'available'
        and (crc.release_at is null or crc.release_at <= v_now)
        and (crc.retire_at is null or crc.retire_at > v_now);
      v_character_published := found;
    end if;
  end if;

  if not v_character_published then
    raise exception using
      errcode = '23514',
      constraint = 'member_character_thread_character_published',
      message = 'selected Character has no active published content release';
  end if;

  if v_character_retired_at is not null
     or v_availability is distinct from 'available'
     or v_enabled is distinct from true
     or (v_release_at is not null and v_release_at > v_now)
     or (v_retire_at is not null and v_retire_at <= v_now) then
    raise exception using
      errcode = '23514',
      constraint = 'member_character_thread_character_available',
      message = 'selected Character is not currently available for Member Chat';
  end if;

  -- Detect every active single-character thread where this Character is still an
  -- active participant. Do not silently choose among duplicate or malformed rows.
  select count(distinct ct.id)
  into v_existing_count
  from public.conversation_threads ct
  join public.conversation_thread_characters tc
    on tc.thread_id = ct.id
   and tc.character_id = p_character_id
   and tc.left_at is null
  where ct.subject_id = p_subject_id
    and ct.thread_type = 'single_character'
    and ct.status = 'active'
    and ct.deleted_at is null;

  if v_existing_count > 1 then
    raise exception using
      errcode = '23514',
      constraint = 'member_character_thread_single_active',
      message = 'multiple active single-Character threads already exist for this Member and Character';
  end if;

  if v_existing_count = 1 then
    select ct.id,
           tc.id,
           tc.role,
           ct.active_content_release_id,
           ct.active_content_bundle_id,
           tc.content_bundle_id
    into strict v_existing_thread_id,
                v_existing_thread_character_id,
                v_existing_role,
                v_existing_release_id,
                v_existing_bundle_id,
                v_existing_participant_bundle_id
    from public.conversation_threads ct
    join public.conversation_thread_characters tc
      on tc.thread_id = ct.id
     and tc.character_id = p_character_id
     and tc.left_at is null
    where ct.subject_id = p_subject_id
      and ct.thread_type = 'single_character'
      and ct.status = 'active'
      and ct.deleted_at is null;

    select count(*)
    into v_active_participant_count
    from public.conversation_thread_characters tc
    where tc.thread_id = v_existing_thread_id
      and tc.left_at is null;

    if v_existing_role is distinct from 'primary'
       or v_active_participant_count <> 1
       or v_existing_release_id is null
       or v_existing_bundle_id is null
       or v_existing_participant_bundle_id is distinct from v_existing_bundle_id then
      raise exception using
        errcode = '23514',
        constraint = 'member_character_thread_existing_shape',
        message = 'existing single-Character thread is not structurally reusable';
    end if;

    return query
    select v_existing_thread_id,
           v_existing_thread_character_id,
           false,
           v_existing_release_id,
           v_existing_bundle_id,
           p_character_id;
    return;
  end if;

  insert into public.conversation_threads (
    id,
    subject_id,
    thread_type,
    status,
    title,
    active_content_release_id,
    active_content_bundle_id,
    content_revision,
    next_sequence_no,
    created_at,
    updated_at,
    deleted_at
  ) values (
    p_thread_id,
    p_subject_id,
    'single_character',
    'active',
    null,
    v_release_id,
    v_bundle_id,
    0,
    1,
    v_now,
    v_now,
    null
  );

  insert into public.conversation_thread_characters (
    id,
    thread_id,
    character_id,
    content_bundle_id,
    role,
    joined_at,
    left_at
  ) values (
    p_thread_character_id,
    p_thread_id,
    p_character_id,
    v_bundle_id,
    'primary',
    v_now,
    null
  );

  return query
  select p_thread_id,
         p_thread_character_id,
         true,
         v_release_id,
         v_bundle_id,
         p_character_id;
end;
$$;

-- CREATE OR REPLACE retains the dedicated, non-BYPASSRLS owner and the
-- original exact API-only EXECUTE permissions. Never grant a new role.
do $postflight$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid='public.cmd_open_member_single_character_thread_v1(uuid,text,uuid,uuid)'::regprocedure
      and p.prosecdef
      and pg_catalog.pg_get_userbyid(p.proowner)='myeongha_chat_thread_open_owner'
      and has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('service_role',p.oid,'EXECUTE')
      and position('member_character_thread_independent_release_ambiguous' in pg_get_functiondef(p.oid))>0
  ) then
    raise exception 'four-character independent chat-open production authority postflight failed';
  end if;
end $postflight$;
commit;
