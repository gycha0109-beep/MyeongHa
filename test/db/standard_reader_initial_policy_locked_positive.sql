-- Synthetic first official Standard Reader SQL: no specialist capability.
-- This file MUST run in same psql session after v2 prefix until line ~329.
\set ON_ERROR_STOP on

insert into public.characters(character_id,created_at)
values ('seyeon',clock_timestamp())
on conflict (character_id) do nothing;

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,
  release_at,retire_at,published_at
) values (
  'seyeon','11391000-0000-0000-0000-000000000001',
  'available',true,clock_timestamp()-interval '1 day',null,
  clock_timestamp()-interval '1 day'
);

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,
  rollout_jsonb,rollout_policy_version,rollout_seed,
  activated_at,retired_at,created_at
) values (
  'b4210000-0000-4000-8000-000000000001',
  's4-private-initial-reader-default',
  '11391000-0000-0000-0000-000000000001',
  'active',true,null,'uniform-default-v1','s4-test-only',
  clock_timestamp()-interval '1 day',null,clock_timestamp()-interval '1 day'
);

insert into public.standard_reader_product_approved_rules_v1(
  product_id,product_spec_version,saju_domain,approved_policy_revision,
  rule_version,policy_kind,target_reader_id,approval_record_ref,
  approved_at,effective_from
) values (
  '11392000-0000-0000-0000-000000000001',
  'v1','relationship','s4-initial-standard-test-only',
  's4-initial-standard','standard_all_readers',null,'test-only:s4',
  clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
);

-- Unrelated first-purchase Intent and verified provider Receipt, exact official
-- Product and initial Offer, BUT a different officially registered Reader.
insert into public.purchase_intents(
  id,subject_id,product_offer_id,provider_account_link_id,
  idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
  status,created_at,updated_at,
  expected_amount_minor,expected_currency,charge_terms_version,
  capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
)
select
  'b4220000-0000-4000-8000-000000000001'::uuid,
  subject_id,product_offer_id,provider_account_link_id,
  's4-first-reader-seyeon','sha256:test:s4-first-reader',
  offer_snapshot_jsonb,offer_snapshot_hash,
  'created',clock_timestamp(),clock_timestamp(),expected_amount_minor,
  expected_currency,charge_terms_version,
  capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
from public.purchase_intents
where id='11392300-0000-0000-0000-000000000001';

insert into public.purchase_intent_reader_selections(
  purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
  selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select
  'b4220000-0000-4000-8000-000000000001'::uuid,
  product_id,'seyeon',reader_content_bundle_id,selection_contract_version,
  jsonb_set(selection_snapshot_jsonb,'{readerCharacterId}','"seyeon"'::jsonb),
  'sha256:test:s4-seyeon-reader-selection',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='11392300-0000-0000-0000-000000000001';

update public.purchase_intents
set status='verified',updated_at=clock_timestamp()
where id='b4220000-0000-4000-8000-000000000001';

insert into public.commerce_receipts(
  id,subject_id,purchase_intent_id,product_offer_id,
  platform,provider,external_transaction_id,receipt_fingerprint,
  verification_status,verified_payload_jsonb,verified_at,created_at,
  environment,verifier_revision,verified_amount_minor,verified_currency
)
select
  'b4230000-0000-4000-8000-000000000001'::uuid,
  subject_id,'b4220000-0000-4000-8000-000000000001'::uuid,
  product_offer_id,platform,provider,'tx-s4-initial-seyeon',
  'hmac-sha256:k1:4444444444444444444444444444444444444444444444444444444444444444',
  verification_status,verified_payload_jsonb,clock_timestamp(),clock_timestamp(),
  environment,verifier_revision,verified_amount_minor,verified_currency
from public.commerce_receipts
where id='12102000-0000-0000-0000-000000000001';

-- Verified initial issuance acquires SAME initial scope lock as initial binding
-- before the original Commerce grant writer may lock Receipt/Grant rows.
select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
  'b4230000-0000-4000-8000-000000000001',
  array['test-reader-unit'],array[transaction_timestamp()],
  array[transaction_timestamp()],array[null]::timestamptz[],array[null]::text[]
);

select pg_temp.assert_v2_true(
  'S4 no specialist Capability for initial canonical seyeon',
  not exists (
    select 1 from public.character_capabilities
    where character_id='seyeon'
      and content_bundle_id='11391000-0000-0000-0000-000000000001'
      and saju_domain='relationship'
  )
);

create temp table _s4_initial_result as
select * from public.internal_cmd_bind_standard_reader_initial_policy_locked_v1(
  '11390000-0000-0000-0000-000000000001',
  'b4220000-0000-4000-8000-000000000001',
  'b4240000-0000-4000-8000-000000000001',
  'b4250000-0000-4000-8000-000000000001',
  'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444',
  'standard-reading-access-bind-v2',
  '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b4220000-0000-4000-8000-000000000001"}'::jsonb
);

select pg_temp.assert_v2_true(
  'S4 initial binder creates ONE official Reading/Interpretation/Access for canonical Reader',
  (select count(*)=1
     and bool_and(reader_character_id='seyeon'
       and reading_id='b4250000-0000-4000-8000-000000000001'::uuid
       and official_reading_created=true
       and interpretation_created=true
       and replayed=false
       and access_role='initial_reader')
   from _s4_initial_result)
  and (select count(*)=1 from public.standard_reading_official_bindings)
  and (select count(*)=1 from public.standard_reading_reader_access_grants)
  and (select count(*)=1 from public.readings where
       subject_id='11390000-0000-0000-0000-000000000001')
);

select pg_temp.assert_v2_fails(
  'S4 historical replay is NOT current Grant authority',
  $sql$
    select * from public.internal_cmd_bind_standard_reader_initial_policy_locked_v1(
      '11390000-0000-0000-0000-000000000001',
      'b4220000-0000-4000-8000-000000000001',
      'b4240000-0000-4000-8000-000000000001',
      'b4250000-0000-4000-8000-000000000001',
      'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444',
      'standard-reading-access-bind-v2',
      '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b4220000-0000-4000-8000-000000000001"}'::jsonb
    )
  $sql$,
  'standard_b2_historical_replay_current_rights_unproven'
);
