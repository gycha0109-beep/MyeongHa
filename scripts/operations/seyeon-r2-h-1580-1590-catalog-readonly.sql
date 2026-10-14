-- R2-H 1580/1590: disposable PG17 metadata only. No row contents or ACL DDL.
-- Watchtower-Track: ops
WITH ledger AS (
  SELECT oid FROM pg_catalog.pg_class WHERE oid=to_regclass('public.seyeon_ai_call_cost_events') AND relkind='r'
), meter AS (
  SELECT oid FROM pg_catalog.pg_roles WHERE rolname='myeongha_seyeon_cost_meter_owner'
), tables AS (
  SELECT c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relname
  FROM pg_catalog.pg_class c WHERE c.oid IN
    (to_regclass('public.seyeon_ai_governor_model_policies_v1'),
     to_regclass('public.seyeon_ai_governor_daily_budgets_v1')) AND c.relkind='r'
), gov_start AS (
  SELECT oid,proowner,prosecdef,proconfig FROM pg_catalog.pg_proc
  WHERE oid=to_regprocedure('public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)')
), gov_settle AS (
  SELECT oid,proowner,prosecdef,proconfig FROM pg_catalog.pg_proc
  WHERE oid=to_regprocedure('public.cmd_governed_settle_seyeon_ai_call_v1(uuid,uuid,uuid,text,jsonb)')
), p AS (
 SELECT polname,polcmd,polroles,polrelid FROM pg_catalog.pg_policy
 WHERE polname IN ('seyeon_ai_governor_model_owner_read_v1','seyeon_ai_governor_day_owner_read_v1','seyeon_ai_governor_day_owner_update_v1')
)
SELECT pg_catalog.jsonb_build_object(
 'version','r2-h-1580-1590-pg17-v1',
 'pgMajor',current_setting('server_version_num')::integer/10000,
 'ledgerCount',(SELECT count(*) FROM ledger),
 'meterRoleCount',(SELECT count(*) FROM meter),
 'legacyStartPresent',(to_regprocedure('public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)') IS NOT NULL),
 'governorTables',(SELECT count(*) FROM tables),
 'governorRlsCount',(SELECT count(*) FROM tables WHERE relrowsecurity AND relforcerowsecurity),
 'governorTableOwnerCount',(SELECT count(*) FROM tables t JOIN meter r ON r.oid=t.relowner),
 'governorPolicyCount',(SELECT count(*) FROM p),
 'governorScopedPolicyCount',(SELECT count(*) FROM p JOIN meter r ON p.polroles=ARRAY[r.oid]::oid[]
   WHERE (p.polname='seyeon_ai_governor_model_owner_read_v1' AND p.polcmd='r')
      OR (p.polname='seyeon_ai_governor_day_owner_read_v1' AND p.polcmd='r')
      OR (p.polname='seyeon_ai_governor_day_owner_update_v1' AND p.polcmd='w')),
 'governorLedgerColumns',(SELECT count(*) FROM pg_catalog.pg_attribute a JOIN ledger l ON a.attrelid=l.oid
   WHERE NOT a.attisdropped AND a.attname IN ('governor_bucket_utc_date','governor_policy_version',
   'governor_price_version','governor_ceiling_micro_usd','governor_input_bound_tokens','governor_output_cap_tokens')),
 'ledgerQuoteCheck',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN ledger l ON l.oid=c.conrelid WHERE c.conname='seyeon_ai_governor_ledger_quote_shape_v1'),
 'ledgerGovernorIndex',(SELECT count(*) FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.seyeon_ai_governor_ledger_subject_day_v1') AND c.relkind='i'),
 'activePolicyUniqueIndex',(SELECT count(*) FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.seyeon_ai_governor_one_active_model_v1') AND c.relkind='i'),
 'ledgerEffectiveStored',(SELECT a.attgenerated='s' FROM pg_catalog.pg_attribute a JOIN ledger l ON a.attrelid=l.oid
   WHERE a.attname='governor_effective_micro_usd' AND NOT a.attisdropped),
 'governedStartCount',(SELECT count(*) FROM gov_start),
 'governedSettleCount',(SELECT count(*) FROM gov_settle),
 'governedStartDdlSha',(SELECT encode(sha256(convert_to(pg_catalog.pg_get_functiondef(oid),'UTF8')),'hex') FROM gov_start),
 'governedStartOwnerValid',(SELECT proowner=(SELECT oid FROM meter) AND prosecdef
   AND 'search_path=pg_catalog, public'=ANY(coalesce(proconfig,ARRAY[]::text[])) FROM gov_start),
 'governedSettleOwnerValid',(SELECT proowner=(SELECT oid FROM meter) AND prosecdef
   AND replace(array_to_string(proconfig,';'),' ','') LIKE '%search_path=pg_catalog,public%' FROM gov_settle),
 'governedStartOnlyApi',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE')
   AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
   AND NOT has_function_privilege('service_role',oid,'EXECUTE') FROM gov_start),
 'governedSettleOnlyApi',(SELECT has_function_privilege('myeongha_api_executor',oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE')
   AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
   AND NOT has_function_privilege('service_role',oid,'EXECUTE') FROM gov_settle),
 'browserGovernorDml',(SELECT coalesce(bool_or(
   has_table_privilege('anon',t.oid,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('authenticated',t.oid,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('service_role',t.oid,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('myeongha_api_executor',t.oid,'SELECT,INSERT,UPDATE,DELETE')),false) FROM tables t),
 'creatorMeterMembershipCount',(SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN meter r ON r.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member AND u.rolname=current_user),
 'meterRoleSchemaCreate',(SELECT has_schema_privilege('myeongha_seyeon_cost_meter_owner','public','CREATE') FROM meter),
 'pending1600ObjectExists',(to_regprocedure('public.guard_seyeon_ai_governor_rate_card_v1()') IS NOT NULL),
 'reviewUnit','cost-governor-foundation',
 'authorizedForProduction',false,'drReady',false
)::text;
