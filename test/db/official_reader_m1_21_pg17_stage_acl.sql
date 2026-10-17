-- M1-21: catalog-only CHECKPOINT after each committed migration in disposable PG17.
-- No INSERT, DDL, GRANT, SECURITY DEFINER calls or production connectivity.
-- Check the exact private/legacy surface released by each migration, including
-- direct and inherited EXECUTE privileges and PUBLIC's default EXECUTE.
with expected(stage, fn_name) as (
  values
    ('1820', 'internal_apply_official_reader_unified_receipt_v1'),
    ('1820', 'internal_cmd_bind_official_reader_unified_v1'),
    ('1890', 'internal_apply_entitlement_effect_v1'),
    ('1890', 'internal_apply_official_reader_provider_revoke_locked_v1'),
    ('1890', 'internal_execute_official_reader_verified_provider_revoke_v1'),
    ('1890', 'internal_apply_official_reader_verified_cancel_scope_v2'),
    ('1890', 'internal_apply_official_reader_verified_cancel_batch_v1'),
    ('1890', 'internal_record_official_reader_portone_cancel_shadow_v1'),
    ('1890', 'internal_apply_reviewed_official_reader_full_cancel_private_v1'),
    ('1900', 'internal_execute_official_reader_verified_cancel_v2'),
    ('1900', 'internal_apply_verified_receipt_capability_effects_v1'),
    ('1900', 'internal_apply_official_reader_unified_receipt_v1'),
    ('1900', 'internal_cmd_bind_official_reader_unified_v1'),
    ('1900', 'internal_cmd_bind_official_reader_additional_locked_v1'),
    ('1900', 'internal_apply_additional_official_reader_receipt_locked_v1'),
    ('1900', 'internal_apply_initial_official_reader_receipt_locked_v1'),
    ('1900', 'internal_cmd_bind_initial_official_reader_locked_v1')
),
stage_expected as (
  select fn_name from expected where stage = :'stage'
),
checked as (
  select e.fn_name, count(p.oid) as function_count,
    coalesce(bool_and(
      not exists (
        select 1
        from (values ('anon'), ('authenticated'), ('service_role'),
          ('myeongha_api_executor'), ('myeongha_commerce_internal_executor'),
          ('myeongha_seyeon_chat_runtime_owner')) actor(role_name)
        where coalesce(
          pg_catalog.has_function_privilege(actor.role_name, p.oid, 'EXECUTE'), true)
      ) and not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(p.proacl, pg_catalog.acldefault('f',p.proowner))
        ) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
    ),false) as all_runtime_closed
  from stage_expected e
  left join pg_catalog.pg_proc p on p.proname=e.fn_name
  left join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    and n.nspname='public'
  where p.oid is null or n.oid is not null
  group by e.fn_name
)
select case when
  (select count(*) from stage_expected) > 0
  and (select count(*) from checked) = (select count(*) from stage_expected)
  and (select coalesce(pg_catalog.bool_and(
    function_count = 1 and all_runtime_closed),false) from checked)
then 'PASS_M1_21_STAGE_CLOSED'
else 'FAIL_M1_21_STAGE_ACL_OPEN_OR_AMBIGUOUS'
end;
