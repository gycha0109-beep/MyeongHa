-- Production Target Person create command-only runtime authority.
--
-- PostgreSQL 16+ role creation may leave either no creator membership (superuser
-- bootstrap) or one admin-only/non-inheritable creator membership (managed migration
-- principal). Both are management-plane shapes; any other membership is rejected.
--
-- Opens only source-authorized Target Person creation: metadata + one target Birth
-- Profile + immutable Birth revision 1. Post-create metadata edit, deletion, Birth
-- correction, and Compatibility execution remain closed.

DO $$
DECLARE
  v_owner_oid oid;
  v_server_version_num integer := current_setting('server_version_num')::integer;
  v_membership_count integer;
  v_expected_admin_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'myeongha_target_person_create_owner'
  ) THEN
    CREATE ROLE myeongha_target_person_create_owner
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION NOBYPASSRLS;
  END IF;

  SELECT r.oid INTO v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_target_person_create_owner'
    AND NOT r.rolcanlogin
    AND NOT r.rolsuper
    AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole
    AND NOT r.rolinherit
    AND NOT r.rolreplication
    AND NOT r.rolbypassrls;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'myeongha_target_person_create_owner is outside the least-privilege role contract';
  END IF;

  SELECT count(*) INTO v_membership_count
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid = v_owner_oid;

  IF v_server_version_num >= 160000 THEN
    SELECT count(*) INTO v_expected_admin_count
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
    JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid = m.grantor
    WHERE m.roleid = v_owner_oid
      AND member_role.rolname = CURRENT_USER
      AND m.admin_option
      AND NOT m.inherit_option
      AND NOT m.set_option
      AND grantor_role.rolsuper;

    IF v_membership_count NOT IN (0, 1)
       OR (v_membership_count = 1 AND v_expected_admin_count <> 1) THEN
      RAISE EXCEPTION 'myeongha_target_person_create_owner has unexpected PostgreSQL 16+ creator membership';
    END IF;
  ELSIF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_target_person_create_owner has unexpected pre-PostgreSQL-16 membership';
  END IF;
END
$$;

grant usage on schema public to myeongha_target_person_create_owner;
grant execute on function public.current_myeongha_subject_id()
to myeongha_target_person_create_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
to myeongha_target_person_create_owner;
grant execute on function public.cmd_create_target_person_v1(
  uuid, uuid, uuid, uuid, text, text, text, date, time, boolean, boolean, text, text
) to myeongha_target_person_create_owner;

grant select (id, status, merged_into_subject_id)
on public.subjects to myeongha_target_person_create_owner;
grant update (id)
on public.subjects to myeongha_target_person_create_owner;

grant select (id, subject_id, profile_kind, archived_at)
on public.birth_profiles to myeongha_target_person_create_owner;
grant insert (
  id, subject_id, profile_kind, label, current_revision_id, archived_at, created_at, updated_at
) on public.birth_profiles to myeongha_target_person_create_owner;
grant update (current_revision_id, updated_at)
on public.birth_profiles to myeongha_target_person_create_owner;

grant insert (
  id, birth_profile_id, subject_id, revision_no, calendar_type, birth_date, birth_time,
  time_known, is_leap_month, sex, input_hash, created_at
) on public.birth_profile_revisions to myeongha_target_person_create_owner;

grant insert (
  id, subject_id, birth_profile_id, display_label, relationship_label, created_at, deleted_at
) on public.target_person_profiles to myeongha_target_person_create_owner;

alter table public.target_person_profiles enable row level security;

drop policy if exists target_person_profiles_api_current_select_v1
on public.target_person_profiles;
create policy target_person_profiles_api_current_select_v1
on public.target_person_profiles
for select
to myeongha_api_executor
using (subject_id = public.current_myeongha_subject_id());

grant select (
  id, subject_id, birth_profile_id, display_label, relationship_label, created_at, deleted_at
) on public.target_person_profiles to myeongha_api_executor;

drop policy if exists subjects_target_person_create_select_v1 on public.subjects;
create policy subjects_target_person_create_select_v1
on public.subjects
for select
to myeongha_target_person_create_owner
using (id = public.current_myeongha_subject_id());

drop policy if exists subjects_target_person_create_lock_v1 on public.subjects;
create policy subjects_target_person_create_lock_v1
on public.subjects
for update
to myeongha_target_person_create_owner
using (id = public.current_myeongha_subject_id())
with check (id = public.current_myeongha_subject_id());

drop policy if exists birth_profiles_target_person_create_select_v1
on public.birth_profiles;
create policy birth_profiles_target_person_create_select_v1
on public.birth_profiles
for select
to myeongha_target_person_create_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists birth_profiles_target_person_create_insert_v1
on public.birth_profiles;
create policy birth_profiles_target_person_create_insert_v1
on public.birth_profiles
for insert
to myeongha_target_person_create_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and profile_kind = 'target'
  and archived_at is null
);

drop policy if exists birth_profiles_target_person_create_update_v1
on public.birth_profiles;
create policy birth_profiles_target_person_create_update_v1
on public.birth_profiles
for update
to myeongha_target_person_create_owner
using (
  subject_id = public.current_myeongha_subject_id()
  and profile_kind = 'target'
)
with check (
  subject_id = public.current_myeongha_subject_id()
  and profile_kind = 'target'
);

drop policy if exists birth_profile_revisions_target_person_create_insert_v1
on public.birth_profile_revisions;
create policy birth_profile_revisions_target_person_create_insert_v1
on public.birth_profile_revisions
for insert
to myeongha_target_person_create_owner
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists target_person_profiles_target_person_create_insert_v1
on public.target_person_profiles;
create policy target_person_profiles_target_person_create_insert_v1
on public.target_person_profiles
for insert
to myeongha_target_person_create_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and deleted_at is null
);

create or replace function public.cmd_create_target_person_runtime_v1(
  p_subject_id uuid,
  p_target_person_id uuid,
  p_birth_profile_id uuid,
  p_revision_id uuid,
  p_display_label text,
  p_relationship_label text,
  p_calendar_type text,
  p_birth_date date,
  p_birth_time time,
  p_time_known boolean,
  p_is_leap_month boolean,
  p_sex text,
  p_input_hash text
)
returns table (
  target_person_id uuid,
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
      constraint = 'target_person_create_runtime_input_hash_format',
      message = 'production Target Person Birth input fingerprint is invalid';
  end if;

  return query
  select core.target_person_id,
         core.birth_profile_id,
         core.revision_id,
         core.revision_no
  from public.cmd_create_target_person_v1(
    p_subject_id,
    p_target_person_id,
    p_birth_profile_id,
    p_revision_id,
    p_display_label,
    p_relationship_label,
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

grant myeongha_target_person_create_owner to current_user;
grant create on schema public to myeongha_target_person_create_owner;

alter function public.cmd_create_target_person_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, date, time, boolean, boolean, text, text
) owner to myeongha_target_person_create_owner;

revoke all on function public.cmd_create_target_person_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, date, time, boolean, boolean, text, text
) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_create_target_person_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,date,time,boolean,boolean,text,text) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_create_target_person_runtime_v1(
  uuid, uuid, uuid, uuid, text, text, text, date, time, boolean, boolean, text, text
) to myeongha_api_executor;

revoke create on schema public from myeongha_target_person_create_owner;
revoke myeongha_target_person_create_owner from current_user;

DO $$
DECLARE
  v_owner_oid oid;
  v_server_version_num integer := current_setting('server_version_num')::integer;
  v_membership_count integer;
  v_expected_admin_count integer;
BEGIN
  SELECT r.oid INTO STRICT v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_target_person_create_owner';

  SELECT count(*) INTO v_membership_count
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid = v_owner_oid;

  IF v_server_version_num >= 160000 THEN
    SELECT count(*) INTO v_expected_admin_count
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
    JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid = m.grantor
    WHERE m.roleid = v_owner_oid
      AND member_role.rolname = CURRENT_USER
      AND m.admin_option
      AND NOT m.inherit_option
      AND NOT m.set_option
      AND grantor_role.rolsuper;

    IF v_membership_count NOT IN (0, 1)
       OR (v_membership_count = 1 AND v_expected_admin_count <> 1) THEN
      RAISE EXCEPTION 'myeongha_target_person_create_owner did not return to the PostgreSQL 16+ admin-only creator membership contract';
    END IF;
  ELSIF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_target_person_create_owner retained unexpected pre-PostgreSQL-16 membership';
  END IF;

  IF NOT has_schema_privilege(
    'myeongha_target_person_create_owner', 'public', 'USAGE'
  ) OR has_schema_privilege(
    'myeongha_target_person_create_owner', 'public', 'CREATE'
  ) THEN
    RAISE EXCEPTION 'myeongha_target_person_create_owner retained unexpected schema privilege';
  END IF;
END
$$;
