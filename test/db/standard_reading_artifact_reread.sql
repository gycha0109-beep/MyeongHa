\set ON_ERROR_STOP on

create or replace function pg_temp.assert_reread_true(label text, condition boolean)
returns void
language plpgsql
as $assert_reread_true$
begin
  if condition is not true then
    raise exception 'FAIL %', label;
  end if;
  raise notice 'PASS %', label;
end;
$assert_reread_true$;

select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',
  false
);

select pg_temp.assert_reread_true(
  'pending bound Reading is not rereadable',
  not exists (
    select 1
    from public.internal_qry_standard_reading_artifact_source_v1(
      '11390000-0000-0000-0000-000000000001',
      '11603100-0000-0000-0000-000000000001',
      clock_timestamp()
    )
  )
);

insert into public.reading_execution_attempts(
  id, reading_id, subject_id, execution_attempt_no, state,
  transport_key, saju_engine_key, requested_engine_version, resolved_engine_version,
  external_request_ref, started_at, finished_at, error_code
) values (
  '11800000-0000-0000-0000-000000000001',
  '11603100-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  1, 'succeeded',
  'standard-reread-test', 'saju-test', null, 'saju-test-v1',
  null, clock_timestamp(), clock_timestamp(), null
);

begin;

insert into public.reading_refs(
  reading_id, subject_id, execution_attempt_id, saju_engine_key,
  external_reading_ref, source_birth_input_hash, target_birth_input_hash,
  saju_engine_version, reading_contract_version, product_response_state,
  required_action_jsonb, clarifications_jsonb, calculation_ambiguity_jsonb,
  response_snapshot_jsonb, response_hash, created_at
) values (
  '11603100-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  '11800000-0000-0000-0000-000000000001',
  'saju-test', null, 'sha256:test:standard-unit-self-v1', null,
  'saju-test-v1', 'product-reading-test-v1', 'delivered',
  null, null, null,
  '{"responseVersion":"myeonghwa-product-reading-response-v2","artifact":"stored-test"}'::jsonb,
  'sha256:test-standard-reading-artifact',
  clock_timestamp()
);

update public.readings
set execution_status = 'succeeded',
    committed_execution_attempt_id = '11800000-0000-0000-0000-000000000001',
    completed_at = clock_timestamp()
where id = '11603100-0000-0000-0000-000000000001'
  and subject_id = '11390000-0000-0000-0000-000000000001';

commit;

select pg_temp.assert_reread_true(
  'owner reads exact completed bound artifact source',
  (
    select q.reading_id = '11603100-0000-0000-0000-000000000001'::uuid
       and q.purchase_intent_id = '11392300-0000-0000-0000-000000000001'::uuid
       and q.reader_character_id = 'test-standard-reader'
       and q.response_hash = 'sha256:test-standard-reading-artifact'
       and q.response_snapshot_jsonb = '{"responseVersion":"myeonghwa-product-reading-response-v2","artifact":"stored-test"}'::jsonb
    from public.internal_qry_standard_reading_artifact_source_v1(
      '11390000-0000-0000-0000-000000000001',
      '11603100-0000-0000-0000-000000000001',
      clock_timestamp()
    ) q
  )
);

select pg_temp.assert_reread_true(
  'unbound Reading identity is not rereadable',
  not exists (
    select 1
    from public.internal_qry_standard_reading_artifact_source_v1(
      '11390000-0000-0000-0000-000000000001',
      '11809999-0000-0000-0000-000000000001',
      clock_timestamp()
    )
  )
);

select pg_temp.assert_reread_true(
  'reread source is pinned to the committed execution attempt',
  position(
    'rr.execution_attempt_id = r.committed_execution_attempt_id'
    in pg_catalog.pg_get_functiondef(
      'public.internal_qry_standard_reading_artifact_source_v1(uuid,uuid,timestamptz)'::pg_catalog.regprocedure
    )
  ) > 0
);

insert into public.entitlement_grants(
  id, subject_id, entitlement_key, scope_key, grant_key, grant_source_type,
  status, valid_from, valid_until, revision, last_effective_at,
  last_provider_ordering_key, created_at, updated_at
)
select
  '11801000-0000-0000-0000-000000000001',
  g.subject_id, g.entitlement_key, g.scope_key, 'other-active-same-key', 'promo',
  'active', g.valid_from, null, 0, clock_timestamp(),
  null, clock_timestamp(), clock_timestamp()
from public.standard_reading_unit_bindings b
join public.entitlement_grants g on g.id = b.entitlement_grant_id
where b.reading_id = '11603100-0000-0000-0000-000000000001';

update public.entitlement_grants g
set status = 'revoked',
    revision = revision + 1,
    last_effective_at = clock_timestamp(),
    updated_at = clock_timestamp()
from public.standard_reading_unit_bindings b
where b.reading_id = '11603100-0000-0000-0000-000000000001'
  and g.id = b.entitlement_grant_id;

select pg_temp.assert_reread_true(
  'revoked exact purchase Grant denies reread even when another same-key Grant is active',
  not exists (
    select 1
    from public.internal_qry_standard_reading_artifact_source_v1(
      '11390000-0000-0000-0000-000000000001',
      '11603100-0000-0000-0000-000000000001',
      clock_timestamp()
    )
  )
  and exists (
    select 1
    from public.entitlement_grants other_g
    where other_g.id = '11801000-0000-0000-0000-000000000001'
      and other_g.status = 'active'
  )
);

select pg_temp.assert_reread_true(
  'access revocation preserves immutable artifact and purchase binding provenance',
  exists (
    select 1 from public.standard_reading_unit_bindings
    where reading_id = '11603100-0000-0000-0000-000000000001'
  )
  and exists (
    select 1 from public.reading_refs
    where reading_id = '11603100-0000-0000-0000-000000000001'
      and response_hash = 'sha256:test-standard-reading-artifact'
  )
);

update public.entitlement_grants g
set status = 'active',
    valid_until = greatest(g.valid_from, clock_timestamp()) + interval '1 minute',
    revision = revision + 1,
    last_effective_at = clock_timestamp(),
    updated_at = clock_timestamp()
from public.standard_reading_unit_bindings b
where b.reading_id = '11603100-0000-0000-0000-000000000001'
  and g.id = b.entitlement_grant_id;

select pg_temp.assert_reread_true(
  'expired exact purchase Grant denies reread',
  not exists (
    select 1
    from public.internal_qry_standard_reading_artifact_source_v1(
      '11390000-0000-0000-0000-000000000001',
      '11603100-0000-0000-0000-000000000001',
      clock_timestamp() + interval '2 minutes'
    )
  )
);

insert into public.subjects(
  id, kind, auth_user_id, status, merged_into_subject_id, created_at, updated_at
) values (
  '11390000-0000-0000-0000-000000000002',
  'guest', null, 'active', null, clock_timestamp(), clock_timestamp()
);

select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000002',
  false
);

select pg_temp.assert_reread_true(
  'different canonical subject cannot read another owner artifact',
  not exists (
    select 1
    from public.internal_qry_standard_reading_artifact_source_v1(
      '11390000-0000-0000-0000-000000000002',
      '11603100-0000-0000-0000-000000000001',
      clock_timestamp()
    )
  )
);

select pg_temp.assert_reread_true(
  'raw artifact source authority remains unavailable to ordinary runtime roles',
  not has_function_privilege(
    'myeongha_api_executor',
    'public.internal_qry_standard_reading_artifact_source_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.internal_qry_standard_reading_artifact_source_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.internal_qry_standard_reading_artifact_source_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.internal_qry_standard_reading_artifact_source_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
);

\echo 'Standard Reading artifact reread source authority tests passed'
