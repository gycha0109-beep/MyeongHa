-- R2-H unit 2 / 1530 protected metadata snapshot. pg_catalog only.
-- Replayed ONLY in disposable PG17 after 1510+known timestamped and 1520.
-- Do not emit row content, function body, role graph, ACL text, or personal data.
-- Watchtower-Track: ops
WITH parent_fn AS (
 SELECT p.oid,p.proowner,p.proacl FROM pg_catalog.pg_proc p
 WHERE p.oid=pg_catalog.to_regprocedure('public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)')
), artifact AS (
 SELECT c.oid,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_catalog.pg_class c
 WHERE c.oid=pg_catalog.to_regclass('public.character_reading_artifacts') AND c.relkind='r'
), narrow_role AS (
 SELECT oid,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls
 FROM pg_catalog.pg_roles
 WHERE rolname='myeongha_character_reading_artifact_runtime_owner'
), writer AS (
 SELECT oid,proowner,prosecdef,proconfig
 FROM pg_catalog.pg_proc
 WHERE oid=pg_catalog.to_regprocedure(
 'public.cmd_commit_character_face_governed_reading_artifact_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)')
), trg AS (
 SELECT t.oid,t.tgtype,t.tgenabled
 FROM pg_catalog.pg_trigger t JOIN artifact a ON t.tgrelid=a.oid
 WHERE NOT t.tgisinternal AND t.tgname='tr_character_reading_artifact_immutable_v1'
  AND t.tgfoid=pg_catalog.to_regprocedure('public.tr_character_reading_artifact_immutable_v1()')
), policy AS (
 SELECT p.polname,p.polcmd,p.polroles,p.polqual,p.polwithcheck,p.polrelid
 FROM pg_catalog.pg_policy p JOIN artifact a ON p.polrelid=a.oid
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-h-1530-artifact-isolated-v1',
 'postgresMajor',pg_catalog.current_setting('server_version_num')::integer/10000,
 'parentFunctionCount',(SELECT count(*) FROM parent_fn),
 'parentDdlSha256',(SELECT encode(sha256(convert_to(pg_catalog.pg_get_functiondef(oid),'UTF8')),'hex') FROM parent_fn),
 'parentOwnerSha256',(SELECT encode(sha256(convert_to(proowner::text,'UTF8')),'hex') FROM parent_fn),
 'parentRawAclSha256',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex') FROM parent_fn),
 'tableCount',(SELECT count(*) FROM artifact),
 'tableRls',(SELECT relrowsecurity FROM artifact),
 'tableForceRls',(SELECT relforcerowsecurity FROM artifact),
 'primaryKeyCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN artifact a ON c.conrelid=a.oid WHERE c.contype='p'),
 'uniqueCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN artifact a ON c.conrelid=a.oid WHERE c.contype='u'),
 'foreignKeyCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN artifact a ON c.conrelid=a.oid WHERE c.contype='f'),
 'checkCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN artifact a ON c.conrelid=a.oid WHERE c.contype='c'),
 'indexCount',(SELECT count(*) FROM pg_catalog.pg_index i JOIN artifact a ON i.indrelid=a.oid),
 'triggerCount',(SELECT count(*) FROM trg),
 'triggerBeforeUpdateDelete',(SELECT tgtype=27 AND tgenabled='O' FROM trg),
 'policyCount',(SELECT count(*) FROM policy),
 'narrowPolicies',(
 SELECT count(*) FROM policy p
 WHERE p.polname IN ('character_reading_artifacts_runtime_select_v1',
                     'character_reading_artifacts_runtime_insert_v1')
 AND p.polcmd IN ('r','a')
 AND p.polroles=ARRAY[(SELECT oid FROM narrow_role)]::oid[]
 AND (
  (p.polcmd='r' AND p.polqual IS NOT NULL
      AND pg_catalog.pg_get_expr(p.polqual,p.polrelid) LIKE '%face_governed_reading%'
      AND pg_catalog.pg_get_expr(p.polqual,p.polrelid) LIKE '%current_myeongha_subject_id%')
  OR (p.polcmd='a' AND p.polwithcheck IS NOT NULL
      AND pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) LIKE '%face_governed_reading%'
      AND pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) LIKE '%current_myeongha_subject_id%')
 )),
 'ownerRoleCount',(SELECT count(*) FROM narrow_role),
 'ownerRoleLeastPrivilege',(SELECT NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls) FROM narrow_role),
 'creatorRoleMembership',(CASE WHEN EXISTS(SELECT 1 FROM narrow_role) THEN
  pg_catalog.pg_has_role(current_user,'myeongha_character_reading_artifact_runtime_owner','MEMBER')
  ELSE false END),
 'ownerRoleSchemaCreate',(CASE WHEN EXISTS(SELECT 1 FROM narrow_role) THEN
  pg_catalog.has_schema_privilege('myeongha_character_reading_artifact_runtime_owner','public','CREATE')
  ELSE false END),
 'writerFunctionCount',(SELECT count(*) FROM writer),
 'writerSecurityDefiner',(SELECT prosecdef FROM writer),
 'writerSearchPathHardened',(SELECT 'search_path=pg_catalog, public'=ANY(coalesce(proconfig,ARRAY[]::text[])) FROM writer),
 'writerOwnedByNarrowRole',(SELECT proowner=(SELECT oid FROM narrow_role) FROM writer),
 'apiWriterExecute',(SELECT pg_catalog.has_function_privilege('myeongha_api_executor',oid,'EXECUTE') FROM writer),
 'anonWriterExecute',(SELECT pg_catalog.has_function_privilege('anon',oid,'EXECUTE') FROM writer),
 'authenticatedWriterExecute',(SELECT pg_catalog.has_function_privilege('authenticated',oid,'EXECUTE') FROM writer),
 'serviceWriterExecute',(SELECT pg_catalog.has_function_privilege('service_role',oid,'EXECUTE') FROM writer),
 'anonTableDml',(SELECT pg_catalog.has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') FROM artifact),
 'authenticatedTableDml',(SELECT pg_catalog.has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') FROM artifact),
 'serviceTableDml',(SELECT pg_catalog.has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE') FROM artifact),
 'apiTableDml',(SELECT pg_catalog.has_table_privilege('myeongha_api_executor',oid,'SELECT,INSERT,UPDATE,DELETE') FROM artifact),
 'reviewUnit','character-artifact',
 'authorizedForProduction',false,'drReady',false
)::text;
