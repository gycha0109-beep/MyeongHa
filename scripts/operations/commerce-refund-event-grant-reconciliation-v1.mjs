// Watchtower-Track: commerce-payment
// Offline, complete-visibility READ ONLY Postgres inspection.
// 'refund' and 'payment.cancelled' are evidence TAGS, never full-refund proof.
export const COMMERCE_REFUND_EVENT_GRANT_RECONCILIATION_SQL_V1 = `
with refund_events as (
 select event.id,event.event_type,event.status,
        event.resolution_source_type,event.provider_ordering_key,
        receipt.id as receipt_id,
        coalesce(rights.grant_count,0)::bigint as grant_count,
        coalesce(rights.active_grant_count,0)::bigint as active_grant_count,
        coalesce(rights.revoked_grant_count,0)::bigint as revoked_grant_count,
        coalesce(rights.exact_event_revoked_count,0)::bigint as exact_event_revoked_count
 from public.commerce_provider_events event
 left join public.commerce_receipts receipt
   on receipt.id=event.resolved_receipt_id
  and receipt.subject_id=event.resolved_subject_id
  and receipt.provider=event.provider
  and receipt.environment='production'
  and receipt.verification_status in ('verified','revoked')
  and (
    event.external_transaction_id=receipt.external_transaction_id
    or (event.external_original_transaction_id is not null
      and event.external_original_transaction_id=receipt.external_transaction_id)
    or (receipt.external_original_transaction_id is not null
      and event.external_transaction_id=receipt.external_original_transaction_id)
    or (receipt.external_original_transaction_id is not null
      and event.external_original_transaction_id is not null
      and event.external_original_transaction_id=receipt.external_original_transaction_id)
  )
 left join lateral (
   select count(*) as grant_count,
          count(*) filter (where g.status='active') as active_grant_count,
          count(*) filter (where g.status='revoked') as revoked_grant_count,
          count(*) filter (where exists(
            select 1 from public.entitlement_events effect
            where effect.grant_id=g.id and effect.source_type='provider_event'
              and effect.source_provider_event_id=event.id
              and effect.event_type='revoked'
          )) as exact_event_revoked_count
   from public.entitlement_grants g
   where g.source_receipt_id=receipt.id
     and g.subject_id=receipt.subject_id
     and g.grant_source_type='purchase'
 ) rights on true
 where event.provider='portone_v2'
   and event.environment='production'
   and event.event_type in ('refund','payment.cancelled',
   'Transaction.Cancelled','Transaction.PartialCancelled','Transaction.CancelPending')
)
select
 (select count(*)::text from refund_events)
   as "productionRefundTaggedEvents",
 (select count(*)::text from refund_events where event_type='refund')
   as "productionLegacyRefundTaggedEvents",
 (select count(*)::text from refund_events where event_type='payment.cancelled')
   as "productionPaymentCancelledTaggedEvents",
 (select count(*)::text from refund_events where event_type='Transaction.Cancelled')
   as "productionOfficialCancelledTaggedEvents",
 (select count(*)::text from refund_events where event_type='Transaction.PartialCancelled')
   as "productionOfficialPartialCancelledTaggedEvents",
 (select count(*)::text from refund_events where event_type='Transaction.CancelPending')
   as "productionOfficialCancelPendingTaggedEvents",
 (select count(*)::text from refund_events
   where status not in ('verified','processed'))
   as "refundEventsWithoutVerifiedStatus",
 (select count(*)::text from refund_events
   where status in ('verified','processed')
     and (receipt_id is null or resolution_source_type is distinct from 'receipt'))
   as "verifiedRefundEventsWithoutExactReceipt",
 (select count(*)::text from refund_events
   where status in ('verified','processed') and receipt_id is not null
     and grant_count=0)
   as "verifiedRefundEventsWithoutPurchaseGrant",
 (select coalesce(sum(active_grant_count),0)::text from refund_events
   where status in ('verified','processed') and receipt_id is not null)
   as "activePurchaseGrantsAtRefundEvent",
 (select coalesce(sum(revoked_grant_count),0)::text from refund_events
   where status in ('verified','processed') and receipt_id is not null)
   as "revokedPurchaseGrantsAtRefundEvent",
 (select coalesce(sum(exact_event_revoked_count),0)::text from refund_events
   where status in ('verified','processed') and receipt_id is not null)
   as "exactRefundEventRevocationEffects",
 (select count(*)::text from refund_events
   where status in ('verified','processed') and provider_ordering_key is null)
   as "verifiedRefundEventsWithoutOrderingKey"
`.trim();

const FIELDS=Object.freeze([
 'productionRefundTaggedEvents',
 'productionLegacyRefundTaggedEvents',
 'productionPaymentCancelledTaggedEvents',
 'productionOfficialCancelledTaggedEvents',
 'productionOfficialPartialCancelledTaggedEvents',
 'productionOfficialCancelPendingTaggedEvents',
 'refundEventsWithoutVerifiedStatus',
 'verifiedRefundEventsWithoutExactReceipt',
 'verifiedRefundEventsWithoutPurchaseGrant',
 'activePurchaseGrantsAtRefundEvent',
 'revokedPurchaseGrantsAtRefundEvent',
 'exactRefundEventRevocationEffects',
 'verifiedRefundEventsWithoutOrderingKey',
]);

export async function reconcileRefundEventGrantsReadOnlyV1(client) {
 let started=false;
 try {
  await client.query('begin isolation level repeatable read read only');
  started=true;
  await client.query("set local statement_timeout='10000ms'");
  const role=await client.query(`select
    current_setting('transaction_read_only')='on' as "readOnly",
    (rolsuper or rolbypassrls) as "completeVisibility"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(role.rows.length!==1||role.rows[0].readOnly!==true||
    role.rows[0].completeVisibility!==true)
   throw Error('REFUND_EVENT_RECONCILIATION_AUTHORITY_REQUIRED');

  const answer=await client.query(COMMERCE_REFUND_EVENT_GRANT_RECONCILIATION_SQL_V1);
  const row=answer.rows[0];
  if(answer.rows.length!==1||!row||FIELDS.some(name=>
    typeof row[name]!=='string'||!/^(?:0|[1-9][0-9]*)$/u.test(row[name])))
   throw Error('INVALID_REFUND_EVENT_RECONCILIATION_RESULT');

  const counts=Object.freeze(Object.fromEntries(FIELDS.map(name=>[name,row[name]])));
  return Object.freeze({
   schemaVersion:'commerce-refund-event-grant-reconciliation-v1',
   status:counts.productionRefundTaggedEvents!=='0'?'review_candidates':'observed',
   counts,
   fullRefundProven:false,partialRefundResolved:false,
   eventOrderingAuthorized:false,revocationAuthorized:false,
   providerCancellationAuthorized:false,pspCallsPerformed:false,
   writesPerformed:false,
  });
 } finally {
  if(started)await client.query('rollback');
 }
}
