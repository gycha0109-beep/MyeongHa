-- Watchtower-Track: ops
-- Phase 8-A: 41 applied remote-only migration source text -> current PG17 catalog
-- READ-ONLY metadata: signatures, hashed definitions, owner, ACL and policy hashes.
-- Names/presence are not historical function body or restored-schema equivalence.
-- NEVER return SQL bodies, application rows, secrets or user identifiers.
BEGIN TRANSACTION READ ONLY;
WITH
target_versions(version) AS (
  VALUES
    ('20261008090417'),
    ('20261023054251'),
    ('20261025193416'),
    ('20261025193454'),
    ('20261025201500'),
    ('20261025203519'),
    ('20261027004434'),
    ('20261027004544'),
    ('20261027011650'),
    ('20261027043527'),
    ('20261027074247'),
    ('20261027081929'),
    ('20261028011357'),
    ('20261029012948'),
    ('20261029070331'),
    ('20261029071539'),
    ('20261030014708'),
    ('20261030014906'),
    ('20261030014935'),
    ('20261030015201'),
    ('20261030015858'),
    ('20261030020711'),
    ('20261030021027'),
    ('20261031182505'),
    ('20261031182550'),
    ('20261031182926'),
    ('20261031185454'),
    ('20261031192427'),
    ('20261031205042'),
    ('20261101095105'),
    ('20261101133954'),
    ('20261101151700'),
    ('20261102060123'),
    ('20261102060126'),
    ('20261102081315'),
    ('20261103005333'),
    ('20261103072224'),
    ('20261103083731'),
    ('20261104043413'),
    ('20261104195925'),
    ('20261105075227')
),
m AS (
  SELECT sm.version,
    CASE WHEN cardinality(sm.statements) = 1 THEN sm.statements[1]
         ELSE array_to_string(sm.statements, E';\n\n') || ';' END AS source_body
  FROM supabase_migrations.schema_migrations sm
  JOIN target_versions t ON t.version=sm.version
),
routine_indicators AS (
  SELECT m.version,
    coalesce(nullif(lower(r[3]), ''), 'public') AS schema_name,
    lower(r[4]) AS object_name
  FROM m, regexp_matches(m.source_body,
    '(?im)^[[:space:]]*create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+(([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)[[:space:]]*\(', 'g') r
),
policy_indicators AS (
  SELECT m.version, lower(p[1]) AS policy_name,
    coalesce(nullif(lower(p[3]), ''), 'public') AS schema_name,
    lower(p[4]) AS relation_name
  FROM m, regexp_matches(m.source_body,
    '(?im)^[[:space:]]*create[[:space:]]+policy[[:space:]]+([a-z_][a-z0-9_]*)[[:space:]]+on[[:space:]]+(([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)', 'g') p
),
table_indicators AS (
  SELECT m.version,
    coalesce(nullif(lower(t[3]), ''), 'public') AS schema_name,
    lower(t[4]) AS relation_name
  FROM m, regexp_matches(m.source_body,
    '(?im)^[[:space:]]*create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?(([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)', 'g') t
),
routine_catalog AS (
  SELECT x.version, x.schema_name, x.object_name,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'signature', pg_catalog.pg_get_function_identity_arguments(f.oid),
        'kind', f.prokind,
        'owner', pg_catalog.pg_get_userbyid(f.proowner),
        'securityDefiner', f.prosecdef,
        'definitionSha256', pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(pg_catalog.pg_get_functiondef(f.oid), 'UTF8')), 'hex'),
        'aclSha256', (
          SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            coalesce(string_agg(
              (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END)
              || ':' || pg_catalog.pg_get_userbyid(acl.grantor)
              || ':' || acl.privilege_type || ':' || acl.is_grantable::text,
              E'\n' ORDER BY acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable),
              '<NO_ACL>'), 'UTF8')), 'hex')
          FROM pg_catalog.aclexplode(coalesce(f.proacl,
            pg_catalog.acldefault('f', f.proowner))) acl
        ),
        'apiExecutorExecute', CASE WHEN pg_catalog.to_regrole('myeongha_api_executor') IS NULL
          THEN NULL ELSE pg_catalog.has_function_privilege('myeongha_api_executor', f.oid, 'EXECUTE') END,
        'anonExecute', CASE WHEN pg_catalog.to_regrole('anon') IS NULL
          THEN NULL ELSE pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE') END,
        'authenticatedExecute', CASE WHEN pg_catalog.to_regrole('authenticated') IS NULL
          THEN NULL ELSE pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') END
      ) ORDER BY pg_catalog.pg_get_function_identity_arguments(f.oid), f.prokind)
      FROM pg_catalog.pg_proc f
      JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
      WHERE n.nspname=x.schema_name AND f.proname=x.object_name
        AND f.prokind IN ('f','p')
    ), '[]'::jsonb) AS overloads
  FROM (SELECT DISTINCT version,schema_name,object_name FROM routine_indicators) x
),
policy_catalog AS (
  SELECT x.version, x.schema_name, x.relation_name, x.policy_name,
    coalesce((
      SELECT jsonb_build_object(
        'command', p.cmd, 'permissive', p.permissive,
        'roles', p.roles,
        'qualSha256', pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(coalesce(p.qual, '<NULL>'), 'UTF8')), 'hex'),
        'withCheckSha256', pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(coalesce(p.with_check, '<NULL>'), 'UTF8')), 'hex'),
        'tableOwner', pg_catalog.pg_get_userbyid(c.relowner),
        'rowSecurityEnabled', c.relrowsecurity,
        'forceRowSecurity', c.relforcerowsecurity
      )
      FROM pg_catalog.pg_policies p
      JOIN pg_catalog.pg_namespace n ON n.nspname=p.schemaname
      JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=p.tablename
      WHERE p.schemaname=x.schema_name AND p.tablename=x.relation_name
        AND p.policyname=x.policy_name
    ), '{}'::jsonb) AS catalog
  FROM (SELECT DISTINCT version,schema_name,relation_name,policy_name FROM policy_indicators) x
),
table_catalog AS (
  SELECT x.version,x.schema_name,x.relation_name,
    coalesce((
      SELECT jsonb_build_object(
        'kind', c.relkind,
        'owner', pg_catalog.pg_get_userbyid(c.relowner),
        'rowSecurityEnabled', c.relrowsecurity,
        'forceRowSecurity', c.relforcerowsecurity,
        'aclSha256', (
          SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            coalesce(string_agg(
              (CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(acl.grantee) END)
              || ':' || pg_catalog.pg_get_userbyid(acl.grantor) || ':'
              || acl.privilege_type || ':' || acl.is_grantable::text,
              E'\n' ORDER BY acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable),
              '<NO_ACL>'), 'UTF8')), 'hex')
          FROM pg_catalog.aclexplode(coalesce(c.relacl,
            pg_catalog.acldefault('r', c.relowner))) acl
        )
      )
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=x.schema_name AND c.relname=x.relation_name
        AND c.relkind IN ('r','p')
    ), '{}'::jsonb) AS catalog
  FROM (SELECT DISTINCT version,schema_name,relation_name FROM table_indicators) x
)
SELECT jsonb_build_object(
  'schemaVersion', 'ops-remote-only-current-object-metadata-v1',
  'observedAtUtc', to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'transactionReadOnly', current_setting('transaction_read_only') = 'on',
  'liveMigrationLedgerCount', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'liveMigrationFrontier', (SELECT max(version) FROM supabase_migrations.schema_migrations),
  'targetVersionCount', (SELECT count(*) FROM target_versions),
  'foundVersionCount', (SELECT count(*) FROM m),
  'perVersion', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'version', t.version,
      'functionIndicators', (SELECT count(*) FROM routine_indicators r WHERE r.version=t.version),
      'policyIndicators', (SELECT count(*) FROM policy_indicators p WHERE p.version=t.version),
      'tableIndicators', (SELECT count(*) FROM table_indicators b WHERE b.version=t.version),
      'routines', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'schema',r.schema_name,'name',r.object_name,'overloads',r.overloads)
        ORDER BY r.schema_name,r.object_name),'[]'::jsonb)
        FROM routine_catalog r WHERE r.version=t.version),
      'policies', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'schema',p.schema_name,'table',p.relation_name,
        'name',p.policy_name,'catalog',p.catalog)
        ORDER BY p.schema_name,p.relation_name,p.policy_name),'[]'::jsonb)
        FROM policy_catalog p WHERE p.version=t.version),
      'tables', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'schema',b.schema_name,'name',b.relation_name,'catalog',b.catalog)
        ORDER BY b.schema_name,b.relation_name),'[]'::jsonb)
        FROM table_catalog b WHERE b.version=t.version)
    ) ORDER BY t.version), '[]'::jsonb)
    FROM target_versions t
  )
)::text AS evidence_json;
ROLLBACK;
