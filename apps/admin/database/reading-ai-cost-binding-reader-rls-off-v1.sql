-- A4 OWNER-APPROVED RLS-OFF CANDIDATE: validate in clean CI before Production.
-- Actual Source/DB binding and credential installation are separate gates.
-- No login secret, no Worker binding, no user/credit/payment mutations.
-- Complements the terminal-attempt-only A4 database verifier.
BEGIN;

DO $a4_binding_reader_preflight$
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Expected isolated managed installer';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles
             WHERE rolname='myeongha_reading_ai_cost_binding_reader_v1')
    OR EXISTS (SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='reading_execution_attempts'
         AND policyname='reading_ai_cost_binding_reader_v1') THEN
    RAISE EXCEPTION 'Reading AI binding reader already exists: reconcile, do not replay';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='reading_execution_attempts'
      AND t.relkind IN ('r','p') AND NOT t.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='myeongha_reading_ai_cost_writer_v1'
  ) THEN
    RAISE EXCEPTION 'Installed Reading attempt and AI cost foundation required';
  END IF;
  -- A restrictive policy could make a globally unique external ref appear
  -- unique within the reader's limited visibility. Refuse that environment.
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid='public.reading_execution_attempts'::regclass
      AND NOT p.polpermissive
  ) THEN
    RAISE EXCEPTION 'Unexpected restrictive RLS policy on RLS-off candidate';
  END IF;
END
$a4_binding_reader_preflight$;

-- No password at installation. An isolated future credential requires its
-- own Owner approval and secure distribution; not configured by this script.
CREATE ROLE myeongha_reading_ai_cost_binding_reader_v1
  LOGIN PASSWORD NULL NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;

-- Supabase creates an unavoidable admin-only membership for the managed
-- postgres installer, granted by supabase_admin. This MUST confer neither
-- SET ROLE nor inherited access; the postflight permits only that exact link.

GRANT USAGE ON SCHEMA public TO myeongha_reading_ai_cost_binding_reader_v1;
-- Only columns needed for exact, globally unique terminal-attempt lookup.
GRANT SELECT (id,reading_id,subject_id,external_request_ref,state)
  ON public.reading_execution_attempts
  TO myeongha_reading_ai_cost_binding_reader_v1;
-- RLS is currently OFF on this pre-existing Production table. Do not
-- silently change its policy mode: role-scoped column GRANT is sufficient
-- for this dedicated non-inheriting principal. No policy is installed.

DO $a4_binding_reader_postflight$
BEGIN
  IF (SELECT count(*) FROM pg_roles
      WHERE rolname='myeongha_reading_ai_cost_binding_reader_v1'
        AND rolcanlogin AND NOT rolinherit AND NOT rolsuper
        AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
        AND NOT rolbypassrls) <> 1
    OR EXISTS (
      -- A real managed Supabase installer receives one ADMIN-only membership
      -- from supabase_admin. No SET/INHERIT grant, or any other link, is allowed.
      SELECT 1 FROM pg_auth_members m
      WHERE (m.roleid=(SELECT oid FROM pg_roles
                     WHERE rolname='myeongha_reading_ai_cost_binding_reader_v1')
             OR m.member=(SELECT oid FROM pg_roles
                     WHERE rolname='myeongha_reading_ai_cost_binding_reader_v1'))
        AND NOT (
          m.roleid=(SELECT oid FROM pg_roles
                    WHERE rolname='myeongha_reading_ai_cost_binding_reader_v1')
          AND m.member=(SELECT oid FROM pg_roles WHERE rolname='postgres')
          AND m.grantor=(SELECT oid FROM pg_roles WHERE rolname='supabase_admin')
          AND NOT m.inherit_option AND NOT m.set_option AND m.admin_option
        )
    )
    OR has_table_privilege('myeongha_reading_ai_cost_binding_reader_v1',
      'public.reading_execution_attempts','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    OR has_schema_privilege('myeongha_reading_ai_cost_binding_reader_v1','public','CREATE')
    -- has_table_privilege('SELECT') also returns true for column-only grants.
    -- Inspect the relation ACL itself so five-column SELECT is not mistaken
    -- for an unrestricted table SELECT grant.
    OR EXISTS (
      SELECT 1
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(
        coalesce(c.relacl, acldefault('r', c.relowner))
      ) acl
      WHERE c.oid = 'public.reading_execution_attempts'::regclass
        AND acl.privilege_type = 'SELECT'
        AND acl.grantee IN (
          0,
          (SELECT oid FROM pg_roles
           WHERE rolname = 'myeongha_reading_ai_cost_binding_reader_v1')
        )
    )
    OR has_column_privilege('myeongha_reading_ai_cost_binding_reader_v1',
      'public.reading_execution_attempts','started_at','SELECT')
    OR (SELECT count(*) FROM (
      VALUES ('id'),('reading_id'),('subject_id'),
             ('external_request_ref'),('state')
    ) AS cols(name)
      WHERE has_column_privilege('myeongha_reading_ai_cost_binding_reader_v1',
         'public.reading_execution_attempts',cols.name,'SELECT')) <> 5
    OR (SELECT relrowsecurity FROM pg_class WHERE oid='public.reading_execution_attempts'::regclass)
  THEN
    RAISE EXCEPTION 'Reading AI binding reader violates least privilege';
  END IF;
END
$a4_binding_reader_postflight$;
COMMIT;
