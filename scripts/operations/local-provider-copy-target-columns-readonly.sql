-- Disposable local PostgreSQL 17 Provider column metadata only.
-- Never selects user data, secrets, tokens, or object bytes.
-- Watchtower-Track: ops
SELECT COALESCE(json_agg(json_build_object(
  'table_schema',n.nspname,
  'table_name',c.relname,
  'column_name',a.attname,
  'not_null',a.attnotnull,
  'has_default',d.oid IS NOT NULL,
  'is_identity',a.attidentity <> '',
  'is_generated',a.attgenerated <> ''
) ORDER BY n.nspname,c.relname,a.attnum),'[]'::json)
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE n.nspname IN ('auth','storage')
  AND c.relkind IN ('r','p')
  AND a.attnum>0 AND NOT a.attisdropped;
