\set ON_ERROR_STOP on

create or replace function pg_temp.assert_fails(
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
    raise exception 'FAIL %: wrong error: % / constraint=%', label, actual_message, actual_constraint;
  end;
  raise exception 'FAIL %: statement unexpectedly succeeded', label;
end;
$$;

set constraints all immediate;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000802')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, merged_into_subject_id, created_at, updated_at)
values
  ('80000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-000000000801', 'active', null, now(), now()),
  ('80000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000000802', 'active', null, now(), now()),
  ('80000000-0000-0000-0000-000000000003', 'guest', null, 'active', null, now(), now()),
  ('80000000-0000-0000-0000-000000000004', 'guest', null, 'merged', '80000000-0000-0000-0000-000000000001', now(), now());

insert into public.products(id, product_key, product_type, enabled, created_at)
values
  ('81000000-0000-0000-0000-000000000001', 'premium-reading', 'reading', true, now()),
  ('81000000-0000-0000-0000-000000000002', 'story-pass', 'episode', true, now());

insert into public.product_offers(
  id, product_id, platform, provider, external_product_id,
  currency, display_price_minor, enabled, created_at
) values
  ('81100000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'web', 'testpay', 'premium-web', 'KRW', 4900, true, now()),
  ('81100000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', 'web', 'otherpay', 'story-web', 'KRW', 2900, true, now());

select pg_temp.assert_fails(
  'offer provider mapping is immutable',
  $$update public.product_offers set provider='rewritten' where id='81100000-0000-0000-0000-000000000001'$$,
  'tr_product_offer_mapping_immutable'
);

insert into public.commerce_account_links(
  id, subject_id, provider, external_account_fingerprint, status, verified_at, created_at
) values
  ('81200000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'testpay', 'hmac-sha256:k2:acct-a', 'active', now(), now()),
  ('81200000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'testpay', 'hmac-sha256:k2:acct-b', 'active', now(), now());

select pg_temp.assert_fails(
  'active provider account fingerprint cannot belong to two subjects',
  $$insert into public.commerce_account_links(id,subject_id,provider,external_account_fingerprint,status,verified_at,created_at) values ('81200000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000002','testpay','hmac-sha256:k2:acct-a','active',now(),now())$$,
  'commerce_account_links_active_external_idx'
);

insert into public.purchase_intents(
  id, subject_id, product_offer_id, idempotency_key, request_hash,
  offer_snapshot_jsonb, offer_snapshot_hash, status, created_at, updated_at
) values (
  '81300000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000003',
  '81100000-0000-0000-0000-000000000001', 'guest-buy', 'hmac-sha256:k2:req-guest',
  '{}', 'sha256:v1:snap-guest', 'created', now(), now()
);

do $$
begin
  if not exists (
    select 1
    from public.purchase_intents
    where id = '81300000-0000-0000-0000-000000000003'
      and subject_id = '80000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'FAIL active canonical Guest purchase owner was not accepted by shared DB invariant';
  end if;
  raise notice 'PASS active canonical Guest is an eligible shared Purchase Intent owner';
end;
$$;

select pg_temp.assert_fails(
  'merged Guest purchase owner is denied',
  $$insert into public.purchase_intents(id,subject_id,product_offer_id,idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,status,created_at,updated_at) values ('81300000-0000-0000-0000-000000000009','80000000-0000-0000-0000-000000000004','81100000-0000-0000-0000-000000000001','merged-guest-buy','hmac-sha256:k2:req-merged-guest','{}','sha256:v1:snap-merged-guest','created',now(),now())$$,
  'ct_purchase_intent_active_canonical_subject'
);

select pg_temp.assert_fails(
  'purchase provider link must match offer provider',
  $$insert into public.purchase_intents(id,subject_id,product_offer_id,provider_account_link_id,idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,status,created_at,updated_at) values ('81300000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000001','81100000-0000-0000-0000-000000000002','81200000-0000-0000-0000-000000000001','provider-mismatch','hmac-sha256:k2:req-provider-mismatch','{}','sha256:v1:snap-provider-mismatch','created',now(),now())$$,
  'ct_purchase_intent_provider_link'
);

insert into public.purchase_intents(
  id, subject_id, product_offer_id, provider_account_link_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at
) values (
  '81300000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001',
  '81100000-0000-0000-0000-000000000001', '81200000-0000-0000-0000-000000000001',
  'buy-1', 'hmac-sha256:k2:req-1', '{"offer":"premium-web","fulfillmentVersion":"v1"}',
  'sha256:v1:snapshot-1', 'pending', now(), now()
);

select pg_temp.assert_fails(
  'purchase idempotency key cannot duplicate',
  $$insert into public.purchase_intents(id,subject_id,product_offer_id,idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,status,created_at,updated_at) values ('81300000-0000-0000-0000-000000000005','80000000-0000-0000-0000-000000000001','81100000-0000-0000-0000-000000000001','buy-1','hmac-sha256:k2:req-other','{}','sha256:v1:snap-other','created',now(),now())$$,
  'purchase_intents_subject_idempotency_unique'
);

select pg_temp.assert_fails(
  'purchase pinned request snapshot cannot be rewritten',
  $$update public.purchase_intents set request_hash='hmac-sha256:k2:rewritten' where id='81300000-0000-0000-0000-000000000001'$$,
  'tr_purchase_intent_identity_immutable'
);

select pg_temp.assert_fails(
  'verified receipt requires resolved offer',
  $$insert into public.commerce_receipts(id,subject_id,platform,provider,external_transaction_id,receipt_fingerprint,verification_status,verified_at,created_at) values ('81400000-0000-0000-0000-000000000005','80000000-0000-0000-0000-000000000001','web','testpay','tx-no-offer','hmac-sha256:k2:receipt-no-offer','verified',now(),now())$$,
  'ct_commerce_receipt_verified_offer'
);

select pg_temp.assert_fails(
  'receipt provider platform must match resolved offer',
  $$insert into public.commerce_receipts(id,subject_id,product_offer_id,platform,provider,external_transaction_id,receipt_fingerprint,verification_status,verified_at,created_at) values ('81400000-0000-0000-0000-000000000006','80000000-0000-0000-0000-000000000001','81100000-0000-0000-0000-000000000001','web','otherpay','tx-wrong-provider','hmac-sha256:k2:receipt-wrong-provider','verified',now(),now())$$,
  'ct_commerce_receipt_offer_mapping'
);

insert into public.commerce_receipts(
  id, subject_id, purchase_intent_id, provider_account_link_id, product_offer_id,
  platform, provider, external_transaction_id, external_original_transaction_id,
  receipt_fingerprint, verification_status, verified_payload_jsonb, verified_at, created_at
) values (
  '81400000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001',
  '81300000-0000-0000-0000-000000000001', '81200000-0000-0000-0000-000000000001',
  '81100000-0000-0000-0000-000000000001', 'web', 'testpay', 'tx-1', 'orig-1',
  'hmac-sha256:k2:receipt-1', 'verified', '{"verifier":"test-v1"}', now(), now()
);

insert into public.commerce_receipts(
  id, subject_id, product_offer_id, platform, provider, external_transaction_id,
  receipt_fingerprint, verification_status, created_at
) values (
  '81400000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001',
  '81100000-0000-0000-0000-000000000001', 'web', 'testpay', 'tx-pending',
  'hmac-sha256:k2:receipt-pending', 'pending', now()
);

select pg_temp.assert_fails(
  'duplicate provider transaction is deduped',
  $$insert into public.commerce_receipts(id,subject_id,product_offer_id,platform,provider,external_transaction_id,receipt_fingerprint,verification_status,created_at) values ('81400000-0000-0000-0000-000000000007','80000000-0000-0000-0000-000000000002','81100000-0000-0000-0000-000000000001','web','testpay','tx-1','hmac-sha256:k2:receipt-dupe','pending',now())$$,
  'commerce_receipts_provider_transaction_unique'
);

select pg_temp.assert_fails(
  'cross-owner receipt account link is denied',
  $$insert into public.commerce_receipts(id,subject_id,provider_account_link_id,product_offer_id,platform,provider,external_transaction_id,receipt_fingerprint,verification_status,verified_at,created_at) values ('81400000-0000-0000-0000-000000000008','80000000-0000-0000-0000-000000000002','81200000-0000-0000-0000-000000000001','81100000-0000-0000-0000-000000000001','web','testpay','tx-cross-owner','hmac-sha256:k2:receipt-cross-owner','verified',now(),now())$$,
  'commerce_receipts_account_subject_provider_fk'
);

select pg_temp.assert_fails(
  'verified provider event cannot remain unresolved',
  $$insert into public.commerce_provider_events(id,provider,external_event_id,event_type,payload_fingerprint,status,received_at) values ('81500000-0000-0000-0000-000000000005','testpay','evt-unresolved','renewal','sha256:v1:evt-unresolved','verified',now())$$,
  'commerce_provider_events_verified_subject_check'
);

select pg_temp.assert_fails(
  'manual provider event resolution remains disabled',
  $$insert into public.commerce_provider_events(id,provider,external_event_id,event_type,resolved_subject_id,resolution_source_type,payload_fingerprint,status,received_at) values ('81500000-0000-0000-0000-000000000006','testpay','evt-manual','adjusted','80000000-0000-0000-0000-000000000001','manual','sha256:v1:evt-manual','verified',now())$$,
  'ct_provider_event_manual_resolution_disabled'
);

select pg_temp.assert_fails(
  'receipt-based provider resolution must preserve provider identity',
  $$insert into public.commerce_provider_events(id,provider,external_event_id,event_type,resolved_subject_id,resolution_source_type,resolved_receipt_id,payload_fingerprint,status,received_at) values ('81500000-0000-0000-0000-000000000007','otherpay','evt-wrong-provider','renewal','80000000-0000-0000-0000-000000000001','receipt','81400000-0000-0000-0000-000000000001','sha256:v1:evt-wrong-provider','verified',now())$$,
  'ct_provider_event_verified_resolution'
);

insert into public.commerce_provider_events(
  id, provider, external_event_id, event_type, external_transaction_id,
  resolved_subject_id, resolution_source_type, resolved_receipt_id,
  payload_fingerprint, provider_occurred_at, provider_ordering_key,
  verified_payload_jsonb, status, received_at
) values (
  '81500000-0000-0000-0000-000000000001', 'testpay', 'evt-1', 'renewal', 'tx-1',
  '80000000-0000-0000-0000-000000000001', 'receipt', '81400000-0000-0000-0000-000000000001',
  'sha256:v1:evt-1', now(), '0001', '{"verified":true}', 'verified', now()
);

select pg_temp.assert_fails(
  'duplicate provider event is deduped',
  $$insert into public.commerce_provider_events(id,provider,external_event_id,event_type,payload_fingerprint,status,received_at) values ('81500000-0000-0000-0000-000000000008','testpay','evt-1','renewal','sha256:v1:evt-dupe','received',now())$$,
  'commerce_provider_events_provider_external_unique'
);

insert into public.entitlement_grants(
  id, subject_id, entitlement_key, scope_key, grant_key, grant_source_type,
  status, valid_from, valid_until, revision, created_at, updated_at
) values
  ('81600000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'premium.reading', null, 'purchase:tx-1', 'purchase', 'active', now(), now() + interval '30 days', 0, now(), now()),
  ('81600000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', 'premium.reading', null, 'promo:launch', 'promo', 'active', now(), now() + interval '7 days', 0, now(), now()),
  ('81600000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000002', 'premium.reading', null, 'system:test-b', 'system', 'active', now(), null, 0, now(), now());

select pg_temp.assert_fails(
  'reserved normalized global scope cannot be supplied as resource scope',
  $$insert into public.entitlement_grants(id,subject_id,entitlement_key,scope_key,grant_key,grant_source_type,status,valid_from,created_at,updated_at) values ('81600000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000001','premium.reading','__GLOBAL__','bad-scope','system','active',now(),now(),now())$$,
  'entitlement_grants_scope_key_check'
);

select pg_temp.assert_fails(
  'same grant source cannot duplicate same logical entitlement',
  $$insert into public.entitlement_grants(id,subject_id,entitlement_key,scope_key,grant_key,grant_source_type,status,valid_from,created_at,updated_at) values ('81600000-0000-0000-0000-000000000005','80000000-0000-0000-0000-000000000001','premium.reading',null,'purchase:tx-1','purchase','active',now(),now(),now())$$,
  'entitlement_grants_logical_source_unique'
);

select pg_temp.assert_fails(
  'unverified receipt cannot create entitlement effect',
  $$insert into public.entitlement_events(id,grant_id,subject_id,entitlement_key,scope_key_norm,source_type,source_receipt_id,event_type,event_schema_version,event_dedupe_key,effective_at,created_at) values ('81700000-0000-0000-0000-000000000005','81600000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','premium.reading','__GLOBAL__','receipt','81400000-0000-0000-0000-000000000002','granted','ent-event-v1','pending-receipt',now(),now())$$,
  'ct_entitlement_event_verified_source'
);

select pg_temp.assert_fails(
  'provider event cannot source another subjects entitlement',
  $$insert into public.entitlement_events(id,grant_id,subject_id,entitlement_key,scope_key_norm,source_type,source_provider_event_id,event_type,event_schema_version,event_dedupe_key,effective_at,created_at) values ('81700000-0000-0000-0000-000000000006','81600000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000002','premium.reading','__GLOBAL__','provider_event','81500000-0000-0000-0000-000000000001','renewed','ent-event-v1','cross-owner-event',now(),now())$$,
  'entitlement_events_provider_event_subject_fk'
);

insert into public.entitlement_events(
  id, grant_id, subject_id, entitlement_key, scope_key_norm, product_id,
  source_type, source_receipt_id, event_type, event_schema_version,
  event_dedupe_key, effective_at, created_at
) values (
  '81700000-0000-0000-0000-000000000001', '81600000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001', 'premium.reading', '__GLOBAL__',
  '81000000-0000-0000-0000-000000000001', 'receipt', '81400000-0000-0000-0000-000000000001',
  'granted', 'ent-event-v1', 'grant-initial', now(), now()
);

select pg_temp.assert_fails(
  'entitlement lifecycle ledger is append only',
  $$update public.entitlement_events set event_type='revoked' where id='81700000-0000-0000-0000-000000000001'$$,
  'tr_entitlement_event_append_only'
);

select pg_temp.assert_fails(
  'entitlement event must match grant logical scope',
  $$insert into public.entitlement_events(id,grant_id,subject_id,entitlement_key,scope_key_norm,source_type,source_actor_ref,event_type,event_schema_version,event_dedupe_key,effective_at,created_at) values ('81700000-0000-0000-0000-000000000007','81600000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','different.key','__GLOBAL__','system','test-system','adjusted','ent-event-v1','wrong-grant-scope',now(),now())$$,
  'entitlement_events_grant_scope_fk'
);

insert into public.entitlements(
  id, subject_id, entitlement_key, scope_key, status, active_grant_count,
  effective_valid_until, revision, created_at, updated_at
) values (
  '81800000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001',
  'premium.reading', null, 'active', 2, now() + interval '30 days', 0, now(), now()
);

select pg_temp.assert_fails(
  'one logical global entitlement projection only',
  $$insert into public.entitlements(id,subject_id,entitlement_key,scope_key,status,active_grant_count,revision,created_at,updated_at) values ('81800000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001','premium.reading',null,'active',1,0,now(),now())$$,
  'entitlements_logical_unique'
);

select pg_temp.assert_fails(
  'inactive entitlement cannot retain active grant count',
  $$insert into public.entitlements(id,subject_id,entitlement_key,scope_key,status,active_grant_count,revision,created_at,updated_at) values ('81800000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000002','story.access',null,'inactive',1,0,now(),now())$$,
  'entitlements_inactive_shape_check'
);

-- Simulate the command-level recompute after revoking one of two independent grants.
update public.entitlement_grants
set status = 'revoked', revision = revision + 1, updated_at = now()
where id = '81600000-0000-0000-0000-000000000001';

update public.entitlements
set active_grant_count = 1,
    effective_valid_until = now() + interval '7 days',
    revision = revision + 1,
    updated_at = now()
where id = '81800000-0000-0000-0000-000000000001';

do $$
declare
  current_status text;
  current_count integer;
  table_count integer;
begin
  select status, active_grant_count into current_status, current_count
  from public.entitlements
  where id = '81800000-0000-0000-0000-000000000001';

  if current_status <> 'active' or current_count <> 1 then
    raise exception 'FAIL overlapping grants: revoking one grant removed logical access';
  end if;

  select count(*) into table_count
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE';

  if table_count <> 60 then
    raise exception 'FAIL schema catalog table count: expected 60, got %', table_count;
  end if;

  raise notice 'PASS overlapping grants preserve access through remaining grant';
  raise notice 'PASS executable public schema catalog = 60 tables';
end;
$$;

select 'commerce authority negative tests passed' as result;