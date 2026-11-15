-- Gate 1 / Phase 8-A: inspect one newly remote-only migration's current effect.
-- PostgreSQL 17; no user rows, password material, role OIDs, or grantor names
-- are returned. This is a Production SELECT-only observation, NOT restore parity.
-- Watchtower-Track: ops
BEGIN TRANSACTION READ ONLY;

WITH
migration AS (
  SELECT version, name, cardinality(statements) AS statement_count,
    octet_length(array_to_string(statements, E'\n')) AS statement_bytes,
    encode(pg_catalog.sha256(
      convert_to(array_to_string(statements, E'\n'), 'UTF8')), 'hex')
      AS statement_sha256
  FROM supabase_migrations.schema_migrations
  WHERE version = '20261109071019'
),
role AS (
  SELECT oid, rolcanlogin, rolinherit, rolsuper, rolcreatedb,
    rolcreaterole, rolreplication, rolbypassrls
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_reading_ai_cost_binding_reader_v1'
),
target AS (
  SELECT c.oid, c.relacl, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'reading_execution_attempts'
),
expected_columns AS (
  SELECT unnest(ARRAY['id','reading_id','subject_id',
    'external_request_ref','state']) AS name
),
target_columns AS (
  SELECT a.attname AS name
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = (SELECT oid FROM target)
    AND a.attnum > 0 AND NOT a.attisdropped
)
SELECT
  to_char(timezone('UTC', clock_timestamp()),
    'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS observed_at_utc,
  (SELECT count(*) FROM migration)::integer AS migration_count,
  (SELECT name FROM migration) AS migration_name,
  (SELECT statement_count FROM migration) AS statement_count,
  (SELECT statement_bytes FROM migration) AS statement_bytes,
  (SELECT statement_sha256 FROM migration) AS statement_sha256,
  (SELECT count(*) FROM role)::integer AS role_count,
  (SELECT count(*) FROM target)::integer AS target_table_count,
  (SELECT rolcanlogin AND NOT rolinherit AND NOT rolsuper
     AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
     AND NOT rolbypassrls FROM role) AS role_restricted_flags_match,
  (SELECT count(*) FROM pg_catalog.pg_auth_members m
   WHERE m.roleid=(SELECT oid FROM role)
      OR m.member=(SELECT oid FROM role))::integer
      AS related_membership_count,
  (SELECT count(*) FROM pg_catalog.pg_auth_members m
   WHERE m.roleid=(SELECT oid FROM role)
     AND m.member=(SELECT oid FROM pg_catalog.pg_roles
                   WHERE rolname='postgres')
     AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles
                    WHERE rolname='supabase_admin')
     AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
  )::integer AS expected_admin_only_membership_count,
  (SELECT has_schema_privilege(
    'myeongha_reading_ai_cost_binding_reader_v1','public','USAGE'))
     AS public_schema_usage,
  (SELECT count(*) FROM pg_catalog.aclexplode(
    (SELECT relacl FROM target)) a
   WHERE a.grantee=(SELECT oid FROM role)
     AND a.privilege_type='SELECT')::integer
     AS explicit_whole_table_select_acl_count,
  (SELECT count(*) FROM target_columns c
    WHERE has_column_privilege(
      'myeongha_reading_ai_cost_binding_reader_v1',
      (SELECT oid FROM target), c.name, 'SELECT'))::integer
    AS selectable_column_count,
  (SELECT count(*) FROM target_columns c
    WHERE has_column_privilege(
      'myeongha_reading_ai_cost_binding_reader_v1',
      (SELECT oid FROM target), c.name, 'SELECT')
    AND NOT EXISTS (SELECT 1 FROM expected_columns e WHERE e.name=c.name)
  )::integer AS unexpected_selectable_column_count,
  (SELECT count(*) FROM expected_columns e
    WHERE NOT has_column_privilege(
      'myeongha_reading_ai_cost_binding_reader_v1',
      (SELECT oid FROM target), e.name, 'SELECT'))::integer
    AS missing_expected_selectable_column_count,
  (SELECT NOT relrowsecurity AND NOT relforcerowsecurity FROM target)
    AS rls_disabled,
  (SELECT count(*) FROM pg_catalog.pg_policy p
    WHERE p.polrelid=(SELECT oid FROM target))::integer
    AS defined_policy_count,
  (SELECT count(*) FROM pg_catalog.pg_policy p
    WHERE p.polrelid=(SELECT oid FROM target) AND NOT p.polpermissive
  )::integer AS restrictive_policy_count,
  (SELECT has_table_privilege(
    'myeongha_reading_ai_cost_binding_reader_v1',
    (SELECT oid FROM target), 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'))
    AS has_direct_table_mutation_privilege,
  false AS restored_provider_equivalence_proven,
  false AS dr_ready,
  false AS service_resumption_allowed;

COMMIT;
