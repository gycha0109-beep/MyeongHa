-- CI-only disposable PostgreSQL 17 exact official stored lineage contract.
-- The existing fixture has already finalized and revoked its original Grant.
-- No Production issuer, customer payment or transport writer is activated.
begin;

select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',
  true
);

set local role myeongha_api_executor;

do $$
begin
  if exists (
    select 1 from public.qry_saju_official_stored_lineage_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000001'
    )
  ) then
    raise exception 'Revoked initial Grant disclosed the official stored source lineage';
  end if;
end
$$;
rollback;

begin;
update public.entitlement_grants
   set status = 'active',
       revision = revision + 1,
       updated_at = clock_timestamp(),
       last_effective_at = clock_timestamp()
 where id = (
   select generation_entitlement_grant_id
     from public.standard_reading_official_bindings
    where reading_id = '12103100-0000-4000-8000-000000000001'
 );
select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',
  true
);
set local role myeongha_api_executor;
do $$
declare v_native text;
declare v_hash text;
begin
  select native_reading_id, stored_response_hash
    into v_native, v_hash
    from public.qry_saju_official_stored_lineage_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000001'
    );
  if v_native is distinct from 'test-saju-native-reading-v1'
     or v_hash is distinct from
       'sha256:v1:d2a541178573365041ce0ba291d38670eabd93b6ad9bae216a9f736895edcbc4' then
    raise exception 'Current exact initial Grant did not admit the immutable stored lineage';
  end if;
  if exists (
    select 1 from public.qry_saju_official_stored_lineage_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      '12104000-0000-0000-0000-000000000009'
    )
  ) then
    raise exception 'Wrong attempt disclosed the stored lineage';
  end if;
end
$$;
rollback;

do $$
begin
  if pg_catalog.has_table_privilege('myeongha_api_executor',
    'public.reading_refs','SELECT')
  or pg_catalog.has_table_privilege('myeongha_api_executor',
    'public.reading_execution_attempts','SELECT') then
    raise exception 'API executor must not need direct private lineage table SELECT';
  end if;
end
$$;
