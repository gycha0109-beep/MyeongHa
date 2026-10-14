-- R2-G SELECT-only: known timestamped overlap lexical audit in DB memory.
-- Never export the remote 104KB body, role graph, ACL, or customer rows.
-- Lexical counters are NOT SQL parser/execution logs and prove NO historical actor.
-- Watchtower-Track: ops
WITH remote AS (
 SELECT version,name,statements[1] AS body
 FROM supabase_migrations.schema_migrations
 WHERE version='20261008090417'
  AND name='seyeon_runtime_1460_1510_acl_before_owner_recovery'
  AND cardinality(statements)=1
), vetted AS (
 SELECT version,
  pg_catalog.octet_length(pg_catalog.convert_to(body,'UTF8')) AS bytes,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(body,'UTF8')),'hex') AS sql_sha256,
  pg_catalog.lower(body) AS content
 FROM remote
), patterns(kind,pattern) AS (
 VALUES
 ('manifestCreate','create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+public[.]qry_content_bundle_manifest_v1'),
 ('manifestRevoke','revoke[[:space:]]+all[[:space:]]+on[[:space:]]+function[[:space:]]+public[.]qry_content_bundle_manifest_v1'),
 ('manifestGrant','grant[[:space:]]+execute[[:space:]]+on[[:space:]]+function[[:space:]]+public[.]qry_content_bundle_manifest_v1'),
 ('manifestReference','qry_content_bundle_manifest_v1'),
 ('guestPromotionCreate','create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+public[.]cmd_promote_guest_v1'),
 ('helperCreate','create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+public[.]assert_seyeon_chat_thread_runtime_v1'),
 ('helperDirectGrant','grant[[:space:]]+execute[[:space:]]+on[[:space:]]+function[[:space:]]+public[.]assert_seyeon_chat_thread_runtime_v1'),
 ('helperOwnerAlter','alter[[:space:]]+function[[:space:]]+public[.]assert_seyeon_chat_thread_runtime_v1')
), counts AS (
 SELECT kind,
 (SELECT pg_catalog.count(*) FROM pg_catalog.regexp_matches(
    (SELECT content FROM vetted),pattern,'g'
  )) AS hits
 FROM patterns
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-g-remote-timestamped-v1',
 'postgresMajor',pg_catalog.current_setting('server_version_num')::int/10000,
 'remoteRows',(SELECT pg_catalog.count(*) FROM remote),
 'remoteBytes',(SELECT bytes FROM vetted),
 'remoteSqlSha256',(SELECT sql_sha256 FROM vetted),
 'earlyMarkerRows',(SELECT pg_catalog.count(*) FROM supabase_migrations.schema_migrations
   WHERE version IN ('1460','1470','1480','1490','1500','1510')),
 'timestampedExactRows',(SELECT pg_catalog.count(*) FROM supabase_migrations.schema_migrations
   WHERE (version='20261007150457' AND name='guest_promotion_auth_fk_validation')
      OR (version='20261008043000' AND name='seyeon_manifest_acl_restore')),
 'lexicalIndicators',(SELECT pg_catalog.jsonb_object_agg(kind,hits ORDER BY kind) FROM counts),
 'timestampedVersionSortBeforeRemote',('20261007150457' < '20261008043000'
   AND '20261008043000' < '20261008090417'),
 'actualExecutionChronologyEstablished',false,
 'originEstablished',false,
 'authorizedForProduction',false,
 'drReady',false
)::text;
