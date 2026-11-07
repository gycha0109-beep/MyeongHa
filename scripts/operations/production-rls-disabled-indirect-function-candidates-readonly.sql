-- Watchtower-Track: ops
-- Phase 8-A: scan current public SQL function metadata for potential indirect references
-- to the 18 RLS-disabled tables. Text matches are heuristic, not verified call edges.
-- No source bodies, application rows, credentials or user identifiers leave SQL.
BEGIN TRANSACTION READ ONLY;
WITH
targets(schema_name, table_name) AS (
 VALUES
 ('public','ai_execution_groundings'),
 ('public','ai_execution_logs'),
 ('public','character_runtime_catalog'),
 ('public','chat_turn_attempts'),
 ('public','chat_turns'),
 ('public','commerce_provider_events'),
 ('public','commerce_receipts'),
 ('public','content_bundles'),
 ('public','content_releases'),
 ('public','entitlement_events'),
 ('public','entitlement_grants'),
 ('public','entitlements'),
 ('public','memory_proposals'),
 ('public','product_offers'),
 ('public','products'),
 ('public','purchase_intents'),
 ('public','reading_execution_attempts'),
 ('public','reading_groundings')
),
f AS MATERIALIZED (
 SELECT p.oid,n.nspname AS schema_name,p.proname,p.prosecdef,p.proconfig,
        p.proowner,p.prokind,
        pg_catalog.pg_get_function_identity_arguments(p.oid) AS signature,
        pg_catalog.pg_get_functiondef(p.oid) AS definition
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind IN ('f','p')
),
matches AS (
 SELECT f.oid, t.schema_name,t.table_name,
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_depend d
          JOIN pg_catalog.pg_class c ON d.refclassid='pg_catalog.pg_class'::regclass
             AND d.refobjid=c.oid
          JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE d.classid='pg_catalog.pg_proc'::regclass
            AND d.objid=f.oid
            AND n.nspname=t.schema_name AND c.relname=t.table_name
        ) AS catalog_dependency
 FROM f CROSS JOIN targets t
 WHERE f.definition ~* ('(^|[^a-z0-9_])'||t.table_name||'([^a-z0-9_]|$)')
),
m AS (
 SELECT f.oid,f.schema_name,f.proname,f.signature,f.prosecdef,
        pg_catalog.pg_get_userbyid(f.proowner) AS owner_name,
        CASE
          WHEN f.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(f.proconfig) setting WHERE setting LIKE 'search_path=%'
          ) THEN 'unset'
          WHEN EXISTS (
            SELECT 1 FROM unnest(f.proconfig) setting WHERE setting='search_path='
          ) THEN 'empty'
          ELSE 'nonempty'
        END AS search_path_kind,
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.definition,'UTF8')),'hex')
          AS definition_sha256,
        coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'name',x.table_name,'catalogDependency',x.catalog_dependency
          ) ORDER BY x.table_name) FROM matches x WHERE x.oid=f.oid
        ),'[]'::jsonb) AS possible_references,
        pg_catalog.has_function_privilege('anon', f.oid,'EXECUTE')
          AND pg_catalog.has_schema_privilege('anon',f.schema_name,'USAGE') AS anon_callable,
        pg_catalog.has_function_privilege('authenticated',f.oid,'EXECUTE')
          AND pg_catalog.has_schema_privilege('authenticated',f.schema_name,'USAGE')
          AS authenticated_callable,
        pg_catalog.has_function_privilege('myeongha_api_executor',f.oid,'EXECUTE')
          AND pg_catalog.has_schema_privilege('myeongha_api_executor',f.schema_name,'USAGE')
          AS api_executor_callable,
        pg_catalog.has_function_privilege('service_role',f.oid,'EXECUTE')
          AND pg_catalog.has_schema_privilege('service_role',f.schema_name,'USAGE')
          AS service_role_callable
 FROM f WHERE EXISTS(SELECT 1 FROM matches x WHERE x.oid=f.oid)
),
s AS (
 SELECT count(*)::int AS matched_functions,
        count(*) FILTER (WHERE prosecdef)::int AS security_definer_functions,
        count(*) FILTER (WHERE prosecdef AND (anon_callable OR authenticated_callable))::int
          AS client_callable_definer_candidates,
        count(*) FILTER (WHERE prosecdef AND api_executor_callable)::int
          AS api_executor_callable_definer_candidates,
        count(*) FILTER (WHERE prosecdef AND search_path_kind='unset')::int
          AS unpinned_definer_candidates,
        count(*) FILTER (WHERE prosecdef AND search_path_kind='nonempty')::int
          AS nonempty_search_path_definer_candidates,
        count(*) FILTER (WHERE anon_callable)::int AS anon_callable_matches,
        count(*) FILTER (WHERE authenticated_callable)::int AS authenticated_callable_matches,
        count(*) FILTER (WHERE api_executor_callable)::int AS api_executor_callable_matches,
        sum(jsonb_array_length(possible_references))::int AS table_name_reference_pairs
 FROM m
)
SELECT jsonb_build_object(
 'schemaVersion','ops-rls-disabled-indirect-routine-candidates-v1',
 'observedAtUtc',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'transactionReadOnly',current_setting('transaction_read_only')='on',
 'postgresVersion',current_setting('server_version'),
 'targetDistinctTables',(SELECT count(*) FROM targets),
 'publicFunctionsScanned',(SELECT count(*) FROM f),
 'summary',(SELECT to_jsonb(s) FROM s),
 'functions',(
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'schema',schema_name,
     'name',proname,
     'signature',signature,
     'securityDefiner',prosecdef,
     'owner',owner_name,
     'searchPathKind',search_path_kind,
     'definitionSha256',definition_sha256,
     'anonCallable',anon_callable,
     'authenticatedCallable',authenticated_callable,
     'apiExecutorCallable',api_executor_callable,
     'serviceRoleCallable',service_role_callable,
     'possibleTableReferences',possible_references
   ) ORDER BY schema_name,proname,signature),'[]'::jsonb)
   FROM m
 )
)::text AS evidence_json;
ROLLBACK;
