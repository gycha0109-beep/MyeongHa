-- R2-H unit 1: immutable metadata-only finalizer snapshot (PG17 isolated).
-- NO function definition, ACL, role graph or user data is emitted.
-- Watchtower-Track: ops
WITH fn AS (
 SELECT oid, proowner, proacl, prosecdef, proconfig
 FROM pg_catalog.pg_proc
 WHERE oid=pg_catalog.to_regprocedure('public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)')
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-h-1520-isolated-v1',
 'postgresMajor',current_setting('server_version_num')::integer/10000,
 'functionCount',(SELECT count(*) FROM fn),
 'functionDdlSha256',(SELECT encode(sha256(convert_to(pg_catalog.pg_get_functiondef(oid),'UTF8')),'hex') FROM fn),
 'functionOwnerSha256',(SELECT encode(sha256(convert_to(proowner::text,'UTF8')),'hex') FROM fn),
 'functionRawAclSha256',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex') FROM fn),
 'securityDefiner',(SELECT prosecdef FROM fn),
 'searchPathHardened',(SELECT 'search_path=pg_catalog, public'=ANY(coalesce(proconfig,ARRAY[]::text[])) FROM fn),
 'anonExecute',(SELECT has_function_privilege('anon',oid,'EXECUTE') FROM fn),
 'authenticatedExecute',(SELECT has_function_privilege('authenticated',oid,'EXECUTE') FROM fn),
 'serviceRoleExecute',(SELECT has_function_privilege('service_role',oid,'EXECUTE') FROM fn),
 'apiExecutorExecute',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE') FROM fn),
 'later1530ObjectExists',(to_regclass('public.character_reading_artifacts') IS NOT NULL),
 'reviewUnit','deletion',
 'authorizedForProduction',false,'drReady',false
)::text;
