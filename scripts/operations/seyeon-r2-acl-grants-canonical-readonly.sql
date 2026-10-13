-- Se-yeon R2 ACL forensics, PostgreSQL 17 READ ONLY.
-- Watchtower-Track: ops
-- Return hash-only per-RPC privilege metadata; never raw ACL/roles, DDL or records.
-- Sort exploded ACL by canonical ROLE NAME and GRANTOR NAME, never by role OID.
-- PG17 isolated replay must use 1510 numbered frontier and two vetted timestamped SQLs.
WITH target(name) AS (VALUES
  ('qry_production_relationship_runtime_v1'),
  ('cmd_enqueue_seyeon_relationship_sync_v1'),
  ('cmd_claim_seyeon_relationship_sync_v1'),
  ('cmd_complete_seyeon_relationship_sync_v1'),
  ('qry_seyeon_production_personal_record_context_v1'),
  ('qry_production_relationship_history_runtime_v1'),
  ('assert_seyeon_chat_thread_runtime_v1'),
  ('cmd_receive_seyeon_chat_turn_runtime_v1'),
  ('cmd_allocate_seyeon_chat_attempt_runtime_v1'),
  ('cmd_mark_seyeon_chat_context_ready_runtime_v1'),
  ('cmd_fail_seyeon_chat_attempt_runtime_v1'),
  ('cmd_persist_seyeon_chat_generated_runtime_v1'),
  ('cmd_persist_seyeon_chat_validated_runtime_v1'),
  ('cmd_commit_seyeon_chat_turn_runtime_v1'),
  ('cmd_commit_seyeon_chat_turn_runtime_v2'),
  ('qry_seyeon_post_turn_analysis_job_v1'),
  ('cmd_claim_seyeon_post_turn_analysis_v1'),
  ('cmd_checkpoint_seyeon_post_turn_analysis_v1'),
  ('cmd_complete_seyeon_post_turn_analysis_v1')
), catalog AS (
 SELECT t.name, p.oid, p.proowner, p.proacl
 FROM target t
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=t.name
), normalized AS (
 SELECT c.name, c.oid, c.proacl,
  (SELECT pg_catalog.string_agg(x.acl_entry,E'\n' ORDER BY x.acl_entry)
   FROM (
    SELECT (CASE WHEN a.grantee=0 THEN 'PUBLIC'
                  ELSE pg_catalog.pg_get_userbyid(a.grantee) END)
           || ':' || pg_catalog.pg_get_userbyid(a.grantor)
           || ':' || a.privilege_type || ':' || a.is_grantable::text
           AS acl_entry
    FROM pg_catalog.aclexplode(
      coalesce(c.proacl,pg_catalog.acldefault('f',c.proowner))) a
   ) x) AS normalized_entries,
  (SELECT count(*)
   FROM pg_catalog.aclexplode(
      coalesce(c.proacl,pg_catalog.acldefault('f',c.proowner)))) AS grant_edges,
  CASE WHEN c.oid IS NOT NULL THEN pg_catalog.has_function_privilege('anon',c.oid,'EXECUTE') END AS anon_exec,
  CASE WHEN c.oid IS NOT NULL THEN pg_catalog.has_function_privilege('authenticated',c.oid,'EXECUTE') END AS auth_exec
 FROM catalog c
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-acl-per-function-v1',
 'postgresMajor',pg_catalog.current_setting('server_version_num')::integer / 10000,
 'functions',pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'name',name,
  'rawAclSha256',pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex'),
  'canonicalGrantSha256',pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(coalesce(normalized_entries,'<NONE>'),'UTF8')),'hex'),
  'explicitAcl',proacl IS NOT NULL,
  'grantEdges',grant_edges,
  'anonExecute',anon_exec,
  'authenticatedExecute',auth_exec
 ) ORDER BY name)
)::text
FROM normalized;