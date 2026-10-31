-- Disposable PostgreSQL 17/18 standalone schema/contract smoke.
-- Must only run against an isolated empty scratch database.
\set ON_ERROR_STOP on
begin;
create table public.products(
 id uuid primary key,product_type text not null
);
create table public.product_offers(
 id uuid primary key,product_id uuid not null
);
create table public.purchase_intents(
 id uuid primary key,subject_id uuid not null,product_offer_id uuid not null,
 status text not null,expected_amount_minor bigint,expected_currency text
);
create table public.commerce_payment_attempts(
 id uuid primary key,subject_id uuid not null,purchase_intent_id uuid not null,
 product_offer_id uuid not null,provider text not null,environment text not null,
 provider_request_id text not null,status text not null,
 provider_transaction_id text
);
create table public.standard_reading_product_specs(
 product_id uuid not null,purchase_unit_mode text not null
);
create table public.purchase_intent_reader_selections(
 purchase_intent_id uuid not null,product_id uuid not null
);
create table public.commerce_receipts(
 id uuid primary key,subject_id uuid not null,purchase_intent_id uuid not null,
 product_offer_id uuid not null,provider text not null,environment text not null,
 external_transaction_id text not null,verification_status text not null,
 verified_at timestamptz,verified_amount_minor bigint,verified_currency text
);
create table public.commerce_provider_events(
 id uuid primary key,provider text not null,external_event_id text not null,
 event_type text not null,external_transaction_id text,
 external_original_transaction_id text,resolved_subject_id uuid,
 resolution_source_type text,resolved_account_link_id uuid,
 resolved_receipt_id uuid,payload_fingerprint text not null,
 provider_occurred_at timestamptz,provider_ordering_key text,
 verified_payload_jsonb jsonb,status text not null,received_at timestamptz not null,
 processed_at timestamptz,environment text,verifier_revision text,
 constraint commerce_provider_events_provider_external_unique
 unique(provider,external_event_id)
);

\ir ../../docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql

insert into public.products values
 ('00000000-0000-4000-8000-000000000001','reading'),
 ('00000000-0000-4000-8000-000000000011','reading'),
 ('00000000-0000-4000-8000-000000000021','episode');
insert into public.product_offers values
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011'),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000021');
insert into public.purchase_intents values
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000002','verified',8900,'KRW'),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000012','verified',8900,'KRW'),
 ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000022','verified',8900,'KRW');
insert into public.standard_reading_product_specs values
 ('00000000-0000-4000-8000-000000000001','topic_reader_reading'),
 ('00000000-0000-4000-8000-000000000011','topic_reader_reading');
insert into public.purchase_intent_reader_selections values
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000011');
insert into public.commerce_payment_attempts values
 ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',
  'portone_v2','production','pmt-A','response_received','tx-A'),
 ('00000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000012',
  'portone_v2','production','pmt-B','response_received','tx-B'),
 ('00000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000022',
  'portone_v2','production','pmt-chat','response_received','tx-chat');
insert into public.commerce_receipts values
 ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',
  'portone_v2','production','tx-A','verified',clock_timestamp(),8900,'KRW'),
 ('00000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000012',
  'portone_v2','production','tx-B','verified',clock_timestamp(),8900,'KRW'),
 ('00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000022',
  'portone_v2','production','tx-chat','verified',clock_timestamp(),8900,'KRW');

do $$
declare
 v_id uuid; v_replay boolean;
 v_id_again uuid; v_fingerprint text;
 v_count bigint; v_status text; v_original text;
 v_readback jsonb;
begin
 select provider_event_id,replayed into v_id,v_replay
 from public.internal_persist_portone_cancellation_event_v1(
  'pmt-A','webhook-A','Transaction.Cancelled','tx-A',
  'full_cancel_shape_observed','hmac-sha256:k1:'||repeat('a',64),
  'hmac-sha256:k1:'||repeat('b',64)
 );
 if v_id is null or v_replay is distinct from false then
  raise exception 'first cancellation did not persist exactly once';
 end if;

 select provider_event_id,replayed into v_id_again,v_replay
 from public.internal_persist_portone_cancellation_event_v1(
  'pmt-A','webhook-A','Transaction.Cancelled','tx-A',
  'full_cancel_shape_observed','hmac-sha256:k1:'||repeat('a',64),
  'hmac-sha256:k1:'||repeat('b',64)
 );
 if v_id_again is distinct from v_id or v_replay is distinct from true then
  raise exception 'exact cancellation replay generated a duplicate event';
 end if;

 select count(*),max(payload_fingerprint),max(status),
        max(external_original_transaction_id)
 into v_count,v_fingerprint,v_status,v_original
 from public.commerce_provider_events
 where provider='portone_v2' and external_event_id='webhook-A';
 select verified_payload_jsonb into v_readback
 from public.commerce_provider_events where id=v_id;
 if v_count<>1 or v_status<>'verified' or v_original<>'tx-A'
    or v_fingerprint is distinct from 'hmac-sha256:k1:'||repeat('a',64)
    or (v_readback ->> 'orderingProven') is distinct from 'false'
    or (v_readback ->> 'refundExecutionAuthorized') is distinct from 'false'
    or (v_readback ->> 'entitlementRevocationAuthorized') is distinct from 'false'
    or v_readback::text like '%webhook-A%' then
  raise exception 'persisted canonical cancellation evidence is wrong';
 end if;

 if (select provider_ordering_key from public.commerce_provider_events
    where id=v_id) is not null then
  raise exception 'received-at or webhook timestamp cannot fabricate provider order';
 end if;

 -- Same webhook ID changed payload: conflict, not silent reparent.
 begin
  perform public.internal_persist_portone_cancellation_event_v1(
   'pmt-A','webhook-A','Transaction.Cancelled','tx-A',
   'full_cancel_shape_observed','hmac-sha256:k1:'||repeat('c',64),
   'hmac-sha256:k1:'||repeat('b',64)
  );
  raise exception 'same event ID conflicting signed payload should be rejected';
 exception when unique_violation then null;
 end;

 -- Reader B has a separate purchased Reading and cannot absorb event A.
 begin
  perform public.internal_persist_portone_cancellation_event_v1(
   'pmt-B','webhook-A','Transaction.Cancelled','tx-B',
   'full_cancel_shape_observed','hmac-sha256:k1:'||repeat('a',64),
   'hmac-sha256:k1:'||repeat('b',64)
  );
  raise exception 'second Reader transaction reused the first cancellation event';
 exception when unique_violation then null;
 end;

 -- Pending and mutually inconsistent event / GET classifications cannot persist.
 begin
  perform public.internal_persist_portone_cancellation_event_v1(
   'pmt-A','pending-A','Transaction.CancelPending','tx-A',
   'full_cancel_shape_observed','hmac-sha256:k1:'||repeat('a',64),
   'hmac-sha256:k1:'||repeat('b',64)
  );
  raise exception 'pending event should not establish a verified cancellation';
 exception when check_violation then null;
 end;

 begin
  perform public.internal_persist_portone_cancellation_event_v1(
   'pmt-A','mismatch-A','Transaction.PartialCancelled','tx-A',
   'full_cancel_shape_observed','hmac-sha256:k1:'||repeat('a',64),
   'hmac-sha256:k1:'||repeat('b',64)
  );
  raise exception 'partial vs full mismatch should not persist';
 exception when check_violation then null;
 end;

 -- A non-Reading product is not a permitted source.
 begin
  perform public.internal_persist_portone_cancellation_event_v1(
   'pmt-chat','webhook-chat','Transaction.Cancelled','tx-chat',
   'full_cancel_shape_observed','hmac-sha256:k1:'||repeat('a',64),
   'hmac-sha256:k1:'||repeat('b',64)
  );
  raise exception 'non-Reading product was accepted';
 exception when raise_exception then
  if sqlerrm <> 'Exact production Reading Receipt evidence is unavailable' then
   raise;
  end if;
 end;

 -- Wrong provider payment or transaction cannot bypass exact Receipt binding.
 begin
  perform public.internal_persist_portone_cancellation_event_v1(
   'pmt-A','webhook-wrong','Transaction.Cancelled','tx-B',
   'full_cancel_shape_observed','hmac-sha256:k1:'||repeat('a',64),
   'hmac-sha256:k1:'||repeat('b',64)
  );
  raise exception 'wrong transaction was accepted';
 exception when raise_exception then
  if sqlerrm <> 'Exact production Reading Receipt evidence is unavailable' then
   raise;
  end if;
 end;

 if (select count(*) from public.commerce_provider_events)<>1 then
  raise exception 'negative cases inserted unexpected event rows';
 end if;
 if (select count(*) from public.commerce_receipts)<>3 then
  raise exception 'cancellation command mutated the paid Receipt evidence';
 end if;
end;
$$;

select 'COMMERCE_CANCELLATION_PRIVATE_PERSIST_SQL_SMOKE_PASS' as result;
rollback;
