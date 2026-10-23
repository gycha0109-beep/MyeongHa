-- R2-H 1550/1560/1570 disposable PG17 catalog-only snapshots.
-- No function definitions, raw ACL, creator role graph, row data or SQL source emitted.
-- Watchtower-Track: ops
WITH ledger AS (
  SELECT c.oid,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_catalog.pg_class c WHERE c.oid=pg_catalog.to_regclass('public.seyeon_ai_call_cost_events') AND c.relkind='r'
), meter AS (
  SELECT r.oid,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolinherit,r.rolreplication,r.rolbypassrls
  FROM pg_catalog.pg_roles r WHERE r.rolname='myeongha_seyeon_cost_meter_owner'
), target_functions AS (
  SELECT p.oid,p.proname,p.proowner,p.prosecdef,p.proconfig
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace='public'::regnamespace AND p.proname IN (
    'cleanup_seyeon_ai_cost_on_attempt_delete_v1',
    'cmd_record_seyeon_ai_call_cost_v1','qry_seyeon_ai_turn_cost_v1',
    'cmd_start_seyeon_ai_call_v1','cmd_settle_seyeon_ai_call_v1',
    'qry_seyeon_ai_model_cost_v1','qry_seyeon_ai_unsettled_calls_v1'
  )
), cost_policies AS (
  SELECT p.oid,p.polname,p.polrelid FROM pg_catalog.pg_policy p
  WHERE p.polname IN (
    'seyeon_ai_cost_turn_owner_read','seyeon_ai_cost_attempt_owner_read',
    'seyeon_ai_cost_ledger_owner_read','seyeon_ai_cost_ledger_owner_insert',
    'seyeon_ai_cost_ledger_owner_cleanup','seyeon_ai_cost_ledger_owner_update_v1'
  )
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-h-cost-foundation-pg17-v1',
 'pgMajor',current_setting('server_version_num')::integer/10000,
 'tableCount',(SELECT count(*) FROM ledger),
 'rowSecurity',(SELECT relrowsecurity FROM ledger),
 'forceRowSecurity',(SELECT relforcerowsecurity FROM ledger),
 'columnCount',(SELECT count(*) FROM pg_catalog.pg_attribute a JOIN ledger l ON a.attrelid=l.oid WHERE a.attnum>0 AND NOT a.attisdropped),
 'pkCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN ledger l ON c.conrelid=l.oid AND c.contype='p'),
 'checkCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN ledger l ON c.conrelid=l.oid AND c.contype='c'),
 'indexCount',(SELECT count(*) FROM pg_catalog.pg_index i JOIN ledger l ON i.indrelid=l.oid),
 'costPolicyCount',(SELECT count(*) FROM cost_policies),
 'ledgerPolicyCount',(SELECT count(*) FROM cost_policies p JOIN ledger l ON p.polrelid=l.oid),
 'cleanupTriggerCount',(
  SELECT count(*) FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid=pg_catalog.to_regclass('public.chat_turn_attempts')
    AND t.tgname='cleanup_seyeon_ai_cost_on_attempt_delete_v1'
    AND t.tgtype=9 AND t.tgenabled='O'
    AND t.tgfoid=pg_catalog.to_regprocedure('public.cleanup_seyeon_ai_cost_on_attempt_delete_v1()')
 ),
 'lifecycleColumnCount',(SELECT count(*) FROM pg_catalog.pg_attribute a JOIN ledger l ON a.attrelid=l.oid WHERE a.attname='lifecycle_state' AND NOT a.attisdropped),
 'lifecycleShapeConstraintCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN ledger l ON c.conrelid=l.oid WHERE c.conname='seyeon_ai_cost_lifecycle_shape_check'),
 'meterRoleCount',(SELECT count(*) FROM meter),
 'meterRoleLeastPrivilege',(SELECT count(*) FROM meter WHERE NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)),
 'creatorDirectMembershipCount',(SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN meter r ON r.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member AND u.rolname=current_user),
 'meterRoleSchemaCreate',(SELECT pg_catalog.has_schema_privilege('myeongha_seyeon_cost_meter_owner','public','CREATE') FROM meter),
 'meterRoleTableUpdate',(SELECT pg_catalog.has_table_privilege('myeongha_seyeon_cost_meter_owner',l.oid,'UPDATE') FROM ledger l),
 'meterRoleTableDelete',(SELECT pg_catalog.has_table_privilege('myeongha_seyeon_cost_meter_owner',l.oid,'DELETE') FROM ledger l),
 'functionCount',(SELECT count(*) FROM target_functions),
 'ownedFunctionCount',(SELECT count(*) FROM target_functions f JOIN meter r ON f.proowner=r.oid),
 'definerCount',(SELECT count(*) FROM target_functions f WHERE f.prosecdef),
 'invokerCount',(SELECT count(*) FROM target_functions f WHERE NOT f.prosecdef),
 'hardenedSearchPathCount',(SELECT count(*) FROM target_functions f WHERE replace(array_to_string(f.proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%'),
 'apiCallableCount',(SELECT count(*) FROM target_functions f WHERE pg_catalog.has_function_privilege('myeongha_api_executor',f.oid,'EXECUTE')),
 'browserOrServiceCallable',(SELECT coalesce(bool_or(pg_catalog.has_function_privilege('anon',f.oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated',f.oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('service_role',f.oid,'EXECUTE')),false) FROM target_functions f),
 'cleanupApiCallable',(SELECT coalesce(bool_or(pg_catalog.has_function_privilege('myeongha_api_executor',f.oid,'EXECUTE')),false) FROM target_functions f WHERE f.proname='cleanup_seyeon_ai_cost_on_attempt_delete_v1'),
 'anonTableDml',(SELECT pg_catalog.has_table_privilege('anon',l.oid,'SELECT,INSERT,UPDATE,DELETE') FROM ledger l),
 'authenticatedTableDml',(SELECT pg_catalog.has_table_privilege('authenticated',l.oid,'SELECT,INSERT,UPDATE,DELETE') FROM ledger l),
 'serviceRoleTableDml',(SELECT pg_catalog.has_table_privilege('service_role',l.oid,'SELECT,INSERT,UPDATE,DELETE') FROM ledger l),
 'apiExecutorTableDml',(SELECT pg_catalog.has_table_privilege('myeongha_api_executor',l.oid,'SELECT,INSERT,UPDATE,DELETE') FROM ledger l),
 'future1580Applied',(pg_catalog.to_regclass('public.seyeon_ai_governor_model_policies_v1') IS NOT NULL),
 'reviewUnit','cost-governor-foundation',
 'authorizedForProduction',false,'drReady',false
)::text;
