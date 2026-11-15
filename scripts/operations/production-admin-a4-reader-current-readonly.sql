-- Phase 8-A: exact-version current-object and privilege effects only.
-- This query emits schema/role metadata, not migration SQL, credentials or rows.
-- Historical statement provenance and same-MVCC causality remain unproven.
-- Never use this observer to migrate, grant privileges or promote DR.
-- Watchtower-Track: ops
BEGIN TRANSACTION READ ONLY;
WITH
source_history AS (
  SELECT version, name, cardinality(statements) AS statement_count,
    octet_length(statements[1]) AS statement_bytes,
    pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to(statements[1],'UTF8')),'hex') AS statement_sha256,
    created_by IS NOT NULL AS has_created_by_metadata,
    idempotency_key IS NOT NULL AS has_idempotency_key,
    "rollback" IS NOT NULL AS has_rollback_statements
  FROM supabase_migrations.schema_migrations
  WHERE version = '20261109071019'
),
reader_role AS (
  SELECT oid, rolcanlogin, rolinherit, rolsuper, rolcreatedb,
    rolcreaterole, rolreplication, rolbypassrls,
    rolpassword IS NULL AS password_absent
  FROM pg_catalog.pg_authid
  WHERE rolname = 'myeongha_reading_ai_cost_binding_reader_v1'
),
target_relation AS (
  SELECT c.oid, c.relrowsecurity, c.relforcerowsecurity,
    c.relkind
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'reading_execution_attempts'
),
column_read_access AS (
  SELECT a.attname,
    pg_catalog.has_column_privilege(
      'myeongha_reading_ai_cost_binding_reader_v1',
      'public.reading_execution_attempts', a.attname, 'SELECT'
    ) AS readable
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.reading_execution_attempts'::pg_catalog.regclass
    AND a.attnum > 0 AND NOT a.attisdropped
),
role_memberships AS (
  SELECT granted.rolname AS granted_role, member.rolname AS member_role,
    grantor.rolname AS grantor_role, edge.admin_option, edge.inherit_option,
    edge.set_option
  FROM pg_catalog.pg_auth_members edge
  JOIN pg_catalog.pg_roles granted ON granted.oid = edge.roleid
  JOIN pg_catalog.pg_roles member ON member.oid = edge.member
  JOIN pg_catalog.pg_roles grantor ON grantor.oid = edge.grantor
  WHERE edge.roleid IN (SELECT oid FROM reader_role)
    OR edge.member IN (SELECT oid FROM reader_role)
),
direct_column_grants AS (
  SELECT table_schema, table_name, column_name, privilege_type
  FROM information_schema.column_privileges
  WHERE grantee = 'myeongha_reading_ai_cost_binding_reader_v1'
)
SELECT pg_catalog.jsonb_build_object(
  'schemaVersion','ops-admin-a4-reader-current-migration-effect-readonly-v1',
  'migrationCount',(SELECT count(*) FROM source_history),
  'migration',(SELECT to_jsonb(m) FROM source_history m),
  'roleCount',(SELECT count(*) FROM reader_role),
  'roleAttributes',(SELECT to_jsonb(r)-'oid' FROM reader_role r),
  'relationCount',(SELECT count(*) FROM target_relation),
  'relationRlsEnabled',(SELECT relrowsecurity FROM target_relation),
  'relationRlsForced',(SELECT relforcerowsecurity FROM target_relation),
  'relationPolicyCount',(SELECT count(*) FROM pg_catalog.pg_policy
    WHERE polrelid IN (SELECT oid FROM target_relation)),
  'schemaUsageGranted',pg_catalog.has_schema_privilege(
    'myeongha_reading_ai_cost_binding_reader_v1','public','USAGE'),
  'wholeTableSelectGranted',pg_catalog.has_table_privilege(
    'myeongha_reading_ai_cost_binding_reader_v1',
    'public.reading_execution_attempts','SELECT'),
  'insertGranted',pg_catalog.has_table_privilege(
    'myeongha_reading_ai_cost_binding_reader_v1',
    'public.reading_execution_attempts','INSERT'),
  'updateGranted',pg_catalog.has_table_privilege(
    'myeongha_reading_ai_cost_binding_reader_v1',
    'public.reading_execution_attempts','UPDATE'),
  'deleteGranted',pg_catalog.has_table_privilege(
    'myeongha_reading_ai_cost_binding_reader_v1',
    'public.reading_execution_attempts','DELETE'),
  'relationColumnCount',(SELECT count(*) FROM column_read_access),
  'readableColumnNames',(SELECT coalesce(jsonb_agg(attname ORDER BY attname),
    '[]'::jsonb) FROM column_read_access WHERE readable),
  'unexpectedReadableColumnNames',(SELECT coalesce(
    jsonb_agg(attname ORDER BY attname),'[]'::jsonb)
    FROM column_read_access
    WHERE readable AND attname <> ALL(ARRAY[
      'id','reading_id','subject_id','external_request_ref','state'])),
  'membershipCount',(SELECT count(*) FROM role_memberships),
  'roleMemberships',(SELECT coalesce(jsonb_agg(to_jsonb(m)
    ORDER BY granted_role,member_role,grantor_role),'[]'::jsonb)
    FROM role_memberships m),
  'directColumnGrantCount',(SELECT count(*) FROM direct_column_grants),
  'directColumnGrants',(SELECT coalesce(jsonb_agg(to_jsonb(g)
    ORDER BY table_schema,table_name,column_name,privilege_type),'[]'::jsonb)
    FROM direct_column_grants g),
  'historicalExecutorAuthenticated',false,
  'appliedSqlEffectCausalityProven',false,
  'providerMigrationLedgerRestored',false,
  'hostedAuthStorageEquivalent',false,
  'drReady',false,
  'serviceResumptionAllowed',false
)::text AS sanitized_observation;
ROLLBACK;
