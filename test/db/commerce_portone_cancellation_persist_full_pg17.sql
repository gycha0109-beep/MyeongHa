\set ON_ERROR_STOP on

-- Executed ONLY by the dedicated disposable full-migration PostgreSQL 17 case.
-- DDL + event observations live exclusively inside this rolled-back transaction.
begin;
set local statement_timeout = '30s';
\ir ../../docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql

do $verify$
declare
 b2_intent uuid:='12192300-0000-0000-0000-000000000002'::uuid;
 b3_intent uuid:='12192300-0000-0000-0000-000000000003'::uuid;
 b2_receipt uuid;
 b3_receipt uuid;
 b2_subject uuid;
 b2_original_tx text;
 b2_paid bigint;
 b2_event uuid;
 replayed_event uuid;
 b2_grant uuid;
 b3_grant uuid;
 original_b2_grant_status text;
 original_b3_grant_status text;
 original_b2_revision bigint;
 original_b3_revision bigint;
 event_before bigint;
 event_after bigint;
 seen boolean;
 event_row record;
begin
 select cr.id,cr.subject_id,cr.external_transaction_id,cr.verified_amount_minor
 into strict b2_receipt,b2_subject,b2_original_tx,b2_paid
 from public.commerce_receipts cr
 where cr.purchase_intent_id=b2_intent
   and cr.provider='portone_v2' and cr.environment='production'
   and cr.verification_status='verified';
 select cr.id into strict b3_receipt
 from public.commerce_receipts cr
 where cr.purchase_intent_id=b3_intent
   and cr.provider='portone_v2' and cr.environment='production'
   and cr.verification_status='verified';
 select g.id,g.status,g.revision
 into strict b2_grant,original_b2_grant_status,original_b2_revision
 from public.entitlement_grants g
 where g.source_receipt_id=b2_receipt and g.grant_source_type='purchase';
 select g.id,g.status,g.revision
 into strict b3_grant,original_b3_grant_status,original_b3_revision
 from public.entitlement_grants g
 where g.source_receipt_id=b3_receipt and g.grant_source_type='purchase';
 if b2_paid<>1 or b2_receipt=b3_receipt or b2_grant=b3_grant then
   raise exception 'PG17 full-migration B2/B3 official Reader fixture changed';
 end if;
 select count(*) into event_before from public.commerce_provider_events;

 select e.provider_event_id,e.replayed into strict b2_event,seen
 from public.internal_persist_portone_cancellation_event_v1(
   'synthetic-hmac-b2-payment','synthetic-full-pg17-event-b2',
   'Transaction.Cancelled',b2_original_tx,
   'full_cancel_shape_observed',
   'hmac-sha256:k1:'||repeat('a',64),
   'hmac-sha256:k1:'||repeat('b',64),
   'hmac-sha256:k1:'||repeat('c',64),b2_paid,b2_paid
 ) e;
 if seen is distinct from false then
   raise exception 'PG17 first canonical cancellation wrongly replayed';
 end if;

 select e.provider_event_id,e.replayed into strict replayed_event,seen
 from public.internal_persist_portone_cancellation_event_v1(
   'synthetic-hmac-b2-payment','synthetic-full-pg17-event-b2',
   'Transaction.Cancelled',b2_original_tx,
   'full_cancel_shape_observed',
   'hmac-sha256:k1:'||repeat('a',64),
   'hmac-sha256:k1:'||repeat('b',64),
   'hmac-sha256:k1:'||repeat('c',64),b2_paid,b2_paid
 ) e;
 if replayed_event is distinct from b2_event or seen is distinct from true then
   raise exception 'PG17 canonical event replay must preserve identity';
 end if;

 select e.id,e.resolved_receipt_id,e.resolved_subject_id,e.event_type,
        e.status,e.provider_ordering_key,e.provider_occurred_at,
        e.verified_payload_jsonb,e.external_original_transaction_id
 into strict event_row
 from public.commerce_provider_events e
 where e.id=b2_event;
 if event_row.resolved_receipt_id is distinct from b2_receipt
   or event_row.resolved_subject_id is distinct from b2_subject
   or event_row.external_original_transaction_id is distinct from b2_original_tx
   or event_row.event_type is distinct from 'Transaction.Cancelled'
   or event_row.status is distinct from 'verified'
   or event_row.provider_ordering_key is not null
   or event_row.provider_occurred_at is not null
   or event_row.verified_payload_jsonb->>'exactSucceededCancellationAmountMinor'
      is distinct from b2_paid::text
   or event_row.verified_payload_jsonb->>'cancellationIdHmac'
      is distinct from 'hmac-sha256:k1:'||repeat('c',64)
   or event_row.verified_payload_jsonb->>'orderingProven' is distinct from 'false'
   or event_row.verified_payload_jsonb->>'entitlementRevocationAuthorized'
      is distinct from 'false' then
   raise exception 'PG17 canonical cancellation was not pinned to its original Receipt';
 end if;

 -- Same provider ID with a changed original signed body must CONFLICT.
 begin
   perform public.internal_persist_portone_cancellation_event_v1(
     'synthetic-hmac-b2-payment','synthetic-full-pg17-event-b2',
     'Transaction.Cancelled',b2_original_tx,
     'full_cancel_shape_observed',
     'hmac-sha256:k1:'||repeat('d',64),
     'hmac-sha256:k1:'||repeat('b',64),
     'hmac-sha256:k1:'||repeat('c',64),b2_paid,b2_paid);
   raise exception 'PG17 changed signed event was accepted';
 exception when unique_violation then null;
 end;

 -- Cross-Reader replay must not reparent B2's event to B3.
 begin
   perform public.internal_persist_portone_cancellation_event_v1(
     'synthetic-hmac-b3-payment','synthetic-full-pg17-event-b2',
     'Transaction.Cancelled','tx-official-reader-b3',
     'full_cancel_shape_observed',
     'hmac-sha256:k1:'||repeat('a',64),
     'hmac-sha256:k1:'||repeat('b',64),
     'hmac-sha256:k1:'||repeat('c',64),1,1);
   raise exception 'PG17 cross-Reader event reparented';
 exception when unique_violation then null;
 end;

 -- A pending signal cannot become a final verified cancellation event.
 begin
   perform public.internal_persist_portone_cancellation_event_v1(
     'synthetic-hmac-b2-payment','synthetic-full-pg17-event-pending',
     'Transaction.CancelPending',b2_original_tx,
     'full_cancel_shape_observed',
     'hmac-sha256:k1:'||repeat('d',64),
     'hmac-sha256:k1:'||repeat('e',64),
     'hmac-sha256:k1:'||repeat('f',64),b2_paid,b2_paid);
   raise exception 'PG17 pending event was persisted as final';
 exception when check_violation then null;
 end;

 select count(*) into event_after from public.commerce_provider_events;
 if event_after<>event_before+1
   or (select count(*) from public.commerce_provider_events
       where resolved_receipt_id=b3_receipt
         and external_event_id='synthetic-full-pg17-event-b2')<>0
   or (select count(*) from public.entitlement_events
       where source_provider_event_id=b2_event)<>0
   or (select count(*) from public.entitlement_grants g
       where g.id=b2_grant and g.status=original_b2_grant_status
         and g.revision=original_b2_revision)<>1
   or (select count(*) from public.entitlement_grants g
       where g.id=b3_grant and g.status=original_b3_grant_status
         and g.revision=original_b3_revision)<>1
   or (select count(*) from public.commerce_receipts
       where id in (b2_receipt,b3_receipt)
         and verification_status='verified')<>2 then
   raise exception 'PG17 cancellation persistence mutated money, grants, or another Reader';
 end if;
 raise notice 'PASS actual PostgreSQL17 Commerce schema: original B2 Receipt, stable replay, B3 isolated, pending HOLD, no Entitlement writes';
end;
$verify$;

select 'COMMERCE_PORTONE_CANCELLATION_PERSIST_FULL_PG17_PASS' as result;
rollback;
