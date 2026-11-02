-- Disposable PG17 fixture: the official Reading is already finalized and
-- its original purchase Grant has been revoked. This tests visibility only,
-- NOT Production Saju issuer reconciliation or automatic retries.
begin;
select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001', true
);
set local role myeongha_api_executor;
do $$
begin
  if exists (
    select 1 from public.qry_saju_official_attempt_reconciliation_status_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000001'
    )
  ) then
    raise exception 'Revoked original purchase disclosed an official issuer attempt state';
  end if;
end
$$;
rollback;

-- Transaction-local reactivation is synthetic; it is rolled back.
begin;
update public.entitlement_grants g
   set status = 'active',
       revision = revision + 1,
       updated_at = clock_timestamp(),
       last_effective_at = clock_timestamp()
 where g.id = (
   select generation_entitlement_grant_id
   from public.standard_reading_official_bindings
   where reading_id = '12103100-0000-4000-8000-000000000001'
 );
select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001', true
);
set local role myeongha_api_executor;
do $$
begin
  if not exists (
    select 1 from public.qry_saju_official_attempt_reconciliation_status_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000001'
    ) where execution_attempt_no = 1
      and attempt_state = 'succeeded'
      and reading_state = 'succeeded'
      and is_committed_source = true
  ) then
    raise exception 'Active exact purchase cannot inspect successful issuer attempt state';
  end if;
  if exists (
    select 1 from public.qry_saju_official_attempt_reconciliation_status_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000099'
    )
  ) then
    raise exception 'Wrong execution attempt disclosed status';
  end if;
end
$$;
rollback;

do $$
begin
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_saju_official_attempt_reconciliation_status_v1(uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_table_privilege(
    'myeongha_api_executor', 'public.reading_execution_attempts', 'SELECT'
  ) or pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_prepare_reading_transport_attempt_v1(uuid,uuid,uuid,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Internal official status read altered forbidden API executor ACL';
  end if;
end
$$;
