import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {
 COMMERCE_CANCELLATION_EXACT_EVENT_READINESS_SQL_V1 as SQL,
 COMMERCE_CANCELLATION_EXACT_EVENT_READINESS_V1 as CONFIG,
 inspectExactCancellationProviderEventReadinessV1 as inspect,
} from '../scripts/operations/commerce-cancellation-exact-event-readiness-v1.mjs';

const EVENT='portone-event-1',TX='verified-transaction-1';
const INPUT={providerWebhookId:EVENT,originalTransactionId:TX,expectedEventType:'Transaction.Cancelled'};
const SOURCE_MAC='hmac-sha256:k1:'+'b'.repeat(64);
const CANCEL_MAC='hmac-sha256:k1:'+'a'.repeat(64);
const ROW={
 providerEventId:'00000000-0000-4000-8000-000000000001',
 eventType:'Transaction.Cancelled',eventStatus:'verified',
 resolutionSourceType:'receipt',providerOrderingKey:'order-1',
 eventTransactionId:TX,eventOriginalTransactionId:null,
 receiptId:'00000000-0000-4000-8000-000000000002',
 receiptStatus:'verified',receiptTransactionId:TX,
 receiptAmountMinor:'8900',receiptCurrency:'KRW',
 receiptSubjectId:'00000000-0000-4000-8000-000000000003',
 purchaseGrantCount:'1',exactEventRevocationCount:'0',
};
function db(rows=[ROW],authority={readOnly:true,completeVisibility:true}){
 const calls=[];
 return {calls,async query(sql,params){
  calls.push([sql,params]);
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===SQL){
   assert.deepEqual(params,[EVENT,rows[0]?.eventType??'Transaction.Cancelled']);
   return {rows};
  }
  assert.ok(!/\b(insert|update|delete|commit)\b/i.test(sql),'No mutation SQL');
  return {rows:[]};
 }};
}
describe('exact verified cancellation event / Reader purchase Grant audit',()=>{
 it('has zero externally mounted or mutation authority',()=>{
  assert.deepEqual(CONFIG,{
   productionMounted:false,publicRouteMounted:false,
   readOnly:true,entitlementMutationEnabled:false,providerRefundEnabled:false,
  });
 });
 it('queries one exact event, original verified receipt and exact grant effect',async()=>{
  const client=db(),r=await inspect(client,INPUT);
  assert.equal(r.kind,'verified_event_review_candidate');
  assert.equal(r.sourceEventReady,true);
  assert.equal(r.exactPurchaseGrantRevoked,false);
  assert.equal(r.grantRevocationAuthorized,false);
  assert.equal(r.providerRefundAuthorized,false);
  assert.equal(r.writesPerformed,false);
  assert.equal(client.calls.at(-1)[0],'rollback');
  assert.ok(SQL.includes("event.external_event_id=$1::text"));
  assert.ok(SQL.includes('effect.source_provider_event_id=event.id'));
  assert.ok(SQL.includes('grant_row.source_receipt_id=receipt.id'));
  assert.ok(SQL.includes('join public.standard_reading_reader_access_grants reader_access'));
  assert.ok(SQL.includes('reader_access.entitlement_grant_id=grant_row.id'));
  assert.ok(SQL.includes('reader_access.purchase_intent_id=receipt.purchase_intent_id'));
  assert.ok(SQL.includes("effect.target_status='revoked'"));
  assert.ok(SQL.includes('event.payload_fingerprint'));
  assert.ok(SQL.includes("event.verified_payload_jsonb->>'signedPayloadHmac'"));
  assert.ok(SQL.includes("event.verified_payload_jsonb->>'cancellationIdHmac'"));
 });
 it('binds the exact signed raw-payload HMAC and original Receipt before review',async()=>{
  const valid={...ROW,signedEventFingerprint:SOURCE_MAC,
    storedSignedPayloadHmac:SOURCE_MAC,
    storedCancellationIdHmac:CANCEL_MAC};
  const input={...INPUT,expectedReceiptId:ROW.receiptId,
    expectedSignedPayloadHmac:SOURCE_MAC,
    expectedCancellationIdHmac:CANCEL_MAC};
  assert.equal((await inspect(db([valid]),input)).sourceEventReady,true);
  assert.equal((await inspect(db([{...valid,receiptId:
    '00000000-0000-4000-8000-000000000099'}]),input)).kind,
    'canonical_event_original_receipt_mismatch');
  assert.equal((await inspect(db([{...valid,storedSignedPayloadHmac:
    'hmac-sha256:k1:'+'c'.repeat(64)}]),input)).kind,
    'canonical_event_signed_source_mismatch');
  assert.equal((await inspect(db([{...valid,signedEventFingerprint:
    'hmac-sha256:k1:'+'d'.repeat(64)}]),input)).kind,
    'canonical_event_signed_source_mismatch');
  // Two successful items may share one receipt, never one event identity.
  assert.equal((await inspect(db([{...valid,storedCancellationIdHmac:
    'hmac-sha256:k1:'+'e'.repeat(64)}]),input)).kind,
    'canonical_event_cancellation_item_mismatch');
  assert.equal((await inspect(db([{...valid,storedCancellationIdHmac:null}]),input)).kind,
    'canonical_event_cancellation_item_mismatch');
 });
 it('rejects malformed source HMAC before any private DB connection',async()=>{
  const client=db();
  await assert.rejects(()=>inspect(client,{
    ...INPUT,expectedSignedPayloadHmac:'raw-user-body',
  }),/INVALID_CANCELLATION_EVENT_AUDIT_INPUT/);
  await assert.rejects(()=>inspect(client,{
    ...INPUT,expectedCancellationIdHmac:'untrusted-item-id',
  }),/INVALID_CANCELLATION_EVENT_AUDIT_INPUT/);
  assert.equal(client.calls.length,0);
 });
 it('observes already-revoked exact grant, without re-revoking',async()=>{
  const r=await inspect(db([{...ROW,exactEventRevocationCount:'1'}]),INPUT);
  assert.equal(r.kind,'exact_event_revocation_observed');
  assert.equal(r.exactPurchaseGrantRevoked,true);
  assert.equal(r.grantRevocationAuthorized,false);
 });
 it('requires original transaction identity matched exactly',async()=>{
  const r=await inspect(db([{...ROW,receiptTransactionId:'different'}]),INPUT);
  assert.equal(r.kind,'event_receipt_identity_inconsistent');
 });
 it('does not treat partial refund tag as full cancellation authority',async()=>{
  const r=await inspect(db([{...ROW,eventType:'Transaction.PartialCancelled'}]),{...INPUT,expectedEventType:'Transaction.PartialCancelled'});
  assert.equal(r.kind,'verified_event_review_candidate');
  assert.equal(r.grantRevocationAuthorized,false);
 });
 it('does not treat pending event as final even with verified event status',async()=>{
  const r=await inspect(db([{...ROW,eventType:'Transaction.CancelPending'}]),{...INPUT,expectedEventType:'Transaction.CancelPending'});
  assert.equal(r.grantRevocationAuthorized,false);
 });
 it('missing event cannot be used to revoke',async()=>{
  const r=await inspect(db([]),INPUT);
  assert.equal(r.kind,'canonical_event_missing');
  assert.equal(r.sourceEventReady,false);
 });
 it('unverified event fails closed',async()=>{
  const r=await inspect(db([{...ROW,eventStatus:'received'}]),INPUT);
  assert.equal(r.kind,'canonical_event_unverified');
 });
 it('missing ordered provider state fails closed',async()=>{
  const r=await inspect(db([{...ROW,providerOrderingKey:null}]),INPUT);
  assert.equal(r.kind,'provider_ordering_unresolved');
 });
 it('missing purchase Grant fails closed',async()=>{
  const r=await inspect(db([{...ROW,purchaseGrantCount:'0'}]),INPUT);
  assert.equal(r.kind,'purchase_grant_missing');
 });
 it('mismatched revocation count fails closed',async()=>{
  const r=await inspect(db([{...ROW,exactEventRevocationCount:'2'}]),INPUT);
  assert.equal(r.kind,'event_receipt_identity_inconsistent');
 });
 it('RLS-filtered actor cannot claim zero events safely',async()=>{
  const client=db([],{readOnly:true,completeVisibility:false});
  await assert.rejects(()=>inspect(client,INPUT),/AUTHORITY_REQUIRED/);
  assert.equal(client.calls.at(-1)[0],'rollback');
  assert.equal(client.calls.some(x=>x[0]===SQL),false);
 });
 it('ambiguous read rejects',async()=>{
  await assert.rejects(()=>inspect(db([ROW,ROW]),INPUT),/AMBIGUOUS/);
 });
 it('invalid identifiers reject before touching DB',async()=>{
  const client=db();
  await assert.rejects(()=>inspect(client,{...INPUT,providerWebhookId:'invalid\nheader'}),/INVALID/);
  assert.equal(client.calls.length,0);
 });
});
