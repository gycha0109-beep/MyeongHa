-- Watchtower-Track: ops
-- Gate 1 / 8-A: current effective GRANT/REVOKE and RLS state for the 18 distinct tables
-- referenced by 20 current policy indicators attached to RLS-disabled tables.
-- Read-only pg_catalog only. No application rows or policy expressions are returned.
BEGIN TRANSACTION READ ONLY;
WITH targets(schema_name, table_name) AS (
 VALUES ('public','chat_turn_attempts'),
        ('public','chat_turns'),
        ('public','memory_proposals'),
        ('public','ai_execution_groundings'),
        ('public','ai_execution_logs'),
        ('public','character_runtime_catalog'),
        ('public','commerce_provider_events'),
        ('public','commerce_receipts'),
        ('public','content_bundles'),
        ('public','content_releases'),
        ('public','entitlement_events'),
        ('public','entitlement_grants'),
        ('public','entitlements'),
        ('public','product_offers'),
        ('public','products'),
        ('public','purchase_intents'),
        ('public','reading_execution_attempts'),
        ('public','reading_groundings')
),
resolved AS (
 SELECT t.schema_name,t.table_name,n.oid AS schema_oid,c.oid AS table_oid,
   c.relrowsecurity,c.relforcerowsecurity,c.relkind,
   pg_catalog.pg_get_userbyid(c.relowner) AS owner_name
 FROM targets t
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname=t.schema_name
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
       AND c.relname=t.table_name AND c.relkind IN ('r','p')
),
roles(role_name) AS (
 VALUES ('anon'),('authenticated'),('service_role'),('myeongha_api_executor')
),
observations AS (
 SELECT r.schema_name,r.table_name,r.relrowsecurity,r.relforcerowsecurity,
   r.relkind,r.owner_name,
   coalesce((
      SELECT count(*)::integer FROM pg_catalog.pg_policy p WHERE p.polrelid=r.table_oid
   ),0) AS policy_count,
   (
      SELECT coalesce(jsonb_object_agg(z.role_name,jsonb_build_object(
       'roleExists',z.role_exists,
       'schemaUsage',z.schema_usage,
       'select',z.can_select,
       'insert',z.can_insert,
       'update',z.can_update,
       'delete',z.can_delete,
       'truncate',z.can_truncate,
       'references',z.can_references,
       'trigger',z.can_trigger
      ) ORDER BY z.role_name), '{}'::jsonb)
      FROM (
        SELECT role_name,
          pg_catalog.to_regrole(role_name) IS NOT NULL AS role_exists,
          CASE WHEN pg_catalog.to_regrole(role_name) IS NULL OR r.schema_oid IS NULL
            THEN NULL ELSE pg_catalog.has_schema_privilege(role_name,r.schema_oid,'USAGE') END AS schema_usage,
          CASE WHEN pg_catalog.to_regrole(role_name) IS NULL OR r.table_oid IS NULL
            THEN NULL ELSE pg_catalog.has_table_privilege(role_name,r.table_oid,'SELECT') END AS can_select,
          CASE WHEN pg_catalog.to_regrole(role_name) IS NULL OR r.table_oid IS NULL
            THEN NULL ELSE pg_catalog.has_table_privilege(role_name,r.table_oid,'INSERT') END AS can_insert,
          CASE WHEN pg_catalog.to_regrole(role_name) IS NULL OR r.table_oid IS NULL
            THEN NULL ELSE pg_catalog.has_table_privilege(role_name,r.table_oid,'UPDATE') END AS can_update,
          CASE WHEN pg_catalog.to_regrole(role_name) IS NULL OR r.table_oid IS NULL
            THEN NULL ELSE pg_catalog.has_table_privilege(role_name,r.table_oid,'DELETE') END AS can_delete,
          CASE WHEN pg_catalog.to_regrole(role_name) IS NULL OR r.table_oid IS NULL
            THEN NULL ELSE pg_catalog.has_table_privilege(role_name,r.table_oid,'TRUNCATE') END AS can_truncate,
          CASE WHEN pg_catalog.to_regrole(role_name) IS NULL OR r.table_oid IS NULL
            THEN NULL ELSE pg_catalog.has_table_privilege(role_name,r.table_oid,'REFERENCES') END AS can_references,
          CASE WHEN pg_catalog.to_regrole(role_name) IS NULL OR r.table_oid IS NULL
            THEN NULL ELSE pg_catalog.has_table_privilege(role_name,r.table_oid,'TRIGGER') END AS can_trigger
        FROM roles
      ) z
   ) AS effective_role_privileges
 FROM resolved r
)
SELECT jsonb_build_object(
  'schemaVersion','ops-current-rls-disabled-role-grants-v1',
  'observedAtUtc', to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'transactionReadOnly',current_setting('transaction_read_only')='on',
  'targetDistinctTableCount',(SELECT count(*) FROM targets),
  'tables',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'schema',schema_name,'table',table_name,
      'tableExists',relkind IS NOT NULL,
      'tableKind',relkind,'owner',owner_name,
      'rowSecurityEnabled',relrowsecurity,'forceRowSecurity',relforcerowsecurity,
      'currentPolicyCount',policy_count,
      'rolePrivileges',effective_role_privileges
    ) ORDER BY schema_name,table_name) FROM observations
  ),'[]'::jsonb)
)::text AS evidence_json;
ROLLBACK;
