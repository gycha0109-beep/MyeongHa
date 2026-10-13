-- Se-yeon R2 1460..1510 PUBLIC RPC catalog snapshot; READ-ONLY.
-- Watchtower-Track: ops
-- Run ONLY with psql -X -qAt -v ON_ERROR_STOP=1 -f <this-file>.
-- Output contains names, signatures, owners, effective browser privileges,
-- and hashes of DDL/ACL; NEVER emits function bodies, row data or credentials.
-- This is a parity probe, NOT proof of remote bundle provenance or permission
-- for migration repair/deployment. Compare on the same PostgreSQL major.
select pg_catalog.jsonb_build_object(
  'schemaVersion', 'seyeon-r2-rpc-catalog-v1',
  'postgresMajor', pg_catalog.current_setting('server_version_num')::integer / 10000,
  'functions', coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'name', p.proname,
      'signature', p.oid::pg_catalog.regprocedure::text,
      'owner', pg_catalog.pg_get_userbyid(p.proowner),
      'securityDefiner', p.prosecdef,
      'volatility', p.provolatile::text,
      'ddlSha256', pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex'),
      'aclSha256', pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(coalesce(p.proacl::text, '<DEFAULT>'), 'UTF8')), 'hex'),
      'anonExecute', pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticatedExecute', pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) order by p.proname, p.oid::pg_catalog.regprocedure::text
  ), '[]'::jsonb)
)::text
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
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
    'cmd_complete_seyeon_post_turn_analysis_v1'
  );
