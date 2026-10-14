-- R2-H 1600/1610: catalog only, no raw SQL DDL/ACL/role graph/personal rows.
-- Disposable PostgreSQL 17; 5 states, all changes rolled back.
-- Watchtower-Track: ops
WITH rate_table AS (
 SELECT oid FROM pg_catalog.pg_class
 WHERE oid=to_regclass('public.seyeon_ai_governor_model_policies_v1') AND relkind='r'
), meter AS (
 SELECT oid FROM pg_catalog.pg_roles WHERE rolname='myeongha_seyeon_cost_meter_owner'
), guard AS (
 SELECT oid,prosecdef,proconfig FROM pg_catalog.pg_proc
 WHERE oid=to_regprocedure('public.guard_seyeon_ai_governor_rate_card_v1()')
), trg AS (
 SELECT t.oid,t.tgtype,t.tgenabled FROM pg_catalog.pg_trigger t
 JOIN rate_table r ON t.tgrelid=r.oid
 WHERE t.tgname='guard_seyeon_ai_governor_rate_card_v1'
 AND t.tgfoid=to_regprocedure('public.guard_seyeon_ai_governor_rate_card_v1()')
 AND NOT t.tgisinternal
), legacy AS (
 SELECT oid,proowner,prosecdef,proconfig,proacl
 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure(
 'public.cmd_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)')
), governed AS (
 SELECT oid,proowner,prosecdef,proconfig,proacl
 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure(
 'public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)')
), helper AS (
 SELECT oid,proowner,prosecdef,proconfig FROM pg_catalog.pg_proc WHERE oid=to_regprocedure(
 'public.seyeon_ai_settle_internal_v1(uuid,uuid,uuid,text,jsonb)')
)
SELECT pg_catalog.jsonb_build_object(
 'schema','seyeon-r2-h-1600-1610-guard-pg17-v1',
 'pgMajor',current_setting('server_version_num')::integer/10000,
 'rateTableCount',(SELECT count(*) FROM rate_table),
 'meterCount',(SELECT count(*) FROM meter),
 'governedCount',(SELECT count(*) FROM governed),
 'legacyCount',(SELECT count(*) FROM legacy),
 'rateGuardCount',(SELECT count(*) FROM guard),
 'rateTriggerCount',(SELECT count(*) FROM trg),
 'rateTriggerBeforeUpdateDelete',(SELECT tgtype=27 AND tgenabled='O' FROM trg),
 'guardInvokerHardened',(SELECT NOT prosecdef AND
   replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%' FROM guard),
 'guardClientExec',(SELECT has_function_privilege('anon',oid,'EXECUTE') OR
   has_function_privilege('authenticated',oid,'EXECUTE') OR
   has_function_privilege('service_role',oid,'EXECUTE') FROM guard),
 'legacyDefinerHardened',(SELECT prosecdef AND proowner=(SELECT oid FROM meter) AND
   replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%' FROM legacy),
 'legacyExecutor',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE') FROM legacy),
 'legacyClientExecute',(SELECT has_function_privilege('anon',oid,'EXECUTE') OR
   has_function_privilege('authenticated',oid,'EXECUTE') OR
   has_function_privilege('service_role',oid,'EXECUTE') FROM legacy),
 'governedDefinerHardened',(SELECT prosecdef AND proowner=(SELECT oid FROM meter) AND
   replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%' FROM governed),
 'governedExecutor',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE') FROM governed),
 'governedClientExecute',(SELECT has_function_privilege('anon',oid,'EXECUTE') OR
   has_function_privilege('authenticated',oid,'EXECUTE') OR
   has_function_privilege('service_role',oid,'EXECUTE') FROM governed),
 'helperCount',(SELECT count(*) FROM helper),
 'helperDefinerHardened',(SELECT prosecdef AND proowner=(SELECT oid FROM meter) AND
   replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%' FROM helper),
 'helperExecutor',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE') FROM helper),
 'helperClientExecute',(SELECT has_function_privilege('anon',oid,'EXECUTE') OR
   has_function_privilege('authenticated',oid,'EXECUTE') OR
   has_function_privilege('service_role',oid,'EXECUTE') FROM helper),
 'legacyDdlDigest',(SELECT encode(sha256(convert_to(pg_catalog.pg_get_functiondef(oid),'UTF8')),'hex') FROM legacy),
 'governedDdlDigest',(SELECT encode(sha256(convert_to(pg_catalog.pg_get_functiondef(oid),'UTF8')),'hex') FROM governed),
 'legacyAclDigest',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex') FROM legacy),
 'governedAclDigest',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex') FROM governed),
 'creatorMembershipCount',(SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN meter r ON m.roleid=r.oid
 JOIN pg_catalog.pg_roles u ON m.member=u.oid WHERE u.rolname=current_user),
 'meterRoleSchemaCreate',(SELECT has_schema_privilege('myeongha_seyeon_cost_meter_owner','public','CREATE') FROM meter),
 'future1620Applied',(to_regprocedure('public.seyeon_ai_start_internal_v1(uuid,uuid,uuid,text,uuid,text,text,text)') IS NOT NULL),
 'ownerUnit','cost-governor-foundation',
 'authorizedForProduction',false,'drReady',false
)::text;
