-- D3e23 only: actual database ACL inventory, metadata SELECT, no customer rows.
-- This diagnostic does NOT authorize an operating change. No GRANT/REVOKE here.
WITH protected_tables(table_name) AS (VALUES
 ('commerce_account_links'),
 ('commerce_provider_events'),
 ('commerce_receipts'),
 ('entitlement_events'),
 ('entitlement_grants'),
 ('entitlements'),
 ('purchase_intents')),
 evidence AS (
  SELECT t.table_name, c.oid IS NOT NULL AS exists_in_database,
   CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_userbyid(c.relowner) END AS owner_name,
   c.relrowsecurity AS rls_enabled,
   CASE WHEN c.oid IS NULL THEN NULL
    ELSE pg_catalog.has_table_privilege('service_role',c.oid,'SELECT') END AS service_can_select,
   CASE WHEN c.oid IS NULL THEN NULL
    ELSE pg_catalog.has_table_privilege('service_role',c.oid,'INSERT') END AS service_can_insert,
   CASE WHEN c.oid IS NULL THEN NULL
    ELSE pg_catalog.has_table_privilege('service_role',c.oid,'UPDATE') END AS service_can_update,
   CASE WHEN c.oid IS NULL THEN NULL
    ELSE pg_catalog.has_table_privilege('service_role',c.oid,'DELETE') END AS service_can_delete,
   CASE WHEN c.oid IS NULL THEN NULL
    ELSE pg_catalog.has_table_privilege('anon',c.oid,'INSERT') END AS anon_can_insert,
   CASE WHEN c.oid IS NULL THEN NULL
    ELSE pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT') END AS auth_can_insert,
   CASE WHEN c.oid IS NULL THEN NULL
    ELSE pg_catalog.has_table_privilege('myeongha_runtime',c.oid,'INSERT') END AS runtime_can_insert,
   CASE WHEN c.oid IS NULL THEN NULL
    ELSE pg_catalog.has_table_privilege('myeongha_worker_runtime',c.oid,'INSERT') END AS worker_can_insert
  FROM protected_tables t
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
   AND c.relname=t.table_name AND c.relkind IN ('r','p')
 )
SELECT pg_catalog.jsonb_build_object(
 'evidence_type','read_only_pg_catalog_seven_table_acl_snapshot',
 'database',current_database(),
 'observed_at',pg_catalog.clock_timestamp(),
 'rows',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) ORDER BY e.table_name) FROM evidence e),
 'cutover_authorized',false
) AS acl_snapshot;