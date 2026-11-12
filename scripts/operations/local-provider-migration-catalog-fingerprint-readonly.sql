-- Read-only Supabase migration catalog fingerprint on disposable PostgreSQL17.
-- Does not read migration statement payloads into results or alter history.
-- Watchtower-Track: ops
BEGIN TRANSACTION READ ONLY;
WITH migration_entries AS (
  SELECT
    version,
    name,
    coalesce((
      SELECT jsonb_agg(
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(statement_text,'UTF8')),'hex'
        ) ORDER BY ordinal
      )
      FROM unnest(statements) WITH ORDINALITY AS item(statement_text,ordinal)
    ),'[]'::jsonb) AS statement_hashes
  FROM supabase_migrations.schema_migrations
  WHERE version ~ '^[0-9]+$'
), catalog_fingerprint AS (
  SELECT
    count(*)::integer AS numeric_version_count,
    max(version::bigint) AS frontier,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      coalesce(
        jsonb_agg(jsonb_build_array(version,name,statement_hashes) ORDER BY version)::text,
        '[]'
      ),'UTF8'
    )),'hex') AS catalog_sha256
  FROM migration_entries
)
SELECT jsonb_build_object(
  'schemaVersion','ops-disposable-supabase-migration-catalog-v1',
  'target','disposable-supabase-cli-3.1.0-postgresql17',
  'migrationTablePresent',true,
  'allVersionCount',(SELECT count(*) FROM supabase_migrations.schema_migrations),
  'numericVersionCount',f.numeric_version_count,
  'migrationFrontier',f.frontier,
  'catalogSha256',f.catalog_sha256,
  'migrationStatementOrUserPayloadOutput',false
)::text
FROM catalog_fingerprint AS f;
ROLLBACK;
