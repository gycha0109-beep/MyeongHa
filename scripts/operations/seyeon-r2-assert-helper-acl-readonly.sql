-- R2 ACL target pinpoint, PostgreSQL 17 READ ONLY.
-- Watchtower-Track: ops. Aggregate counts only; no original function DDL,
-- source SQL, ACL grant text, role list, or customer data in output.
WITH fn AS (
 SELECT p.oid,p.proowner,p.proacl
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname='assert_seyeon_chat_thread_runtime_v1'
), grants AS (
 SELECT f.oid,f.proowner,a.grantee,a.privilege_type,a.is_grantable
 FROM fn f
 JOIN LATERAL pg_catalog.aclexplode(
   coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a ON true
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-helper-direct-grant-v1',
 'postgresMajor',pg_catalog.current_setting('server_version_num')::integer / 10000,
 'totalEdges',count(*),
 'ownerEdges',count(*) FILTER(WHERE grantee=proowner),
 'publicEdges',count(*) FILTER(WHERE grantee=0),
 'serverRoleDirectExecute',count(*) FILTER(
    WHERE grantee=pg_catalog.to_regrole('service_role')::oid
      AND privilege_type='EXECUTE'),
 'browserRoleDirectExecute',count(*) FILTER(
    WHERE grantee IN (pg_catalog.to_regrole('anon')::oid,
                      pg_catalog.to_regrole('authenticated')::oid)
      AND privilege_type='EXECUTE'),
 'grantOptionEdges',count(*) FILTER(WHERE is_grantable)
)::text
FROM grants;