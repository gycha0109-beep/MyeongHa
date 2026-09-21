\set ON_ERROR_STOP on

\i test/db/standard_love_relationship_reader_authority.sql

create or replace function pg_temp.assert_v2_true(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'FAIL %', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

create or replace function pg_temp.assert_v2_fails(
  label text,
  statement text,
  expected_fragment text
) returns void
language plpgsql
as $$
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
$$;

-- The current test Product opts into the new Official Reading + Reader Interpretation
-- delivery policy without changing the historical immutable Product spec row.
insert into public.standard_reading_delivery_policies(
  product_id, policy_version, reading_identity_mode, reader_interpretation_mode
) values (
  '11392000-0000-0000-0000-000000000001',
  'test-official-reader-v1',
  'official_subject_product_scope_birth_authority',
  'per_reader_purchase_grant'
);

insert into public.product_offers(
  id, product_id, platform, provider, external_product_id,
  currency, display_price_minor, enabled, created_at, capability_set_id
) values (
  '12102200-0000-0000-0000-000000000001',
  '11392000-0000-0000-0000-000000000001',
  'web',
  'portone_v2',
  'test-standard-reader-additional-v1',
  'KRW',
  1,
  true,
  clock_timestamp(),
  '11392100-0000-0000-0000-000000000001'
);

insert into public.product_offer_charge_terms(
  id, product_offer_id, terms_version, amount_minor, currency, created_at, retired_at
) values (
  '12102210-0000-0000-0000-000000000001',
  '12102200-0000-0000-0000-000000000001',
  'test-additional-v1',
  1,
  'KRW',
  clock_timestamp(),
  null
);

insert into public.purchase_intents(
  id, subject_id, product_offer_id, provider_account_link_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at,
  expected_amount_minor, expected_currency, charge_terms_version,
  capability_set_id, capability_snapshot_jsonb, capability_snapshot_hash
) values (
  '12102300-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  '12102200-0000-0000-0000-000000000001',
  null,
  'reader-additional-v2',
  'sha256:test:reader-additional-request-v2',
  '{}'::jsonb,
  'sha256:test:reader-additional-offer-v2',
  'created',
  clock_timestamp(),
  clock_timestamp(),
  1,
  'KRW',
  'test-additional-v1',
  '11392100-0000-0000-0000-000000000001',
  '{"capabilitySetId":"11392100-0000-0000-0000-000000000001","definitionVersion":"v1","definitionHash":"sha256:test:reader-capability"}'::jsonb,
  'sha256:test:reader-additional-capability-v2'
);

insert into public.purchase_intent_reader_selections(
  purchase_intent_id,
  product_id,
  reader_character_id,
  reader_content_bundle_id,
  selection_contract_version,
  selection_snapshot_jsonb,
  selection_hash,
  created_at
) values (
  '12102300-0000-0000-0000-000000000001',
  '11392000-0000-0000-0000-000000000001',
  'test-unlockable-reader',
  '11391000-0000-0000-0000-000000000001',
  'standard-reading-reader-selection-v1',
  '{"schemaVersion":"standard-reading-reader-selection-v1","productId":"11392000-0000-0000-0000-000000000001","topicKey":"test_reader_topic","specVersion":"v1","readerCharacterId":"test-unlockable-reader","readerContentBundleId":"11391000-0000-0000-0000-000000000001"}'::jsonb,
  'sha256:test:reader-additional-selection-v2',
  clock_timestamp()
);

insert into public.standard_reading_offer_roles(
  product_offer_id, purchase_role, role_contract_version
) values
(
  '11392200-0000-0000-0000-000000000001',
  'initial_reading',
  'standard-reading-offer-role-v1'
),
(
  '12102200-0000-0000-0000-000000000001',
  'additional_reader_interpretation',
  'standard-reading-offer-role-v1'
);

insert into public.character_capabilities(
  id, content_bundle_id, character_id, saju_domain, role, can_initiate, capability_version
) values
(
  '12100000-0000-0000-0000-000000000001',
  '11391000-0000-0000-0000-000000000001',
  'test-standard-reader',
  'relationship',
  'primary',
  true,
  'relationship-test-v2'
),
(
  '12100000-0000-0000-0000-000000000002',
  '11391000-0000-0000-0000-000000000001',
  'test-unlockable-reader',
  'relationship',
  'secondary',
  true,
  'relationship-test-v2'
);

insert into public.saju_domain_runtime(
  saju_domain, availability, capability_version, required_engine_version, updated_at
) values (
  'relationship', 'available', 'relationship-test-v2', null, clock_timestamp()
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
  '12101000-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  'self', 'self', null, null, clock_timestamp(), clock_timestamp()
);

insert into public.birth_profile_revisions(
  id, birth_profile_id, subject_id, revision_no,
  calendar_type, birth_date, birth_time, time_known,
  is_leap_month, sex, input_hash, created_at
) values (
  '12101100-0000-0000-0000-000000000001',
  '12101000-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  1, 'solar', date '1996-01-09', time '09:30:00', true,
  false, 'male', 'sha256:test:official-standard-reading-self-v1', clock_timestamp()
);

update public.birth_profiles
set current_revision_id = '12101100-0000-0000-0000-000000000001',
    updated_at = clock_timestamp()
where id = '12101000-0000-0000-0000-000000000001';

update public.purchase_intents
set status = 'verified', updated_at = clock_timestamp()
where id in (
  '11392300-0000-0000-0000-000000000001',
  '12102300-0000-0000-0000-000000000001'
);

insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, product_offer_id,
  platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb,
  verified_at, created_at, environment, verifier_revision,
  verified_amount_minor, verified_currency
) values
(
  '12102000-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  '11392300-0000-0000-0000-000000000001',
  '11392200-0000-0000-0000-000000000001',
  'web', 'portone_v2', 'tx-official-reader-a',
  'hmac-sha256:k1:1111111111111111111111111111111111111111111111111111111111111111',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  clock_timestamp(), clock_timestamp(), 'production', 'test-verifier-v1', 1, 'KRW'
),
(
  '12102000-0000-0000-0000-000000000002',
  '11390000-0000-0000-0000-000000000001',
  '12102300-0000-0000-0000-000000000001',
  '12102200-0000-0000-0000-000000000001',
  'web', 'portone_v2', 'tx-official-reader-b',
  'hmac-sha256:k1:2222222222222222222222222222222222222222222222222222222222222222',
  'verified', '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  clock_timestamp(), clock_timestamp(), 'production', 'test-verifier-v1', 1, 'KRW'
);

select * from public.internal_apply_verified_receipt_capability_effects_v1(
  '12102000-0000-0000-0000-000000000001',
  array['test-reader-unit'],
  array[transaction_timestamp()],
  array[transaction_timestamp()],
  array[null]::timestamptz[],
  array[null]::text[]
);

select * from public.internal_apply_verified_receipt_capability_effects_v1(
  '12102000-0000-0000-0000-000000000002',
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

select pg_temp.assert_v2_fails(
  'Additional Reader Offer cannot create an official Reading when none exists',
  $sql$
    select *
    from public.cmd_bind_standard_reading_access_v2(
      '11390000-0000-0000-0000-000000000001',
      '12102300-0000-0000-0000-000000000001',
      '12103000-0000-0000-0000-000000000090',
      '12103100-0000-0000-0000-000000000090',
      'sha256:v1:9090909090909090909090909090909090909090909090909090909090909090',
      'standard-reading-access-bind-v2',
      '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"12102300-0000-0000-0000-000000000001"}'::jsonb
    )
  $sql$,
  'cmd_standard_reading_access_v2_additional_requires_official'
);

select pg_temp.assert_v2_true(
  'Additional Reader denial creates no official Reading, interpretation, or access grant',
  (select count(*) = 0 from public.standard_reading_official_bindings)
  and (select count(*) = 0 from public.standard_reading_reader_interpretations)
  and (select count(*) = 0 from public.standard_reading_reader_access_grants)
);

select pg_temp.assert_v2_true(
  'first Reader purchase creates exactly one Reader-independent official Reading',
  (
    select result.purchase_intent_id = '11392300-0000-0000-0000-000000000001'::uuid
       and result.reader_character_id = 'test-standard-reader'
       and result.reading_session_id = '12103000-0000-0000-0000-000000000001'::uuid
       and result.reading_id = '12103100-0000-0000-0000-000000000001'::uuid
       and result.access_role = 'initial_reader'
       and result.official_reading_created = true
       and result.interpretation_created = true
       and result.replayed = false
    from public.cmd_bind_standard_reading_access_v2(
      '11390000-0000-0000-0000-000000000001',
      '11392300-0000-0000-0000-000000000001',
      '12103000-0000-0000-0000-000000000001',
      '12103100-0000-0000-0000-000000000001',
      'sha256:v1:1111111111111111111111111111111111111111111111111111111111111111',
      'standard-reading-access-bind-v2',
      '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"11392300-0000-0000-0000-000000000001"}'::jsonb
    ) result
  )
);

select pg_temp.assert_v2_true(
  'official Reading itself carries no requested Reader identity',
  (
    select r.requested_character_id is null
       and r.requested_character_content_bundle_id is null
       and r.execution_status = 'pending'
    from public.readings r
    where r.id = '12103100-0000-0000-0000-000000000001'
  )
  and
  (select count(*) = 1 from public.standard_reading_official_bindings)
  and
  (select count(*) = 1 from public.standard_reading_reader_interpretations)
  and
  (select count(*) = 1 from public.standard_reading_reader_access_grants)
);

-- Commit the official Source Truth before an Additional Reader may reuse it.
insert into public.reading_execution_attempts(
  id, reading_id, subject_id, execution_attempt_no, state,
  transport_key, saju_engine_key, requested_engine_version, resolved_engine_version,
  external_request_ref, started_at, finished_at, error_code
) values (
  '12104000-0000-0000-0000-000000000001',
  '12103100-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  1, 'succeeded',
  'official-reader-v2-test', 'saju-test', null, 'saju-test-v2',
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
  '12103100-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  '12104000-0000-0000-0000-000000000001',
  'saju-test', null, 'sha256:test:official-standard-reading-self-v1', null,
  'saju-test-v2', 'product-reading-test-v2', 'delivered',
  null, null, null,
  '{"responseVersion":"myeonghwa-product-reading-response-v2","artifact":"official-source"}'::jsonb,
  'sha256:test-official-reading-artifact',
  clock_timestamp()
);

update public.readings
set execution_status = 'succeeded',
    committed_execution_attempt_id = '12104000-0000-0000-0000-000000000001',
    completed_at = clock_timestamp()
where id = '12103100-0000-0000-0000-000000000001'
  and subject_id = '11390000-0000-0000-0000-000000000001';

commit;

create temp table _v2_additional_result as
select *
from public.cmd_bind_standard_reading_access_v2(
  '11390000-0000-0000-0000-000000000001',
  '12102300-0000-0000-0000-000000000001',
  '12103000-0000-0000-0000-000000000099',
  '12103100-0000-0000-0000-000000000099',
  'sha256:v1:2222222222222222222222222222222222222222222222222222222222222222',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"12102300-0000-0000-0000-000000000001"}'::jsonb
);

select * from _v2_additional_result;

select pg_temp.assert_v2_true(
  'additional Reader bind returns existing official Reading identity',
  (
    select reader_character_id = 'test-unlockable-reader'
       and reading_session_id = '12103000-0000-0000-0000-000000000001'::uuid
       and reading_id = '12103100-0000-0000-0000-000000000001'::uuid
       and access_role = 'additional_reader'
       and official_reading_created = false
       and interpretation_created = true
       and replayed = false
    from _v2_additional_result
  )
);

select pg_temp.assert_v2_true(
  'additional Reader bind creates access only and no second official Reading',
  (select count(*) = 1 from public.standard_reading_official_bindings)
  and (select count(*) = 1 from public.readings where subject_id = '11390000-0000-0000-0000-000000000001')
  and (select count(*) = 2 from public.standard_reading_reader_interpretations)
  and (select count(*) = 2 from public.standard_reading_reader_access_grants)
);

select pg_temp.assert_v2_true(
  'same Reader purchase replay does not duplicate interpretation or access',
  (
    select result.reading_id = '12103100-0000-0000-0000-000000000001'::uuid
       and result.replayed = true
       and result.official_reading_created = false
       and result.interpretation_created = false
    from public.cmd_bind_standard_reading_access_v2(
      '11390000-0000-0000-0000-000000000001',
      '12102300-0000-0000-0000-000000000001',
      '12103000-0000-0000-0000-000000000098',
      '12103100-0000-0000-0000-000000000098',
      'sha256:v1:2222222222222222222222222222222222222222222222222222222222222222',
      'standard-reading-access-bind-v2',
      '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"12102300-0000-0000-0000-000000000001"}'::jsonb
    ) result
  )
  and (select count(*) = 2 from public.standard_reading_reader_interpretations)
  and (select count(*) = 2 from public.standard_reading_reader_access_grants)
);

select pg_temp.assert_v2_true(
  'Reader Knowledge exposes only official Readings opened to that exact Reader',
  exists (
    select 1
    from public.internal_qry_character_standard_reading_access_v1(
      '11390000-0000-0000-0000-000000000001',
      'test-standard-reader',
      clock_timestamp()
    ) q
    where q.reading_id = '12103100-0000-0000-0000-000000000001'
      and q.response_hash = 'sha256:test-official-reading-artifact'
  )
  and exists (
    select 1
    from public.internal_qry_character_standard_reading_access_v1(
      '11390000-0000-0000-0000-000000000001',
      'test-unlockable-reader',
      clock_timestamp()
    )
  )
  and not exists (
    select 1
    from public.internal_qry_character_standard_reading_access_v1(
      '11390000-0000-0000-0000-000000000001',
      'test-coming-soon-reader',
      clock_timestamp()
    )
  )
);

select pg_temp.assert_v2_true(
  'bundle-aware Reader Knowledge returns exact server-owned Reader and content bundle',
  exists (
    select 1
    from public.qry_character_standard_reading_access_runtime_v2(
      '11390000-0000-0000-0000-000000000001',
      'test-standard-reader',
      clock_timestamp()
    ) q
    where q.subject_id = '11390000-0000-0000-0000-000000000001'
      and q.reading_id = '12103100-0000-0000-0000-000000000001'
      and q.reader_character_id = 'test-standard-reader'
      and q.reader_content_bundle_id = '11391000-0000-0000-0000-000000000001'
      and q.response_hash = 'sha256:test-official-reading-artifact'
  )
  and exists (
    select 1
    from public.qry_character_standard_reading_access_runtime_v2(
      '11390000-0000-0000-0000-000000000001',
      'test-unlockable-reader',
      clock_timestamp()
    ) q
    where q.reader_character_id = 'test-unlockable-reader'
      and q.reader_content_bundle_id = '11391000-0000-0000-0000-000000000001'
  )
  and not exists (
    select 1
    from public.qry_character_standard_reading_access_runtime_v2(
      '11390000-0000-0000-0000-000000000001',
      'test-coming-soon-reader',
      clock_timestamp()
    )
  )
);

select pg_temp.assert_v2_true(
  'different Readers consume the same official Source Truth hash',
  (
    select count(distinct q.response_hash) = 1
    from (
      select response_hash
      from public.internal_qry_character_standard_reading_access_v1(
        '11390000-0000-0000-0000-000000000001',
        'test-standard-reader',
        clock_timestamp()
      )
      union all
      select response_hash
      from public.internal_qry_character_standard_reading_access_v1(
        '11390000-0000-0000-0000-000000000001',
        'test-unlockable-reader',
        clock_timestamp()
      )
    ) q
  )
);

-- Refund/revoke Reader A only. Official Reading and Reader B remain intact.
update public.entitlement_grants g
set status = 'revoked',
    revision = revision + 1,
    last_effective_at = clock_timestamp(),
    updated_at = clock_timestamp()
from public.standard_reading_reader_access_grants a
where a.purchase_intent_id = '11392300-0000-0000-0000-000000000001'
  and g.id = a.entitlement_grant_id;

select pg_temp.assert_v2_true(
  'Reader A refund revokes only Reader A access and preserves Reader B + official Reading',
  not exists (
    select 1
    from public.internal_qry_character_standard_reading_access_v1(
      '11390000-0000-0000-0000-000000000001',
      'test-standard-reader',
      clock_timestamp()
    )
  )
  and exists (
    select 1
    from public.internal_qry_character_standard_reading_access_v1(
      '11390000-0000-0000-0000-000000000001',
      'test-unlockable-reader',
      clock_timestamp()
    )
  )
  and exists (
    select 1
    from public.standard_reading_official_bindings
    where reading_id = '12103100-0000-0000-0000-000000000001'
  )
  and exists (
    select 1
    from public.reading_refs
    where reading_id = '12103100-0000-0000-0000-000000000001'
      and response_hash = 'sha256:test-official-reading-artifact'
  )
);

select pg_temp.assert_v2_true(
  'Reader-scoped raw source denies revoked Reader A and permits active Reader B',
  not exists (
    select 1
    from public.internal_qry_standard_reading_artifact_source_v2(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-0000-0000-000000000001',
      'test-standard-reader',
      clock_timestamp()
    )
  )
  and exists (
    select 1
    from public.internal_qry_standard_reading_artifact_source_v2(
      '11390000-0000-0000-0000-000000000001',
      '12103100-0000-0000-0000-000000000001',
      'test-unlockable-reader',
      clock_timestamp()
    )
  )
);

insert into public.subjects(
  id, kind, auth_user_id, status, merged_into_subject_id, created_at, updated_at
) values (
  '12109000-0000-0000-0000-000000000001',
  'guest', null, 'active', null, clock_timestamp(), clock_timestamp()
);

select pg_catalog.set_config(
  'myeongha.subject_id',
  '12109000-0000-0000-0000-000000000001',
  false
);

select pg_temp.assert_v2_true(
  'different subject cannot reference another owner official Reading',
  not exists (
    select 1
    from public.internal_qry_character_standard_reading_access_v1(
      '12109000-0000-0000-0000-000000000001',
      'test-unlockable-reader',
      clock_timestamp()
    )
  )
);

select pg_temp.assert_v2_fails(
  'client cannot switch subject id while execution context is another subject',
  $$select * from public.internal_qry_character_standard_reading_access_v1(
      '11390000-0000-0000-0000-000000000001',
      'test-unlockable-reader',
      clock_timestamp()
    )$$,
  'subject execution context mismatch'
);

select pg_catalog.set_config(
  'myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',
  false
);

select pg_temp.assert_v2_true(
  'Production Reader Knowledge exposes only the narrow bundle-aware wrapper',
  has_function_privilege(
    'myeongha_api_executor',
    'public.qry_character_standard_reading_access_runtime_v2(uuid,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_bind_standard_reading_access_v2(uuid,uuid,uuid,uuid,text,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'myeongha_api_executor',
    'public.internal_qry_standard_reading_artifact_source_v2(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'myeongha_api_executor',
    'public.internal_qry_character_standard_reading_access_v2(uuid,text,timestamptz)',
    'EXECUTE'
  )
  and not has_table_privilege(
    'myeongha_api_executor',
    'public.standard_reading_reader_access_grants',
    'SELECT'
  )
);

select pg_temp.assert_v2_true(
  'real Standard Product stays disabled with no saleable Offer',
  (
    select p.enabled = false
    from public.products p
    where p.id = '11300000-0000-0000-0000-000000000001'
  )
  and not exists (
    select 1
    from public.product_offers po
    where po.product_id = '11300000-0000-0000-0000-000000000001'
  )
);

\echo 'Official Standard Reading + Reader Interpretation authority tests passed'
