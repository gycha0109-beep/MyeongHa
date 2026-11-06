-- Production current-frontier authority inventory; PostgreSQL 17 READ ONLY.
-- Watchtower-Track: ops
-- Purpose: compare role membership, effective privileges, function authority,
-- table/column ACLs, RLS flags/policies, and selected migration provenance.
-- Emits catalog metadata and hashes only. Never emits application rows, DDL bodies,
-- credentials, secrets, or raw function source.
-- This is an observation tool, NOT permission to repair or deploy migrations.

BEGIN TRANSACTION READ ONLY;

WITH
target_roles(role_name) AS (
  VALUES
    ('myeongha_api_executor'),
    ('myeongha_relationship_apply_owner'),
    ('myeongha_seyeon_chat_runtime_owner'),
    ('myeongha_seyeon_post_turn_owner'),
    ('myeongha_seyeon_cost_meter_owner'),
    ('myeongha_seyeon_governed_executor'),
    ('myeongha_chat_history_reader_v1'),
    ('service_role'),
    ('anon'),
    ('authenticated')
),
target_schemas(schema_name) AS (
  VALUES ('public'), ('seyeon_private'), ('chat_private')
),
target_tables(table_name) AS (
  VALUES
    ('subjects'),
    ('ai_execution_groundings'),
    ('ai_execution_logs'),
    ('chat_turns'),
    ('chat_turn_attempts'),
    ('conversation_threads'),
    ('conversation_thread_characters'),
    ('conversation_messages'),
    ('outbox_events'),
    ('memory_items'),
    ('memory_proposals'),
    ('record_access_grants'),
    ('relationship_history_entries'),
    ('relationship_event_records'),
    ('relationship_event_provenance_refs'),
    ('seyeon_positive_source_type_registry_v1'),
    ('seyeon_ai_call_cost_events'),
    ('seyeon_ai_governor_model_policies_v1'),
    ('seyeon_ai_governor_daily_budgets_v1')
),
role_inventory AS (
  SELECT
    t.role_name,
    r.oid IS NOT NULL AS present,
    r.rolsuper,
    r.rolinherit,
    r.rolcreaterole,
    r.rolcreatedb,
    r.rolcanlogin,
    r.rolreplication,
    r.rolbypassrls,
    r.rolconfig
  FROM target_roles t
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname=t.role_name
),
membership_inventory AS (
  SELECT
    pg_catalog.pg_get_userbyid(m.member) AS member_name,
    pg_catalog.pg_get_userbyid(m.roleid) AS role_name,
    pg_catalog.pg_get_userbyid(m.grantor) AS grantor_name,
    m.admin_option,
    m.inherit_option,
    m.set_option
  FROM pg_catalog.pg_auth_members m
  WHERE m.member IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN (SELECT role_name FROM target_roles))
     OR m.roleid IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN (SELECT role_name FROM target_roles))
),
schema_inventory AS (
  SELECT
    r.role_name,
    s.schema_name,
    CASE WHEN pg_catalog.to_regnamespace(s.schema_name) IS NOT NULL
      THEN pg_catalog.has_schema_privilege(r.role_name,s.schema_name,'USAGE') ELSE false END AS usage,
    CASE WHEN pg_catalog.to_regnamespace(s.schema_name) IS NOT NULL
      THEN pg_catalog.has_schema_privilege(r.role_name,s.schema_name,'CREATE') ELSE false END AS create
  FROM target_roles r CROSS JOIN target_schemas s
  WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_roles pr WHERE pr.rolname=r.role_name)
),
table_inventory AS (
  SELECT
    t.table_name,
    c.oid IS NOT NULL AS present,
    CASE WHEN c.oid IS NOT NULL THEN pg_catalog.pg_get_userbyid(c.relowner) END AS owner_name,
    CASE WHEN c.oid IS NOT NULL THEN c.relrowsecurity END AS row_security_enabled,
    CASE WHEN c.oid IS NOT NULL THEN c.relforcerowsecurity END AS force_row_security,
    CASE WHEN c.oid IS NOT NULL THEN
      (SELECT count(*) FROM pg_catalog.pg_policies p
       WHERE p.schemaname='public' AND p.tablename=t.table_name) END AS policy_count,
    CASE WHEN c.oid IS NOT NULL THEN
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce((
        SELECT pg_catalog.string_agg(
          p.policyname || ':' || p.permissive || ':' ||
          pg_catalog.array_to_string(p.roles,',') || ':' ||
          p.cmd || ':' || coalesce(p.qual,'') || ':' || coalesce(p.with_check,''),
          E'\n' ORDER BY p.policyname
        )
        FROM pg_catalog.pg_policies p
        WHERE p.schemaname='public' AND p.tablename=t.table_name
      ),'<NO_POLICIES>'),'UTF8')),'hex') END AS policy_sha256,
    CASE WHEN c.oid IS NOT NULL THEN
      (SELECT count(*) FROM pg_catalog.aclexplode(
        coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner)))) END AS table_acl_edges,
    CASE WHEN c.oid IS NOT NULL THEN
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce((
        SELECT pg_catalog.string_agg(x.entry,E'\n' ORDER BY x.entry)
        FROM (
          SELECT
            (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END)
            || ':' || pg_catalog.pg_get_userbyid(a.grantor)
            || ':' || a.privilege_type || ':' || a.is_grantable::text AS entry
          FROM pg_catalog.aclexplode(
            coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))
          ) a
        ) x
      ),'<NO_TABLE_ACL>'),'UTF8')),'hex') END AS table_acl_sha256,
    CASE WHEN c.oid IS NOT NULL THEN
      (SELECT count(*)
       FROM pg_catalog.pg_attribute a
       CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
         AND a.attacl IS NOT NULL) END AS column_acl_edges,
    CASE WHEN c.oid IS NOT NULL THEN
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce((
        SELECT pg_catalog.string_agg(x.entry,E'\n' ORDER BY x.entry)
        FROM (
          SELECT
            a.attname || ':' ||
            (CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END)
            || ':' || pg_catalog.pg_get_userbyid(acl.grantor)
            || ':' || acl.privilege_type || ':' || acl.is_grantable::text AS entry
          FROM pg_catalog.pg_attribute a
          CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
          WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
            AND a.attacl IS NOT NULL
        ) x
      ),'<NO_COLUMN_ACL>'),'UTF8')),'hex') END AS column_acl_sha256
  FROM target_tables t
  LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('public.'||t.table_name)
),
effective_table_privileges AS (
  SELECT
    r.role_name,
    t.table_name,
    array_remove(ARRAY[
      CASE WHEN pg_catalog.has_table_privilege(r.role_name,c.oid,'SELECT') THEN 'SELECT' END,
      CASE WHEN pg_catalog.has_table_privilege(r.role_name,c.oid,'INSERT') THEN 'INSERT' END,
      CASE WHEN pg_catalog.has_table_privilege(r.role_name,c.oid,'UPDATE') THEN 'UPDATE' END,
      CASE WHEN pg_catalog.has_table_privilege(r.role_name,c.oid,'DELETE') THEN 'DELETE' END,
      CASE WHEN pg_catalog.has_table_privilege(r.role_name,c.oid,'TRUNCATE') THEN 'TRUNCATE' END,
      CASE WHEN pg_catalog.has_table_privilege(r.role_name,c.oid,'REFERENCES') THEN 'REFERENCES' END,
      CASE WHEN pg_catalog.has_table_privilege(r.role_name,c.oid,'TRIGGER') THEN 'TRIGGER' END
    ],NULL) AS effective_privileges
  FROM target_roles r
  CROSS JOIN target_tables t
  JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('public.'||t.table_name)
  WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_roles pr WHERE pr.rolname=r.role_name)
),
function_inventory AS (
  SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
    p.prosecdef AS security_definer,
    p.proconfig AS function_config,
    p.provolatile AS volatility,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce((
      SELECT pg_catalog.string_agg(x.entry,E'\n' ORDER BY x.entry)
      FROM (
        SELECT
          (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END)
          || ':' || pg_catalog.pg_get_userbyid(a.grantor)
          || ':' || a.privilege_type || ':' || a.is_grantable::text AS entry
        FROM pg_catalog.aclexplode(
          coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
        ) a
      ) x
    ),'<NO_FUNCTION_ACL>'),'UTF8')),'hex') AS acl_sha256,
    pg_catalog.has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE') AS api_executor_execute,
    pg_catalog.has_function_privilege('myeongha_chat_history_reader_v1',p.oid,'EXECUTE') AS history_reader_execute,
    pg_catalog.has_function_privilege('myeongha_seyeon_chat_runtime_owner',p.oid,'EXECUTE') AS chat_owner_execute,
    pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute,
    pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('seyeon_private','chat_private')
     OR (n.nspname='public' AND (
       p.proname IN (
         'qry_production_relationship_runtime_v1',
         'cmd_enqueue_seyeon_relationship_sync_v1',
         'cmd_claim_seyeon_relationship_sync_v1',
         'cmd_complete_seyeon_relationship_sync_v1',
         'qry_seyeon_production_personal_record_context_v1',
         'qry_production_relationship_history_runtime_v1',
         'assert_seyeon_chat_thread_runtime_v1',
         'cmd_receive_seyeon_chat_turn_runtime_v1',
         'cmd_allocate_seyeon_chat_attempt_runtime_v1',
         'cmd_mark_seyeon_chat_context_ready_runtime_v1',
         'cmd_fail_seyeon_chat_attempt_runtime_v1',
         'cmd_persist_seyeon_chat_generated_runtime_v1',
         'cmd_persist_seyeon_chat_validated_runtime_v1',
         'cmd_commit_seyeon_chat_turn_runtime_v1',
         'cmd_commit_seyeon_chat_turn_runtime_v2',
         'qry_seyeon_post_turn_analysis_job_v1',
         'cmd_claim_seyeon_post_turn_analysis_v1',
         'cmd_checkpoint_seyeon_post_turn_analysis_v1',
         'cmd_complete_seyeon_post_turn_analysis_v1',
         'cmd_mark_seyeon_chat_context_ready_pinned_v1',
         'cmd_mark_seyeon_positive_context_ready_pinned_v1',
         'cmd_accept_seyeon_private_conversation_recall_proposal_v1',
         'cmd_ack_seyeon_positive_reply_v1',
         'cmd_request_seyeon_memory_revoke_v1',
         'cmd_revoke_seyeon_memory_grant_v1',
         'qry_chat_thread_owner_visible_history_v1',
         'cmd_commit_chat_turn_legacy_v1'
       )
       OR p.proname LIKE 'qry_seyeon_g0_%'
       OR p.proname LIKE 'qry_seyeon_recover_%'
       OR p.proname LIKE 'cmd_seyeon_supersede_%'
       OR p.proname LIKE 'cmd_seyeon_%'
       OR p.proname LIKE 'assert_seyeon_%'
     ))
),
migration_inventory AS (
  SELECT
    version,
    name,
    coalesce(cardinality(statements),0) AS statement_count,
    CASE WHEN cardinality(statements)=1 THEN octet_length(statements[1])
      ELSE octet_length(array_to_string(statements,E';\n\n')||';') END AS reconstructed_bytes,
    CASE WHEN cardinality(statements)=1 THEN
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(statements[1],'UTF8')),'hex')
      ELSE pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(array_to_string(statements,E';\n\n')||';','UTF8')),'hex')
    END AS reconstructed_sha256
  FROM supabase_migrations.schema_migrations
  WHERE version IN (
    '1460','1470','1480','1490','1500','1510','1520','1530','1540','1550','1560',
    '1570','1580','1590','1600','1610','1620','1630','1640',
    '20261008090417','20261025193416','20261026025332',
    '20261031182505','20261031182550','20261031182926','20261031205042',
    '20261101095105','20261101133954','20261101151700',
    '20261102060123','20261102060126','20261103083731','20261104043413'
  )
),
registry_inventory AS (
  SELECT
    record_kind,record_type,schema_version,projector_version,enabled,writable_enabled
  FROM public.seyeon_positive_source_type_registry_v1
)
SELECT pg_catalog.jsonb_build_object(
  'schemaVersion','production-authority-frontier-readonly-v1',
  'postgresVersion',pg_catalog.current_setting('server_version'),
  'currentDatabase',current_database(),
  'currentUser',current_user,
  'sessionUser',session_user,
  'transactionReadOnly',pg_catalog.current_setting('transaction_read_only'),
  'migrationCatalog',pg_catalog.jsonb_build_object(
    'totalVersions',(SELECT count(*) FROM supabase_migrations.schema_migrations),
    'latestVersion',(SELECT max(version) FROM supabase_migrations.schema_migrations),
    'selectedMigrations',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.version),'[]'::jsonb) FROM migration_inventory m)
  ),
  'roles',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.role_name),'[]'::jsonb) FROM role_inventory r),
  'memberships',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.role_name,m.member_name,m.grantor_name),'[]'::jsonb) FROM membership_inventory m),
  'schemaPrivileges',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.role_name,s.schema_name),'[]'::jsonb) FROM schema_inventory s),
  'tables',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.table_name),'[]'::jsonb) FROM table_inventory t),
  'effectiveTablePrivileges',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.role_name,p.table_name),'[]'::jsonb) FROM effective_table_privileges p WHERE cardinality(p.effective_privileges)>0),
  'functions',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.schema_name,f.function_name,f.identity_arguments),'[]'::jsonb) FROM function_inventory f),
  'positiveSourceRegistry',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.record_kind,r.record_type),'[]'::jsonb) FROM registry_inventory r)
)::text;

ROLLBACK;
