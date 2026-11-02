-- Disposable PostgreSQL17 only. Minimal schema matching the existing
-- MyeongHa production table columns referenced by the private lookup.
create table public.commerce_payment_attempts (
  id uuid primary key,
  purchase_intent_id uuid,
  subject_id uuid,
  product_offer_id uuid,
  provider text,
  environment text,
  provider_request_id text,
  provider_transaction_id text
);
create table public.purchase_intents (
  id uuid primary key,
  subject_id uuid,
  product_offer_id uuid,
  status text,
  expected_amount_minor bigint,
  expected_currency text
);
create table public.product_offers (id uuid primary key,product_id uuid);
create table public.products (id uuid primary key,product_type text);
create table public.standard_reading_product_specs (
  product_id uuid,purchase_unit_mode text
);
create table public.purchase_intent_reader_selections (
  purchase_intent_id uuid,product_id uuid,reader_character_id text
);
create table public.commerce_receipts (
  id uuid primary key,
  purchase_intent_id uuid,
  subject_id uuid,
  product_offer_id uuid,
  provider text,
  environment text,
  verification_status text,
  verified_at timestamptz,
  verified_amount_minor bigint,
  verified_currency text,
  external_transaction_id text
);
insert into public.products values
 ('00000000-0000-4000-8000-000000000001','reading');
insert into public.product_offers values
 ('00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001');
insert into public.standard_reading_product_specs values
 ('00000000-0000-4000-8000-000000000001','topic_reader_reading');
insert into public.purchase_intents values
 ('00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000002','verified',8900,'KRW');
insert into public.purchase_intent_reader_selections values
 ('00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001','seyeon');
insert into public.commerce_payment_attempts values
 ('00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000002',
  'portone_v2','production','payment-1','tx-1');
insert into public.commerce_receipts values
 ('00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000002',
  'portone_v2','production','verified',clock_timestamp(),8900,'KRW','tx-1');
