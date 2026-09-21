-- Production account-deletion start runtime authority.
--
-- Ordinary requests enter through myeongha_api_executor with a transaction-local
-- canonical subject. The historical core command remains SECURITY INVOKER and closed
-- to the API executor; this migration exposes one narrow SECURITY DEFINER wrapper
-- owned by a dedicated NOLOGIN/NOBYPASSRLS role.
--
-- The wrapper asserts the already-bound subject before delegating to the existing
-- cmd_start_account_deletion_v1 transaction. The owner receives only the table
-- capabilities required by that command.

DO $$
DECLARE
  v_role record;
  v_marker text;
  v_expected_marker constant text := 'myeongha:account-deletion-start-owner:v1';
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
  WHERE rolname = 'myeongha_account_deletion_start_owner';

  IF NOT FOUND THEN
    CREATE ROLE myeongha_account_deletion_start_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;

    COMMENT ON ROLE myeongha_account_deletion_start_owner IS
      'myeongha:account-deletion-start-owner:v1';
  ELSE
    v_marker := pg_catalog.shobj_description(v_role.oid, 'pg_authid');

    IF v_marker IS DISTINCT FROM v_expected_marker THEN
      RAISE EXCEPTION 'myeongha_account_deletion_start_owner exists without the managed role marker';
    END IF;

    IF v_role.rolcanlogin
       OR v_role.rolsuper
       OR v_role.rolcreatedb
       OR v_role.rolcreaterole
       OR v_role.rolinherit
       OR v_role.rolreplication
       OR v_role.rolbypassrls THEN
      RAISE EXCEPTION 'managed account-deletion start owner violates least-privilege role shape';
    END IF;
  END IF;
END
$$;

grant usage on schema public to myeongha_account_deletion_start_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_account_deletion_start_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_account_deletion_start_owner;
grant execute on function public.cmd_start_account_deletion_v1(uuid, uuid, text, uuid)
  to myeongha_account_deletion_start_owner;

grant select (id, kind, status)
  on public.subjects
  to myeongha_account_deletion_start_owner;
grant update (status, updated_at)
  on public.subjects
  to myeongha_account_deletion_start_owner;

grant select (id, subject_id, scope, request_dedupe_key, status)
  on public.data_deletion_jobs
  to myeongha_account_deletion_start_owner;
grant insert (
  id, subject_id, scope, target_resource_type, target_resource_id,
  request_dedupe_key, status, retention_exceptions_jsonb,
  requested_at, started_at, completed_at, error_code
)
  on public.data_deletion_jobs
  to myeongha_account_deletion_start_owner;

grant select (subject_id, status, revoked_at)
  on public.share_artifacts
  to myeongha_account_deletion_start_owner;
grant update (status, revoked_at)
  on public.share_artifacts
  to myeongha_account_deletion_start_owner;

grant select (subject_id, revoked_at)
  on public.device_installations
  to myeongha_account_deletion_start_owner;
grant update (revoked_at)
  on public.device_installations
  to myeongha_account_deletion_start_owner;

grant select (subject_id, status)
  on public.notifications
  to myeongha_account_deletion_start_owner;
grant update (status)
  on public.notifications
  to myeongha_account_deletion_start_owner;

grant insert (
  id, aggregate_type, aggregate_id, event_type, event_schema_version,
  dedupe_key, payload_jsonb, status, attempt_count, available_at, created_at
)
  on public.outbox_events
  to myeongha_account_deletion_start_owner;

drop policy if exists subjects_account_deletion_start_owner_select_v1
  on public.subjects;
create policy subjects_account_deletion_start_owner_select_v1
on public.subjects
for select
to myeongha_account_deletion_start_owner
using (id = public.current_myeongha_subject_id());

drop policy if exists subjects_account_deletion_start_owner_update_v1
  on public.subjects;
create policy subjects_account_deletion_start_owner_update_v1
on public.subjects
for update
to myeongha_account_deletion_start_owner
using (id = public.current_myeongha_subject_id())
with check (id = public.current_myeongha_subject_id());

drop policy if exists data_deletion_jobs_account_deletion_start_owner_select_v1
  on public.data_deletion_jobs;
create policy data_deletion_jobs_account_deletion_start_owner_select_v1
on public.data_deletion_jobs
for select
to myeongha_account_deletion_start_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists data_deletion_jobs_account_deletion_start_owner_insert_v1
  on public.data_deletion_jobs;
create policy data_deletion_jobs_account_deletion_start_owner_insert_v1
on public.data_deletion_jobs
for insert
to myeongha_account_deletion_start_owner
with check (
  subject_id = public.current_myeongha_subject_id()
  and scope = 'account'
);

drop policy if exists share_artifacts_account_deletion_start_owner_select_v1
  on public.share_artifacts;
create policy share_artifacts_account_deletion_start_owner_select_v1
on public.share_artifacts
for select
to myeongha_account_deletion_start_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists share_artifacts_account_deletion_start_owner_update_v1
  on public.share_artifacts;
create policy share_artifacts_account_deletion_start_owner_update_v1
on public.share_artifacts
for update
to myeongha_account_deletion_start_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists device_installations_account_deletion_start_owner_select_v1
  on public.device_installations;
create policy device_installations_account_deletion_start_owner_select_v1
on public.device_installations
for select
to myeongha_account_deletion_start_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists device_installations_account_deletion_start_owner_update_v1
  on public.device_installations;
create policy device_installations_account_deletion_start_owner_update_v1
on public.device_installations
for update
to myeongha_account_deletion_start_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists notifications_account_deletion_start_owner_select_v1
  on public.notifications;
create policy notifications_account_deletion_start_owner_select_v1
on public.notifications
for select
to myeongha_account_deletion_start_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists notifications_account_deletion_start_owner_update_v1
  on public.notifications;
create policy notifications_account_deletion_start_owner_update_v1
on public.notifications
for update
to myeongha_account_deletion_start_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists outbox_events_account_deletion_start_owner_insert_v1
  on public.outbox_events;
create policy outbox_events_account_deletion_start_owner_insert_v1
on public.outbox_events
for insert
to myeongha_account_deletion_start_owner
with check (
  aggregate_type = 'data_deletion_job'
  and event_type = 'ACCOUNT_DELETION_STARTED'
  and event_schema_version = 'v1'
  and dedupe_key = 'account-delete-start-v1'
  and payload_jsonb ->> 'scope' = 'account'
  and payload_jsonb ->> 'subjectId' = public.current_myeongha_subject_id()::text
);

create or replace function public.cmd_start_account_deletion_runtime_v1(
  p_subject_id uuid,
  p_deletion_job_id uuid,
  p_request_dedupe_key text,
  p_outbox_event_id uuid
)
returns table (
  deletion_job_id uuid,
  deletion_job_status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $account_deletion_runtime$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select core.deletion_job_id,
         core.deletion_job_status,
         core.replayed
  from public.cmd_start_account_deletion_v1(
    p_subject_id,
    p_deletion_job_id,
    p_request_dedupe_key,
    p_outbox_event_id
  ) core;
end;
$account_deletion_runtime$;

grant myeongha_account_deletion_start_owner to current_user;
grant create on schema public to myeongha_account_deletion_start_owner;

alter function public.cmd_start_account_deletion_runtime_v1(uuid, uuid, text, uuid)
  owner to myeongha_account_deletion_start_owner;

revoke all on function public.cmd_start_account_deletion_runtime_v1(uuid, uuid, text, uuid)
  from public;
revoke all on function public.cmd_start_account_deletion_v1(uuid, uuid, text, uuid)
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
      'revoke all on function public.cmd_start_account_deletion_runtime_v1(uuid,uuid,text,uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_start_account_deletion_runtime_v1(uuid, uuid, text, uuid)
  to myeongha_api_executor;

revoke create on schema public from myeongha_account_deletion_start_owner;
revoke myeongha_account_deletion_start_owner from current_user;

DO $$
DECLARE
  v_owner text;
  v_security_definer boolean;
BEGIN
  select owner_role.rolname, p.prosecdef
    into v_owner, v_security_definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
  where n.nspname = 'public'
    and p.oid = 'public.cmd_start_account_deletion_runtime_v1(uuid,uuid,text,uuid)'::pg_catalog.regprocedure;

  IF v_owner IS DISTINCT FROM 'myeongha_account_deletion_start_owner'
     OR v_security_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'account-deletion start runtime wrapper lost its dedicated SECURITY DEFINER owner';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_start_account_deletion_runtime_v1(uuid,uuid,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor cannot execute the account-deletion start runtime wrapper';
  END IF;

  IF pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_start_account_deletion_v1(uuid,uuid,text,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly bypasses the account-deletion runtime wrapper';
  END IF;

  IF pg_catalog.has_table_privilege('myeongha_api_executor', 'public.subjects', 'UPDATE')
     OR pg_catalog.has_table_privilege('myeongha_api_executor', 'public.data_deletion_jobs', 'INSERT')
     OR pg_catalog.has_table_privilege('myeongha_api_executor', 'public.outbox_events', 'INSERT') THEN
    RAISE EXCEPTION 'account-deletion runtime activation leaked direct table mutation authority to API executor';
  END IF;
END
$$;
