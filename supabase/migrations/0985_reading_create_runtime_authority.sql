-- Production direct Reading create command-only runtime authority.
--
-- POST /api/readings may create only a source-safe logical Reading Session/Reading pair.
-- The Reading remains execution_status='pending': this authority cannot prepare transport,
-- finalize provider output, write reading_refs, or mark a Reading succeeded. Canonical
-- ProductReadingResponse semantic validation remains a separate authority boundary.

DO $$
DECLARE
  v_owner_oid oid;
  v_server_version_num integer := current_setting('server_version_num')::integer;
  v_membership_count integer;
  v_expected_admin_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_reading_create_owner'
  ) THEN
    CREATE ROLE myeongha_reading_create_owner
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION NOBYPASSRLS;
  END IF;

  SELECT r.oid INTO v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_reading_create_owner'
    AND NOT r.rolcanlogin
    AND NOT r.rolsuper
    AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole
    AND NOT r.rolinherit
    AND NOT r.rolreplication
    AND NOT r.rolbypassrls;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'myeongha_reading_create_owner is outside the least-privilege role contract';
  END IF;

  SELECT count(*) INTO v_membership_count
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid = v_owner_oid;

  IF v_server_version_num >= 160000 THEN
    -- PostgreSQL 16+ may create one automatic ADMIN-only creator membership for a
    -- non-superuser CREATEROLE principal. A bootstrap superuser creator needs no such
    -- membership, so zero rows is also valid. Any row that exists must be exactly the
    -- non-runtime management-plane shape: ADMIN true, INHERIT/SET false, superuser grantor.
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

    IF v_membership_count > 1 OR v_membership_count <> v_expected_admin_count THEN
      RAISE EXCEPTION 'myeongha_reading_create_owner has unexpected PostgreSQL 16+ creator membership';
    END IF;
  ELSIF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_reading_create_owner has unexpected pre-PostgreSQL-16 membership';
  END IF;
END
$$;

grant usage on schema public to myeongha_reading_create_owner;
grant execute on function public.current_myeongha_subject_id()
to myeongha_reading_create_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
to myeongha_reading_create_owner;
grant execute on function public.cmd_create_reading_session_v1(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, uuid,
  uuid, uuid, text, uuid
) to myeongha_reading_create_owner;

-- The legacy atomic command locks the selected Birth root with FOR UPDATE, so the
-- command owner needs SELECT plus UPDATE(id). RLS keeps that lock owner-scoped.
grant select (id, subject_id, profile_kind, current_revision_id)
on public.birth_profiles
to myeongha_reading_create_owner;
grant update (id)
on public.birth_profiles
to myeongha_reading_create_owner;

drop policy if exists birth_profiles_reading_create_select_v1 on public.birth_profiles;
create policy birth_profiles_reading_create_select_v1
on public.birth_profiles
for select
to myeongha_reading_create_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists birth_profiles_reading_create_lock_v1 on public.birth_profiles;
create policy birth_profiles_reading_create_lock_v1
on public.birth_profiles
for update
to myeongha_reading_create_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

-- Domain runtime is non-user reference authority. Only the availability/version columns
-- consumed by the create command are visible to this owner.
grant select (saju_domain, availability, capability_version)
on public.saju_domain_runtime
to myeongha_reading_create_owner;

-- reading_sessions does not yet have a general ordinary-user runtime surface. The
-- NOLOGIN owner receives only the columns required by the atomic create command; the
-- wrapper binds p_subject_id to the transaction-local canonical Subject before entry.
grant select (
  id, subject_id, source_birth_revision_id, target_birth_revision_id,
  domain_capability_version
)
on public.reading_sessions
to myeongha_reading_create_owner;
grant insert (
  id, subject_id, saju_domain, domain_capability_version,
  source_birth_revision_id, target_birth_revision_id, state,
  next_attempt_no, current_reading_id, created_at, updated_at
)
on public.reading_sessions
to myeongha_reading_create_owner;
grant update (current_reading_id, next_attempt_no, updated_at)
on public.reading_sessions
to myeongha_reading_create_owner;

-- readings already has RLS from the Records Reading History authority. Add a dedicated
-- current-subject policy for this NOLOGIN command owner without widening executor DML.
grant select (
  id, reading_session_id, subject_id, attempt_no,
  request_idempotency_key, request_hash
)
on public.readings
to myeongha_reading_create_owner;
grant insert (
  id, reading_session_id, subject_id, saju_domain, attempt_no,
  parent_reading_id, source_turn_id, requested_thread_character_id,
  requested_character_id, requested_character_content_bundle_id,
  execution_status, request_idempotency_key, request_hash,
  request_contract_version, request_snapshot_jsonb,
  next_execution_attempt_no, committed_execution_attempt_id,
  created_at, completed_at
)
on public.readings
to myeongha_reading_create_owner;

drop policy if exists readings_reading_create_select_v1 on public.readings;
create policy readings_reading_create_select_v1
on public.readings
for select
to myeongha_reading_create_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists readings_reading_create_insert_v1 on public.readings;
create policy readings_reading_create_insert_v1
on public.readings
for insert
to myeongha_reading_create_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and execution_status = 'pending'
  and committed_execution_attempt_id is null
  and completed_at is null
);

create or replace function public.cmd_create_reading_session_runtime_v1(
  p_subject_id uuid,
  p_reading_session_id uuid,
  p_reading_id uuid,
  p_request_idempotency_key text,
  p_request_hash text,
  p_request_contract_version text,
  p_request_snapshot_jsonb jsonb,
  p_saju_domain text,
  p_source_birth_profile_id uuid,
  p_target_birth_profile_id uuid,
  p_source_turn_id uuid,
  p_requested_thread_character_id uuid,
  p_requested_character_id text,
  p_requested_character_content_bundle_id uuid
)
returns table (
  reading_session_id uuid,
  reading_id uuid,
  attempt_no integer,
  source_birth_revision_id uuid,
  target_birth_revision_id uuid,
  domain_capability_version text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_request_hash is null
     or p_request_hash !~ '^sha256:v1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'reading_create_runtime_request_hash_format',
      message = 'production Reading request hash is invalid';
  end if;

  if p_request_contract_version is distinct from 'reading-request-v1'
     or p_request_snapshot_jsonb is null
     or jsonb_typeof(p_request_snapshot_jsonb) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'reading_create_runtime_request_contract',
      message = 'production Reading request contract is invalid';
  end if;

  if p_target_birth_profile_id is not null
     or p_source_turn_id is not null
     or p_requested_thread_character_id is not null
     or p_requested_character_id is not null
     or p_requested_character_content_bundle_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'reading_create_runtime_direct_only',
      message = 'production Reading create runtime accepts only the direct source-safe baseline';
  end if;

  return query
  select core.reading_session_id,
         core.reading_id,
         core.attempt_no,
         core.source_birth_revision_id,
         core.target_birth_revision_id,
         core.domain_capability_version,
         core.replayed
  from public.cmd_create_reading_session_v1(
    p_subject_id,
    p_reading_session_id,
    p_reading_id,
    p_request_idempotency_key,
    p_request_hash,
    p_request_contract_version,
    p_request_snapshot_jsonb,
    p_saju_domain,
    p_source_birth_profile_id,
    null,
    null,
    null,
    null,
    null
  ) core;
end;
$$;

grant myeongha_reading_create_owner to current_user;
grant create on schema public to myeongha_reading_create_owner;

alter function public.cmd_create_reading_session_runtime_v1(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, uuid,
  uuid, uuid, text, uuid
) owner to myeongha_reading_create_owner;

revoke all on function public.cmd_create_reading_session_runtime_v1(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, uuid,
  uuid, uuid, text, uuid
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
      'revoke all on function public.cmd_create_reading_session_runtime_v1(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,uuid,uuid,uuid,text,uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_create_reading_session_runtime_v1(
  uuid, uuid, uuid, text, text, text, jsonb, text, uuid, uuid,
  uuid, uuid, text, uuid
) to myeongha_api_executor;

revoke create on schema public from myeongha_reading_create_owner;
revoke myeongha_reading_create_owner from current_user;

DO $$
DECLARE
  v_owner_oid oid;
  v_server_version_num integer := current_setting('server_version_num')::integer;
  v_membership_count integer;
  v_expected_admin_count integer;
BEGIN
  SELECT r.oid INTO STRICT v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_reading_create_owner';

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

    IF v_membership_count > 1 OR v_membership_count <> v_expected_admin_count THEN
      RAISE EXCEPTION 'myeongha_reading_create_owner retained unexpected PostgreSQL 16+ creator membership';
    END IF;
  ELSIF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_reading_create_owner retained unexpected pre-PostgreSQL-16 membership';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_create_reading_session_runtime_v1(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,uuid,uuid,uuid,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor lacks Reading create runtime EXECUTE';
  END IF;

  IF has_table_privilege('myeongha_api_executor', 'public.readings', 'INSERT')
     OR has_table_privilege('myeongha_api_executor', 'public.reading_sessions', 'INSERT') then
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly has direct Reading create DML';
  END IF;
END
$$;
