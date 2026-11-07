-- Watchtower-Track: ops
-- 2026-11-07 current Production frontier, metadata-only, no object contents.
-- Enumerates lexical CREATE FUNCTION/POLICY/TABLE indicators in precisely the 41
-- applied remote-only migration records and checks name/schema presence in pg_catalog.
-- Text matches can be inside procedural bodies. Names present != body/ACL/owner/RLS parity.
-- Retains missing names as diagnostic text only. Does not touch application rows.
BEGIN TRANSACTION READ ONLY;
WITH m AS (
 SELECT version,name,
 CASE WHEN cardinality(statements)=1 THEN statements[1] ELSE array_to_string(statements,E';\n\n')||';' END body
 FROM supabase_migrations.schema_migrations WHERE version IN ('20261008090417','20261023054251','20261025193416','20261025193454','20261025201500','20261025203519','20261027004434','20261027004544','20261027011650','20261027043527','20261027074247','20261027081929','20261028011357','20261029012948','20261029070331','20261029071539','20261030014708','20261030014906','20261030014935','20261030015201','20261030015858','20261030020711','20261030021027','20261031182505','20261031182550','20261031182926','20261031185454','20261031192427','20261031205042','20261101095105','20261101133954','20261101151700','20261102060123','20261102060126','20261102081315','20261103005333','20261103072224','20261103083731','20261104043413','20261104195925','20261105075227')
), routine_indicators AS (
 SELECT m.version,coalesce(nullif(lower(r[3]),''),'public') schema_name,lower(r[4]) object_name
 FROM m, regexp_matches(m.body,
 '(?im)^[[:space:]]*create[[:space:]]+(or[[:space:]]+replace[[:space:]]+)?function[[:space:]]+(([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)[[:space:]]*\(','g') r
), policy_indicators AS (
 SELECT m.version,lower(p[1]) policy_name,coalesce(nullif(lower(p[3]),''),'public') schema_name,lower(p[4]) relation_name
 FROM m,regexp_matches(m.body,
 '(?im)^[[:space:]]*create[[:space:]]+policy[[:space:]]+([a-z_][a-z0-9_]*)[[:space:]]+on[[:space:]]+(([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)','g') p
), table_indicators AS (
 SELECT m.version,coalesce(nullif(lower(t[3]),''),'public') schema_name,lower(t[4]) relation_name
 FROM m,regexp_matches(m.body,
 '(?im)^[[:space:]]*create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?(([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)','g') t
), matched_routines AS (
 SELECT i.*,exists(SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
 WHERE n.nspname=i.schema_name AND f.proname=i.object_name) present FROM routine_indicators i
), matched_policies AS (
 SELECT i.*,exists(SELECT 1 FROM pg_policies p WHERE p.schemaname=i.schema_name AND p.tablename=i.relation_name AND p.policyname=i.policy_name) present FROM policy_indicators i
), matched_tables AS (
 SELECT i.*,to_regclass(quote_ident(i.schema_name)||'.'||quote_ident(i.relation_name)) IS NOT NULL present FROM table_indicators i
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
 'version',m.version,
 'functionIndicators',(SELECT count(*) FROM matched_routines f WHERE f.version=m.version),
 'liveNamedFunctions',(SELECT count(*) FROM matched_routines f WHERE f.version=m.version AND f.present),
 'missingNamedFunctions',(SELECT coalesce(jsonb_agg(DISTINCT f.schema_name||'.'||f.object_name),'[]'::jsonb) FROM matched_routines f WHERE f.version=m.version AND NOT f.present),
 'policyIndicators',(SELECT count(*) FROM matched_policies p WHERE p.version=m.version),
 'liveNamedPolicies',(SELECT count(*) FROM matched_policies p WHERE p.version=m.version AND p.present),
 'missingNamedPolicies',(SELECT coalesce(jsonb_agg(DISTINCT p.schema_name||'.'||p.relation_name||':'||p.policy_name),'[]'::jsonb) FROM matched_policies p WHERE p.version=m.version AND NOT p.present),
 'tableIndicators',(SELECT count(*) FROM matched_tables t WHERE t.version=m.version),
 'liveNamedTables',(SELECT count(*) FROM matched_tables t WHERE t.version=m.version AND t.present),
 'missingNamedTables',(SELECT coalesce(jsonb_agg(DISTINCT t.schema_name||'.'||t.relation_name),'[]'::jsonb) FROM matched_tables t WHERE t.version=m.version AND NOT t.present)
) ORDER BY m.version),'[]'::jsonb)::text FROM m;
ROLLBACK;
