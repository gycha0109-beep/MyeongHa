// Watchtower-Track: commerce-payment
import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_REFUND_EVENT_GRANT_RECONCILIATION_SQL_V1,
 reconcileRefundEventGrantsReadOnlyV1,
} from '../scripts/operations/commerce-refund-event-grant-reconciliation-v1.mjs';

const zeros=Object.freeze({
 productionRefundTaggedEvents:'0',
 productionLegacyRefundTaggedEvents:'0',productionPaymentCancelledTaggedEvents:'0',refundEventsWithoutVerifiedStatus:'0',
 verifiedRefundEventsWithoutExactReceipt:'0',
 verifiedRefundEventsWithoutPurchaseGrant:'0',
 activePurchaseGrantsAtRefundEvent:'0',
 revokedPurchaseGrantsAtRefundEvent:'0',
 exactRefundEventRevocationEffects:'0',
 verifiedRefundEventsWithoutOrderingKey:'0',
});

function db({row=zeros,authority={readOnly:true,completeVisibility:true},error}={}) {
 return {query:vi.fn(async sql=>{
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===COMMERCE_REFUND_EVENT_GRANT_RECONCILIATION_SQL_V1){
   if(error)throw error;
   return {rows:[row]};
  }
  return {rows:[]};
 })};
}

describe('offline refund-tagged provider Event to exact purchase Grant review',()=>{
 it('only inspects production PortOne refund tags and exact receipt-linked purchase Grants',()=>{
  const sql=COMMERCE_REFUND_EVENT_GRANT_RECONCILIATION_SQL_V1;
  expect(sql).toContain("event.provider='portone_v2'");
  expect(sql).toContain("event.environment='production'");
  expect(sql).toContain("event.event_type in ('refund','payment.cancelled')");
  expect(sql).toContain("receipt.verification_status in ('verified','revoked')");
  expect(sql).toContain("g.source_receipt_id=receipt.id");
  expect(sql).toContain("g.subject_id=receipt.subject_id");
  expect(sql).toContain("g.grant_source_type='purchase'");
  expect(sql).toContain('effect.source_provider_event_id=event.id');
  expect(sql).not.toMatch(/\b(insert|update|delete|grant|revoke|truncate)\s+(into|from|table|on)/i);
 });
 it('returns observed zero without authorizing cancellation or revocation',async()=>{
  const c=db();
  const output=await reconcileRefundEventGrantsReadOnlyV1(c);
  expect(output).toEqual({
   schemaVersion:'commerce-refund-event-grant-reconciliation-v1',
   status:'observed',counts:zeros,
   fullRefundProven:false,partialRefundResolved:false,
   eventOrderingAuthorized:false,revocationAuthorized:false,
   providerCancellationAuthorized:false,pspCallsPerformed:false,
   writesPerformed:false,
  });
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it.each([
  'productionLegacyRefundTaggedEvents',
  'productionPaymentCancelledTaggedEvents',
  'refundEventsWithoutVerifiedStatus',
  'verifiedRefundEventsWithoutExactReceipt',
  'verifiedRefundEventsWithoutPurchaseGrant',
  'activePurchaseGrantsAtRefundEvent',
  'revokedPurchaseGrantsAtRefundEvent',
  'exactRefundEventRevocationEffects',
  'verifiedRefundEventsWithoutOrderingKey',
 ])('does not infer refund completion from the %s count',async field=>{
  const r=await reconcileRefundEventGrantsReadOnlyV1(db({
   row:{...zeros,productionRefundTaggedEvents:'1',[field]:'1',customerId:'must-hide'},
  }));
  expect(r.status).toBe('review_candidates');
  expect(r.fullRefundProven).toBe(false);
  expect(r.revocationAuthorized).toBe(false);
  expect(r.counts).not.toHaveProperty('customerId');
 });
 it('denies filtered/RLS-incomplete observations',async()=>{
  const c=db({authority:{readOnly:true,completeVisibility:false}});
  await expect(reconcileRefundEventGrantsReadOnlyV1(c))
   .rejects.toThrow('AUTHORITY_REQUIRED');
  expect(c.query.mock.calls.some(([sql])=>
   sql===COMMERCE_REFUND_EVENT_GRANT_RECONCILIATION_SQL_V1)).toBe(false);
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('rejects a malformed count and always rolls back',async()=>{
  const c=db({row:{...zeros,activePurchaseGrantsAtRefundEvent:'1.0'}});
  await expect(reconcileRefundEventGrantsReadOnlyV1(c))
   .rejects.toThrow('INVALID_REFUND_EVENT_RECONCILIATION_RESULT');
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('does not claim success after DB failures',async()=>{
  const c=db({error:Error('private provider source failed')});
  await expect(reconcileRefundEventGrantsReadOnlyV1(c)).rejects.toThrow();
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
});
