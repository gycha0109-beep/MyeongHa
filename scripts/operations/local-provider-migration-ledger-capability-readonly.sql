-- Read-only capability probe for a fresh disposable Supabase CLI 3.1.0 DB.
-- No migration table or user row referenced. No SQL body emitted.
-- Watchtower-Track: ops
BEGIN TRANSACTION READ ONLY;
WITH target AS (
  SELECT pg_catalog.to_regclass('supabase_migrations.schema_migrations') AS oid
), attributes AS (
  SELECT
    coalesce(pg_catalog.bool_or(a.attname='version'),false) AS has_version,
    coalesce(pg_catalog.bool_or(a.attname='name'),false) AS has_name,
    coalesce(pg_catalog.bool_or(a.attname='statements'),false) AS has_statements
  FROM target t
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
)
SELECT pg_catalog.jsonb_build_object(
  'schemaVersion','ops-disposable-provider-ledger-capability-v1',
  'target','disposable-supabase-cli-3.1.0-postgresql17',
  'migrationTablePresent',t.oid IS NOT NULL,
  'requiredColumnsPresent',a.has_version AND a.has_name AND a.has_statements,
  'migrationStatementOrUserPayloadOutput',false
)::text
FROM target t CROSS JOIN attributes a;
ROLLBACK;
