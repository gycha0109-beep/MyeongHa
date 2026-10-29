-- Watchtower-Track: security
-- Read-only Production G3/S0 installation and ACL evidence.
-- Inspect metadata only. No user records, transcripts, migrations, DDL,
-- DML, role changes, or automatic authorization.
-- Applies equally before and after the separately approved 07/08 install.
with expected(signature) as (
  values
    ('public.qry_seyeon_memory_grant_lifecycle_v1(uuid,uuid)'),
    ('public.qry_seyeon_thread_ever_involved_v1(uuid,uuid)')
), installed as (
  select e.signature, to_regprocedure(e.signature) as function_oid
  from expected e
), function_acl as (
  select i.signature,
    i.function_oid is not null as present,
    coalesce(pg_get_userbyid(p.proowner)='postgres',false) as owned_by_postgres,
    coalesce(p.prosecdef,false) as security_definer,
    coalesce(p.provolatile='s',false) as stable,
    coalesce(exists(select 1 from unnest(p.proconfig) config
      where replace(config,' ','')='search_path=pg_catalog,public'),
      false) as pinned_search_path,
    coalesce('row_security=off'=any(p.proconfig),false) as rows_bypassed_by_owned_function,
    coalesce(has_function_privilege('myeongha_api_executor',i.function_oid,'EXECUTE'),false) as api_execute,
    coalesce(has_function_privilege('anon',i.function_oid,'EXECUTE'),false) as anon_execute,
    coalesce(has_function_privilege('authenticated',i.function_oid,'EXECUTE'),false) as authenticated_execute,
    coalesce(has_function_privilege('service_role',i.function_oid,'EXECUTE'),false) as service_execute,
    coalesce((select bool_or(acl.grantee=0 and acl.privilege_type='EXECUTE')
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl),true)
      as public_execute
  from installed i left join pg_proc p on p.oid=i.function_oid
), baseline as (
  select
    current_setting('server_version_num')::integer between 170000 and 179999 as pg17,
    to_regrole('myeongha_api_executor') is not null as api_role_present,
    to_regprocedure('public.assert_myeongha_subject_context_v1(uuid)') is not null
      as canonical_subject_assertion_present,
    to_regprocedure('public.qry_memory_active_grants_v1(uuid,uuid)') is not null
      as original_grant_reader_present,
    to_regprocedure('public.qry_chat_thread_runtime_binding_v1(uuid,uuid)') is not null
      as original_thread_binding_present,
    to_regprocedure('public.qry_chat_thread_stream_v2(uuid,uuid,bigint,integer)') is not null
      as original_stream_present,
    coalesce((select relrowsecurity from pg_class
      where oid='public.conversation_thread_characters'::regclass),false)
      as participant_rls_enabled,
    coalesce((select relrowsecurity from pg_class
      where oid='public.record_access_grants'::regclass),false)
      as grant_rls_enabled,
    not has_table_privilege('myeongha_api_executor',
      'public.conversation_thread_characters','SELECT') as api_participant_select_denied,
    not has_table_privilege('myeongha_api_executor',
      'public.conversation_thread_characters','UPDATE') as api_participant_update_denied,
    not has_table_privilege('myeongha_api_executor',
      'public.record_access_grants','UPDATE') as api_grant_update_denied,
    not has_table_privilege('myeongha_api_executor',
      'public.memory_items','UPDATE') as api_memory_update_denied,
    not exists(select 1 from public.seyeon_positive_source_type_registry_v1
      where enabled or writable_enabled) as positive_registry_off
), counts as (
  select count(*) filter(where present)::integer as installed_count,
    count(*) filter(where present and owned_by_postgres and security_definer
      and stable and pinned_search_path and rows_bypassed_by_owned_function
      and api_execute and not anon_execute and not authenticated_execute
      and not service_execute and not public_execute)::integer as acl_verified_count,
    coalesce(jsonb_agg(signature order by signature)
      filter(where not present),'[]'::jsonb) as missing_functions,
    coalesce(jsonb_agg(signature order by signature)
      filter(where present and not (
        owned_by_postgres and security_definer and stable
        and pinned_search_path and rows_bypassed_by_owned_function
        and api_execute and not anon_execute and not authenticated_execute
        and not service_execute and not public_execute
      )),'[]'::jsonb) as drifted_functions
  from function_acl
), results as (
  select b.*,c.*, (
    b.pg17 and b.api_role_present and b.canonical_subject_assertion_present
    and b.original_grant_reader_present and b.original_thread_binding_present
    and b.original_stream_present and b.participant_rls_enabled
    and b.grant_rls_enabled and b.api_participant_select_denied
    and b.api_participant_update_denied and b.api_grant_update_denied
    and b.api_memory_update_denied and b.positive_registry_off
  ) as baseline_ok
  from baseline b cross join counts c
)
select current_setting('server_version_num')::integer as pg_version,
  installed_count,
  missing_functions,
  drifted_functions,
  baseline_ok,
  case
    when not baseline_ok then 'HOLD_BASELINE_DRIFT'
    when installed_count=0 then 'HOLD_07_08_NOT_INSTALLED'
    when installed_count<>2 then 'HOLD_PARTIAL_INSTALLATION'
    when acl_verified_count<>2 then 'HOLD_FUNCTION_ACL_DRIFT'
    else 'CATALOG_ACL_PASS_RELEASE_STILL_HOLD'
  end as installation_verdict,
  'G3_PRODUCTION_REVEAL_AND_HISTORY_REMAIN_HOLD'::text as disclosure_verdict
from results;
