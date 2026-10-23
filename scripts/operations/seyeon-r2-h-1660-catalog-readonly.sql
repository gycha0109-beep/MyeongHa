-- R2-H 1660 Member/Reader locator, catalog-only, no IDs/rows/SQL body or ACL text.
-- Disposable PostgreSQL 17, independent of 1650 or future 1670–1720.
-- Watchtower-Track: ops
WITH locator AS (
 SELECT p.oid,p.prosecdef,p.provolatile,p.proconfig,p.proacl,p.proowner
 FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure(
 'public.qry_member_single_character_thread_locator_v1(uuid,text)')
), thread_table AS (
 SELECT c.oid FROM pg_catalog.pg_class c
 WHERE c.oid=to_regclass('public.conversation_threads') AND c.relkind='r'
), participants AS (
 SELECT c.oid FROM pg_catalog.pg_class c
 WHERE c.oid=to_regclass('public.conversation_thread_characters') AND c.relkind='r'
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-h-1660-reader-locator-pg17-v1',
 'pgMajor',current_setting('server_version_num')::integer/10000,
 'subjectsPresent',to_regclass('public.subjects') IS NOT NULL,
 'threadCount',(SELECT count(*) FROM thread_table),
 'participantCount',(SELECT count(*) FROM participants),
 'locatorCount',(SELECT count(*) FROM locator),
 'locatorInvoker',(SELECT NOT prosecdef FROM locator),
 'locatorStable',(SELECT provolatile='s' FROM locator),
 'searchPathHardened',(SELECT replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%' FROM locator),
 'apiExecutor',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE') FROM locator),
 'browserServiceExec',(SELECT has_function_privilege('anon',oid,'EXECUTE')
  OR has_function_privilege('authenticated',oid,'EXECUTE')
  OR has_function_privilege('service_role',oid,'EXECUTE') FROM locator),
 'functionDdlSha',(SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') FROM locator),
 'functionRawAclSha',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex') FROM locator),
 'later1670Exists',to_regprocedure('public.begin_seyeon_governed_guest_subject_context_v1(text)') IS NOT NULL,
 'reviewUnit','reader-locator',
 'purchaseEntitlementVerified',false,
 'ambiguousTwoThreadRuntimeVerified',false,
 'readerPublicationEnabled',false,
 'authorizedForProduction',false,'drReady',false
)::text;
