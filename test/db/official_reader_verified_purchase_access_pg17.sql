-- Disposable PG17 regression: a stale active Reader entitlement cannot
-- authorize access after its exact purchase Intent stops being verified.
-- The historic fixture has revoked all Reader grants; all changes roll back.
begin;
update public.entitlement_grants g
   set status = 'active', revision = revision + 1,
       updated_at = clock_timestamp(), last_effective_at = clock_timestamp()
  from public.standard_reading_reader_access_grants a
 where a.purchase_intent_id = '12192300-0000-0000-0000-000000000002'
   and a.entitlement_grant_id = g.id;

select pg_catalog.set_config(
  'myeongha.subject_id', '11390000-0000-0000-0000-000000000001', true
);
set local role myeongha_api_executor;

do $$
begin
  if not exists (
    select 1 from public.qry_character_standard_reading_access_runtime_v2(
      '11390000-0000-0000-0000-000000000001',
      'test-unlockable-reader', statement_timestamp()
    )
  ) or not exists (
    select 1 from public.qry_standard_reading_artifact_source_runtime_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      'test-unlockable-reader', statement_timestamp()
    )
  ) or not exists (
    select 1 from public.qry_official_reading_record_runtime_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001'
    )
  ) then
    raise exception 'Verified second Reader purchase must retain Reader and owner reread';
  end if;
end
$$;

reset role;

-- Simulate Commerce refund/cancel recorded before stale Grant revocation.
update public.purchase_intents
   set status = 'cancelled', updated_at = clock_timestamp()
 where id = '12192300-0000-0000-0000-000000000002';

set local role myeongha_api_executor;
do $$
begin
  if exists (
    select 1 from public.qry_character_standard_reading_access_runtime_v2(
      '11390000-0000-0000-0000-000000000001',
      'test-unlockable-reader', statement_timestamp()
    )
  ) or exists (
    select 1 from public.qry_character_standard_reading_access_runtime_v1(
      '11390000-0000-0000-0000-000000000001',
      'test-unlockable-reader', statement_timestamp()
    )
  ) or exists (
    select 1 from public.qry_standard_reading_artifact_source_runtime_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001',
      'test-unlockable-reader', statement_timestamp()
    )
  ) or exists (
    select 1 from public.qry_official_reading_record_runtime_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001'
    )
  ) then
    raise exception 'Cancelled original Reader B purchase exposed protected Reader or Records source';
  end if;
end
$$;
rollback;

-- An independent verified Reader A purchase still authorizes the same
-- immutable owner archive even when Reader B's purchase is cancelled.
begin;
update public.entitlement_grants g
   set status = 'active', revision = revision + 1,
       updated_at = clock_timestamp(), last_effective_at = clock_timestamp()
  from public.standard_reading_reader_access_grants a
 where a.purchase_intent_id in (
   '11392300-0000-0000-0000-000000000001',
   '12192300-0000-0000-0000-000000000002'
 )
   and a.entitlement_grant_id = g.id;
update public.purchase_intents
   set status = 'cancelled', updated_at = clock_timestamp()
 where id = '12192300-0000-0000-0000-000000000002';

select pg_catalog.set_config(
  'myeongha.subject_id', '11390000-0000-0000-0000-000000000001', true
);
set local role myeongha_api_executor;
do $$
begin
  if exists (
    select 1 from public.qry_character_standard_reading_access_runtime_v2(
      '11390000-0000-0000-0000-000000000001',
      'test-unlockable-reader', statement_timestamp()
    )
  ) or not exists (
    select 1 from public.qry_character_standard_reading_access_runtime_v2(
      '11390000-0000-0000-0000-000000000001',
      'test-standard-reader', statement_timestamp()
    )
  ) or not exists (
    select 1 from public.qry_official_reading_record_runtime_v1(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-4000-8000-000000000001'
    )
  ) then
    raise exception 'Reader B cancellation must not revoke verified independent Reader A';
  end if;
end
$$;
rollback;

do $$
begin
  if pg_catalog.has_table_privilege('myeongha_api_executor','public.purchase_intents','SELECT')
    or pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.internal_qry_character_standard_reading_access_v2(uuid,text,timestamptz)',
      'EXECUTE'
    ) or pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.internal_qry_standard_reading_artifact_source_v2(uuid,uuid,text,timestamptz)',
      'EXECUTE'
    ) then
    raise exception 'Reader purchase check improperly widened API executor privileges';
  end if;
end
$$;
