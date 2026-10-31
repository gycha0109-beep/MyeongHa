// Watchtower-Track: commerce-payment
// Complete-visibility, operations-only READ ONLY event-to-Receipt-to-Grant audit.
// Never infer refund settlement or grant-revocation permission from event tags.
export const COMMERCE_CANCELLATION_EXACT_EVENT_READINESS_SQL_V1 = `
select
 event.id::text as "providerEventId",
 event.event_type as "eventType",
 event.status as "eventStatus",
 event.resolution_source_type as "resolutionSourceType",
 event.provider_ordering_key as "providerOrderingKey",
 event.external_transaction_id as "eventTransactionId",
 event.external_original_transaction_id as "eventOriginalTransactionId",
 receipt.id::text as "receiptId",
 receipt.verification_status as "receiptStatus",
 receipt.external_transaction_id as "receiptTransactionId",
 receipt.verified_amount_minor::text as "receiptAmountMinor",
 receipt.verified_currency as "receiptCurrency",
 receipt.subject_id::text as "receiptSubjectId",
 coalesce((
  select count(*) from public.entitlement_grants grant_row
  where grant_row.source_receipt_id=receipt.id
    and grant_row.subject_id=receipt.subject_id
    and grant_row.grant_source_type='purchase'
 ),0)::text as "purchaseGrantCount",
 coalesce((
  select count(*) from public.entitlement_grants grant_row
  join public.entitlement_events effect
    on effect.grant_id=grant_row.id
   and effect.subject_id=grant_row.subject_id
   and effect.source_type='provider_event'
   and effect.source_provider_event_id=event.id
   and effect.event_type='revoked'
  where grant_row.source_receipt_id=receipt.id
    and grant_row.subject_id=receipt.subject_id
    and grant_row.grant_source_type='purchase'
 ),0)::text as "exactEventRevocationCount"
from public.commerce_provider_events event
join public.commerce_receipts receipt
 on receipt.id=event.resolved_receipt_id
 and receipt.subject_id=event.resolved_subject_id
 and receipt.provider=event.provider
 and receipt.environment=event.environment
where event.provider='portone_v2'
 and event.environment='production'
 and event.external_event_id=$1::text
 and receipt.provider='portone_v2'
 and receipt.environment='production'
 and receipt.verification_status in ('verified','revoked')
 and event.resolution_source_type='receipt'
limit 2
`.trim();

const ID=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const TYPES=new Set(['Transaction.Cancelled','Transaction.PartialCancelled','Transaction.CancelPending']);
const INTEGER=/^(0|[1-9][0-9]*)$/u;
const VALID_STATUSES=new Set(['verified','processed']);
const no=(kind)=>Object.freeze({
 schemaVersion:'commerce-cancellation-exact-event-readiness-v1',
 kind,sourceEventReady:false,exactPurchaseGrantRevoked:false,
 grantRevocationAuthorized:false,providerRefundAuthorized:false,
 writesPerformed:false,
});
function validId(v){return typeof v==='string'&&ID.test(v)&&v.trim()===v;}
export const COMMERCE_CANCELLATION_EXACT_EVENT_READINESS_V1=Object.freeze({
 productionMounted:false,publicRouteMounted:false,
 readOnly:true,entitlementMutationEnabled:false,
 providerRefundEnabled:false,
});
/**
 * Query is intentionally about exact existing event provenance, not creation.
 * Missing canonical event / order is a gap to implement, not a bypass.
 */
export async function inspectExactCancellationProviderEventReadinessV1(client,input){
 if(!input||!validId(input.providerWebhookId)||
    !validId(input.originalTransactionId))throw Error('INVALID_CANCELLATION_EVENT_AUDIT_INPUT');
 let tx=false;
 try{
  await client.query('begin isolation level repeatable read read only');tx=true;
  await client.query("set local statement_timeout='10000ms'");
  const authority=await client.query(`select
    current_setting('transaction_read_only')='on' as "readOnly",
    (rolsuper or rolbypassrls) as "completeVisibility"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(authority.rows.length!==1||
     authority.rows[0].readOnly!==true||
     authority.rows[0].completeVisibility!==true)
    throw Error('CANCELLATION_EVENT_AUDIT_AUTHORITY_REQUIRED');
  const answer=await client.query(COMMERCE_CANCELLATION_EXACT_EVENT_READINESS_SQL_V1,[input.providerWebhookId]);
  if(answer.rows.length===0)return no('canonical_event_missing');
  if(answer.rows.length!==1)throw Error('CANCELLATION_EVENT_AUDIT_AMBIGUOUS');
  const r=answer.rows[0];
  if(!validId(r.providerEventId)||!validId(r.receiptId)||
     !TYPES.has(r.eventType)||
     !validId(r.receiptTransactionId)||
     r.receiptTransactionId!==input.originalTransactionId||
     !(r.eventTransactionId===input.originalTransactionId||
       r.eventOriginalTransactionId===input.originalTransactionId)||
     r.resolutionSourceType!=='receipt'||
     !['verified','revoked'].includes(r.receiptStatus)||
     !INTEGER.test(r.purchaseGrantCount)||
     !INTEGER.test(r.exactEventRevocationCount)||
     Number(r.exactEventRevocationCount)>Number(r.purchaseGrantCount)||
     !INTEGER.test(r.receiptAmountMinor)||r.receiptAmountMinor==='0'||
     !/^[A-Z]{3}$/u.test(r.receiptCurrency)||
     !validId(r.receiptSubjectId))
     return no('event_receipt_identity_inconsistent');
  if(!VALID_STATUSES.has(r.eventStatus))
    return no('canonical_event_unverified');
  if(!validId(r.providerOrderingKey))
    return no('provider_ordering_unresolved');
  if(r.purchaseGrantCount==='0')
    return no('purchase_grant_missing');
  // Status verified and provider ordering evidence can support further
  // review only. They cannot by themselves authorize policy resolution.
  const revoked=Number(r.exactEventRevocationCount)>0;
  return Object.freeze({
    ...no(revoked?'exact_event_revocation_observed':'verified_event_review_candidate'),
    sourceEventReady:true,
    exactPurchaseGrantRevoked:revoked,
    alreadyRevokedGrantCount:r.exactEventRevocationCount,
    purchaseGrantCount:r.purchaseGrantCount,
  });
 }finally{
   if(tx)await client.query('rollback');
 }
}
