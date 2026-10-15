-- D3e27 — READ-ONLY seven-asset generic service_role write-surface catalog.
-- Safe against a running production database: SELECT only, no customer rows.
-- This is a lexical/categorical candidate scan, NOT proof of all transitive
-- RPC/function dependencies or proof that PostgREST exposes a given relation.
WITH protected(name) AS (
 VALUES ('commerce_account_links'),('commerce_provider_events'),
 ('commerce_receipts'),('entitlement_events'),('entitlement_grants'),
 ('entitlements'),('purchase_intents')
), protected_relations AS (
 SELECT t.name, c.oid,
  CASE WHEN c.oid IS NULL THEN false
   ELSE pg_catalog.has_table_privilege('service_role',c.oid,'SELECT') END AS service_can_read,
  CASE WHEN c.oid IS NULL THEN false
   ELSE (pg_catalog.has_table_privilege('service_role',c.oid,'INSERT') OR
         pg_catalog.has_table_privilege('service_role',c.oid,'UPDATE') OR
         pg_catalog.has_table_privilege('service_role',c.oid,'DELETE')) END AS service_can_write
 FROM protected t
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_class c
 ON c.relnamespace=n.oid AND c.relname=t.name AND c.relkind IN ('r','p')
), adjacent_relations AS (
 SELECT names.name,c.oid
 FROM (VALUES ('commerce_payment_attempts'),
  ('purchase_intent_reader_selections')) AS names(name)
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
  AND c.relname=names.name AND c.relkind IN ('r','p')
), accessible_definer_routines AS (
 SELECT p.oid
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND p.prokind='f' AND p.prosecdef
  AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  -- Body-name matching is intentionally conservative: direct references only.
  AND p.prosrc ~* '(commerce_account_links|commerce_provider_events|commerce_receipts|entitlement_events|entitlement_grants|entitlements|purchase_intents)'
), view_dependencies AS (
 SELECT DISTINCT v.oid
 FROM pg_catalog.pg_class v
 JOIN pg_catalog.pg_namespace n ON n.oid=v.relnamespace
 JOIN pg_catalog.pg_rewrite rw ON rw.ev_class=v.oid
 JOIN pg_catalog.pg_depend d ON d.classid='pg_rewrite'::regclass
  AND d.objid=rw.oid AND d.refclassid='pg_class'::regclass
 JOIN protected_relations t ON t.oid=d.refobjid
 WHERE v.relkind='v' AND n.nspname NOT IN ('pg_catalog','information_schema')
), updatable_granted_views AS (
 SELECT v.oid
 FROM view_dependencies v
 WHERE pg_catalog.pg_relation_is_updatable(v.oid,true) <> 0
  AND (pg_catalog.has_table_privilege('service_role',v.oid,'INSERT') OR
       pg_catalog.has_table_privilege('service_role',v.oid,'UPDATE') OR
       pg_catalog.has_table_privilege('service_role',v.oid,'DELETE'))
)
SELECT pg_catalog.jsonb_build_object(
 'evidence_type','d3e27_service_role_alternate_write_surface_catalog_v1',
 'protected_relation_count',(SELECT count(*) FROM protected_relations WHERE oid IS NOT NULL),
 'protected_service_read_count',(SELECT count(*) FROM protected_relations WHERE service_can_read),
 'protected_direct_dml_count',(SELECT count(*) FROM protected_relations WHERE service_can_write),
 'adjacent_relation_count',(SELECT count(*) FROM adjacent_relations WHERE oid IS NOT NULL),
 'adjacent_direct_dml_count',(SELECT count(*) FROM adjacent_relations
  WHERE oid IS NOT NULL AND
   (pg_catalog.has_table_privilege('service_role',oid,'INSERT') OR
    pg_catalog.has_table_privilege('service_role',oid,'UPDATE') OR
    pg_catalog.has_table_privilege('service_role',oid,'DELETE'))),
 'service_executable_definer_candidate_count',(SELECT count(*) FROM accessible_definer_routines),
 'service_updatable_view_candidate_count',(SELECT count(*) FROM updatable_granted_views),
 'cutover_authorized',false
) AS d3e27_snapshot;