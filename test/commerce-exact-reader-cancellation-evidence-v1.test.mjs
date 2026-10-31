// Watchtower-Track: commerce-payment
import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_EXACT_READER_CANCELLATION_EVIDENCE_SQL_V1,
 inspectExactReaderCancellationEvidenceV1,
} from '../scripts/operations/commerce-exact-reader-cancellation-evidence-v1.mjs';

const EVENT='00000000-0000-4000-8000-000000000001';
const GRANT='00000000-0000-4000-8000-000000000002';
const READING='00000000-0000-4000-8000-000000000003';
const ROW={
 providerEventId:EVENT,grantId:GRANT,grantStatus:'active',grantRevision:'4',
 officialReadingId:READING,readerCharacterId:'seyeon',
 eventType:'payment.cancelled',eventStatus:'verified',
 eventOrderingKey:'order-1',exactRevokeEffectExists:false,
 otherActiveReaderPurchaseGrants:'1',
};
const REQUEST={providerEventId:EVENT,entitlementGrantId:GRANT};

function db({rows=[ROW],authority={readOnly:true,completeVisibility:true},error}={}){
 const query=vi.fn(async (sql,params)=>{
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===COMMERCE_EXACT_READER_CANCELLATION_EVIDENCE_SQL_V1){
   if(error)throw error;
   if(JSON.stringify(params)!==JSON.stringify([EVENT,GRANT]))
    throw Error('Unexpected unscoped search');
   return {rows};
  }
  return {rows:[]};
 });
 return {query};
}

describe('exact Reader cancellation event/Grant evidence inspection',()=>{
 it('selects exact production verified receipt-lineage provider event and Reader-specific Grant',()=>{
  const sql=COMMERCE_EXACT_READER_CANCELLATION_EVIDENCE_SQL_V1;
  expect(sql).toContain('event.id=$1::uuid');
  expect(sql).toContain('g.id=$2::uuid');
  expect(sql).toContain("event.environment='production'");
  expect(sql).toContain("receipt.environment='production'");
  expect(sql).toContain("event.status in ('verified','processed')");
  expect(sql).toContain("event.event_type in ('refund','payment.cancelled',");
  expect(sql).toContain('g.source_receipt_id=receipt.id');
  expect(sql).toContain('access.entitlement_grant_id=g.id');
  expect(sql).toContain('access.purchase_intent_id=receipt.purchase_intent_id');
  expect(sql).toContain('other_access.entitlement_grant_id<>access.entitlement_grant_id');
  expect(sql).not.toMatch(/^\s*(insert\s+into|update\s+public\.|delete\s+from|truncate\s+table|grant\s+on|revoke\s+on)\b/im);
 });
 it('returns review-only, not authorized, and preserves other Reader count without disclosing their IDs',async()=>{
  const c=db();
  const x=await inspectExactReaderCancellationEvidenceV1(c,REQUEST);
  expect(x).toEqual({
   schemaVersion:'commerce-exact-reader-cancellation-evidence-v1',
   kind:'linked_review_only',
   currentGrantStatus:'active',
   sameEventRevocationObserved:false,
   otherActiveReaderPurchaseGrants:'1',
   orderingKeyPresent:true,
   fullRefundEstablished:false,cancellationFinalityEstablished:false,
   revocationAuthorized:false,providerCancellationAuthorized:false,
   writesPerformed:false,
  });
  expect(x).not.toHaveProperty('readerCharacterId');
  expect(x).not.toHaveProperty('officialReadingId');
  expect(x).not.toHaveProperty('grantId');
  expect(c.query.mock.calls[0][0]).toContain('repeatable read read only');
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('even exact revoked effect observed does not prove full-refund provider finality',async()=>{
  const x=await inspectExactReaderCancellationEvidenceV1(db({
   rows:[{...ROW,grantStatus:'revoked',exactRevokeEffectExists:true,
     otherActiveReaderPurchaseGrants:'2'}],
  }),REQUEST);
  expect(x).toMatchObject({
   kind:'exact_revoke_effect_observed',
   otherActiveReaderPurchaseGrants:'2',
   fullRefundEstablished:false,revocationAuthorized:false,
  });
 });
 it.each(['Transaction.Cancelled','Transaction.PartialCancelled','Transaction.CancelPending'])(
  'keeps official %s tag review-only, not a revocation approval',async eventType=>{
   const r=await inspectExactReaderCancellationEvidenceV1(db({rows:[{...ROW,eventType}]}),REQUEST);
   expect(r).toMatchObject({kind:'linked_review_only',fullRefundEstablished:false,
    cancellationFinalityEstablished:false,revocationAuthorized:false});
  });
 it('a different event, grant, or absent exact Reader purchase is no match',async()=>{
  const x=await inspectExactReaderCancellationEvidenceV1(db({rows:[]}),REQUEST);
  expect(x).toEqual({
   schemaVersion:'commerce-exact-reader-cancellation-evidence-v1',
   kind:'no_exact_link',fullRefundEstablished:false,
   cancellationFinalityEstablished:false,revocationAuthorized:false,
   providerCancellationAuthorized:false,writesPerformed:false,
  });
 });
 it.each([
  [{...ROW,readerCharacterId:''}],
  [{...ROW,grantStatus:'unknown'}],
  [{...ROW,grantRevision:'-1'}],
  [{...ROW,otherActiveReaderPurchaseGrants:'NaN'}],
  [{...ROW,providerEventId:GRANT}],
  [{...ROW,grantId:EVENT}],
  [{...ROW,eventStatus:'received'}],
  [{...ROW,eventType:'Future.Unknown'}],
  [{...ROW,exactRevokeEffectExists:'true'}],
  [ROW,ROW],
 ].map(rows=>[rows]))('refuses invalid or ambiguous reader evidence %j',async rows=>{
  await expect(inspectExactReaderCancellationEvidenceV1(db({rows}),REQUEST))
   .rejects.toThrow();
 });
 it.each([
  {providerEventId:'fake',entitlementGrantId:GRANT},
  {providerEventId:EVENT,entitlementGrantId:'fake'},
 ])('rejects invalid ID before querying DB %j',async bad=>{
  const c=db();
  await expect(inspectExactReaderCancellationEvidenceV1(c,bad)).rejects.toThrow('INVALID_PRIVATE_READER');
  expect(c.query).not.toHaveBeenCalled();
 });
 it('fails on incomplete RLS visibility and rolls back',async()=>{
  const c=db({authority:{readOnly:true,completeVisibility:false}});
  await expect(inspectExactReaderCancellationEvidenceV1(c,REQUEST)).rejects.toThrow('AUTHORITY_REQUIRED');
  expect(c.query.mock.calls.some(([sql])=>sql===COMMERCE_EXACT_READER_CANCELLATION_EVIDENCE_SQL_V1))
   .toBe(false);
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('refuses a database error rather than claiming safety',async()=>{
  const c=db({error:Error('private DB failure')});
  await expect(inspectExactReaderCancellationEvidenceV1(c,REQUEST)).rejects.toThrow();
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
});
