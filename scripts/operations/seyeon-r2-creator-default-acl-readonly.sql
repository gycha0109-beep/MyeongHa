-- R2 creator-default ACL mechanism, read-only against Production.
-- Watchtower-Track: ops. No ACL source, role graph, SQL body, or personal data.
-- Historical default privilege values at 2026-10-08 are NOT reconstructed here.
WITH creator AS (
 SELECT pg_catalog.to_regrole('postgres')::oid AS owner_oid,
   pg_catalog.to_regrole('service_role')::oid AS service_oid,
   pg_catalog.to_regrole('anon')::oid AS anon_oid,
   pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid,
   (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='public') AS public_oid
), a AS (
 SELECT d.defaclnamespace, g.grantee,g.privilege_type
 FROM pg_catalog.pg_default_acl d
 JOIN creator c ON d.defaclrole=c.owner_oid
 CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) g
 WHERE d.defaclobjtype='f' AND d.defaclnamespace IN (0,(SELECT public_oid FROM creator))
)
SELECT pg_catalog.jsonb_build_object(
  'schemaVersion','seyeon-r2-current-creator-default-acl-v1',
  'postgresMajor',pg_catalog.current_setting('server_version_num')::integer/10000,
  'observedCurrentOnly',true,
  'globalServiceRoleFunctionExecuteCount',
    (SELECT count(*) FROM a CROSS JOIN creator c
      WHERE a.defaclnamespace=0 AND a.grantee=c.service_oid AND a.privilege_type='EXECUTE'),
  'publicSchemaServiceRoleFunctionExecuteCount',
    (SELECT count(*) FROM a CROSS JOIN creator c
      WHERE a.defaclnamespace=c.public_oid AND a.grantee=c.service_oid AND a.privilege_type='EXECUTE'),
  'publicSchemaBrowserFunctionExecuteCount',
    (SELECT count(*) FROM a CROSS JOIN creator c
      WHERE a.defaclnamespace=c.public_oid AND a.grantee IN (c.anon_oid,c.authenticated_oid)
        AND a.privilege_type='EXECUTE')
)::text;
