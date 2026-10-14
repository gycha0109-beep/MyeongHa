-- R2-G: SELECT-only production/isolated PG17 ContentManifest final catalog comparison.
-- Only hashes/counts/booleans. Never reveal pg_get_functiondef, raw proacl, roles.
-- Watchtower-Track: ops
WITH fn AS (
 SELECT p.oid,p.proowner,p.proacl,p.prosecdef
 FROM pg_catalog.pg_proc p
 WHERE p.oid=pg_catalog.to_regprocedure('public.qry_content_bundle_manifest_v1(uuid)')
), edges AS (
 SELECT (CASE WHEN a.grantee=0 THEN 'PUBLIC'
              ELSE pg_catalog.pg_get_userbyid(a.grantee) END)
   ||':'||pg_catalog.pg_get_userbyid(a.grantor)
   ||':'||a.privilege_type||':'||a.is_grantable::text AS edge
 FROM fn f
 CROSS JOIN LATERAL pg_catalog.aclexplode(
   coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))
 ) a
), normalized AS (
 SELECT pg_catalog.string_agg(edge,E'\n' ORDER BY edge) AS graph,
        pg_catalog.count(*) AS grant_edges FROM edges
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-g-manifest-rpc-parity-v1',
 'postgresMajor',pg_catalog.current_setting('server_version_num')::int/10000,
 'functionCount',(SELECT pg_catalog.count(*) FROM fn),
 'ownerSha256',(SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
     pg_catalog.pg_get_userbyid(proowner),'UTF8')),'hex') FROM fn),
 'ddlSha256',(SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
     pg_catalog.pg_get_functiondef(oid),'UTF8')),'hex') FROM fn),
 'rawAclSha256',(SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
     coalesce(proacl::text,'<DEFAULT>'),'UTF8')),'hex') FROM fn),
 'canonicalGrantsSha256',(SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
     coalesce(graph,'<NONE>'),'UTF8')),'hex') FROM normalized),
 'grantEdges',(SELECT grant_edges FROM normalized),
 'securityInvoker',(SELECT NOT prosecdef FROM fn),
 'apiExecutorExecute',(SELECT pg_catalog.has_function_privilege(
  'myeongha_api_executor',oid,'EXECUTE') FROM fn),
 'serviceRoleExecute',(SELECT pg_catalog.has_function_privilege(
  'service_role',oid,'EXECUTE') FROM fn),
 'anonExecute',(SELECT pg_catalog.has_function_privilege(
  'anon',oid,'EXECUTE') FROM fn),
 'authenticatedExecute',(SELECT pg_catalog.has_function_privilege(
  'authenticated',oid,'EXECUTE') FROM fn),
 'originEstablished',false,'authorizedForProduction',false,'drReady',false
)::text;
