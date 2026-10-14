-- R2-F: READ ONLY, PG17. Fixed-category effective EXECUTE / direct grant / owner inheritance.
-- Execute only in authorized environments; keep raw result protected.
-- No source SQL, ACL text, membership edges, grantor identities, or user rows are selected.
-- Watchtower-Track: ops
WITH fn AS (
 SELECT p.oid,p.proowner,p.proacl
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='assert_seyeon_chat_thread_runtime_v1'
 AND p.proargtypes='uuid uuid'::pg_catalog.oidvector
), targets(kind,rolename) AS (VALUES
 ('server_service','service_role'),
 ('api_executor','myeongha_api_executor'),
 ('function_owner','myeongha_seyeon_chat_runtime_owner'),
 ('browser_anon','anon'),
 ('browser_authenticated','authenticated')
), checks AS (
 SELECT t.kind, r.oid IS NOT NULL AS role_exists,
 CASE WHEN r.oid IS NULL THEN false ELSE pg_catalog.has_function_privilege(r.oid,fn.oid,'EXECUTE') END AS effective_execute,
 CASE WHEN r.oid IS NULL THEN false ELSE pg_catalog.has_schema_privilege(r.oid,'public','USAGE') END AS schema_usage,
 CASE WHEN r.oid IS NULL THEN false ELSE pg_catalog.pg_has_role(r.oid,fn.proowner,'USAGE') END AS inherits_owner,
 CASE WHEN r.oid IS NULL THEN false ELSE pg_catalog.pg_has_role(r.oid,fn.proowner,'SET') END AS can_set_owner,
 EXISTS (
 SELECT 1 FROM pg_catalog.aclexplode(coalesce(fn.proacl,pg_catalog.acldefault('f',fn.proowner))) acl
 WHERE acl.grantee=r.oid AND acl.privilege_type='EXECUTE'
 ) AS direct_execute
 FROM fn CROSS JOIN targets t
 LEFT JOIN pg_catalog.pg_roles r ON r.rolname=t.rolename
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-effective-helper-v1',
 'postgresMajor',pg_catalog.current_setting('server_version_num')::int / 10000,
 'functionCount',(SELECT count(*) FROM fn),
 'roleResults',(SELECT pg_catalog.jsonb_object_agg(kind,pg_catalog.jsonb_build_object(
 'exists',role_exists,'directExecute',direct_execute,
 'effectiveExecute',effective_execute,'schemaUsage',schema_usage,
 'inheritsOwner',inherits_owner,'canSetOwner',can_set_owner)) FROM checks),
 'originEstablished',false,'authorizedForProduction',false,'drReady',false
)::text;
