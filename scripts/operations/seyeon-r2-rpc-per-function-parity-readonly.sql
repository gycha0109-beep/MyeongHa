-- #1887 exact 19-function local/remote comparison; SELECT-ONLY.
-- Returns SHA-256 fingerprints, function names and two browser rights;
-- never outputs SQL bodies, ACL lists, user records, keys or migration text.
-- Historical source provenance and full DB/DR approval remain separate.
-- body_whitespace_stripped_sha256 is a lexical diagnostic ONLY: stripping
-- whitespace can change SQL string literals. Equality is not semantic proof.
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
   pg_catalog.format('%I.%I(%s)',n.nspname,p.proname,
     pg_catalog.pg_get_function_identity_arguments(p.oid)) AS signature,
   pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
   coalesce(p.proacl::text,'<DEFAULT>') AS acl_text,
   pg_catalog.pg_get_functiondef(p.oid) AS function_ddl,
   p.prosrc AS function_body,
   coalesce(array_to_string(p.proconfig, E'\n'),'<DEFAULT>') AS function_config,
   p.prosecdef,p.provolatile,
   pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
   pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
   pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute
 FROM target t
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=t.name
)
SELECT name,
  (oid IS NOT NULL) AS present,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(signature,'UTF8')),'hex') AS signature_sha256,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(owner_name,'UTF8')),'hex') AS owner_sha256,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(acl_text,'UTF8')),'hex') AS acl_sha256,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(function_ddl,'UTF8')),'hex') AS ddl_sha256,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(function_body,'UTF8')),'hex') AS body_sha256,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.regexp_replace(function_body,'[[:space:]]+','','g'),'UTF8')),'hex') AS body_whitespace_stripped_sha256,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(function_config,'UTF8')),'hex') AS config_sha256,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    coalesce(prosecdef::text,'<MISSING>') || '/' ||
    coalesce(provolatile::text,'<MISSING>') || '/' ||
    coalesce(anon_execute::text,'<MISSING>') || '/' ||
    coalesce(authenticated_execute::text,'<MISSING>'),'UTF8')),'hex') AS flags_sha256,
  coalesce(anon_execute,false) AS anon_execute,
  coalesce(authenticated_execute,false) AS authenticated_execute,
  coalesce(service_role_execute,false) AS service_role_execute
FROM catalog ORDER BY name,signature_sha256;
