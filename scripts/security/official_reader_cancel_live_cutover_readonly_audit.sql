-- D3e20-preflight / READ ONLY. Run using an independently approved
-- metadata-only connection; never with payment or customer rows.
-- SELECT pg_catalog metadata ONLY: no GRANT, role switch, DDL, DML,
-- pg_stat_activity query text, credentials, customer ID or API request.
-- Audit evidence is a POINT-IN-TIME OBSERVATION, NOT release authorization.
WITH
required_routines(routine_name) AS (
  VALUES
   ('internal_private_cancel_review_v1'),
   ('internal_private_cancel_commit_review_approval_v1'),
   ('internal_apply_reviewed_official_reader_full_cancel_private_v1'),
   ('internal_apply_entitlement_effect_v1'),
   ('internal_apply_official_reader_verified_cancel_batch_v1'),
   ('internal_execute_official_reader_verified_cancel_v2')
),
identities(role_name) AS (
  VALUES
   ('anon'),('authenticated'),('service_role'),
   ('myeongha_api_executor'),('myeongha_commerce_internal_executor'),
   ('myeongha_seyeon_chat_runtime_owner'),('postgres'),
   ('myeongha_cancel_verifier'),('myeongha_cancel_executor'),
   ('myeongha_cancel_owner')
),
role_evidence AS (
  SELECT i.role_name,
     (r.oid IS NOT NULL) AS role_exists,
     r.rolcanlogin AS can_login,
     r.rolsuper AS superuser,
     r.rolbypassrls AS bypass_rls,
     r.rolcreaterole AS can_create_roles,
     CASE WHEN r.oid IS NOT NULL
       AND (SELECT oid FROM pg_catalog.pg_roles
            WHERE rolname='myeongha_cancel_owner') IS NOT NULL
       THEN pg_catalog.pg_has_role(
         r.oid,
         (SELECT oid FROM pg_catalog.pg_roles
          WHERE rolname='myeongha_cancel_owner'), 'MEMBER')
       ELSE NULL END AS member_of_dedicated_owner
  FROM identities i LEFT JOIN pg_catalog.pg_roles r ON r.rolname=i.role_name
),
function_evidence AS (
  SELECT n.routine_name, count(p.oid) AS matching_overloads,
    pg_catalog.string_agg(DISTINCT owner_role.rolname,',' ORDER BY owner_role.rolname) AS owner_roles,
    pg_catalog.bool_or(p.prosecdef) AS has_security_definer,
    pg_catalog.bool_or(pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')) AS public_execute,
    pg_catalog.bool_or(pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')) AS anon_execute,
    pg_catalog.bool_or(pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')) AS authenticated_execute,
    pg_catalog.bool_or(pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) AS service_role_execute,
    pg_catalog.bool_or(pg_catalog.has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')) AS api_executor_execute,
    pg_catalog.bool_or(pg_catalog.has_function_privilege('myeongha_commerce_internal_executor',p.oid,'EXECUTE')) AS commerce_executor_execute
  FROM required_routines n
  LEFT JOIN pg_catalog.pg_proc p ON p.proname=n.routine_name
    AND p.pronamespace='public'::pg_catalog.regnamespace
  LEFT JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=p.proowner
  GROUP BY n.routine_name
),
entitlement_acl AS (
  SELECT 'public.entitlement_events' AS table_name,
    pg_catalog.to_regclass('public.entitlement_events') IS NOT NULL AS table_exists,
    CASE WHEN pg_catalog.to_regclass('public.entitlement_events') IS NOT NULL
      THEN (pg_catalog.has_table_privilege('service_role',
        'public.entitlement_events','INSERT') AND
        pg_catalog.has_table_privilege('service_role',
        'public.entitlement_events','UPDATE') AND
        pg_catalog.has_table_privilege('service_role',
        'public.entitlement_events','DELETE'))
      ELSE NULL END AS service_role_all_mutations,
    CASE WHEN pg_catalog.to_regclass('public.entitlement_events') IS NOT NULL
      THEN (pg_catalog.has_table_privilege('postgres',
        'public.entitlement_events','INSERT') AND
        pg_catalog.has_table_privilege('postgres',
        'public.entitlement_events','UPDATE') AND
        pg_catalog.has_table_privilege('postgres',
        'public.entitlement_events','DELETE'))
      ELSE NULL END AS postgres_all_mutations,
    CASE WHEN pg_catalog.to_regclass('public.entitlement_events') IS NOT NULL
      THEN (pg_catalog.has_table_privilege('myeongha_commerce_internal_executor',
        'public.entitlement_events','INSERT') AND
        pg_catalog.has_table_privilege('myeongha_commerce_internal_executor',
        'public.entitlement_events','UPDATE') AND
        pg_catalog.has_table_privilege('myeongha_commerce_internal_executor',
        'public.entitlement_events','DELETE'))
      ELSE NULL END AS commerce_executor_all_mutations
)
SELECT pg_catalog.jsonb_build_object(
  'evidence_kind','read_only_catalog_snapshot_not_authorization',
  'database',current_database(),
  'observed_at',pg_catalog.clock_timestamp(),
  'roles',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)
           ORDER BY r.role_name) FROM role_evidence r),
  'functions',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f)
           ORDER BY f.routine_name) FROM function_evidence f),
  'entitlement_table',(SELECT pg_catalog.to_jsonb(t) FROM entitlement_acl t),
  'release_authorized',false
) AS metadata_evidence;
