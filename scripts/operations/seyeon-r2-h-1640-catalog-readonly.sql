-- R2-H 1640 ZERO-personal-source Pin: PG17 isolated, catalog-only protected proof.
-- Do not emit customer rows, SQL function body, raw ACL, role graph, or proof markers.
-- Watchtower-Track: ops
WITH attempts AS (
 SELECT c.oid FROM pg_catalog.pg_class c
 WHERE c.oid=to_regclass('public.chat_turn_attempts') AND c.relkind='r'
), owner_role AS (
 SELECT oid,rolcanlogin,rolsuper,rolbypassrls
 FROM pg_catalog.pg_roles WHERE rolname='myeongha_seyeon_chat_runtime_owner'
), legacy AS (
 SELECT p.oid,p.proowner,p.proacl
 FROM pg_catalog.pg_proc p
 WHERE p.oid=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_runtime_v1(uuid,uuid,uuid)')
), pinned AS (
 SELECT p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig
 FROM pg_catalog.pg_proc p
 WHERE p.oid=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)')
), trigger_fn AS (
 SELECT p.oid,p.prosecdef,p.proconfig FROM pg_catalog.pg_proc p
 WHERE p.oid=to_regprocedure('public.tr_seyeon_zero_source_pin_immutable_v1()')
), trg AS (
 SELECT t.oid,t.tgtype,t.tgenabled FROM pg_catalog.pg_trigger t JOIN attempts a ON a.oid=t.tgrelid
 WHERE t.tgname='tr_seyeon_zero_source_pin_immutable_v1' AND NOT t.tgisinternal
 AND t.tgfoid=to_regprocedure('public.tr_seyeon_zero_source_pin_immutable_v1()')
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-h-1640-zero-source-pg17-v1',
 'pgMajor',current_setting('server_version_num')::integer/10000,
 'attemptTableCount',(SELECT count(*) FROM attempts),
 'pinColumnCount',(SELECT count(*) FROM pg_catalog.pg_attribute c JOIN attempts a ON a.oid=c.attrelid
 WHERE c.attname IN ('seyeon_personal_source_pin_jsonb','seyeon_personal_source_pinned_at') AND c.attnum>0 AND NOT c.attisdropped),
 'pinColumnsCorrectTypes',(SELECT count(*) FROM pg_catalog.pg_attribute c JOIN attempts a ON a.oid=c.attrelid
 WHERE (c.attname='seyeon_personal_source_pin_jsonb' AND c.atttypid='jsonb'::regtype)
 OR (c.attname='seyeon_personal_source_pinned_at' AND c.atttypid='timestamp with time zone'::regtype)),
 'pinShapeCheckCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN attempts a ON a.oid=c.conrelid
 WHERE c.conname='chat_attempt_seyeon_source_pin_shape_v1' AND c.contype='c'),
 'pinTriggerCount',(SELECT count(*) FROM trg),
 'pinTriggerBeforeUpdate',(SELECT tgtype=19 AND tgenabled='O' FROM trg),
 'pinTriggerInvokerHardened',(SELECT NOT prosecdef AND replace(array_to_string(proconfig,';'),' ','')
 LIKE '%search_path=pg_catalog,public%' FROM trigger_fn),
 'pinnedFunctionCount',(SELECT count(*) FROM pinned),
 'pinnedOwnerAndDefiner',(SELECT proowner=(SELECT oid FROM owner_role) AND prosecdef AND
 replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%' FROM pinned),
 'pinnedApiExecutor',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE') FROM pinned),
 'pinnedBrowserServiceExecutor',(SELECT
 has_function_privilege('anon',oid,'EXECUTE') OR
 has_function_privilege('authenticated',oid,'EXECUTE') OR
 has_function_privilege('service_role',oid,'EXECUTE') FROM pinned),
 'legacyFunctionCount',(SELECT count(*) FROM legacy),
 'legacyApiExecutor',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE') FROM legacy),
 'legacyBrowserServiceExecutor',(SELECT
 has_function_privilege('anon',oid,'EXECUTE') OR
 has_function_privilege('authenticated',oid,'EXECUTE') OR
 has_function_privilege('service_role',oid,'EXECUTE') FROM legacy),
 'legacyDdlSha256',(SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') FROM legacy),
 'legacyOwnerSha256',(SELECT encode(sha256(convert_to(proowner::text,'UTF8')),'hex') FROM legacy),
 'legacyAclSha256',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex') FROM legacy),
 'ownerRoleCount',(SELECT count(*) FROM owner_role),
 'ownerRoleNonLoginNonBypass',(SELECT NOT (rolcanlogin OR rolsuper OR rolbypassrls) FROM owner_role),
 'creatorDirectMembershipCount',(SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN owner_role r ON r.oid=m.roleid
 JOIN pg_catalog.pg_roles u ON m.member=u.oid WHERE u.rolname=current_user),
 'ownerSchemaCreate',(SELECT has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE') FROM owner_role),
 'reviewUnit','g1-memory-pin',
 'authorizedForProduction',false,'g1PositiveAdmissionAllowed',false,'drReady',false
)::text;
