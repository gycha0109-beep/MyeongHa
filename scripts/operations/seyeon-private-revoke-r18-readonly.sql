-- Watchtower-Track: security
-- R18 OBSERVATION ONLY. Does not install R17 or grant any privilege.
-- Intended for explicit, authorized pg_catalog review. Never reads Memory rows.
-- A matching catalog is NOT a Security/DB/API/Character signature or G6 approval.
\set ON_ERROR_STOP on

with targets as (
  select
    pg_catalog.to_regrole('myeongha_api_executor')::oid as executor_oid,
    pg_catalog.to_regrole('postgres')::oid as expected_owner_oid,
    pg_catalog.to_regnamespace('seyeon_private')::oid as schema_oid,
    pg_catalog.to_regprocedure(
      'seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid)'
    )::oid as revoke_oid,
    pg_catalog.to_regprocedure(
      'public.cmd_revoke_memory_character_grant_v1(uuid,uuid,text)'
    )::oid as legacy_oid
), observed as (
  select
    t.executor_oid is not null as api_executor_exists,
    t.schema_oid is not null as private_schema_exists,
    t.revoke_oid is not null as private_rpc_exists,
    coalesce(p.prosecdef and p.proowner = t.expected_owner_oid, false)
      as private_rpc_definer_owned,
    coalesce(
      pg_catalog.has_schema_privilege(t.executor_oid,t.schema_oid,'USAGE'),
      false
    ) as executor_private_schema_usage,
    coalesce(
      pg_catalog.has_function_privilege(t.executor_oid,t.revoke_oid,'EXECUTE'),
      false
    ) as executor_private_rpc_execute,
    coalesce(
      pg_catalog.has_function_privilege(t.executor_oid,t.legacy_oid,'EXECUTE'),
      false
    ) as executor_legacy_rpc_execute,
    coalesce(
      pg_catalog.has_table_privilege(t.executor_oid,'public.subjects','UPDATE'),
      false
    ) as executor_subjects_update,
    coalesce(
      pg_catalog.has_table_privilege(t.executor_oid,'public.record_access_grants','SELECT'),
      false
    ) as executor_grants_select,
    coalesce(
      pg_catalog.has_table_privilege(t.executor_oid,'public.record_access_grants','UPDATE'),
      false
    ) as executor_grants_update,
    coalesce(
      pg_catalog.has_table_privilege(t.executor_oid,'public.memory_items','SELECT'),
      false
    ) as executor_memory_select,
    coalesce((
      select pg_catalog.bool_and(
        not coalesce(pg_catalog.has_schema_privilege(r.oid,t.schema_oid,'USAGE'),false)
        and not coalesce(pg_catalog.has_function_privilege(r.oid,t.revoke_oid,'EXECUTE'),false)
      ) from pg_catalog.pg_roles r
      where r.rolname in ('anon','authenticated','service_role')
    ),false) as direct_api_roles_denied,
    coalesce(
      not pg_catalog.has_function_privilege('public',t.revoke_oid,'EXECUTE'),
      false
    ) as public_execute_denied
  from targets t
  left join pg_catalog.pg_proc p on p.oid=t.revoke_oid
)
select
  *,
  case
    when api_executor_exists and private_schema_exists and private_rpc_exists
      and private_rpc_definer_owned and executor_private_schema_usage
      and executor_private_rpc_execute
      and not executor_legacy_rpc_execute and not executor_subjects_update
      and not executor_grants_select and not executor_grants_update
      and not executor_memory_select and direct_api_roles_denied
      and public_execute_denied
    then 'CATALOG_MATCHES_CANDIDATE_ONLY_OWNER_SIGNOFF_AND_TRANSPORT_STILL_HOLD'
    else 'HOLD_PRIVATE_REVOKE_NOT_INSTALLED_OR_ACL_NOT_VERIFIED'
  end as technical_readiness
from observed;
