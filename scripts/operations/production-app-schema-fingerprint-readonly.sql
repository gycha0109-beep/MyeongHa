-- Production application-schema fingerprint; PostgreSQL 17, SELECT ONLY.
-- Watchtower-Track: ops
-- Covers all current public base tables, their columns/constraints/indexes/triggers/
-- policies/ACLs and all functions in public, seyeon_private, chat_private.
-- Outputs identifiers, security metadata, counts, and SHA-256 of canonical definitions.
-- No application data rows, raw source code, secrets or parameter values.
-- This is a catalog baseline for a later isolated-restore comparison, NOT proof of DR.
BEGIN TRANSACTION READ ONLY;

WITH
table_catalog AS (
 SELECT
   c.oid AS relid,
   c.relacl AS source_acl,
   c.relowner AS owner_oid,
   n.nspname AS schema_name,
   c.relname AS table_name,
   pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
   c.relrowsecurity AS rls_enabled,
   c.relforcerowsecurity AS rls_forced,
   (
     SELECT pg_catalog.jsonb_build_object(
       'columns',coalesce((
         SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'name',a.attname,
           'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
           'notNull',a.attnotnull,
           'identity',a.attidentity,
           'generated',a.attgenerated,
           'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid),
           'columnAcl',coalesce(a.attacl::text,'<DEFAULT>')
         ) ORDER BY a.attnum)
         FROM pg_catalog.pg_attribute a
         LEFT JOIN pg_catalog.pg_attrdef d
           ON d.adrelid=a.attrelid AND d.adnum=a.attnum
         WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
       ),'[]'::jsonb),
       'constraints',coalesce((
         SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'name',co.conname,
           'type',co.contype,
           'def',pg_catalog.pg_get_constraintdef(co.oid,true)
         ) ORDER BY co.conname)
         FROM pg_catalog.pg_constraint co WHERE co.conrelid=c.oid
       ),'[]'::jsonb),
       'indexes',coalesce((
         SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'name',ic.relname,
           'definition',pg_catalog.pg_get_indexdef(i.indexrelid),
           'valid',i.indisvalid,
           'ready',i.indisready
         ) ORDER BY ic.relname)
         FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
         WHERE i.indrelid=c.oid
       ),'[]'::jsonb),
       'triggers',coalesce((
         SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'name',tg.tgname,
           'enabled',tg.tgenabled,
           'definition',pg_catalog.pg_get_triggerdef(tg.oid,true)
         ) ORDER BY tg.tgname)
         FROM pg_catalog.pg_trigger tg
         WHERE tg.tgrelid=c.oid AND NOT tg.tgisinternal
       ),'[]'::jsonb),
       'policies',coalesce((
         SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'name',p.policyname,
           'permissive',p.permissive,
           'roles',p.roles,
           'command',p.cmd,
           'using',p.qual,
           'check',p.with_check
         ) ORDER BY p.policyname)
         FROM pg_catalog.pg_policies p
         WHERE p.schemaname=n.nspname AND p.tablename=c.relname
       ),'[]'::jsonb),
       'acl',coalesce((
         SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantee',CASE WHEN acl.grantee=0 THEN 'PUBLIC'
                          ELSE pg_catalog.pg_get_userbyid(acl.grantee) END,
           'grantor',pg_catalog.pg_get_userbyid(acl.grantor),
           'permission',acl.privilege_type,
           'grantable',acl.is_grantable
         ) ORDER BY acl.grantee,acl.grantor,acl.privilege_type)
         FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
       ),'[]'::jsonb),
       'reloptions',coalesce(to_jsonb(c.reloptions),'[]'::jsonb),
       'persistence',c.relpersistence,
       'rowSecurityEnabled',c.relrowsecurity,
       'rowSecurityForced',c.relforcerowsecurity
     )
   ) AS structural_definition
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
),
tables AS (
 SELECT schema_name,table_name,owner_name,rls_enabled,rls_forced,
   (SELECT count(*) FROM pg_catalog.pg_attribute a
    WHERE a.attrelid=t.relid AND a.attnum>0 AND NOT a.attisdropped) AS column_count,
   (SELECT count(*) FROM pg_catalog.pg_index i WHERE i.indrelid=t.relid) AS index_count,
   (SELECT count(*) FROM pg_catalog.pg_trigger g
    WHERE g.tgrelid=t.relid AND NOT g.tgisinternal) AS user_trigger_count,
   (SELECT count(*) FROM pg_catalog.pg_constraint co WHERE co.conrelid=t.relid) AS constraint_count,
   (SELECT count(*) FROM pg_catalog.pg_policies p
    WHERE p.schemaname=t.schema_name AND p.tablename=t.table_name) AS policy_count,
   pg_catalog.encode(pg_catalog.sha256(
     pg_catalog.convert_to(t.structural_definition::text,'UTF8')),'hex') AS structural_sha256,
   -- Only per-component digests, never column/constraint/ACL raw material.
   pg_catalog.jsonb_build_object(
     'columns',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'columns')::text,'UTF8')),'hex'),
     'constraints',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'constraints')::text,'UTF8')),'hex'),
     'indexes',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'indexes')::text,'UTF8')),'hex'),
     'triggers',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'triggers')::text,'UTF8')),'hex'),
     'policies',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'policies')::text,'UTF8')),'hex'),
     'acl',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'acl')::text,'UTF8')),'hex'),
     'reloptions',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'reloptions')::text,'UTF8')),'hex'),
     'persistence',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'persistence')::text,'UTF8')),'hex'),
     'rowSecurityEnabled',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'rowSecurityEnabled')::text,'UTF8')),'hex'),
     'rowSecurityForced',pg_catalog.encode(pg_catalog.sha256(
       pg_catalog.convert_to((t.structural_definition->'rowSecurityForced')::text,'UTF8')),'hex')
   ) AS structural_component_sha256,
   coalesce((
     SELECT pg_catalog.jsonb_object_agg(g.grantee_name,g.privileges_sha256)
     FROM LATERAL (
       SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC'
                   ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee_name,
         pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
           pg_catalog.string_agg(
             a.privilege_type||':'||a.is_grantable::text,E'\n'
             ORDER BY a.privilege_type,a.is_grantable
           ),'UTF8')),'hex') AS privileges_sha256
       FROM pg_catalog.aclexplode(
         coalesce(t.source_acl,pg_catalog.acldefault('r',t.owner_oid))) a
       GROUP BY a.grantee
     ) g
   ),'{}'::jsonb) AS acl_by_grantee_privilege_sha256,
    -- Canonical grantor-aware digest, ordered by role name (not DB-local OID).
    -- Kept alongside the legacy hash; no raw GRANT tuple leaves the encrypted archive.
    coalesce((
      SELECT pg_catalog.jsonb_object_agg(g.grantee_name,g.grantor_privileges_sha256)
      FROM LATERAL (
        SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC'
                    ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee_name,
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            pg_catalog.string_agg(
              pg_catalog.pg_get_userbyid(a.grantor)||':'||
              a.privilege_type||':'||a.is_grantable::text,E'\n'
              ORDER BY pg_catalog.pg_get_userbyid(a.grantor),
                       a.privilege_type,a.is_grantable
            ),'UTF8')),'hex') AS grantor_privileges_sha256
        FROM pg_catalog.aclexplode(
          coalesce(t.source_acl,pg_catalog.acldefault('r',t.owner_oid))) a
        GROUP BY a.grantee
      ) g
    ),'{}'::jsonb) AS acl_by_grantee_grantor_privilege_sha256
 FROM table_catalog t
),
functions AS (
 SELECT n.nspname AS schema_name,p.proname AS function_name,
   pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
   pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
   p.prosecdef AS security_definer,
   p.provolatile AS volatility,
   coalesce(p.proconfig,'{}'::text[]) AS function_config,
   pg_catalog.encode(pg_catalog.sha256(
     pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')),'hex')
      AS full_definition_sha256,
   pg_catalog.encode(pg_catalog.sha256(
     pg_catalog.convert_to(coalesce((
       SELECT pg_catalog.string_agg(
         (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END)
         ||':'||pg_catalog.pg_get_userbyid(a.grantor)
         ||':'||a.privilege_type||':'||a.is_grantable::text,E'\n'
         ORDER BY a.grantee,a.grantor,a.privilege_type)
       FROM pg_catalog.aclexplode(
         coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
     ),'<NO_ACL>'),'UTF8')),'hex') AS acl_sha256,
   -- Same ACL grant entries without GRANTED BY, not inherited effective rights.
   pg_catalog.encode(pg_catalog.sha256(
     pg_catalog.convert_to(coalesce((
       SELECT pg_catalog.string_agg(
         (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END)
         ||':'||a.privilege_type||':'||a.is_grantable::text,E'\n'
         ORDER BY a.grantee,a.privilege_type,a.is_grantable)
       FROM pg_catalog.aclexplode(
         coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
     ),'<NO_ACL>'),'UTF8')),'hex') AS acl_grant_entries_without_grantor_sha256,
   coalesce((
     SELECT pg_catalog.jsonb_object_agg(g.grantee_name,g.privileges_sha256)
     FROM LATERAL (
       SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC'
                   ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee_name,
         pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
           pg_catalog.string_agg(
             a.privilege_type||':'||a.is_grantable::text,E'\n'
             ORDER BY a.privilege_type,a.is_grantable
           ),'UTF8')),'hex') AS privileges_sha256
       FROM pg_catalog.aclexplode(
         coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
       GROUP BY a.grantee
     ) g
   ),'{}'::jsonb) AS acl_by_grantee_privilege_sha256,
    -- Canonical grantor-aware digest, ordered by role name (not DB-local OID).
    -- Kept alongside the legacy hash; no raw GRANT tuple leaves the encrypted archive.
    coalesce((
      SELECT pg_catalog.jsonb_object_agg(g.grantee_name,g.grantor_privileges_sha256)
      FROM LATERAL (
        SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC'
                    ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee_name,
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            pg_catalog.string_agg(
              pg_catalog.pg_get_userbyid(a.grantor)||':'||
              a.privilege_type||':'||a.is_grantable::text,E'\n'
              ORDER BY pg_catalog.pg_get_userbyid(a.grantor),
                       a.privilege_type,a.is_grantable
            ),'UTF8')),'hex') AS grantor_privileges_sha256
        FROM pg_catalog.aclexplode(
          coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        GROUP BY a.grantee
      ) g
    ),'{}'::jsonb) AS acl_by_grantee_grantor_privilege_sha256
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','seyeon_private','chat_private')
   AND p.prokind IN ('f','p')
),
schema_metadata AS (
 SELECT n.nspname AS schema_name,
   pg_catalog.pg_get_userbyid(n.nspowner) AS owner_name,
   pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce((
     SELECT pg_catalog.string_agg(
       (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END)
       ||':'||pg_catalog.pg_get_userbyid(a.grantor)
       ||':'||a.privilege_type||':'||a.is_grantable::text,E'\n'
       ORDER BY a.grantee,a.grantor,a.privilege_type)
     FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
   ),'<NO_ACL>'),'UTF8')),'hex') AS acl_sha256,
   pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce((
     SELECT pg_catalog.string_agg(
       (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END)
       ||':'||a.privilege_type||':'||a.is_grantable::text,E'\n'
       ORDER BY a.grantee,a.privilege_type,a.is_grantable)
     FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
   ),'<NO_ACL>'),'UTF8')),'hex') AS acl_grant_entries_without_grantor_sha256,
   coalesce((
     SELECT pg_catalog.jsonb_object_agg(g.grantee_name,g.privileges_sha256)
     FROM LATERAL (
       SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC'
                   ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee_name,
         pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
           pg_catalog.string_agg(
             a.privilege_type||':'||a.is_grantable::text,E'\n'
             ORDER BY a.privilege_type,a.is_grantable
           ),'UTF8')),'hex') AS privileges_sha256
       FROM pg_catalog.aclexplode(
         coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
       GROUP BY a.grantee
     ) g
   ),'{}'::jsonb) AS acl_by_grantee_privilege_sha256,
    -- Canonical grantor-aware digest, ordered by role name (not DB-local OID).
    -- Kept alongside the legacy hash; no raw GRANT tuple leaves the encrypted archive.
    coalesce((
      SELECT pg_catalog.jsonb_object_agg(g.grantee_name,g.grantor_privileges_sha256)
      FROM LATERAL (
        SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC'
                    ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee_name,
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            pg_catalog.string_agg(
              pg_catalog.pg_get_userbyid(a.grantor)||':'||
              a.privilege_type||':'||a.is_grantable::text,E'\n'
              ORDER BY pg_catalog.pg_get_userbyid(a.grantor),
                       a.privilege_type,a.is_grantable
            ),'UTF8')),'hex') AS grantor_privileges_sha256
        FROM pg_catalog.aclexplode(
          coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
        GROUP BY a.grantee
      ) g
    ),'{}'::jsonb) AS acl_by_grantee_grantor_privilege_sha256
 FROM pg_catalog.pg_namespace n
 WHERE n.nspname IN ('public','seyeon_private','chat_private')
),
-- Read-only direct application role graph. Provider-owned cross-boundary
-- memberships are explicitly OUTSIDE scope and cannot be inferred from it.
-- Preserve grantor provenance as metadata, not as an ACL repair directive.
application_roles AS (
 SELECT r.rolname::text AS role_name,
   r.rolsuper AS superuser,
   r.rolinherit AS inherit,
   r.rolcreaterole AS create_role,
   r.rolcreatedb AS create_database,
   r.rolcanlogin AS can_login,
   r.rolreplication AS replication,
   r.rolbypassrls AS bypass_rls,
   r.rolconnlimit AS connection_limit
 FROM pg_catalog.pg_roles r
 WHERE r.rolname::text ~ '^myeongha_[a-z0-9_]+$'
),
application_memberships AS (
 SELECT granted.rolname::text AS granted_role,
   member.rolname::text AS member_role,
   pg_catalog.pg_get_userbyid(edge.grantor) AS grantor_name,
   edge.admin_option, edge.inherit_option, edge.set_option
 FROM pg_catalog.pg_auth_members edge
 JOIN pg_catalog.pg_roles granted ON granted.oid=edge.roleid
 JOIN pg_catalog.pg_roles member ON member.oid=edge.member
 WHERE granted.rolname::text ~ '^myeongha_[a-z0-9_]+$'
   AND member.rolname::text ~ '^myeongha_[a-z0-9_]+$'
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','ops-postgres-application-schema-fingerprint-v1',
 'postgresVersion',pg_catalog.current_setting('server_version'),
 'transactionReadOnly',pg_catalog.current_setting('transaction_read_only'),
 'migrationCatalog',pg_catalog.jsonb_build_object(
   'totalVersions',(SELECT count(*) FROM supabase_migrations.schema_migrations),
   'latestVersion',(SELECT max(version) FROM supabase_migrations.schema_migrations)
 ),
 'applicationRoleGraph',pg_catalog.jsonb_build_object(
   'scope','myeongha_to_myeongha_direct_membership_only_v1',
   'providerBoundaryMembershipsIncluded',false,
   'roles',(SELECT coalesce(pg_catalog.jsonb_agg(to_jsonb(r)
     ORDER BY r.role_name),'[]'::jsonb) FROM application_roles r),
   'directMemberships',(SELECT coalesce(pg_catalog.jsonb_agg(to_jsonb(m)
     ORDER BY m.granted_role,m.member_role,m.grantor_name),'[]'::jsonb)
     FROM application_memberships m)
 ),
 'schemaCount',(SELECT count(*) FROM schema_metadata),
 'tableCount',(SELECT count(*) FROM tables),
 'functionCount',(SELECT count(*) FROM functions),
 'schemas',(SELECT coalesce(pg_catalog.jsonb_agg(to_jsonb(s) ORDER BY s.schema_name),'[]'::jsonb) FROM schema_metadata s),
 'tables',(SELECT coalesce(pg_catalog.jsonb_agg(to_jsonb(t) ORDER BY t.schema_name,t.table_name),'[]'::jsonb) FROM tables t),
 'functions',(SELECT coalesce(pg_catalog.jsonb_agg(to_jsonb(f) ORDER BY f.schema_name,f.function_name,f.identity_arguments),'[]'::jsonb) FROM functions f)
)::text;
ROLLBACK;
