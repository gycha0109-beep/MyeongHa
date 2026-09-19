-- P0-AUTH-01 system/worker execution identity for account deletion.
--
-- Ordinary API execution remains myeongha_runtime -> myeongha_api_executor.
-- Worker/admin/lifecycle execution uses a separate managed role path.
--
-- This migration provisions role shape and capability grants only. Runtime password/secret
-- material is deliberately not stored in migrations.
--
-- Account deletion gets an event-specific SECURITY DEFINER claim wrapper. The system role
-- receives no generic outbox table CRUD and no EXECUTE on the generic outbox claim command.

DO $$
DECLARE
  v_role record;
  v_marker text;
  v_expected_marker constant text := 'myeongha:system-execution-role:v1';
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
  WHERE rolname = 'myeongha_system_executor';

  IF NOT FOUND THEN
    CREATE ROLE myeongha_system_executor
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;

    COMMENT ON ROLE myeongha_system_executor IS
      'myeongha:system-execution-role:v1';
  ELSE
    v_marker := pg_catalog.shobj_description(v_role.oid, 'pg_authid');

    IF v_marker IS DISTINCT FROM v_expected_marker THEN
      RAISE EXCEPTION 'myeongha_system_executor exists without the managed system role marker';
    END IF;

    IF v_role.rolcanlogin
       OR v_role.rolsuper
       OR v_role.rolcreatedb
       OR v_role.rolcreaterole
       OR v_role.rolinherit
       OR v_role.rolreplication
       OR v_role.rolbypassrls THEN
      RAISE EXCEPTION 'managed myeongha_system_executor violates the P0-AUTH-01 system role shape';
    END IF;
  END IF;
END
$$;

DO $$
DECLARE
  v_role record;
  v_marker text;
  v_expected_marker constant text := 'myeongha:production-worker-login-principal:v1';
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
  WHERE rolname = 'myeongha_worker_runtime';

  IF NOT FOUND THEN
    CREATE ROLE myeongha_worker_runtime
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS
      PASSWORD NULL;

    COMMENT ON ROLE myeongha_worker_runtime IS
      'myeongha:production-worker-login-principal:v1';
  ELSE
    v_marker := pg_catalog.shobj_description(v_role.oid, 'pg_authid');

    IF v_marker IS DISTINCT FROM v_expected_marker THEN
      RAISE EXCEPTION 'myeongha_worker_runtime exists without the managed worker principal marker';
    END IF;

    IF NOT v_role.rolcanlogin
       OR v_role.rolsuper
       OR v_role.rolcreatedb
       OR v_role.rolcreaterole
       OR v_role.rolinherit
       OR v_role.rolreplication
       OR v_role.rolbypassrls THEN
      RAISE EXCEPTION 'managed myeongha_worker_runtime violates the production worker login shape';
    END IF;
  END IF;
END
$$;

grant myeongha_system_executor to myeongha_worker_runtime;

-- Fail closed if ordinary API identities ever acquire the system worker role.
DO $$
BEGIN
  IF pg_catalog.pg_has_role(
    'myeongha_runtime',
    'myeongha_system_executor',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'ordinary myeongha_runtime must not enter myeongha_system_executor';
  END IF;

  IF pg_catalog.pg_has_role(
    'myeongha_api_executor',
    'myeongha_system_executor',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'ordinary myeongha_api_executor must not enter myeongha_system_executor';
  END IF;

  IF pg_catalog.pg_has_role(
    'myeongha_system_executor',
    'myeongha_api_executor',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'system executor must not inherit ordinary API execution authority';
  END IF;

  IF NOT pg_catalog.pg_has_role(
    'myeongha_worker_runtime',
    'myeongha_system_executor',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'worker runtime cannot enter myeongha_system_executor';
  END IF;
END
$$;

create or replace function public.internal_claim_account_deletion_outbox_v1(
  p_outbox_event_id uuid,
  p_lock_owner text,
  p_lease_expires_at timestamptz
)
returns table (
  outbox_event_id uuid,
  subject_id uuid,
  deletion_job_id uuid,
  reclaimed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $account_deletion_claim$
declare
  v_claim record;
  v_subject_id uuid;
  v_deletion_job_id uuid;
  v_payload_subject_text text;
  v_payload_job_text text;
begin
  select *
    into v_claim
  from public.cmd_claim_outbox_event_v1(
    p_outbox_event_id,
    p_lock_owner,
    p_lease_expires_at
  );

  if v_claim.aggregate_type is distinct from 'data_deletion_job'
     or v_claim.event_type is distinct from 'ACCOUNT_DELETION_STARTED'
     or v_claim.event_schema_version is distinct from 'v1'
     or v_claim.dedupe_key is distinct from 'account-delete-start-v1'
     or pg_catalog.jsonb_typeof(v_claim.payload_jsonb) is distinct from 'object'
     or v_claim.payload_jsonb ->> 'scope' is distinct from 'account' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_worker_claim_event_contract_mismatch',
      message = 'worker claim requires the exact ACCOUNT_DELETION_STARTED event contract';
  end if;

  v_payload_subject_text := v_claim.payload_jsonb ->> 'subjectId';
  v_payload_job_text := v_claim.payload_jsonb ->> 'deletionJobId';

  if v_payload_subject_text is null
     or v_payload_job_text is null
     or btrim(v_payload_subject_text) = ''
     or btrim(v_payload_job_text) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_worker_claim_payload_identity_required',
      message = 'account deletion outbox payload requires subjectId and deletionJobId';
  end if;

  begin
    v_subject_id := v_payload_subject_text::uuid;
    v_deletion_job_id := v_payload_job_text::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '23514',
        constraint = 'account_deletion_worker_claim_payload_identity_invalid',
        message = 'account deletion outbox payload identities must be UUIDs';
  end;

  if v_claim.aggregate_id is distinct from v_deletion_job_id::text then
    raise exception using
      errcode = '23514',
      constraint = 'account_deletion_worker_claim_aggregate_mismatch',
      message = 'account deletion outbox aggregate id must match deletionJobId';
  end if;

  return query
  select
    v_claim.outbox_event_id,
    v_subject_id,
    v_deletion_job_id,
    v_claim.reclaimed;
end;
$account_deletion_claim$;

revoke all on function public.internal_claim_account_deletion_outbox_v1(uuid, text, timestamptz) from public;

-- The system executor receives only the account-deletion lifecycle capabilities required
-- by the claimed-worker orchestration. Generic outbox authority stays closed.
revoke execute on function public.cmd_claim_outbox_event_v1(uuid, text, timestamptz)
  from myeongha_system_executor;

grant execute on function public.internal_claim_account_deletion_outbox_v1(uuid, text, timestamptz)
  to myeongha_system_executor;
grant execute on function public.internal_account_deletion_resume_state_v1(uuid, uuid, text)
  to myeongha_system_executor;
grant execute on function public.internal_finalize_account_deletion_db_v1(uuid, uuid, text)
  to myeongha_system_executor;
grant execute on function public.internal_complete_account_deletion_v1(uuid, uuid, text)
  to myeongha_system_executor;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN (
      'public',
      'anon',
      'authenticated',
      'service_role',
      'myeongha_api_executor',
      'myeongha_runtime'
    )
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_claim_account_deletion_outbox_v1(uuid,text,timestamptz) from %I',
      v_role
    );
  END LOOP;
END
$$;
