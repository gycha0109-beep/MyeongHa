-- Disposable PostgreSQL 17: exact official issuer lineage must require BOTH the
-- current initial Reader purchase Grant and its verified original Purchase Intent.
-- The existing synthetic Reading is finalized and its Grant is revoked on entry.
-- No Production issuer, paid transaction, or transport writer is activated.

begin;
select pg_catalog.set_config(
  'myeongha.subject_id', '11390000-0000-0000-0000-000000000001', true
);
set local role myeongha_api_executor;
do $$
begin
  if exists (
    select 1 from public.qry_saju_official_stored_lineage_v3(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000001'
    )
  ) then
    raise exception 'Revoked original purchase disclosed verified-purchase issuer lineage';
  end if;
end
$$;
rollback;

-- Restore the exact original Grant ONLY in the disposable test transaction.
begin;
update public.entitlement_grants
   set status = 'active', revision = revision + 1,
       updated_at = clock_timestamp(), last_effective_at = clock_timestamp()
 where id = (
   select generation_entitlement_grant_id
     from public.standard_reading_official_bindings
    where reading_id = '12103100-0000-4000-8000-000000000001'
 );
select pg_catalog.set_config(
  'myeongha.subject_id', '11390000-0000-0000-0000-000000000001', true
);
set local role myeongha_api_executor;
do $$
begin
  if not exists (
    select 1 from public.qry_saju_official_stored_lineage_v3(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000001'
    )
    where native_reading_id = 'test-saju-native-reading-v1'
      and saju_engine_version = 'saju-test-v2'
      and attempt_engine_version = 'saju-test-v2'
      and stored_response_hash =
        'sha256:v1:d2a541178573365041ce0ba291d38670eabd93b6ad9bae216a9f736895edcbc4'
  ) then
    raise exception 'Verified original purchase did not admit exact immutable issuer lineage';
  end if;
  if exists (
    select 1 from public.qry_saju_official_stored_lineage_v3(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000099'
    )
  ) then
    raise exception 'Wrong issuer execution attempt disclosed original lineage';
  end if;
end
$$;
rollback;

-- A purchase intent that is no longer verified must not be accepted merely
-- because a stale or inconsistent Entitlement Grant remains active.
begin;
update public.entitlement_grants
   set status = 'active', revision = revision + 1,
       updated_at = clock_timestamp(), last_effective_at = clock_timestamp()
 where id = (
   select generation_entitlement_grant_id
     from public.standard_reading_official_bindings
    where reading_id = '12103100-0000-4000-8000-000000000001'
 );
update public.purchase_intents
   set status = 'cancelled', updated_at = clock_timestamp()
 where id = (
   select generation_purchase_intent_id
     from public.standard_reading_official_bindings
    where reading_id = '12103100-0000-4000-8000-000000000001'
 );
select pg_catalog.set_config(
  'myeongha.subject_id', '11390000-0000-0000-0000-000000000001', true
);
set local role myeongha_api_executor;
do $$
begin
  if exists (
    select 1 from public.qry_saju_official_stored_lineage_v3(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000001'
    )
  ) then
    raise exception 'Cancelled original Purchase Intent disclosed issuer lineage through active Grant';
  end if;
end
$$;
rollback;

do $$
begin
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_saju_official_stored_lineage_v3(uuid,uuid,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_table_privilege(
    'myeongha_api_executor', 'public.purchase_intents', 'SELECT'
  ) or pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_finalize_reading_transport_success_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'Official Purchase Intent lineage read broadened existing API privileges';
  end if;
end
$$;
