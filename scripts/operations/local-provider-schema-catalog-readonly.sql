-- Read schema names and column names only from a disposable CLI PostgreSQL 17.
-- No user rows, auth tokens or storage object bytes are queried.
-- Watchtower-Track: ops
WITH provider_catalog AS (
  SELECT n.nspname AS schema_name,
         c.relname AS relation_name,
         COALESCE((
           SELECT jsonb_agg(a.attname ORDER BY a.attnum)
           FROM pg_catalog.pg_attribute AS a
           WHERE a.attrelid = c.oid
             AND a.attnum > 0
             AND NOT a.attisdropped
         ), '[]'::jsonb) AS columns
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('auth', 'storage')
    AND c.relkind IN ('r', 'p')
)
SELECT jsonb_build_object(
  'schemaVersion', 'ops-disposable-provider-catalog-v1',
  'postgresMajor', current_setting('server_version_num')::integer / 10000,
  'relationRowsRead', false,
  'tables', COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'schema', schema_name,
        'table', relation_name,
        'columns', columns
      )
      ORDER BY schema_name, relation_name
    ) FROM provider_catalog),
    '[]'::jsonb
  )
);
