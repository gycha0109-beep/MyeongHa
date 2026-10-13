-- R2 remote-only forensic metadata. SELECT only; NEVER output the 104KB SQL.
-- Watchtower-Track: ops
-- The regex counts are a lexical overlap screen; not a SQL parser, DDL parity
-- proof, original source audit, or permission for deployment/migration repair.
-- All input bytes stay in Production PostgreSQL memory.
WITH expected(name) AS (
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
), bundle AS (
  SELECT version, name, statements[1] AS body
  FROM supabase_migrations.schema_migrations
  WHERE version='20261008090417'
    AND name='seyeon_runtime_1460_1510_acl_before_owner_recovery'
    AND cardinality(statements)=1
), verified AS (
  SELECT version,
    octet_length(convert_to(body,'UTF8')) AS bytes,
    encode(sha256(convert_to(body,'UTF8')),'hex') AS sql_sha256,
    body
  FROM bundle
), function_tokens AS (
  SELECT lower((hit.parts)[2]) AS name
  FROM verified v
  CROSS JOIN LATERAL regexp_matches(v.body,
    'create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+public[.]([a-z0-9_]+)[[:space:]]*[(]',
    'gi') AS hit(parts)
), counters AS (
  SELECT count(*) AS definition_tokens,
    count(DISTINCT f.name) AS distinct_function_tokens,
    count(DISTINCT f.name) FILTER (WHERE EXISTS
      (SELECT 1 FROM expected e WHERE e.name=f.name)) AS known_rpc_overlap
  FROM function_tokens f
)
SELECT v.version, v.bytes AS statement_bytes, v.sql_sha256,
  (v.bytes=104021 AND v.sql_sha256='4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894') AS approved_observation_fingerprint,
  c.definition_tokens, c.distinct_function_tokens, c.known_rpc_overlap,
  'HOLD_R2_ORIGINAL_SOURCE_AND_DDL_PARITY_UNVERIFIED' AS verdict
FROM verified v CROSS JOIN counters c;
