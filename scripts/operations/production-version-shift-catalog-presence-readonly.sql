-- Watchtower-Track: ops
-- Phase 8-A / 2026-11-07: selected live catalog name/privilege census only.
-- The eight pairs have different migration VERSION IDs. Object existence is
-- not SQL body, DDL/ACL, provider-ledger or recovery equivalence.
-- Production: SELECT-only, no secret, user row, source SQL or provider payload.
BEGIN TRANSACTION READ ONLY;

SELECT current_setting('transaction_read_only') AS transaction_read_only,
       current_setting('server_version') AS server_version;

WITH expected(name) AS (
 VALUES
 ('qry_myeongha_owner_admin_access_v1'),
 ('internal_cmd_chat_credit_verified_topup_v1'),
 ('internal_cmd_chat_first_paid_reading_reward_v1'),
 ('internal_cmd_chat_credit_ack_delivered_proven_v2'),
 ('qry_commerce_owner_sandbox_credit_checkout_v1'),
 ('qry_commerce_owner_sandbox_credit_checkout_v2'),
 ('cmd_prepare_owner_portone_sandbox_credit_v1'),
 ('cmd_persist_owner_kcp_signed_sandbox_receipt_v1')
), fx AS (
 SELECT e.name, p.oid, n.nspname,
        has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
        has_function_privilege('service_role',p.oid,'EXECUTE') AS service_exec,
        has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE') AS api_exec
 FROM expected e LEFT JOIN pg_proc p ON p.proname=e.name
 LEFT JOIN pg_namespace n ON n.oid=p.pronamespace
    AND n.nspname IN ('public','commerce_private')
 WHERE p.oid IS NULL OR n.oid IS NOT NULL
), inventory AS (
 SELECT 'function'::text AS kind, name AS object_name,
        count(oid) AS found_count,
        bool_or(coalesce(anon_exec,false)) AS anon_exec,
        bool_or(coalesce(auth_exec,false)) AS auth_exec,
        bool_or(coalesce(service_exec,false)) AS service_exec,
        bool_or(coalesce(api_exec,false)) AS api_exec
 FROM fx GROUP BY name
 UNION ALL
 SELECT 'relation', a.name, count(c.oid),null,null,null,null
 FROM (VALUES('public','myeongha_owner_administrators_v1'),
             ('commerce_private','owner_sandbox_receipt_attestation_v1')) a(schema_name,name)
 LEFT JOIN pg_namespace n ON n.nspname=a.schema_name
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=a.name
 GROUP BY a.name
 UNION ALL
 SELECT 'constraint', a.name, count(co.oid),null,null,null,null
 FROM (VALUES('products_type_check'),('chat_credit_lots_v1_source_kind_check'),
             ('chat_credit_lots_validity_v1')) a(name)
 LEFT JOIN pg_constraint co ON co.conname=a.name
 GROUP BY a.name
)
SELECT * FROM inventory ORDER BY kind,object_name;

WITH named(schema_name,object_name) AS (
 VALUES('public','myeongha_owner_administrators_v1'),
       ('commerce_private','owner_sandbox_receipt_attestation_v1')
)
SELECT a.schema_name,a.object_name,c.oid IS NOT NULL AS exists,
       c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced,
       coalesce((SELECT count(*) FROM pg_policy pol WHERE pol.polrelid=c.oid),0)
         AS policy_count,
       coalesce(has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'),false)
         AS anon_any_dml,
       coalesce(has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'),false)
         AS authenticated_any_dml,
       coalesce(has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'),false)
         AS service_any_dml,
       coalesce(has_table_privilege('myeongha_api_executor',c.oid,'SELECT,INSERT,UPDATE,DELETE'),false)
         AS api_any_dml
FROM named a
LEFT JOIN pg_namespace n ON n.nspname=a.schema_name
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=a.object_name
ORDER BY a.object_name;

ROLLBACK;
