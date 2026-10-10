-- MyeongHa Production Se-yeon 1460-1510 ACL recovery parity probe.
-- Strictly SELECT only; no DDL, DML, role mutation, migration repair or secrets.
-- Intended for Operations evidence #1887, NOT as a deploy/restore authorization.
-- Reviewed against a live, read-only Production SELECT on 2026-10-10.
-- Watchtower-Track: ops
with expected(source_version, signature, expected_owner, expected_definer) as (
  values
    ('1460', 'public.qry_production_relationship_runtime_v1(uuid,text)', 'myeongha_relationship_apply_owner', true),
    ('1470', 'public.cmd_enqueue_seyeon_relationship_sync_v1(uuid,uuid,uuid,jsonb)', 'myeongha_relationship_apply_owner', true),
    ('1470', 'public.cmd_claim_seyeon_relationship_sync_v1(uuid,uuid,text,timestamptz)', 'myeongha_relationship_apply_owner', true),
    ('1470', 'public.cmd_complete_seyeon_relationship_sync_v1(uuid,uuid,text)', 'myeongha_relationship_apply_owner', true),
    ('1480', 'public.qry_production_relationship_history_runtime_v1(uuid,text,bigint)', 'myeongha_relationship_apply_owner', true),
    ('1490', 'public.cmd_receive_seyeon_chat_turn_runtime_v1(uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,text)', 'myeongha_seyeon_chat_runtime_owner', true),
    ('1490', 'public.cmd_allocate_seyeon_chat_attempt_runtime_v1(uuid,uuid,uuid,text)', 'myeongha_seyeon_chat_runtime_owner', true),
    ('1490', 'public.cmd_mark_seyeon_chat_context_ready_runtime_v1(uuid,uuid,uuid)', 'myeongha_seyeon_chat_runtime_owner', true),
    ('1490', 'public.cmd_fail_seyeon_chat_attempt_runtime_v1(uuid,uuid,uuid,text,text)', 'myeongha_seyeon_chat_runtime_owner', true),
    ('1490', 'public.cmd_persist_seyeon_chat_generated_runtime_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,text,jsonb)', 'myeongha_seyeon_chat_runtime_owner', true),
    ('1490', 'public.cmd_persist_seyeon_chat_validated_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)', 'myeongha_seyeon_chat_runtime_owner', true),
    ('1490', 'public.cmd_commit_seyeon_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)', 'myeongha_seyeon_chat_runtime_owner', true),
    ('1500', 'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)', 'myeongha_seyeon_chat_runtime_owner', true),
    ('1500', 'public.qry_seyeon_post_turn_analysis_job_v1(uuid,uuid)', 'myeongha_seyeon_post_turn_owner', true),
    ('1500', 'public.cmd_claim_seyeon_post_turn_analysis_v1(uuid,uuid,text,timestamptz)', 'myeongha_seyeon_post_turn_owner', true),
    ('1500', 'public.cmd_checkpoint_seyeon_post_turn_analysis_v1(uuid,uuid,text,jsonb)', 'myeongha_seyeon_post_turn_owner', true),
    ('1500', 'public.cmd_complete_seyeon_post_turn_analysis_v1(uuid,uuid,text)', 'myeongha_seyeon_post_turn_owner', true),
    ('1510', 'public.qry_content_bundle_manifest_v1(uuid)', 'postgres', false)
),
catalog as (
  select e.*, pg_catalog.to_regprocedure(e.signature) as fn_oid
  from expected e
),
function_checks as (
  select c.*,
    c.fn_oid is not null as is_present,
    coalesce(pg_catalog.pg_get_userbyid(p.proowner) = c.expected_owner, false) as owner_ok,
    coalesce(p.prosecdef = c.expected_definer, false) as definer_ok,
    coalesce(pg_catalog.has_function_privilege('myeongha_api_executor', c.fn_oid, 'EXECUTE'), false) as api_exec_ok,
    not coalesce(pg_catalog.has_function_privilege('anon', c.fn_oid, 'EXECUTE'), true) as anon_denied,
    not coalesce(pg_catalog.has_function_privilege('authenticated', c.fn_oid, 'EXECUTE'), true) as authenticated_denied,
    not coalesce(pg_catalog.has_function_privilege('service_role', c.fn_oid, 'EXECUTE'), true) as service_denied
  from catalog c
  left join pg_catalog.pg_proc p on p.oid = c.fn_oid
),
function_failures as (
  select signature
  from function_checks
  where not (is_present and owner_ok and definer_ok and api_exec_ok
             and anon_denied and authenticated_denied and service_denied)
),
role_checks as (
  select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb,
    pg_catalog.has_schema_privilege(rolname, 'public', 'CREATE') as can_create
  from pg_catalog.pg_roles
  where rolname in ('myeongha_api_executor', 'myeongha_relationship_apply_owner',
                    'myeongha_seyeon_chat_runtime_owner', 'myeongha_seyeon_post_turn_owner')
),
role_failures as (
  select rolname
  from role_checks
  where rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or can_create
),
totals as (
  select
    (select count(*) from function_checks) as functions_checked,
    (select count(*) from function_failures) as function_failure_count,
    (select coalesce(jsonb_agg(signature order by signature), '[]'::jsonb)
       from function_failures) as function_failure_signatures,
    (select count(*) from role_checks) as roles_checked,
    (select count(*) from role_failures) as role_failure_count,
    (select coalesce(jsonb_agg(rolname order by rolname), '[]'::jsonb)
       from role_failures) as role_failure_names
)
select *,
  case when functions_checked = 18 and function_failure_count = 0
             and roles_checked = 4 and role_failure_count = 0
       then 'ACL_PARITY_PASS_RECONCILIATION_STILL_HOLD'
       else 'HOLD_FUNCTION_OR_ROLE_ACL_DRIFT' end as verdict
from totals;
