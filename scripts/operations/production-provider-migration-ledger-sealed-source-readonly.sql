-- Source Provider migration-history rows for a protected, optional encrypted archive.
-- NEVER publish the result: it contains historical SQL text and provenance fields.
-- Existing Production read-only connection only; never writes or repairs ledger.
-- Watchtower-Track: ops
BEGIN TRANSACTION READ ONLY;
WITH complete_rows AS MATERIALIZED (
  SELECT version, name, statements, created_by, idempotency_key, rollback
  FROM supabase_migrations.schema_migrations
),
numeric_rows AS MATERIALIZED (
  SELECT version, name, statements
  FROM complete_rows
  WHERE version ~ '^[0-9]+$'
),
hashed_rows AS (
  SELECT
    version, name,
    coalesce((
      SELECT jsonb_agg(
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(statement_text, 'UTF8')),
          'hex'
        ) ORDER BY ordinal
      )
      FROM unnest(statements) WITH ORDINALITY AS item(statement_text, ordinal)
    ), '[]'::jsonb) AS statement_hashes
  FROM numeric_rows
),
fingerprint AS (
  SELECT
    count(*)::integer AS numeric_version_count,
    max(version::bigint) AS migration_frontier,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      coalesce(
        jsonb_agg(
          jsonb_build_array(version, name, statement_hashes)
          ORDER BY version
        )::text,
        '[]'
      ), 'UTF8'
    )), 'hex') AS catalog_sha256
  FROM hashed_rows
)
SELECT jsonb_build_object(
  'schemaVersion', 'ops-provider-migration-sealed-source-v1',
  'allVersionCount', (SELECT count(*)::integer FROM complete_rows),
  'numericVersionCount', f.numeric_version_count,
  'migrationFrontier', f.migration_frontier,
  'catalogSha256', f.catalog_sha256,
  'entries', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'version', version,
      'name', name,
      'statements', statements,
      'createdBy', created_by,
      'idempotencyKey', idempotency_key,
      'rollbackStatements', rollback
    ) ORDER BY version)
    FROM complete_rows
  ), '[]'::jsonb)
)::text
FROM fingerprint f;
ROLLBACK;
