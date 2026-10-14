-- R2-H 1620/1630: strict catalog-only snapshot, disposable PostgreSQL 17.
-- No raw function DDL, raw ACL, credential, SQL body, role graph or customer rows.
-- Watchtower-Track: ops
WITH m AS (
 SELECT oid FROM pg_catalog.pg_roles WHERE rolname='myeongha_seyeon_cost_meter_owner'
), governed_role AS (
 SELECT oid,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,
        rolreplication,rolbypassrls
 FROM pg_catalog.pg_roles WHERE rolname='myeongha_seyeon_governed_executor'
), f AS (
 SELECT p.oid,p.proname,p.proowner,p.prosecdef,p.proconfig,p.proacl
 FROM pg_catalog.pg_proc p WHERE p.pronamespace='public'::regnamespace
 AND p.proname IN (
 'cmd_start_seyeon_ai_call_v1','cmd_governed_start_seyeon_ai_call_v1',
 'cmd_settle_seyeon_ai_call_v1','cmd_governed_settle_seyeon_ai_call_v1',
 'cmd_record_seyeon_ai_call_cost_v1',
 'seyeon_ai_start_internal_v1','seyeon_ai_settle_internal_v1',
 'current_myeongha_subject_id','assert_myeongha_subject_context_v1',
 'begin_member_subject_context_v1','begin_guest_subject_context_v1')
), role_flags AS (
 SELECT r.oid,
  (NOT (r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
    OR r.rolinherit OR r.rolreplication OR r.rolbypassrls)) AS least_priv
 FROM governed_role r
), starts AS (
 SELECT oid,proname,proowner,prosecdef,proconfig,proacl FROM f
 WHERE proname IN ('cmd_start_seyeon_ai_call_v1','cmd_governed_start_seyeon_ai_call_v1')
), exposed AS (
 SELECT * FROM f
 WHERE proname IN ('cmd_start_seyeon_ai_call_v1','cmd_governed_start_seyeon_ai_call_v1',
                    'cmd_settle_seyeon_ai_call_v1','cmd_governed_settle_seyeon_ai_call_v1')
), priv AS (
 SELECT * FROM f WHERE proname IN ('seyeon_ai_start_internal_v1','seyeon_ai_settle_internal_v1')
)
SELECT pg_catalog.jsonb_build_object(
 'schema','r2-h-1620-1630-governed-private-v1',
 'pgMajor',current_setting('server_version_num')::integer/10000,
 'costLedgerPresent',to_regclass('public.seyeon_ai_call_cost_events') IS NOT NULL,
 'costMeterRoleCount',(SELECT count(*) FROM m),
 'exposedCount',(SELECT count(*) FROM exposed),
 'privateSettleCount',(SELECT count(*) FROM priv WHERE proname='seyeon_ai_settle_internal_v1'),
 'privateStartCount',(SELECT count(*) FROM priv WHERE proname='seyeon_ai_start_internal_v1'),
 'privateStartSecure',(SELECT prosecdef AND proowner=(SELECT oid FROM m)
   AND replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%'
   FROM priv WHERE proname='seyeon_ai_start_internal_v1'),
 'privateStartApiExecute',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE')
   FROM priv WHERE proname='seyeon_ai_start_internal_v1'),
 'privateStartClientExecute',(SELECT has_function_privilege('anon',oid,'EXECUTE')
    OR has_function_privilege('authenticated',oid,'EXECUTE')
    OR has_function_privilege('service_role',oid,'EXECUTE')
   FROM priv WHERE proname='seyeon_ai_start_internal_v1'),
 'privateSettleSecure',(SELECT prosecdef AND proowner=(SELECT oid FROM m)
   AND replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%'
   FROM priv WHERE proname='seyeon_ai_settle_internal_v1'),
 'privateSettleApiExecute',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE')
   FROM priv WHERE proname='seyeon_ai_settle_internal_v1'),
 'privateSettleClientExecute',(SELECT has_function_privilege('anon',oid,'EXECUTE')
    OR has_function_privilege('authenticated',oid,'EXECUTE')
    OR has_function_privilege('service_role',oid,'EXECUTE')
   FROM priv WHERE proname='seyeon_ai_settle_internal_v1'),
 'exposedOwnedSecureCount',(SELECT count(*) FROM exposed
   WHERE prosecdef AND proowner=(SELECT oid FROM m)
     AND replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%'),
 'apiExposedExecuteCount',(SELECT count(*) FROM exposed
   WHERE has_function_privilege('myeongha_api_executor',oid,'EXECUTE')),
 'clientExposedExecuteCount',(SELECT count(*) FROM exposed
   WHERE has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE')
         OR has_function_privilege('service_role',oid,'EXECUTE')),
 'legacyStartDdlSha',(SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')
   FROM starts WHERE proname='cmd_start_seyeon_ai_call_v1'),
 'governedStartDdlSha',(SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')
   FROM starts WHERE proname='cmd_governed_start_seyeon_ai_call_v1'),
 'legacyStartAclSha',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex')
   FROM starts WHERE proname='cmd_start_seyeon_ai_call_v1'),
 'governedStartAclSha',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex')
   FROM starts WHERE proname='cmd_governed_start_seyeon_ai_call_v1'),
 'legacySettleAclSha',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex')
   FROM exposed WHERE proname='cmd_settle_seyeon_ai_call_v1'),
 'governedSettleAclSha',(SELECT encode(sha256(convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex')
   FROM exposed WHERE proname='cmd_governed_settle_seyeon_ai_call_v1'),
 'governedRoleCount',(SELECT count(*) FROM governed_role),
 'governedRoleLeastPrivilegeCount',(SELECT count(*) FROM role_flags WHERE least_priv),
 'governedRoleMembershipEdgeCount',(SELECT count(*) FROM pg_catalog.pg_auth_members am
   JOIN governed_role g ON g.oid=am.roleid OR g.oid=am.member),
 'governedRoleSchemaUsage',(SELECT has_schema_privilege('myeongha_seyeon_governed_executor','public','USAGE') FROM governed_role),
 'governedRoleSchemaCreate',(SELECT has_schema_privilege('myeongha_seyeon_governed_executor','public','CREATE') FROM governed_role),
 'governedContextFunctions',(SELECT count(*) FROM f JOIN governed_role g ON true
  WHERE f.proname IN ('current_myeongha_subject_id','assert_myeongha_subject_context_v1',
                     'begin_member_subject_context_v1','begin_guest_subject_context_v1')
    AND has_function_privilege('myeongha_seyeon_governed_executor',f.oid,'EXECUTE')),
 'governedCostFunctions',(SELECT count(*) FROM f JOIN governed_role g ON true
  WHERE f.proname IN ('cmd_governed_start_seyeon_ai_call_v1','cmd_governed_settle_seyeon_ai_call_v1')
    AND has_function_privilege('myeongha_seyeon_governed_executor',f.oid,'EXECUTE')),
 'governedLegacyFunctions',(SELECT count(*) FROM f JOIN governed_role g ON true
  WHERE f.proname IN ('cmd_start_seyeon_ai_call_v1','cmd_settle_seyeon_ai_call_v1',
                     'cmd_record_seyeon_ai_call_cost_v1')
    AND has_function_privilege('myeongha_seyeon_governed_executor',f.oid,'EXECUTE')),
 'governedPrivateFunctions',(SELECT count(*) FROM priv JOIN governed_role g ON true
  WHERE has_function_privilege('myeongha_seyeon_governed_executor',priv.oid,'EXECUTE')),
 'governedDirectTableDml',(SELECT coalesce(bool_or(
   has_table_privilege('myeongha_seyeon_governed_executor',c.oid,'SELECT,INSERT,UPDATE,DELETE')),false)
   FROM pg_catalog.pg_class c JOIN governed_role g ON true WHERE c.oid IN
    (to_regclass('public.seyeon_ai_call_cost_events'),
     to_regclass('public.seyeon_ai_governor_model_policies_v1'),
     to_regclass('public.seyeon_ai_governor_daily_budgets_v1'))),
 'meterCreatorMembership',(SELECT count(*) FROM pg_catalog.pg_auth_members am
  JOIN m ON am.roleid=m.oid
  JOIN pg_catalog.pg_roles u ON u.oid=am.member AND u.rolname=current_user),
 'future1640Present',(SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace
  AND proname='cmd_mark_seyeon_chat_context_ready_pinned_v1'),
 'reviewUnit','cost-governor-foundation',
 'authorizedForProduction',false,'credentialProvisioned',false,'drReady',false
)::text;
