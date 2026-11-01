WITH migration_entries AS (
  SELECT
    version,
    name,
    coalesce((
      SELECT jsonb_agg(
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(statement_text, 'UTF8')),
          'hex'
        )
        ORDER BY ordinal
      )
      FROM unnest(statements) WITH ORDINALITY AS item(statement_text, ordinal)
    ), '[]'::jsonb) AS statement_hashes
  FROM supabase_migrations.schema_migrations
  WHERE version ~ '^[0-9]+$'
), catalog_snapshot AS (
  SELECT
    count(*)::integer AS version_count,
    max(version::bigint) AS migration_frontier,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          coalesce(
            jsonb_agg(jsonb_build_array(version, name, statement_hashes) ORDER BY version)::text,
            '[]'
          ),
          'UTF8'
        )
      ),
      'hex'
    ) AS catalog_sha256
  FROM migration_entries
)
SELECT jsonb_build_object(
  'version_count', version_count,
  'migration_frontier', migration_frontier,
  'catalog_sha256', catalog_sha256
)::text
FROM catalog_snapshot;
