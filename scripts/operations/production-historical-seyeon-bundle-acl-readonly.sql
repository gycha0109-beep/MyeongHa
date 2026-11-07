-- Watchtower-Track: ops
-- Phase 8-A: metadata-only verification of applied remote-only migration 20261008090417.
-- Read-only Production query. Returns aggregate catalog facts and role access only.
-- Does not expose migration SQL, function definitions, policy expressions, personal rows,
-- authentication material, credentials or external storage contents.
-- Important: name/ACL inspection != source byte equality, full DDL/ACL parity,
-- provider-managed restore equivalence or permission to deploy/repair migrations.

BEGIN TRANSACTION READ ONLY;

WITH src AS (
  SELECT statements[1] AS body
  FROM supabase_migrations.schema_migrations
  WHERE version = '20261008090417' AND cardinality(statements) = 1
), fn_decl AS (
  SELECT DISTINCT
    coalesce(nullif(lower(r[3]), ''), 'public') AS schema_name,
    lower(r[4]) AS function_name
  FROM src, regexp_matches(
    body,
    $rx$(?im)^[[:space:]]*create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+(([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)[[:space:]]*\($rx$,
    'g'
  ) r
), fn_live AS (
  SELECT d.schema_name, d.function_name, p.oid, p.prosecdef, p.proconfig,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
    pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
    pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec,
    pg_catalog.has_function_privilege('myeongha_api_executor', p.oid, 'EXECUTE') AS api_exec
  FROM fn_decl d
  LEFT JOIN pg_namespace n ON n.nspname = d.schema_name
  LEFT JOIN pg_proc p ON p.pronamespace = n.oid AND p.proname = d.function_name
), pol_decl AS (
  SELECT DISTINCT
    lower(p[1]) AS policy_name,
    coalesce(nullif(lower(p[3]), ''), 'public') AS schema_name,
    lower(p[4]) AS relation_name
  FROM src, regexp_matches(
    body,
    $rx$(?im)^[[:space:]]*create[[:space:]]+policy[[:space:]]+([a-z_][a-z0-9_]*)[[:space:]]+on[[:space:]]+(([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)$rx$,
    'g'
  ) p
), pol_live AS (
  SELECT d.*, c.relrowsecurity, p.cmd
  FROM pol_decl d
  LEFT JOIN pg_policies p
    ON p.schemaname = d.schema_name AND p.tablename = d.relation_name
   AND p.policyname = d.policy_name
  LEFT JOIN pg_class c
    ON c.oid = to_regclass(quote_ident(d.schema_name) || '.' || quote_ident(d.relation_name))
)
SELECT jsonb_build_object(
  'transactionReadOnly', current_setting('transaction_read_only'),
  'appliedMigrationVersion', '20261008090417',
  'migrationStatementCount', (SELECT cardinality(statements) FROM supabase_migrations.schema_migrations WHERE version = '20261008090417'),
  'functionDeclarations', (SELECT count(*) FROM fn_decl),
  'liveFunctionNames', (SELECT count(DISTINCT (schema_name, function_name)) FROM fn_live WHERE oid IS NOT NULL),
  'liveOverloadRows', (SELECT count(*) FROM fn_live WHERE oid IS NOT NULL),
  'overloadedNames', (SELECT count(*) FROM (
    SELECT schema_name, function_name FROM fn_live WHERE oid IS NOT NULL
    GROUP BY 1,2 HAVING count(*) > 1
  ) x),
  'securityDefinerRows', (SELECT count(*) FROM fn_live WHERE prosecdef),
  'definerWithoutSearchPathConfig', (SELECT count(*) FROM fn_live
    WHERE prosecdef AND NOT coalesce((
      SELECT bool_or(x LIKE 'search_path=%') FROM unnest(proconfig) x
    ), false)),
  'anonExecutableRows', (SELECT count(*) FROM fn_live WHERE anon_exec),
  'authenticatedExecutableRows', (SELECT count(*) FROM fn_live WHERE auth_exec),
  'serviceExecutableRows', (SELECT count(*) FROM fn_live WHERE service_exec),
  'apiExecutorExecutableRows', (SELECT count(*) FROM fn_live WHERE api_exec),
  'ownerDistribution', (SELECT coalesce(jsonb_object_agg(owner, count_rows), '{}'::jsonb)
    FROM (SELECT owner, count(*) AS count_rows FROM fn_live WHERE oid IS NOT NULL GROUP BY owner) a),
  'policyDeclarations', (SELECT count(*) FROM pol_decl),
  'liveNamedPolicies', (SELECT count(*) FROM pol_live WHERE cmd IS NOT NULL),
  'rlsDisabledDeclaredPolicyTables', (SELECT coalesce(
    jsonb_agg(DISTINCT schema_name || '.' || relation_name), '[]'::jsonb)
    FROM pol_live WHERE NOT coalesce(relrowsecurity, false)),
  'livePolicyCommands', (SELECT coalesce(jsonb_object_agg(cmd, count_rows), '{}'::jsonb)
    FROM (SELECT cmd, count(*) AS count_rows FROM pol_live WHERE cmd IS NOT NULL GROUP BY cmd) a)
)::text AS historic_bundle_catalog_scope;

-- When RLS is disabled, named policy presence does not enforce row restrictions.
-- Independently check direct table AND column rights for roles that serve
-- ordinary browser and API requests. Metadata only; never query application rows.
WITH tables AS (
  SELECT c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('chat_turns', 'chat_turn_attempts')
), grants AS (
  SELECT t.nspname || '.' || t.relname AS relation,
    t.relrowsecurity AS rlsEnabled, t.relforcerowsecurity AS rlsForced,
    role.role_name,
    has_table_privilege(role.role_name, t.oid, 'SELECT') AS tableSelect,
    has_table_privilege(role.role_name, t.oid, 'INSERT') AS tableInsert,
    has_table_privilege(role.role_name, t.oid, 'UPDATE') AS tableUpdate,
    has_table_privilege(role.role_name, t.oid, 'DELETE') AS tableDelete,
    has_any_column_privilege(role.role_name, t.oid, 'SELECT') AS columnSelect,
    has_any_column_privilege(role.role_name, t.oid, 'INSERT') AS columnInsert,
    has_any_column_privilege(role.role_name, t.oid, 'UPDATE') AS columnUpdate,
    has_any_column_privilege(role.role_name, t.oid, 'REFERENCES') AS columnReferences
  FROM tables t CROSS JOIN (
    VALUES ('anon'), ('authenticated'), ('myeongha_api_executor')
  ) AS role(role_name)
)
SELECT jsonb_build_object(
  'transactionReadOnly', current_setting('transaction_read_only'),
  'directTableAndColumnPrivileges', (SELECT jsonb_agg(to_jsonb(g) ORDER BY relation, role_name) FROM grants g)
)::text AS rls_disabled_table_access_scope;

ROLLBACK;
