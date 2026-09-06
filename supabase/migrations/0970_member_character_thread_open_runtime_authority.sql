-- Production Member single-Character thread create-or-reuse runtime authority.
--
-- Product authority: CHARACTER_LAUNCH_MVP_AUTHORITY_V1.
-- All normal Members resolve to the current active default release. For one
-- (Member subject, Character) pair there is at most one logical active
-- single-character thread: reuse it when present, otherwise create it atomically
-- and pin the active default release/bundle. The command does not create a first-
-- meeting message, World Event, Relationship Event, outbox event, Guest thread,
-- archived-thread transition, or multi-character thread.
--
-- The ordinary API executor receives EXECUTE only. A dedicated NOLOGIN /
-- NOBYPASSRLS function owner holds the narrow relation privileges required by
-- this command. The canonical Member subject row is locked before inspecting or
-- creating a thread, so concurrent create/open requests for one Member serialize
-- and converge on one logical active thread without adding a denormalized guard
-- table or caller-visible idempotency key.

DO $$
DECLARE
  v_owner_oid oid;
  v_server_version_num integer := current_setting('server_version_num')::integer;
  v_membership_count integer;
  v_expected_admin_count integer;
  v_current_user_superuser boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_chat_thread_open_owner'
  ) THEN
    CREATE ROLE myeongha_chat_thread_open_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;

  SELECT r.oid
  INTO v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_chat_thread_open_owner'
    AND NOT r.rolcanlogin
    AND NOT r.rolsuper
    AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole
    AND NOT r.rolinherit
    AND NOT r.rolreplication
    AND NOT r.rolbypassrls;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'myeongha_chat_thread_open_owner is outside the least-privilege role contract';
  END IF;

  SELECT count(*)
  INTO v_membership_count
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid = v_owner_oid;

  SELECT r.rolsuper
  INTO STRICT v_current_user_superuser
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = CURRENT_USER;

  IF v_server_version_num >= 160000 THEN
    IF v_current_user_superuser THEN
      -- A superuser-created NOLOGIN role has no automatic creator membership.
      -- Keep that zero-membership bootstrap shape instead of inventing one.
      IF v_membership_count <> 0 THEN
        RAISE EXCEPTION 'myeongha_chat_thread_open_owner has unexpected PostgreSQL 16+ superuser bootstrap membership';
      END IF;
    ELSE
      -- PostgreSQL 16+ gives a non-superuser CREATEROLE principal an automatic
      -- ADMIN-only membership with INHERIT/SET disabled and a superuser grantor.
      SELECT count(*)
      INTO v_expected_admin_count
      FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles member_role
        ON member_role.oid = m.member
      JOIN pg_catalog.pg_roles grantor_role
        ON grantor_role.oid = m.grantor
      WHERE m.roleid = v_owner_oid
        AND member_role.rolname = CURRENT_USER
        AND m.admin_option
        AND NOT m.inherit_option
        AND NOT m.set_option
        AND grantor_role.rolsuper;

      IF v_membership_count <> 1 OR v_expected_admin_count <> 1 THEN
        RAISE EXCEPTION 'myeongha_chat_thread_open_owner has unexpected PostgreSQL 16+ managed creator membership';
      END IF;
    END IF;
  ELSIF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_chat_thread_open_owner has unexpected pre-PostgreSQL-16 membership';
  END IF;
END
$$;

grant usage on schema public to myeongha_chat_thread_open_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_chat_thread_open_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_chat_thread_open_owner;

-- SELECT ... FOR UPDATE on the canonical subject requires SELECT plus UPDATE on
-- at least one column. UPDATE(id) exists only to permit the row lock; RLS keeps
-- the row pinned to the transaction-local canonical subject.
grant select (id, kind, status, merged_into_subject_id)
  on public.subjects to myeongha_chat_thread_open_owner;
grant update (id)
  on public.subjects to myeongha_chat_thread_open_owner;

-- Operational content authority reads. No content relation receives write access.
grant select (id, content_bundle_id, status, is_default)
  on public.content_releases to myeongha_chat_thread_open_owner;
grant select (id, retired_at)
  on public.content_bundles to myeongha_chat_thread_open_owner;
grant select (character_id, retired_at)
  on public.characters to myeongha_chat_thread_open_owner;
grant select (
  character_id,
  content_bundle_id,
  availability,
  enabled,
  release_at,
  retire_at
) on public.character_runtime_catalog to myeongha_chat_thread_open_owner;

-- The command owner can inspect and create only the two relations that form one
-- single-character thread aggregate. It cannot update/delete existing threads.
grant select (
  id,
  subject_id,
  thread_type,
  status,
  active_content_release_id,
  active_content_bundle_id,
  deleted_at
) on public.conversation_threads to myeongha_chat_thread_open_owner;
grant insert (
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
) on public.conversation_threads to myeongha_chat_thread_open_owner;

grant select (
  id,
  thread_id,
  character_id,
  content_bundle_id,
  role,
  left_at
) on public.conversation_thread_characters to myeongha_chat_thread_open_owner;
grant insert (
  id,
  thread_id,
  character_id,
  content_bundle_id,
  role,
  joined_at,
  left_at
) on public.conversation_thread_characters to myeongha_chat_thread_open_owner;

-- The command owner remains NOBYPASSRLS inside the SECURITY DEFINER wrapper.
-- Existing API RLS is preserved; these policies add only the owner-specific slice.
drop policy if exists subjects_chat_thread_open_select_v1 on public.subjects;
create policy subjects_chat_thread_open_select_v1
on public.subjects
for select
to myeongha_chat_thread_open_owner
using (id = public.current_myeongha_subject_id());

drop policy if exists subjects_chat_thread_open_lock_v1 on public.subjects;
create policy subjects_chat_thread_open_lock_v1
on public.subjects
for update
to myeongha_chat_thread_open_owner
using (id = public.current_myeongha_subject_id())
with check (id = public.current_myeongha_subject_id());

drop policy if exists conversation_threads_chat_thread_open_select_v1
  on public.conversation_threads;
create policy conversation_threads_chat_thread_open_select_v1
on public.conversation_threads
for select
to myeongha_chat_thread_open_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_threads_chat_thread_open_insert_v1
  on public.conversation_threads;
create policy conversation_threads_chat_thread_open_insert_v1
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
    where cr.id = active_content_release_id
      and cr.content_bundle_id = active_content_bundle_id
      and cr.status = 'active'
      and cr.is_default = true
  )
);

drop policy if exists conversation_thread_characters_chat_thread_open_select_v1
  on public.conversation_thread_characters;
create policy conversation_thread_characters_chat_thread_open_select_v1
on public.conversation_thread_characters
for select
to myeongha_chat_thread_open_owner
using (
  exists (
    select 1
    from public.conversation_threads ct
    where ct.id = conversation_thread_characters.thread_id
      and ct.subject_id = public.current_myeongha_subject_id()
  )
);

drop policy if exists conversation_thread_characters_chat_thread_open_insert_v1
  on public.conversation_thread_characters;
create policy conversation_thread_characters_chat_thread_open_insert_v1
on public.conversation_thread_characters
for insert
to myeongha_chat_thread_open_owner
with check (
  role = 'primary'
  and left_at is null
  and exists (
    select 1
    from public.conversation_threads ct
    where ct.id = conversation_thread_characters.thread_id
      and ct.subject_id = public.current_myeongha_subject_id()
      and ct.thread_type = 'single_character'
      and ct.status = 'active'
      and ct.deleted_at is null
      and ct.active_content_bundle_id = conversation_thread_characters.content_bundle_id
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

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'member_character_thread_character_published',
      message = 'selected Character is not published in the active default content bundle';
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

-- Transfer only this wrapper to the narrow owner. PostgreSQL 16+ creator
-- membership semantics are handled exactly as in the existing runtime-authority
-- migrations: a temporary SET-capable self-grant and schema CREATE are removed
-- immediately after ownership transfer.
grant myeongha_chat_thread_open_owner to current_user;
grant create on schema public to myeongha_chat_thread_open_owner;

alter function public.cmd_open_member_single_character_thread_v1(
  uuid, text, uuid, uuid
) owner to myeongha_chat_thread_open_owner;

revoke all on function public.cmd_open_member_single_character_thread_v1(
  uuid, text, uuid, uuid
) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_open_member_single_character_thread_v1(uuid,text,uuid,uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_open_member_single_character_thread_v1(
  uuid, text, uuid, uuid
) to myeongha_api_executor;

revoke create on schema public from myeongha_chat_thread_open_owner;
revoke myeongha_chat_thread_open_owner from current_user;

DO $$
DECLARE
  v_owner_oid oid;
  v_server_version_num integer := current_setting('server_version_num')::integer;
  v_membership_count integer;
  v_expected_admin_count integer;
  v_current_user_superuser boolean;
BEGIN
  SELECT r.oid
  INTO STRICT v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_chat_thread_open_owner';

  SELECT count(*)
  INTO v_membership_count
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid = v_owner_oid;

  SELECT r.rolsuper
  INTO STRICT v_current_user_superuser
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = CURRENT_USER;

  IF v_server_version_num >= 160000 THEN
    IF v_current_user_superuser THEN
      IF v_membership_count <> 0 THEN
        RAISE EXCEPTION 'myeongha_chat_thread_open_owner retained unexpected PostgreSQL 16+ superuser membership';
      END IF;
    ELSE
      SELECT count(*)
      INTO v_expected_admin_count
      FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles member_role
        ON member_role.oid = m.member
      JOIN pg_catalog.pg_roles grantor_role
        ON grantor_role.oid = m.grantor
      WHERE m.roleid = v_owner_oid
        AND member_role.rolname = CURRENT_USER
        AND m.admin_option
        AND NOT m.inherit_option
        AND NOT m.set_option
        AND grantor_role.rolsuper;

      IF v_membership_count <> 1 OR v_expected_admin_count <> 1 THEN
        RAISE EXCEPTION 'myeongha_chat_thread_open_owner did not return to the PostgreSQL 16+ admin-only managed creator membership contract';
      END IF;
    END IF;
  ELSIF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_chat_thread_open_owner retained unexpected pre-PostgreSQL-16 membership';
  END IF;

  IF NOT has_schema_privilege(
    'myeongha_chat_thread_open_owner',
    'public',
    'USAGE'
  ) OR has_schema_privilege(
    'myeongha_chat_thread_open_owner',
    'public',
    'CREATE'
  ) THEN
    RAISE EXCEPTION 'myeongha_chat_thread_open_owner retained unexpected schema privilege';
  END IF;
END
$$;
