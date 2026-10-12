-- CAP-B2 genuine additional Reader bind positive, disposable PostgreSQL only.
-- Preceded in the SAME psql session by existing v2 fixture through committed
-- Official Reading source (before the legacy additional Reader bind).
-- Watchtower-Track: applizing
\set ON_ERROR_STOP on

insert into public.characters(character_id,created_at)
values ('baekheon',clock_timestamp())
on conflict (character_id) do nothing;

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,
  release_at,retire_at,published_at
) values (
  'baekheon','11391000-0000-0000-0000-000000000001',
  'available',true,clock_timestamp()-interval '1 day',null,
  clock_timestamp()-interval '1 day'
);

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,
  rollout_jsonb,rollout_policy_version,rollout_seed,
  activated_at,retired_at,created_at
) values (
  'b2010000-0000-4000-8000-000000000001',
  'b2-disposable-official-standard-default',
  '11391000-0000-0000-0000-000000000001',
  'active',true,null,'uniform-default-v1','b2-fixture',
  clock_timestamp()-interval '1 day',null,
  clock_timestamp()-interval '1 day'
);

insert into public.standard_reader_product_approved_rules_v1(
  product_id,product_spec_version,saju_domain,approved_policy_revision,
  rule_version,policy_kind,target_reader_id,approval_record_ref,
  approved_at,effective_from
) values (
  '11392000-0000-0000-0000-000000000001',
  'v1','relationship','b2-synthetic-approved-only',
  'b2-synthetic-rule','standard_all_readers',null,'test-only:no-production',
  clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
);

insert into public.purchase_intents(
  id,subject_id,product_offer_id,provider_account_link_id,
  idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
  status,created_at,updated_at,
  expected_amount_minor,expected_currency,charge_terms_version,
  capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
) values (
  'b2020000-0000-4000-8000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  '12102200-0000-0000-0000-000000000001',
  null,'b2-additional-baekheon','sha256:test:b2-additional-baekheon',
  '{}'::jsonb,'sha256:test:b2-offer','created',
  clock_timestamp(),clock_timestamp(),1,'KRW','test-additional-v1',
  '11392100-0000-0000-0000-000000000001',
  '{"capabilitySetId":"11392100-0000-0000-0000-000000000001","definitionVersion":"v1","definitionHash":"sha256:test:reader-capability"}'::jsonb,
  'sha256:test:b2-capability'
);

insert into public.purchase_intent_reader_selections(
  purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
  selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
) values (
  'b2020000-0000-4000-8000-000000000001',
  '11392000-0000-0000-0000-000000000001',
  'baekheon','11391000-0000-0000-0000-000000000001',
  'standard-reading-reader-selection-v1',
  '{"schemaVersion":"standard-reading-reader-selection-v1","productId":"11392000-0000-0000-0000-000000000001","topicKey":"test_reader_topic","specVersion":"v1","readerCharacterId":"baekheon","readerContentBundleId":"11391000-0000-0000-0000-000000000001"}'::jsonb,
  'sha256:test:b2-selection',clock_timestamp()
);

update public.purchase_intents
set status='verified',updated_at=clock_timestamp()
where id='b2020000-0000-4000-8000-000000000001';

insert into public.commerce_receipts(
  id,subject_id,purchase_intent_id,product_offer_id,
  platform,provider,external_transaction_id,receipt_fingerprint,
  verification_status,verified_payload_jsonb,verified_at,created_at,
  environment,verifier_revision,verified_amount_minor,verified_currency
) values (
  'b2030000-0000-4000-8000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  'b2020000-0000-4000-8000-000000000001',
  '12102200-0000-0000-0000-000000000001',
  'web','portone_v2','tx-b2-test-baekheon',
  'hmac-sha256:k1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'verified','{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  clock_timestamp(),clock_timestamp(),'production','test-verifier-v1',1,'KRW'
);

select * from public.internal_apply_verified_receipt_capability_effects_v1(
  'b2030000-0000-4000-8000-000000000001',
  array['test-reader-unit'],array[clock_timestamp()],
  array[clock_timestamp()],array[null]::timestamptz[],array[null]::text[]
);

select pg_temp.assert_v2_true(
  'B2 synthetic official baekheon Reader has no specialist Capability',
  not exists (
    select 1 from public.character_capabilities cc
    where cc.character_id='baekheon'
      and cc.content_bundle_id='11391000-0000-0000-0000-000000000001'
      and cc.saju_domain='relationship'
  )
);

create temp table _b2_additional_result as
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
  '11390000-0000-0000-0000-000000000001',
  'b2020000-0000-4000-8000-000000000001',
  'b2040000-0000-4000-8000-000000000001',
  'b2050000-0000-4000-8000-000000000001',
  'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b2020000-0000-4000-8000-000000000001"}'::jsonb
);

select pg_temp.assert_v2_true(
  'B2 new private Standard Binder binds one extra Reader to committed Official Reading',
  (select count(*)=1 and bool_and(
    reader_character_id='baekheon'
    and reading_id='12103100-0000-0000-0000-000000000001'::uuid
    and official_reading_created=false
    and interpretation_created=true
    and replayed=false
    and access_role='additional_reader'
  ) from _b2_additional_result)
  and (select count(*)=1 from public.standard_reading_official_bindings)
  and (select count(*)=1 from public.readings
       where subject_id='11390000-0000-0000-0000-000000000001')
  and exists (
    select 1 from public.standard_reading_reader_access_grants
    where reader_character_id='baekheon'
      and purchase_intent_id='b2020000-0000-4000-8000-000000000001'
  )
);

select pg_temp.assert_v2_fails(
  'B2 refuses historical replay as current Grant authorization',
  $sql$
  select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
    '11390000-0000-0000-0000-000000000001',
    'b2020000-0000-4000-8000-000000000001',
    'b2040000-0000-4000-8000-000000000001',
    'b2050000-0000-4000-8000-000000000001',
    'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'standard-reading-access-bind-v2',
    '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b2020000-0000-4000-8000-000000000001"}'::jsonb
  )
  $sql$,
  'standard_b2_historical_replay_current_rights_unproven'
);
