-- Watchtower-Track: ops
-- Production Operations Phase 8-A: effective privileges on four applied,
-- different-version commerce migration pairs.
-- Only catalog metadata is returned. Never evaluate the stored migration SQL.
-- This SELECT-only tool does not prove deployment identity, replay semantics,
-- complete function-source parity, or provider-equivalent restore readiness.
BEGIN TRANSACTION READ ONLY;

WITH target(nsp, function_name, git_version, applied_version) AS (
  VALUES
  ('public','internal_cmd_chat_credit_ack_delivered_proven_v2','20261027125500','20261027043527'),
  ('public','qry_commerce_owner_sandbox_credit_checkout_v1','20261027163500','20261027074247'),
  ('public','cmd_prepare_owner_portone_sandbox_credit_v1','20261027185000','20261027081929'),
  ('public','qry_commerce_owner_sandbox_credit_checkout_v2','20261027185000','20261027081929'),
  ('public','cmd_persist_owner_kcp_signed_sandbox_receipt_v1','20261028110500','20261028011357')
), function_authority AS (
  SELECT t.function_name, t.git_version, t.applied_version, p.oid,
    pg_get_userbyid(p.proowner) AS owner,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    p.prosecdef AS security_definer,
    COALESCE((
      SELECT bool_or(x LIKE 'search_path=%') FROM unnest(p.proconfig) x
    ), FALSE) AS search_path_configured,
    CASE WHEN p.oid IS NULL THEN NULL
      ELSE has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_execute,
    CASE WHEN p.oid IS NULL THEN NULL
      ELSE has_function_privilege('authenticated',p.oid,'EXECUTE') END AS authenticated_execute,
    CASE WHEN p.oid IS NULL THEN NULL
      ELSE has_function_privilege('service_role',p.oid,'EXECUTE') END AS service_role_execute,
    CASE WHEN p.oid IS NULL THEN NULL
      ELSE has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE') END AS api_execute,
    CASE WHEN p.oid IS NULL THEN NULL ELSE EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
    ) END AS direct_public_execute_grant
  FROM target t
  LEFT JOIN pg_namespace n ON n.nspname=t.nsp
  LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=t.function_name
), table_authority AS (
  SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
    pg_get_userbyid(c.relowner) AS owner,
    has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
    has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
    has_table_privilege('myeongha_api_executor',c.oid,'SELECT') AS api_select
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='commerce_private'
    AND c.relname='owner_sandbox_receipt_attestation_v1'
)
SELECT jsonb_build_object(
  'transactionReadOnly',current_setting('transaction_read_only'),
  'currentFrontier',(SELECT max(version) FROM supabase_migrations.schema_migrations),
  'appliedLedgerEntryCount',(SELECT count(*) FROM supabase_migrations.schema_migrations),
  'functions',(SELECT jsonb_agg(jsonb_build_object(
    'function',function_name,'gitVersion',git_version,'appliedVersion',applied_version,
    'present',oid IS NOT NULL,'identityArguments',identity_arguments,
    'owner',owner,'securityDefiner',security_definer,
    'searchPathConfigured',search_path_configured,
    'anonExecute',anon_execute,'authenticatedExecute',authenticated_execute,
    'serviceRoleExecute',service_role_execute,'apiExecute',api_execute,
    'directPublicExecuteGrant',direct_public_execute_grant
  ) ORDER BY function_name,identity_arguments) FROM function_authority),
  'privateTable',(SELECT jsonb_agg(jsonb_build_object(
    'table',relname,'owner',owner,'rlsEnabled',relrowsecurity,
    'forceRls',relforcerowsecurity,
    'anonSelect',anon_select,'authenticatedSelect',authenticated_select,
    'apiSelect',api_select
  )) FROM table_authority)
)::text AS phase8_kcp_authority_observation;

ROLLBACK;
