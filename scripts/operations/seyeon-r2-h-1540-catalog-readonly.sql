-- R2-H 1540 / Saju Proof. PG17 disposable catalog-only 3-state snapshot.
-- No SQL definitions, ACL strings, role graph or row data are emitted.
-- Watchtower-Track: ops
WITH t AS (
 SELECT c.oid,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_catalog.pg_class c
 WHERE c.oid=pg_catalog.to_regclass('public.saju_source_proof_nonce_claims') AND c.relkind='r'
), roles AS (
 SELECT r.oid,r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,
        r.rolinherit,r.rolreplication,r.rolbypassrls
 FROM pg_catalog.pg_roles r
 WHERE r.rolname IN ('myeongha_saju_proof_nonce_runtime','myeongha_saju_proof_nonce_gc')
), pol AS (
 SELECT p.polname,p.polcmd,p.polroles,p.polqual,p.polwithcheck,p.polrelid
 FROM pg_catalog.pg_policy p JOIN t ON p.polrelid=t.oid
), fixed_policy AS (
 SELECT p.polname
 FROM pol p JOIN roles r ON
   ((p.polname IN ('saju_source_proof_nonce_runtime_select_v1','saju_source_proof_nonce_runtime_insert_v1')
       AND r.rolname='myeongha_saju_proof_nonce_runtime')
    OR (p.polname IN ('saju_source_proof_nonce_gc_select_expired_v1','saju_source_proof_nonce_gc_delete_expired_v1')
       AND r.rolname='myeongha_saju_proof_nonce_gc'))
 WHERE p.polroles=ARRAY[r.oid]::oid[]
 AND (
   (p.polname='saju_source_proof_nonce_runtime_select_v1'
    AND p.polcmd='r' AND pg_catalog.pg_get_expr(p.polqual,p.polrelid) LIKE '%true%' AND p.polwithcheck IS NULL)
   OR
   (p.polname='saju_source_proof_nonce_runtime_insert_v1'
    AND p.polcmd='a' AND p.polqual IS NULL
    AND pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) LIKE '%retained_until%'
    AND pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) LIKE '%clock_timestamp%'
    AND pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) LIKE '%interval%')
   OR
   (p.polname='saju_source_proof_nonce_gc_select_expired_v1'
    AND p.polcmd='r' AND p.polwithcheck IS NULL
    AND pg_catalog.pg_get_expr(p.polqual,p.polrelid) LIKE '%retained_until%'
    AND pg_catalog.pg_get_expr(p.polqual,p.polrelid) LIKE '%clock_timestamp%')
   OR
   (p.polname='saju_source_proof_nonce_gc_delete_expired_v1'
    AND p.polcmd='d' AND p.polwithcheck IS NULL
    AND pg_catalog.pg_get_expr(p.polqual,p.polrelid) LIKE '%retained_until%'
    AND pg_catalog.pg_get_expr(p.polqual,p.polrelid) LIKE '%clock_timestamp%')
 )
), columns AS (
 SELECT a.attname,a.atttypid,a.attnotnull,a.atthasdef
 FROM pg_catalog.pg_attribute a JOIN t ON a.attrelid=t.oid
 WHERE a.attnum>0 AND NOT a.attisdropped
)
SELECT pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-r2-h-1540-saju-nonce-v1',
 'pgMajor',pg_catalog.current_setting('server_version_num')::integer/10000,
 'tableCount',(SELECT count(*) FROM t),
 'rlsEnabled',(SELECT relrowsecurity FROM t),
 'forceRls',(SELECT relforcerowsecurity FROM t),
 'columnCount',(SELECT count(*) FROM columns),
 'columnShapeCount',(SELECT count(*) FROM columns WHERE
   (attname='replay_key_digest' AND atttypid='text'::regtype AND attnotnull)
   OR (attname='retained_until' AND atttypid='timestamp with time zone'::regtype AND attnotnull)
   OR (attname='created_at' AND atttypid='timestamp with time zone'::regtype AND attnotnull AND atthasdef)),
 'primaryKeyCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN t ON c.conrelid=t.oid WHERE c.contype='p'),
 'checkCount',(SELECT count(*) FROM pg_catalog.pg_constraint c JOIN t ON c.conrelid=t.oid WHERE c.contype='c'),
 'indexCount',(SELECT count(*) FROM pg_catalog.pg_index i JOIN t ON i.indrelid=t.oid),
 'policyCount',(SELECT count(*) FROM pol),
 'policyScopeCount',(SELECT count(*) FROM fixed_policy),
 'roleCount',(SELECT count(*) FROM roles),
 'leastPrivilegeRoles',(SELECT count(*) FROM roles WHERE NOT (
   rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)),
 'creatorMembershipCount',(SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN roles r ON r.oid=m.roleid
    JOIN pg_catalog.pg_roles current_r ON current_r.oid=m.member AND current_r.rolname=current_user),
 'browserAnonDml',(SELECT pg_catalog.has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') FROM t),
 'browserAuthenticatedDml',(SELECT pg_catalog.has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') FROM t),
 'serviceRoleDml',(SELECT pg_catalog.has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE') FROM t),
 'apiExecutorDml',(SELECT pg_catalog.has_table_privilege('myeongha_api_executor',oid,'SELECT,INSERT,UPDATE,DELETE') FROM t),
 'runtimeDigestSelect',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_runtime',oid,'replay_key_digest','SELECT') FROM t),
 'runtimeRetainedSelect',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_runtime',oid,'retained_until','SELECT') FROM t),
 'runtimeCreatedSelect',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_runtime',oid,'created_at','SELECT') FROM t),
 'runtimeDigestInsert',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_runtime',oid,'replay_key_digest','INSERT') FROM t),
 'runtimeRetainedInsert',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_runtime',oid,'retained_until','INSERT') FROM t),
 'runtimeCreatedInsert',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_runtime',oid,'created_at','INSERT') FROM t),
 'runtimeTableUpdateDelete',(SELECT pg_catalog.has_table_privilege('myeongha_saju_proof_nonce_runtime',oid,'UPDATE,DELETE') FROM t),
 'gcDigestSelect',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_gc',oid,'replay_key_digest','SELECT') FROM t),
 'gcRetainedSelect',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_gc',oid,'retained_until','SELECT') FROM t),
 'gcCreatedSelect',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_gc',oid,'created_at','SELECT') FROM t),
 'gcTableDelete',(SELECT pg_catalog.has_table_privilege('myeongha_saju_proof_nonce_gc',oid,'DELETE') FROM t),
 'gcTableInsertUpdate',(SELECT pg_catalog.has_table_privilege('myeongha_saju_proof_nonce_gc',oid,'INSERT,UPDATE') FROM t),
 'gcDigestInsert',(SELECT pg_catalog.has_column_privilege('myeongha_saju_proof_nonce_gc',oid,'replay_key_digest','INSERT') FROM t),
 'later1550Exists',(to_regclass('public.seyeon_ai_call_cost_events') IS NOT NULL),
 'reviewUnit','saju-proof',
 'authorizedForProduction',false,
 'drReady',false
)::text;
