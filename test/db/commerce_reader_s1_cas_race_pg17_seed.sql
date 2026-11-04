\set ON_ERROR_STOP on

-- Disposable PostgreSQL17 B2/B3 Reader purchase fixture only.
-- Exactly the trusted source-v2 HMAC/PortOne lineage used by the existing
-- read-only full-cancellation smoke; no actual provider contact/refund.
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 external_original_transaction_id,resolved_subject_id,resolution_source_type,
 resolved_receipt_id,payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select
 '12196200-0000-4000-8000-000000000002'::uuid,'portone_v2',
 'synthetic-b2-shared-reader-cas-event','Transaction.Cancelled',
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
 ),'verified',pg_catalog.clock_timestamp(),'production','portone-cancel-readback-v2'
from public.commerce_receipts cr
where cr.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid
 and cr.provider='portone_v2' and cr.environment='production'
 and cr.verification_status='verified';
do $assert$
begin
 if (select count(*) from public.commerce_provider_events
     where id='12196200-0000-4000-8000-000000000002'::uuid)<>1
 then
  raise exception 'PG17_B2_SYNTHETIC_VERIFIED_CANCEL_EVENT_UNAVAILABLE';
 end if;
end;
$assert$;
