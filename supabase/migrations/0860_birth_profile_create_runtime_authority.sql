-- Production Birth Profile create command-only runtime authority.
--
-- Ordinary API requests continue to execute through myeongha_api_executor, which receives
-- no direct Birth DML. A separate NOLOGIN/NOBYPASSRLS function owner holds only the
-- column privileges required by the existing SECURITY INVOKER core command. The runtime
-- wrapper is SECURITY DEFINER to that narrow role, asserts the transaction-local canonical
-- Subject context, validates the production Birth HMAC format, and then delegates to the
-- already-verified atomic create command.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_birth_profile_create_owner'
  ) THEN
    CREATE ROLE myeongha_birth_profile_create_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_birth_profile_create_owner'
      AND NOT r.rolcanlogin
      AND NOT r.rolsuper
      AND NOT r.rolcreatedb
      AND NOT r.rolcreaterole
      AND NOT r.rolinherit
      AND NOT r.rolreplication
      AND NOT r.rolbypassrls
  ) THEN
    RAISE EXCEPTION 'myeongha_birth_profile_create_owner is outside the least-privilege contract';
  END IF;
END
$$;

-- The command owner can evaluate the canonical Subject context and invoke only the
-- existing Birth create core command. It is intentionally not a member of the ordinary
-- API role and receives no login capability.
grant usage on schema public to myeongha_birth_profile_create_owner;
grant execute on function public.current_myeongha_subject_id()
to myeongha_birth_profile_create_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
to myeongha_birth_profile_create_owner;
grant execute on function public.cmd_create_birth_profile_v1(
  uuid, uuid, uuid, text, text, date, time, boolean, boolean, text, text
) to myeongha_birth_profile_create_owner;

-- SELECT ... FOR UPDATE requires SELECT plus UPDATE privilege on at least one column.
-- UPDATE(id) exists only to permit the row lock; the RLS WITH CHECK prevents changing
-- the canonical Subject id, and no other Subject column is writable by this role.
grant select (id, status, merged_into_subject_id)
on public.subjects
to myeongha_birth_profile_create_owner;
grant update (id)
on public.subjects
to myeongha_birth_profile_create_owner;

grant select (id, subject_id, profile_kind, archived_at)
on public.birth_profiles
to myeongha_birth_profile_create_owner;
grant insert (
  id,
  subject_id,
  profile_kind,
  label,
  current_revision_id,
  archived_at,
  created_at,
  updated_at
)
on public.birth_profiles
to myeongha_birth_profile_create_owner;
grant update (current_revision_id, updated_at)
on public.birth_profiles
to myeongha_birth_profile_create_owner;

grant insert (
  id,
  birth_profile_id,
  subject_id,
  revision_no,
  calendar_type,
  birth_date,
  birth_time,
  time_known,
  is_leap_month,
  sex,
  input_hash,
  created_at
)
on public.birth_profile_revisions
to myeongha_birth_profile_create_owner;

-- RLS remains the row authority even inside the SECURITY DEFINER wrapper because the
-- function owner is explicitly NOBYPASSRLS and is not a table owner.
drop policy if exists subjects_birth_create_select_v1 on public.subjects;
create policy subjects_birth_create_select_v1
on public.subjects
for select
to myeongha_birth_profile_create_owner
using (id = public.current_myeongha_subject_id());

drop policy if exists subjects_birth_create_lock_v1 on public.subjects;
create policy subjects_birth_create_lock_v1
on public.subjects
for update
to myeongha_birth_profile_create_owner
using (id = public.current_myeongha_subject_id())
with check (id = public.current_myeongha_subject_id());

drop policy if exists birth_profiles_birth_create_select_v1 on public.birth_profiles;
create policy birth_profiles_birth_create_select_v1
on public.birth_profiles
for select
to myeongha_birth_profile_create_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists birth_profiles_birth_create_insert_v1 on public.birth_profiles;
create policy birth_profiles_birth_create_insert_v1
on public.birth_profiles
for insert
to myeongha_birth_profile_create_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and profile_kind = 'self'
  and archived_at is null
);

drop policy if exists birth_profiles_birth_create_update_v1 on public.birth_profiles;
create policy birth_profiles_birth_create_update_v1
on public.birth_profiles
for update
to myeongha_birth_profile_create_owner
using (
  subject_id = public.current_myeongha_subject_id()
  and profile_kind = 'self'
)
with check (
  subject_id = public.current_myeongha_subject_id()
  and profile_kind = 'self'
);

drop policy if exists birth_profile_revisions_birth_create_insert_v1
on public.birth_profile_revisions;
create policy birth_profile_revisions_birth_create_insert_v1
on public.birth_profile_revisions
for insert
to myeongha_birth_profile_create_owner
with check (subject_id = public.current_myeongha_subject_id());

create or replace function public.cmd_create_birth_profile_runtime_v1(
  p_subject_id uuid,
  p_birth_profile_id uuid,
  p_revision_id uuid,
  p_label text,
  p_calendar_type text,
  p_birth_date date,
  p_birth_time time,
  p_time_known boolean,
  p_is_leap_month boolean,
  p_sex text,
  p_input_hash text
)
returns table (
  birth_profile_id uuid,
  revision_id uuid,
  revision_no integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_input_hash is null
     or p_input_hash !~ '^hmac-sha256:k1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'birth_profile_create_runtime_input_hash_format',
      message = 'production Birth input fingerprint is invalid';
  end if;

  return query
  select core.birth_profile_id,
         core.revision_id,
         core.revision_no
  from public.cmd_create_birth_profile_v1(
    p_subject_id,
    p_birth_profile_id,
    p_revision_id,
    p_label,
    p_calendar_type,
    p_birth_date,
    p_birth_time,
    p_time_known,
    p_is_leap_month,
    p_sex,
    p_input_hash
  ) core;
end;
$$;

alter function public.cmd_create_birth_profile_runtime_v1(
  uuid, uuid, uuid, text, text, date, time, boolean, boolean, text, text
) owner to myeongha_birth_profile_create_owner;

revoke all on function public.cmd_create_birth_profile_runtime_v1(
  uuid, uuid, uuid, text, text, date, time, boolean, boolean, text, text
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
      'revoke all on function public.cmd_create_birth_profile_runtime_v1(uuid,uuid,uuid,text,text,date,time,boolean,boolean,text,text) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_create_birth_profile_runtime_v1(
  uuid, uuid, uuid, text, text, date, time, boolean, boolean, text, text
) to myeongha_api_executor;
