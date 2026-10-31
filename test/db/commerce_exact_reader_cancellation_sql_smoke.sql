-- Isolated PostgreSQL 17 minimal fixture for the exact-reader cancellation SELECT.
-- Never run this fixture in Production.
create table public.commerce_provider_events (
 id uuid primary key, provider text, environment text, status text,
 event_type text, resolution_source_type text, resolved_receipt_id uuid,
 resolved_subject_id uuid, provider_ordering_key text,
 external_transaction_id text, external_original_transaction_id text
);
create table public.commerce_receipts (
 id uuid primary key, subject_id uuid, provider text, environment text,
 verification_status text, purchase_intent_id uuid,
 external_transaction_id text, external_original_transaction_id text
);
create table public.entitlement_grants (
 id uuid primary key, subject_id uuid,source_receipt_id uuid,
 grant_source_type text,status text,revision bigint
);
create table public.standard_reading_reader_access_grants (
 official_reading_id uuid, reader_character_id text,entitlement_grant_id uuid,
 subject_id uuid,purchase_intent_id uuid
);
create table public.entitlement_events (
 grant_id uuid, subject_id uuid,source_type text,
 source_provider_event_id uuid,event_type text,target_status text
);

insert into public.commerce_receipts values
 ('00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000004','portone_v2','production',
  'verified','00000000-0000-4000-8000-000000000022','tx-a',null),
 ('00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000004','portone_v2','production',
  'verified','00000000-0000-4000-8000-000000000023','tx-b',null);
insert into public.commerce_provider_events values
 ('00000000-0000-4000-8000-000000000001',
  'portone_v2','production','verified','payment.cancelled','receipt',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000004','provider-order-1','tx-a',null),
 ('00000000-0000-4000-8000-000000000007',
  'portone_v2','production','verified','refund','receipt',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000004','provider-order-2','tx-mismatch',null);
insert into public.entitlement_grants values
 ('00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000011','purchase','active',4),
 ('00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000012','purchase','active',1);
insert into public.standard_reading_reader_access_grants values
 ('00000000-0000-4000-8000-000000000003','reader-a',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000022'),
 ('00000000-0000-4000-8000-000000000003','reader-b',
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000023');
