-- Se-yeon R2: exact cross-environment RPC set fingerprint; READ-ONLY.
-- Watchtower-Track: ops. Return ONLY 6 aggregate digests, counts and PG major.
-- Never log/export function DDL, parameters, ACL text, role graph, or user data.
-- PostgreSQL major/minor or search_path drift must not be silently normalized.
-- A match only proves catalog equivalence for these 19 RPCs at measurement time,
-- NOT the origin/order/authority of remote-only 20261008090417.
WITH target(name) AS (
  VALUES
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
  SELECT t.name,p.oid,
    pg_catalog.format('%I.%I(%s)', n.nspname, p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid)) AS signature,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
    coalesce(p.proacl::text, '<DEFAULT>') AS acl_text,
    pg_catalog.pg_get_functiondef(p.oid) AS function_ddl,
    p.prosecdef, p.provolatile,
    pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
  FROM target t
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=t.name
), per_row AS (
  SELECT name, oid, anon_execute, authenticated_execute,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(signature,'UTF8')), 'hex') AS sig_hash,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(owner_name,'UTF8')), 'hex') AS owner_hash,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(acl_text,'UTF8')), 'hex') AS acl_hash,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(function_ddl,'UTF8')), 'hex') AS ddl_hash,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      coalesce(prosecdef::text,'<MISSING>') || '/' ||
      coalesce(provolatile::text,'<MISSING>') || '/' ||
      coalesce(anon_execute::text,'<MISSING>') || '/' ||
      coalesce(authenticated_execute::text,'<MISSING>'),'UTF8')), 'hex') AS flags_hash
  FROM catalog
)
SELECT pg_catalog.jsonb_build_object(
  'schemaVersion', 'seyeon-r2-rpc-set-fingerprint-v1',
  'postgresMajor', pg_catalog.current_setting('server_version_num')::integer / 10000,
  'expectedNames', 19,
  'rows', count(*),
  'resolvedFunctions', count(oid),
  'uniqueResolvedNames', count(DISTINCT name) FILTER (WHERE oid IS NOT NULL),
  'missingFunctions', count(*) FILTER (WHERE oid IS NULL),
  'browserExecuteCount', count(*) FILTER (
    WHERE coalesce(anon_execute,false) OR coalesce(authenticated_execute,false)),
  'namesSha256', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.string_agg(name, E'\n' ORDER BY name,coalesce(sig_hash,'<MISSING>')), 'UTF8')), 'hex'),
  'signatureSetSha256', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.string_agg(name || ':' || coalesce(sig_hash,'<MISSING>'), E'\n'
      ORDER BY name,coalesce(sig_hash,'<MISSING>')),'UTF8')), 'hex'),
  'ownerSetSha256', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.string_agg(name || ':' || coalesce(owner_hash,'<MISSING>'), E'\n'
      ORDER BY name,coalesce(sig_hash,'<MISSING>')),'UTF8')), 'hex'),
  'aclSetSha256', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.string_agg(name || ':' || coalesce(acl_hash,'<MISSING>'), E'\n'
      ORDER BY name,coalesce(sig_hash,'<MISSING>')),'UTF8')), 'hex'),
  'ddlSetSha256', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.string_agg(name || ':' || coalesce(ddl_hash,'<MISSING>'), E'\n'
      ORDER BY name,coalesce(sig_hash,'<MISSING>')),'UTF8')), 'hex'),
  'flagsSetSha256', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.string_agg(name || ':' || coalesce(flags_hash,'<MISSING>'), E'\n'
      ORDER BY name,coalesce(sig_hash,'<MISSING>')),'UTF8')), 'hex')
)::text
FROM per_row;
