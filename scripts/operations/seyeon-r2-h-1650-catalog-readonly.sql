-- R2-H 1650 PG17 metadata-only source owner/ACL and governed admission identity.
-- No raw DDL, role graph, rows, tokens or personally identifying data.
-- Watchtower-Track: ops
WITH meter AS (
 SELECT oid FROM pg_catalog.pg_roles WHERE rolname='myeongha_seyeon_cost_meter_owner'
), runner AS (
 SELECT oid FROM pg_catalog.pg_roles WHERE rolname='myeongha_seyeon_governed_executor'
), admission AS (
 SELECT oid,proowner,proacl FROM pg_catalog.pg_proc
 WHERE oid=to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)')
), helper AS (
 SELECT oid,proowner,prosecdef,proconfig FROM pg_catalog.pg_proc
 WHERE oid=to_regprocedure('public.seyeon_ai_lock_active_subject_for_cost_v1(uuid)')
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-h-1650-active-subject-pg17-v1',
 'pgMajor',current_setting('server_version_num')::integer/10000,
 'meterCount',(SELECT count(*) FROM meter),
 'governedRoleCount',(SELECT count(*) FROM runner),
 'subjectTableExists',to_regclass('public.subjects') IS NOT NULL,
 'admissionCount',(SELECT count(*) FROM admission),
 'admissionDdlSha',(SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') FROM admission),
 'admissionOwnerSha',(SELECT encode(sha256(convert_to(proowner::text,'UTF8')),'hex') FROM admission),
 'admissionAclSha',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex') FROM admission),
 'helperCount',(SELECT count(*) FROM helper),
 'helperSecurityDefiner',(SELECT prosecdef FROM helper),
 'helperSearchPathHardened',(SELECT replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%' FROM helper),
 'helperOwnedByCostMeter',(SELECT proowner=(SELECT oid FROM meter) FROM helper),
 'helperOwnedByMigrationUser',(SELECT proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user) FROM helper),
 'helperOwnerSuperuser',(SELECT r.rolsuper FROM helper h JOIN pg_catalog.pg_roles r ON r.oid=h.proowner),
 'meterExecHelper',(SELECT has_function_privilege('myeongha_seyeon_cost_meter_owner',oid,'EXECUTE') FROM helper),
 'runnerExecHelper',(SELECT has_function_privilege('myeongha_seyeon_governed_executor',oid,'EXECUTE') FROM helper),
 'apiExecHelper',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE') FROM helper),
 'browserOrServiceExecHelper',(SELECT has_function_privilege('anon',oid,'EXECUTE')
   OR has_function_privilege('authenticated',oid,'EXECUTE')
   OR has_function_privilege('service_role',oid,'EXECUTE') FROM helper),
 'ownerMembershipCount',(SELECT count(*) FROM pg_catalog.pg_auth_members a JOIN meter m ON a.roleid=m.oid
  JOIN pg_catalog.pg_roles u ON u.oid=a.member WHERE u.rolname=current_user),
 'later1670GuestResolverExists',to_regprocedure('public.begin_seyeon_governed_guest_subject_context_v1(text)') IS NOT NULL,
 'reviewUnit','governor-subject-lock',
 'authorizedForProduction',false,
 'actualOriginalCommitVerified',false,
 'drReady',false
)::text;
