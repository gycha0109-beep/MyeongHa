-- Production Device Installation registration/re-registration authority.
--
-- Product-owner decision 2026-10-02 resolves SRC-19 for the Expo Push mobile
-- registration lifecycle only:
-- - same subject + active installation key refreshes the current row in place;
-- - push-token rotation updates that same active row;
-- - the same token moving to another installation key for the same subject revokes
--   the prior active row and creates a new server-owned row;
-- - revoked rows are never resurrected;
-- - another subject cannot claim an active installation key or token until revoke;
-- - app_version, client_capability, and last_seen_at refresh on successful register.
--
-- This does not authorize notification scheduling (SRC-32) or delivery-provider
-- resolution/sending (SRC-31).

create or replace function public.cmd_register_device_installation_v1(
  p_subject_id uuid,
  p_installation_id uuid,
  p_platform text,
  p_installation_key text,
  p_push_token_encrypted text,
  p_push_token_key_id text,
  p_token_fingerprint text,
  p_app_version text,
  p_client_capability text
)
returns table (
  installation_id uuid,
  registration_state text,
  token_changed boolean,
  last_seen_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $device_register$
declare
  v_now timestamptz := clock_timestamp();
  v_subject_id uuid;
  v_current_id uuid;
  v_current_fingerprint text;
  v_token_id uuid;
  v_token_changed boolean := false;
  v_state text := 'created';
  v_lock_a bigint;
  v_lock_b bigint;
begin
  if p_subject_id is null
     or p_installation_id is null
     or p_platform not in ('ios', 'android')
     or p_installation_key is null
     or length(p_installation_key) < 8
     or length(p_installation_key) > 128
     or p_installation_key ~ '[[:space:][:cntrl:]]'
     or p_push_token_encrypted is null
     or p_push_token_encrypted !~ '^aes-256-gcm:k1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
     or p_push_token_key_id is distinct from 'k1'
     or p_token_fingerprint is null
     or p_token_fingerprint !~ '^hmac-sha256:k1:[0-9a-f]{64}$'
     or p_app_version is null
     or p_app_version !~ '^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$'
     or p_client_capability is distinct from 'mobile-push-registration-v1' then
    raise exception using
      errcode = '23514',
      constraint = 'device_installation_registration_input_invalid',
      message = 'device installation registration input is invalid';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'myeongha:device-installation:subject:' || p_subject_id::text,
      0
    )
  );

  v_lock_a := pg_catalog.hashtextextended(
    'myeongha:device-installation:key:' || p_platform || ':' || p_installation_key,
    0
  );
  v_lock_b := pg_catalog.hashtextextended(
    'myeongha:device-installation:token:' || p_token_fingerprint,
    0
  );
  if v_lock_a <= v_lock_b then
    perform pg_catalog.pg_advisory_xact_lock(v_lock_a);
    if v_lock_b <> v_lock_a then
      perform pg_catalog.pg_advisory_xact_lock(v_lock_b);
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_lock_b);
    perform pg_catalog.pg_advisory_xact_lock(v_lock_a);
  end if;

  select s.id
    into v_subject_id
  from public.subjects s
  where s.id = p_subject_id
    and s.status = 'active'
    and s.merged_into_subject_id is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'device_installation_registration_subject_ineligible',
      message = 'device installation registration requires an active canonical subject';
  end if;

  select di.id, di.token_fingerprint
    into v_current_id, v_current_fingerprint
  from public.device_installations di
  where di.subject_id = p_subject_id
    and di.platform = p_platform
    and di.installation_key = p_installation_key
    and di.revoked_at is null
  for update;

  if found then
    select di.id
      into v_token_id
    from public.device_installations di
    where di.subject_id = p_subject_id
      and di.token_fingerprint = p_token_fingerprint
      and di.revoked_at is null
      and di.id <> v_current_id
    for update;

    if found then
      update public.device_installations di
      set revoked_at = v_now,
          last_seen_at = v_now
      where di.id = v_token_id
        and di.subject_id = p_subject_id
        and di.revoked_at is null;
    end if;

    v_token_changed := v_current_fingerprint is distinct from p_token_fingerprint;

    begin
      update public.device_installations di
      set push_token_encrypted = p_push_token_encrypted,
          push_token_key_id = p_push_token_key_id,
          token_fingerprint = p_token_fingerprint,
          app_version = p_app_version,
          client_capability = p_client_capability,
          last_seen_at = v_now
      where di.id = v_current_id
        and di.subject_id = p_subject_id
        and di.revoked_at is null;
    exception
      when unique_violation then
        raise exception using
          errcode = '23505',
          constraint = 'device_installation_registration_conflict',
          message = 'device installation identity is already active';
    end;

    return query
    select v_current_id, 'refreshed'::text, v_token_changed, v_now;
    return;
  end if;

  select di.id
    into v_token_id
  from public.device_installations di
  where di.subject_id = p_subject_id
    and di.token_fingerprint = p_token_fingerprint
    and di.revoked_at is null
  for update;

  if found then
    update public.device_installations di
    set revoked_at = v_now,
        last_seen_at = v_now
    where di.id = v_token_id
      and di.subject_id = p_subject_id
      and di.revoked_at is null;
    v_state := 'rebound';
  end if;

  begin
    insert into public.device_installations (
      id,
      subject_id,
      platform,
      installation_key,
      push_token_encrypted,
      push_token_key_id,
      token_fingerprint,
      app_version,
      client_capability,
      last_seen_at,
      revoked_at,
      created_at
    ) values (
      p_installation_id,
      p_subject_id,
      p_platform,
      p_installation_key,
      p_push_token_encrypted,
      p_push_token_key_id,
      p_token_fingerprint,
      p_app_version,
      p_client_capability,
      v_now,
      null,
      v_now
    );
  exception
    when unique_violation then
      raise exception using
        errcode = '23505',
        constraint = 'device_installation_registration_conflict',
        message = 'device installation identity is already active';
  end;

  return query
  select p_installation_id, v_state, false, v_now;
end;
$device_register$;

revoke all on function public.cmd_register_device_installation_v1(
  uuid, uuid, text, text, text, text, text, text, text
) from public;

DO $$
DECLARE
  v_role record;
  v_marker text;
  v_expected_marker constant text := 'myeongha:device-installation-owner:v1';
BEGIN
  SELECT
    oid,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls
  INTO v_role
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_device_installation_owner';

  IF NOT FOUND THEN
    CREATE ROLE myeongha_device_installation_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;

    COMMENT ON ROLE myeongha_device_installation_owner IS
      'myeongha:device-installation-owner:v1';
  ELSE
    v_marker := pg_catalog.shobj_description(v_role.oid, 'pg_authid');
    IF v_marker IS DISTINCT FROM v_expected_marker THEN
      RAISE EXCEPTION 'myeongha_device_installation_owner exists without the managed role marker';
    END IF;
    IF v_role.rolcanlogin
       OR v_role.rolsuper
       OR v_role.rolcreatedb
       OR v_role.rolcreaterole
       OR v_role.rolinherit
       OR v_role.rolreplication
       OR v_role.rolbypassrls THEN
      RAISE EXCEPTION 'managed Device Installation owner violates least-privilege role shape';
    END IF;
  END IF;
END
$$;

grant usage on schema public to myeongha_device_installation_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_device_installation_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_device_installation_owner;
grant execute on function public.cmd_register_device_installation_v1(
  uuid, uuid, text, text, text, text, text, text, text
) to myeongha_device_installation_owner;
grant execute on function public.cmd_revoke_device_installation_v1(uuid, uuid)
  to myeongha_device_installation_owner;

grant select (id, status, merged_into_subject_id)
  on public.subjects
  to myeongha_device_installation_owner;
grant update (id)
  on public.subjects
  to myeongha_device_installation_owner;

grant select (
  id, subject_id, platform, installation_key, token_fingerprint,
  revoked_at, last_seen_at
)
  on public.device_installations
  to myeongha_device_installation_owner;
grant insert (
  id, subject_id, platform, installation_key, push_token_encrypted,
  push_token_key_id, token_fingerprint, app_version, client_capability,
  last_seen_at, revoked_at, created_at
)
  on public.device_installations
  to myeongha_device_installation_owner;
grant update (
  push_token_encrypted, push_token_key_id, token_fingerprint,
  app_version, client_capability, last_seen_at, revoked_at
)
  on public.device_installations
  to myeongha_device_installation_owner;

drop policy if exists subjects_device_installation_owner_select_v1
  on public.subjects;
create policy subjects_device_installation_owner_select_v1
on public.subjects
for select
to myeongha_device_installation_owner
using (id = public.current_myeongha_subject_id());

drop policy if exists subjects_device_installation_owner_update_v1
  on public.subjects;
create policy subjects_device_installation_owner_update_v1
on public.subjects
for update
to myeongha_device_installation_owner
using (id = public.current_myeongha_subject_id())
with check (id = public.current_myeongha_subject_id());

drop policy if exists device_installations_registration_owner_select_v1
  on public.device_installations;
create policy device_installations_registration_owner_select_v1
on public.device_installations
for select
to myeongha_device_installation_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists device_installations_registration_owner_insert_v1
  on public.device_installations;
create policy device_installations_registration_owner_insert_v1
on public.device_installations
for insert
to myeongha_device_installation_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and revoked_at is null
);

drop policy if exists device_installations_registration_owner_update_v1
  on public.device_installations;
create policy device_installations_registration_owner_update_v1
on public.device_installations
for update
to myeongha_device_installation_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

create or replace function public.cmd_register_device_installation_runtime_v1(
  p_subject_id uuid,
  p_installation_id uuid,
  p_platform text,
  p_installation_key text,
  p_push_token_encrypted text,
  p_push_token_key_id text,
  p_token_fingerprint text,
  p_app_version text,
  p_client_capability text
)
returns table (
  installation_id uuid,
  registration_state text,
  token_changed boolean,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $device_register_runtime$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return query
  select core.installation_id,
         core.registration_state,
         core.token_changed,
         core.last_seen_at
  from public.cmd_register_device_installation_v1(
    p_subject_id,
    p_installation_id,
    p_platform,
    p_installation_key,
    p_push_token_encrypted,
    p_push_token_key_id,
    p_token_fingerprint,
    p_app_version,
    p_client_capability
  ) core;
end;
$device_register_runtime$;

create or replace function public.cmd_revoke_device_installation_runtime_v1(
  p_subject_id uuid,
  p_installation_id uuid
)
returns table (
  installation_id uuid,
  revoked_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $device_revoke_runtime$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return query
  select core.installation_id,
         core.revoked_at,
         core.replayed
  from public.cmd_revoke_device_installation_v1(
    p_subject_id,
    p_installation_id
  ) core;
end;
$device_revoke_runtime$;

grant myeongha_device_installation_owner to current_user;
grant create on schema public to myeongha_device_installation_owner;

alter function public.cmd_register_device_installation_runtime_v1(
  uuid, uuid, text, text, text, text, text, text, text
) owner to myeongha_device_installation_owner;
alter function public.cmd_revoke_device_installation_runtime_v1(uuid, uuid)
  owner to myeongha_device_installation_owner;

revoke all on function public.cmd_register_device_installation_runtime_v1(
  uuid, uuid, text, text, text, text, text, text, text
) from public;
revoke all on function public.cmd_revoke_device_installation_runtime_v1(uuid, uuid)
  from public;

revoke all on function public.cmd_register_device_installation_v1(
  uuid, uuid, text, text, text, text, text, text, text
) from myeongha_api_executor;
revoke all on function public.cmd_revoke_device_installation_v1(uuid, uuid)
  from myeongha_api_executor;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN (
      'anon',
      'authenticated',
      'service_role',
      'myeongha_runtime',
      'myeongha_worker_runtime',
      'myeongha_system_executor'
    )
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_register_device_installation_v1(uuid,uuid,text,text,text,text,text,text,text) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_register_device_installation_runtime_v1(uuid,uuid,text,text,text,text,text,text,text) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_revoke_device_installation_runtime_v1(uuid,uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_register_device_installation_runtime_v1(
  uuid, uuid, text, text, text, text, text, text, text
) to myeongha_api_executor;
grant execute on function public.cmd_revoke_device_installation_runtime_v1(uuid, uuid)
  to myeongha_api_executor;

revoke create on schema public from myeongha_device_installation_owner;
revoke myeongha_device_installation_owner from current_user;

DO $$
DECLARE
  v_register_owner text;
  v_revoke_owner text;
  v_register_definer boolean;
  v_revoke_definer boolean;
BEGIN
  select owner_role.rolname, p.prosecdef
    into v_register_owner, v_register_definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
  where p.oid = 'public.cmd_register_device_installation_runtime_v1(uuid,uuid,text,text,text,text,text,text,text)'::pg_catalog.regprocedure;

  select owner_role.rolname, p.prosecdef
    into v_revoke_owner, v_revoke_definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
  where p.oid = 'public.cmd_revoke_device_installation_runtime_v1(uuid,uuid)'::pg_catalog.regprocedure;

  IF v_register_owner IS DISTINCT FROM 'myeongha_device_installation_owner'
     OR v_revoke_owner IS DISTINCT FROM 'myeongha_device_installation_owner'
     OR v_register_definer IS DISTINCT FROM true
     OR v_revoke_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Device Installation runtime wrappers lost dedicated SECURITY DEFINER ownership';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_register_device_installation_runtime_v1(uuid,uuid,text,text,text,text,text,text,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_revoke_device_installation_runtime_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor cannot execute Device Installation runtime wrappers';
  END IF;

  IF pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_register_device_installation_v1(uuid,uuid,text,text,text,text,text,text,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_revoke_device_installation_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly bypasses Device Installation runtime wrappers';
  END IF;

  IF pg_catalog.has_table_privilege(
    'myeongha_api_executor',
    'public.device_installations',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'myeongha_api_executor',
    'public.device_installations',
    'UPDATE'
  ) THEN
    RAISE EXCEPTION 'Device Installation activation leaked direct table mutation authority to API executor';
  END IF;
END
$$;
