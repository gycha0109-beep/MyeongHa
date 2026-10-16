-- D3e28: privilege/caller inventory only; metadata SELECT, no customer records.
-- This query is safe on a running DB. It does NOT change any ACL, invoke
-- application functions, inspect payment rows or authorize a cutover.
-- Role MEMBER indicates reachability candidates; it is NOT a proof of SET ROLE
-- across PostgreSQL versions or of deployed runtime credentials.
WITH
guarded_table(name) AS (
 VALUES ('commerce_account_links'),('commerce_provider_events'),
 ('commerce_receipts'),('entitlement_events'),('entitlement_grants'),
 ('entitlements'),('purchase_intents')
),
role_names(name) AS (
 VALUES ('service_role'),('postgres'),('authenticator'),('anon'),
 ('authenticated'),('myeongha_runtime'),('myeongha_worker_runtime'),
 ('myeongha_api_executor'),('myeongha_commerce_internal_executor')
),
role_catalog AS (
 SELECT wanted.name, r.oid, r.rolcanlogin, r.rolbypassrls, r.rolsuper
 FROM role_names wanted
 LEFT JOIN pg_catalog.pg_roles r ON r.rolname=wanted.name
),
role_edges AS (
 SELECT a.name AS actor, b.name AS target,
   pg_catalog.pg_has_role(a.oid,b.oid,'MEMBER') AS is_member,
   pg_catalog.pg_has_role(a.oid,b.oid,'USAGE') AS inherits_privileges
 FROM role_catalog a JOIN role_catalog b ON a.oid IS NOT NULL
  AND b.oid IS NOT NULL AND a.oid<>b.oid
 WHERE pg_catalog.pg_has_role(a.oid,b.oid,'MEMBER')
    OR pg_catalog.pg_has_role(a.oid,b.oid,'USAGE')
),
protected_relations AS (
 SELECT t.name,c.oid,c.relrowsecurity AS rls_enabled
 FROM guarded_table t
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
  AND c.relname=t.name AND c.relkind IN ('r','p')
),
effective_table_dml AS (
 SELECT r.name AS role_name, t.name AS table_name,
   pg_catalog.has_table_privilege(r.oid,t.oid,'INSERT') AS can_insert,
   pg_catalog.has_table_privilege(r.oid,t.oid,'UPDATE') AS can_update,
   pg_catalog.has_table_privilege(r.oid,t.oid,'DELETE') AS can_delete
 FROM role_catalog r CROSS JOIN protected_relations t
 WHERE r.oid IS NOT NULL AND t.oid IS NOT NULL
),
elevated_role_edges AS (
 SELECT * FROM role_edges
 WHERE actor IN ('myeongha_runtime','myeongha_worker_runtime',
                'myeongha_api_executor','myeongha_commerce_internal_executor')
   AND target IN ('postgres','service_role')
),
restricted_write_roles AS (
 SELECT * FROM effective_table_dml
 WHERE role_name IN ('myeongha_runtime','myeongha_worker_runtime',
                     'myeongha_api_executor','myeongha_commerce_internal_executor')
   AND (can_insert OR can_update OR can_delete)
),
tracked_function(name) AS (
 VALUES ('cmd_create_purchase_intent_v2'),('cmd_create_purchase_intent_v3'),
 ('cmd_create_payment_attempt_v1'),('cmd_persist_verified_payment_evidence_v1'),
 ('cmd_restore_entitlements_runtime_v1'),('internal_finalize_account_deletion_db_v1'),
 ('internal_apply_entitlement_effect_v1'),
 ('internal_apply_verified_receipt_capability_effects_v1'),
 ('cmd_bind_standard_reading_access_v2'),
 ('internal_apply_reviewed_official_reader_full_cancel_private_v1'),
 ('internal_apply_official_reader_verified_cancel_batch_v1'),
 ('internal_execute_official_reader_verified_cancel_v2')
),
functions AS (
 SELECT t.name,p.oid,p.prosecdef,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments
 FROM tracked_function t
 LEFT JOIN pg_catalog.pg_proc p ON p.proname=t.name
  AND p.pronamespace='public'::pg_catalog.regnamespace
),
effective_function_execute AS (
 SELECT f.name AS function_name,f.identity_arguments,f.owner_name,
  f.prosecdef AS security_definer,r.name AS role_name
 FROM functions f JOIN role_catalog r ON r.oid IS NOT NULL
 WHERE f.oid IS NOT NULL
   AND pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE')
),
trigger_catalog AS (
 SELECT c.relname AS table_name,t.tgname AS trigger_name,
  t.tgenabled AS enabled,p.proname AS function_name,p.prosecdef AS security_definer
 FROM pg_catalog.pg_trigger t
 JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
 WHERE n.nspname='public' AND NOT t.tgisinternal
  AND c.relname IN (SELECT name FROM guarded_table)
)
SELECT pg_catalog.jsonb_build_object(
 'evidence_type','d3e28_reader_cancel_role_execution_inventory_v1',
 'database',current_database(),
 'observed_at',pg_catalog.clock_timestamp(),
 'existing_guarded_tables',(SELECT count(*) FROM protected_relations WHERE oid IS NOT NULL),
 'guarded_table_rls',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table_name',name,'rls_enabled',rls_enabled) ORDER BY name),'[]'::jsonb) FROM protected_relations),
 'roles',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY name) FROM role_catalog x),
 'membership_edges',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY actor,target),'[]'::jsonb) FROM role_edges x),
 'elevated_app_role_edges',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY actor,target),'[]'::jsonb) FROM elevated_role_edges x),
 'restricted_role_write_count',(SELECT count(*) FROM restricted_write_roles),
 'restricted_role_write_rows',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY role_name,table_name),'[]'::jsonb) FROM restricted_write_roles x),
 'service_role_writable_table_count',(SELECT count(*) FROM effective_table_dml WHERE role_name='service_role' AND (can_insert OR can_update OR can_delete)),
 'service_role_set_role_gateway_candidate',(SELECT EXISTS(SELECT 1 FROM role_edges WHERE actor='authenticator' AND target='service_role')),
 'missing_named_functions',(SELECT coalesce(pg_catalog.jsonb_agg(name ORDER BY name),'[]'::jsonb) FROM functions WHERE oid IS NULL),
 'effective_named_function_execute',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY function_name,role_name),'[]'::jsonb) FROM effective_function_execute x WHERE role_name <> 'postgres'),
 'guarded_table_triggers',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY table_name,trigger_name),'[]'::jsonb) FROM trigger_catalog x),
 'indirect_dynamic_calls_verified',false,
 'deployed_credential_binding_verified',false,
 'cutover_authorized',false
) AS d3e28_snapshot;
