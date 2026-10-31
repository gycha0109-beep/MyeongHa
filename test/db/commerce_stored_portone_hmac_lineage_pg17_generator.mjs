import {
 COMMERCE_STORED_PORTONE_CANCEL_HMAC_SOURCE_SQL_V1 as sourceSql,
} from '../../scripts/operations/commerce-stored-portone-cancellation-hmac-recheck-v1.mjs';

if(!sourceSql.includes('join public.standard_reading_reader_access_grants access')||
   !sourceSql.includes('event.verifier_revision=')||
   !sourceSql.includes('g.id=$2::uuid')||
   !sourceSql.includes('event.id=$1::uuid')) {
 throw Error('STORED_PORTONE_HMAC_SQL_CONTRACT_NOT_CURRENT');
}
const proof = [
 String.raw`\set ON_ERROR_STOP on
-- ONLY isolated PG17 database with official_standard_reading_reader_interpretation fixture.
begin;
set local statement_timeout = '20s';

-- The independent B2 purchase is a verified Receipt-backed Reader Grant.
-- Attach a synthetic, provenance-only payment attempt to B2's actual Intent.
insert into public.commerce_payment_attempts(
 id,purchase_intent_id,subject_id,product_offer_id,attempt_no,provider,
 environment,idempotency_key,provider_request_id,provider_transaction_id,
 status,failure_code,created_at,updated_at
)
select '12196100-0000-4000-8000-000000000002'::uuid,
 pi.id,pi.subject_id,pi.product_offer_id,1,'portone_v2',
 'production','synthetic-hmac-b2-attempt','synthetic-hmac-b2-payment',
 cr.external_transaction_id,'response_received',null,
 clock_timestamp(),clock_timestamp()
from public.purchase_intents pi
join public.commerce_receipts cr on cr.purchase_intent_id=pi.id
where pi.id='12192300-0000-0000-0000-000000000002'::uuid
  and cr.provider='portone_v2' and cr.environment='production';

-- A second independent B3 payment attempt proves no cross-purchase grant match.
insert into public.commerce_payment_attempts(
 id,purchase_intent_id,subject_id,product_offer_id,attempt_no,provider,
 environment,idempotency_key,provider_request_id,provider_transaction_id,
 status,failure_code,created_at,updated_at
)
select '12196100-0000-4000-8000-000000000003'::uuid,
 pi.id,pi.subject_id,pi.product_offer_id,1,'portone_v2',
 'production','synthetic-hmac-b3-attempt','synthetic-hmac-b3-payment',
 cr.external_transaction_id,'response_received',null,
 clock_timestamp(),clock_timestamp()
from public.purchase_intents pi
join public.commerce_receipts cr on cr.purchase_intent_id=pi.id
where pi.id='12192300-0000-0000-0000-000000000003'::uuid
  and cr.provider='portone_v2' and cr.environment='production';

-- Independent source-v2 event is from B2 only. No PG refund or Entitlement writer.
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 external_original_transaction_id,resolved_subject_id,resolution_source_type,
 resolved_receipt_id,payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select
 '12196200-0000-4000-8000-000000000002'::uuid,'portone_v2',
 'synthetic-b2-hmac-cancel-event','Transaction.Cancelled',
 cr.external_transaction_id,cr.external_transaction_id,cr.subject_id,
 'receipt',cr.id,'hmac-sha256:k1:'||repeat('a',64),null,null,
 jsonb_build_object(
 'schemaVersion','commerce-portone-cancellation-source-v2',
 'signedPayloadHmac','hmac-sha256:k1:'||repeat('a',64),
 'providerReadbackHmac','hmac-sha256:k1:'||repeat('b',64),
 'cancellationIdHmac','hmac-sha256:k1:'||repeat('c',64),
 'matchingCancellationStatus','SUCCEEDED',
 'exactSucceededCancellationAmountMinor',cr.verified_amount_minor,
 'observedCumulativeCancelledAmountMinor',cr.verified_amount_minor,
 'originalReceiptPaidAmountMinor',cr.verified_amount_minor,
 'currency',cr.verified_currency,
 'orderingProven',false,
 'refundExecutionAuthorized',false,
 'entitlementRevocationAuthorized',false
 ),'verified',clock_timestamp(),'production','portone-cancel-readback-v2'
from public.commerce_receipts cr
where cr.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid
  and cr.provider='portone_v2' and cr.environment='production';

do $proof$
declare
 q text:=$source$`,
 sourceSql,
 String.raw`$source$;
 event_id uuid:='12196200-0000-4000-8000-000000000002'::uuid;
 b2_purchase uuid:='12192300-0000-0000-0000-000000000002'::uuid;
 b3_purchase uuid:='12192300-0000-0000-0000-000000000003'::uuid;
 b2_grant uuid;
 b3_grant uuid;
 data_row record;
 wrong_row record;
 matched_rows bigint;
begin
 select g.id into strict b2_grant
 from public.entitlement_grants g
 join public.commerce_receipts cr on cr.id=g.source_receipt_id
 where cr.purchase_intent_id=b2_purchase and g.grant_source_type='purchase';
 select g.id into strict b3_grant
 from public.entitlement_grants g
 join public.commerce_receipts cr on cr.id=g.source_receipt_id
 where cr.purchase_intent_id=b3_purchase and g.grant_source_type='purchase';

 if b2_grant=b3_grant then
  raise exception 'SYNTHETIC_TWO_READER_PURCHASE_GRANTS_NOT_DISTINCT';
 end if;
 execute q into strict data_row using event_id,b2_grant;
 if data_row."providerEventId" is distinct from event_id::text
    or data_row."exactReaderGrantId" is distinct from b2_grant::text
    or data_row."eventType" is distinct from 'Transaction.Cancelled'
    or data_row."sourceCancellationStatus" is distinct from 'SUCCEEDED'
    or data_row."sourceExactAmountMinor" is distinct from '1'
    or data_row."sourcePaidMinor" is distinct from '1'
    or data_row."receiptPaidMinor" is distinct from '1'
    or data_row."receiptCurrency" is distinct from 'KRW'
    or data_row."providerPaymentId" is distinct from 'synthetic-hmac-b2-payment'
    or data_row."originalTransactionId" is distinct from 'tx-official-reader-b2'
    or data_row."sourceOrderingProven" is distinct from 'false'
    or data_row."sourceRefundAuthorized" is distinct from 'false'
    or data_row."sourceRevokeAuthorized" is distinct from 'false'
    or data_row."cancellationIdHmac" is distinct from 'hmac-sha256:k1:'||repeat('c',64)
 then
  raise exception 'SYNTHETIC_B2_STORED_PORTONE_SOURCE_NOT_BOUND_TO_EXACT_READER';
 end if;

 -- Same B2 cancellation must not resolve B3's independent paid Reader Grant.
 execute q into wrong_row using event_id,b3_grant;
 get diagnostics matched_rows = row_count;
 if matched_rows<>0 then
  raise exception 'SYNTHETIC_CROSS_READER_STORED_HMAC_SOURCE_ACCEPTED';
 end if;

 -- Another Event ID must never act as an alias to the true cancel item.
 execute q into wrong_row using '12196200-0000-4000-8000-000000000003'::uuid,b2_grant;
 get diagnostics matched_rows = row_count;
 if matched_rows<>0 then
  raise exception 'SYNTHETIC_UNVERIFIED_EVENT_WAS_RESOLVED';
 end if;

 if (select count(*) from public.entitlement_events
         where source_provider_event_id=event_id)<>0 then
  raise exception 'SYNTHETIC_READ_ONLY_HMAC_QUERY_WRITTEN_ENTITLEMENT_EFFECT';
 end if;
 raise notice 'PASS exact immutable PortOne HMAC event => Receipt/Payment Attempt/Reader B2; B3 and unknown event rejected';
end;
$proof$;
select 'COMMERCE_STORED_PORTONE_HMAC_LINEAGE_REAL_PG17_PASS' as result;
rollback;`,
];
process.stdout.write(proof.join('\n'));
