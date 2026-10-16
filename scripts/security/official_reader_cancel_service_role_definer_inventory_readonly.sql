-- D3e29: read-only SECURITY DEFINER execution audit for service_role.
-- Covers all public routines regardless of lexical table references:
-- dynamic SQL, helper-function indirection and procedures are all candidates.
-- Non-public managed schemas (for example vault) are reported separately;
-- their privileges must not be silently equated with a public Commerce bypass.
-- NO customer rows, secret values, mutations, operations or cutover approval.
WITH potential_routines AS (
 SELECT n.nspname AS schema_name,p.proname,p.oid,p.prokind,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind IN ('f','p')
  AND p.prosecdef
  AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND n.nspname NOT LIKE 'pg_temp%'
  AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
), public_candidates AS (
 SELECT schema_name,proname,prokind,owner_name,arguments
 FROM potential_routines WHERE schema_name='public'
), other_schema_candidates AS (
 SELECT schema_name,proname,prokind,owner_name,arguments
 FROM potential_routines WHERE schema_name<>'public'
), protected(name) AS (
 VALUES ('commerce_account_links'),('commerce_provider_events'),
 ('commerce_receipts'),('entitlement_events'),('entitlement_grants'),
 ('entitlements'),('purchase_intents')
), protected_triggers AS (
 SELECT c.relname AS table_name,t.tgname AS trigger_name,
  p.proname AS function_name,p.prosecdef AS trigger_security_definer
 FROM pg_catalog.pg_trigger t
 JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
 WHERE n.nspname='public'
  AND c.relname IN (SELECT name FROM protected)
  AND NOT t.tgisinternal
)
SELECT pg_catalog.jsonb_build_object(
 'evidence_type','d3e29_reader_cancel_definer_full_public_surface_v1',
 'database',current_database(),
 'observed_at',pg_catalog.clock_timestamp(),
 'service_role_public_definer_count',(SELECT count(*) FROM public_candidates),
 'service_role_public_definers',(SELECT coalesce(
   pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
     ORDER BY schema_name,proname,arguments),'[]'::jsonb)
   FROM public_candidates x),
 'managed_or_other_schema_definer_count',(SELECT count(*) FROM other_schema_candidates),
 'managed_or_other_schema_definers',(SELECT coalesce(
   pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
     ORDER BY schema_name,proname,arguments),'[]'::jsonb)
   FROM other_schema_candidates x),
 'protected_trigger_count',(SELECT count(*) FROM protected_triggers),
 'protected_definer_trigger_count',(SELECT count(*) FROM protected_triggers
   WHERE trigger_security_definer),
 'indirect_or_dynamic_execution_proven_safe',false,
 'managed_schema_semantics_proven_safe',false,
 'deployment_role_binding_verified',false,
 'cutover_authorized',false
) AS d3e29_snapshot;
