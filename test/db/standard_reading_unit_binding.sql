\set ON_ERROR_STOP on

\i test/db/standard_love_relationship_reader_authority.sql

create or replace function pg_temp.assert_unit_true(label text, condition boolean)
returns void
language plpgsql
as $assert_unit_true$
begin
  if condition is not true then
    raise exception 'FAIL %', label;
  end if;
  raise notice 'PASS %', label;
end;
$assert_unit_true$;

create or replace function pg_temp.assert_unit_fails(
  label text,
  statement text,
  expected_fragment text
) returns void
language plpgsql
as $assert_unit_fails$
declare
  actual_message text;
  actual_constraint text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics
      actual_message = message_text,
      actual_constraint = constraint_name;
    if position(expected_fragment in coalesce(actual_message, '')) > 0
       or position(expected_fragment in coalesce(actual_constraint, '')) > 0 then
      raise notice 'PASS % -> %', label, expected_fragment;
      return;
    end if;
    raise exception 'FAIL %: wrong error: % / constraint=%',
      label, actual_message, actual_constraint;
  end;
  raise exception 'FAIL %: statement unexpectedly succeeded', label;
end;
$assert_unit_fails$;

insert into public.character_capabilities(
  id, content_bundle_id, character_id, saju_domain, role, can_initiate, capability_version
) values (
  '11600000-0000-0000-0000-000000000001',
  '11391000-0000-0000-0000-000000000001',
  'test-standard-reader',
  'relationship',
  'primary',
  true,
  'relationship-test-v1'
);

insert into public.saju_domain_runtime(
  saju_domain, availability, capability_version, required_engine_version, updated_at
) values (
  'relationship', 'available', 'relationship-test-v1', null, clock_timestamp()
)
on conflict (saju_domain) do update
set availability = excluded.availability,
    capability_version = excluded.capability_version,
    required_engine_version = excluded.required_engine_version,
    updated_at = excluded.updated_at;

insert into public.birth_profiles(
  id, subject_id, profile_kind, label, current_revision_id,
  archived_at, created_at, updated_at
) values (
  '11601000-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  'self', 'self', null, null, clock_timestamp(), clock_timestamp()
);

insert into public.birth_profile_revisions(
  id, birth_profile_id, subject_id, revision_no,
  calendar_type, birth_date, birth_time, time_known,
  is_leap_month, sex, input_hash, created_at
) values (
  '11601100-0000-0000-0000-000000000001',
  '11601000-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  1, 'solar', date '1996-01-09', time '09:30:00', true,
  false, 'male', 'sha256:test:standard-unit-self-v1', clock_timestamp()
);

update public.birth_profiles
set current_revision_id = '11601100-0000-0000-0000-000000000001',
    updated_at = clock_timestamp()
where id = '11601000-0000-0000-0000-000000000001';

update public.purchase_intents
set status = 'verified', updated_at = clock_timestamp()
where id in (
  '11392300-0000-0000-0000-000000000001',
  '11392300-0000-0000-0000-000000000002',
  '11392300-0000-0000-0000-000000000004'
);

insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb,
  verified_at, created_at, environment, verifier_revision,
  verified_amount_minor, verified_currency
) values
(
  '11602000-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  '11392300-0000-0000-0000-000000000001',
  '11392200-0000-0000-0000-000000000001',
  'web', 'portone_v2', 'tx-standard-unit-1',
  'hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  clock_timestamp(), clock_timestamp(), 'production', 'test-verifier-v1', 1, 'KRW'
),
(
  '11602000-0000-0000-0000-000000000004',
  '11390000-0000-0000-0000-000000000001',
  '11392300-0000-0000-0000-000000000004',
  '11392200-0000-0000-0000-000000000001',
  'web', 'portone_v2', 'tx-standard-unit-4',
  'hmac-sha256:k1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  clock_timestamp(), clock_timestamp(), 'production', 'test-verifier-v1', 1, 'KRW'
);

select * from public.internal_apply_verified_receipt_capability_effects_v1(
  '11602000-0000-0000-0000-000000000001',
  array['test-reader-unit'],
  array[transaction_timestamp()],
  array[transaction_timestamp()],
  array[null]::timestamptz[],
  array[null]::text[]
);

select * from public.internal_apply_verified_receipt_capability_effects_v1(
  '11602000-0000-0000-0000-000000000004',
  array['test-reader-unit'],
  array[transaction_timestamp()],
  array[transaction_timestamp()],
  array[null]::timestamptz[],
  array[null]::text[]
);

select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',
  false
);

select pg_temp.assert_unit_true(
  'verified Reader-bound purchase unit creates one pending Reading',
  (
    select result.purchase_intent_id = '11392300-0000-0000-0000-000000000001'::uuid
       and result.product_id = '11392000-0000-0000-0000-000000000001'::uuid
       and result.reader_character_id = 'test-standard-reader'
       and result.reader_content_bundle_id = '11391000-0000-0000-0000-000000000001'::uuid
       and result.reading_session_id = '11603000-0000-0000-0000-000000000001'::uuid
       and result.reading_id = '11603100-0000-0000-0000-000000000001'::uuid
       and result.attempt_no = 1
       and result.source_birth_revision_id = '11601100-0000-0000-0000-000000000001'::uuid
       and result.saju_domain = 'relationship'
       and result.domain_capability_version = 'relationship-test-v1'
       and result.replayed = false
    from public.cmd_bind_standard_reading_unit_v1(
      '11390000-0000-0000-0000-000000000001',
      '11392300-0000-0000-0000-000000000001',
      '11603000-0000-0000-0000-000000000001',
      '11603100-0000-0000-0000-000000000001',
      'sha256:v1:1111111111111111111111111111111111111111111111111111111111111111',
      'standard-reading-unit-request-v1',
      '{"schemaVersion":"standard-reading-unit-request-v1","purchaseIntentId":"11392300-0000-0000-0000-000000000001","sourceBirthProfileId":"11601000-0000-0000-0000-000000000001"}'::jsonb,
      '11601000-0000-0000-0000-000000000001'
    ) result
  )
);

select pg_temp.assert_unit_true(
  'unit binding stops before transport/finalization/grounding',
  (
    select r.execution_status = 'pending'
       and r.request_idempotency_key = 'standard-reading-unit:11392300-0000-0000-0000-000000000001'
       and r.request_contract_version = 'standard-reading-unit-request-v1'
       and r.request_snapshot_jsonb->>'purchaseIntentId' = '11392300-0000-0000-0000-000000000001'
       and r.requested_character_id = 'test-standard-reader'
       and r.requested_character_content_bundle_id = '11391000-0000-0000-0000-000000000001'::uuid
       and rs.saju_domain = 'relationship'
       and rs.source_birth_revision_id = '11601100-0000-0000-0000-000000000001'::uuid
       and not exists (
         select 1 from public.reading_execution_attempts rea where rea.reading_id = r.id
       )
       and not exists (
         select 1 from public.reading_refs rr where rr.reading_id = r.id
       )
       and not exists (
         select 1 from public.reading_groundings rg where rg.reading_id = r.id
       )
    from public.readings r
    join public.reading_sessions rs on rs.id = r.reading_session_id
    where r.id = '11603100-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_unit_true(
  'binding pins exact purchase-backed verified production Grant lineage',
  (
    select b.purchase_intent_id = cr.purchase_intent_id
       and b.subject_id = eg.subject_id
       and b.entitlement_grant_id = eg.id
       and b.reader_character_id = 'test-standard-reader'
       and eg.grant_source_type = 'purchase'
       and cr.verification_status = 'verified'
       and cr.environment = 'production'
    from public.standard_reading_unit_bindings b
    join public.entitlement_grants eg on eg.id = b.entitlement_grant_id
    join public.commerce_receipts cr on cr.id = eg.source_receipt_id
    where b.purchase_intent_id = '11392300-0000-0000-0000-000000000001'
  )
);

select pg_temp.assert_unit_true(
  'same purchase/request replay converges to one stored Reading',
  (
    select result.reading_session_id = '11603000-0000-0000-0000-000000000001'::uuid
       and result.reading_id = '11603100-0000-0000-0000-000000000001'::uuid
       and result.replayed = true
    from public.cmd_bind_standard_reading_unit_v1(
      '11390000-0000-0000-0000-000000000001',
      '11392300-0000-0000-0000-000000000001',
      '11603000-0000-0000-0000-000000000099',
      '11603100-0000-0000-0000-000000000099',
      'sha256:v1:1111111111111111111111111111111111111111111111111111111111111111',
      'standard-reading-unit-request-v1',
      '{"schemaVersion":"standard-reading-unit-request-v1","purchaseIntentId":"11392300-0000-0000-0000-000000000001","sourceBirthProfileId":"11601000-0000-0000-0000-000000000001"}'::jsonb,
      '11601000-0000-0000-0000-000000000001'
    ) result
  )
);

select pg_temp.assert_unit_true(
  'replay leaves one binding and one logical Reading',
  (select count(*) = 1
   from public.standard_reading_unit_bindings
   where purchase_intent_id = '11392300-0000-0000-0000-000000000001')
  and
  (select count(*) = 1
   from public.readings
   where request_idempotency_key =
     'standard-reading-unit:11392300-0000-0000-0000-000000000001')
);

select pg_temp.assert_unit_fails(
  'conflicting reuse of consumed purchase unit is denied',
  $$select * from public.cmd_bind_standard_reading_unit_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    '11603000-0000-0000-0000-000000000098',
    '11603100-0000-0000-0000-000000000098',
    'sha256:v1:2222222222222222222222222222222222222222222222222222222222222222',
    'standard-reading-unit-request-v1',
    '{"schemaVersion":"standard-reading-unit-request-v1","purchaseIntentId":"11392300-0000-0000-0000-000000000001","sourceBirthProfileId":"11601000-0000-0000-0000-000000000099"}'::jsonb,
    '11601000-0000-0000-0000-000000000099'
  )$$,
  'cmd_standard_reading_unit_binding_conflict'
);

select pg_temp.assert_unit_fails(
  'verified purchase without purchase-backed Grant cannot create Reading',
  $$select * from public.cmd_bind_standard_reading_unit_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000002',
    '11603000-0000-0000-0000-000000000002',
    '11603100-0000-0000-0000-000000000002',
    'sha256:v1:3333333333333333333333333333333333333333333333333333333333333333',
    'standard-reading-unit-request-v1',
    '{"schemaVersion":"standard-reading-unit-request-v1","purchaseIntentId":"11392300-0000-0000-0000-000000000002","sourceBirthProfileId":"11601000-0000-0000-0000-000000000001"}'::jsonb,
    '11601000-0000-0000-0000-000000000001'
  )$$,
  'cmd_standard_reading_unit_entitlement_unavailable'
);

select pg_temp.assert_unit_fails(
  'cross-subject execution context cannot consume another owner purchase unit',
  $$select set_config('myeongha.subject_id','11609900-0000-0000-0000-000000000099',false);
    select * from public.cmd_bind_standard_reading_unit_v1(
      '11390000-0000-0000-0000-000000000001',
      '11392300-0000-0000-0000-000000000002',
      '11603000-0000-0000-0000-000000000003',
      '11603100-0000-0000-0000-000000000003',
      'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444',
      'standard-reading-unit-request-v1',
      '{"schemaVersion":"standard-reading-unit-request-v1","purchaseIntentId":"11392300-0000-0000-0000-000000000002","sourceBirthProfileId":"11601000-0000-0000-0000-000000000001"}'::jsonb,
      '11601000-0000-0000-0000-000000000001'
    )$$,
  'subject execution context mismatch'
);

select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',
  false
);

select pg_temp.assert_unit_fails(
  'binding provenance is append-only',
  $$update public.standard_reading_unit_bindings
    set reader_selection_hash = 'sha256:mutated'
    where purchase_intent_id = '11392300-0000-0000-0000-000000000001'$$,
  'tr_standard_reading_unit_binding_append_only'
);

select pg_temp.assert_unit_true(
  'new consumption command remains unactivated for ordinary runtime roles',
  not has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_bind_standard_reading_unit_v1(uuid,uuid,uuid,uuid,text,text,jsonb,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.cmd_bind_standard_reading_unit_v1(uuid,uuid,uuid,uuid,text,text,jsonb,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cmd_bind_standard_reading_unit_v1(uuid,uuid,uuid,uuid,text,text,jsonb,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cmd_bind_standard_reading_unit_v1(uuid,uuid,uuid,uuid,text,text,jsonb,uuid)',
    'EXECUTE'
  )
);

select pg_temp.assert_unit_true(
  'API executor has no direct Standard Reading unit binding table authority',
  not has_table_privilege(
    'myeongha_api_executor', 'public.standard_reading_unit_bindings', 'SELECT'
  )
  and not has_table_privilege(
    'myeongha_api_executor', 'public.standard_reading_unit_bindings', 'INSERT'
  )
  and not has_table_privilege(
    'myeongha_api_executor', 'public.standard_reading_unit_bindings', 'UPDATE'
  )
  and not has_table_privilege(
    'myeongha_api_executor', 'public.standard_reading_unit_bindings', 'DELETE'
  )
);

select pg_temp.assert_unit_true(
  'real Standard Product remains disabled and has no Offer',
  (
    select p.enabled = false
    from public.products p
    where p.id = '11300000-0000-0000-0000-000000000001'
  )
  and not exists (
    select 1 from public.product_offers po
    where po.product_id = '11300000-0000-0000-0000-000000000001'
  )
);

raise notice 'Standard Reading unit binding SQL authority tests passed';
