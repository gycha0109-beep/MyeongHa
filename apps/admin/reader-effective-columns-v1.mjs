// Compare the complete effective Reader column grant set, including future
// application tables, against the reviewed static allowlist. No data is read.
export function adminReaderExactColumnsPredicateV1(allowedColumns){
  if(!Array.isArray(allowedColumns)||allowedColumns.length<1||
     allowedColumns.some(key=>typeof key!=='string'||!/^(?:public|myeongha_admin_ops)\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/u.test(key))||
     new Set(allowedColumns).size!==allowedColumns.length)
    throw Error('Invalid reviewed Admin Reader column allowlist');
  const expected=allowedColumns.map(name=>"'"+name+"'").join(',');
  return `ARRAY(
    SELECT n.nspname||'.'||c.relname||'.'||a.attname AS column_ref
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname IN ('public','myeongha_admin_ops')
      AND c.relkind IN ('r','p','v','m','f')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.classid='pg_catalog.pg_class'::regclass
          AND d.objid=c.oid AND d.deptype='e'
      )
      AND has_column_privilege(current_user,c.oid,a.attnum,'SELECT')
    ORDER BY column_ref
  ) = ARRAY(
    SELECT name FROM unnest(ARRAY[${expected}]::text[]) AS expected(name)
    ORDER BY name
  )`;
}
