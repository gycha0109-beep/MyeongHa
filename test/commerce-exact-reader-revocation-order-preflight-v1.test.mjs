// Commerce P4 exact Reader / ordered Provider Event revoke preflight.
import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_EXACT_READER_REVOCATION_ORDER_SQL_V1 as SQL,
 COMMERCE_EXACT_READER_REVOCATION_ORDER_PREFLIGHT_V1 as CONFIG,
 inspectExactReaderRevocationOrderPreflightV1 as inspect,
} from '../scripts/operations/commerce-exact-reader-revocation-order-preflight-v1.mjs';

const EVENT='00000000-0000-4000-8000-000000000001';
const GRANT='00000000-0000-4000-8000-000000000002';
const RECEIPT='00000000-0000-4000-8000-000000000003';
const SUBJECT='00000000-0000-4000-8000-000000000004';
const READING='00000000-0000-4000-8000-000000000005';
const ROW=Object.freeze({
 providerEventId:EVENT,providerEventType:'Transaction.Cancelled',
 providerEventStatus:'verified',resolvedReceiptId:RECEIPT,
 resolvedSubjectId:SUBJECT,eventTransactionId:'transaction-original',
 eventOriginalTransactionId:'transaction-original',
 eventProviderOrderingKey:null,
 receiptId:RECEIPT,receiptSubjectId:SUBJECT,
 receiptTransactionId:'transaction-original',
 receiptPaidMinor:'8900',receiptCurrency:'KRW',
 cancelEvidenceSchema:'commerce-portone-cancellation-source-v2',
 cancelEvidenceStatus:'SUCCEEDED',
 cancelEvidenceIdHmac:'hmac-sha256:k1:'+('c'.repeat(64)),
 exactSucceededCancellationAmountMinor:'8900',
 observedCumulativeCancelledAmountMinor:'8900',
 cancelEvidenceOriginalPaidAmountMinor:'8900',
 cancelEvidenceCurrency:'KRW',
 grantId:GRANT,grantSubjectId:SUBJECT,grantSourceReceiptId:RECEIPT,
 grantStatus:'active',grantRevision:'3',grantLastProviderOrderingKey:null,
 officialReadingId:READING,readerCharacterId:'seyeon',
 sameEventEffectCount:'0',sameEventRevokedCount:'0',
 otherActiveReaderPurchaseGrants:'1',
});
const INPUT={providerEventId:EVENT,entitlementGrantId:GRANT};
function db({rows=[ROW],readOnly=true,completeVisibility=true,error}={}){
 const queries=[];
 const query=vi.fn(async(sql,parameters)=>{
  queries.push([sql,parameters]);
  if(sql.includes('pg_catalog.pg_roles'))
   return {rows:[{readOnly,completeVisibility}]};
  if(sql===SQL){
   if(error)throw error;
   expect(parameters).toEqual([EVENT,GRANT]);
   return {rows};
  }
  expect(sql).not.toMatch(/\b(commit|insert|update|delete|truncate|alter|drop)\b/iu);
  return {rows:[]};
 });
 return {query,queries};
}
describe('P4 exact Reader revocation lineage and provider event ordering inspection',()=>{
 it('does not mount a revocation, provider cancel or client route',()=>{
  expect(CONFIG).toEqual({
   productionMounted:false,publicRouteMounted:false,readOnly:true,
   providerOrderComparatorBound:false,readerT2LinearizationBound:false,
   entitlementEffectEnabled:false,refundEnabled:false,
  });
  expect(SQL).toContain('event.id=$1::uuid');
  expect(SQL).toContain('g.id=$2::uuid');
  expect(SQL).toContain('g.source_receipt_id=receipt.id');
  expect(SQL).toContain('access.entitlement_grant_id=g.id');
  expect(SQL).toContain('access.purchase_intent_id=receipt.purchase_intent_id');
  expect(SQL).toContain("receipt.environment=event.environment");
  expect(SQL).toContain("event.environment='production'");
  expect(SQL).toContain("event.provider='portone_v2'");
  expect(SQL).toContain('other_access.entitlement_grant_id<>access.entitlement_grant_id');
  expect(SQL).toContain('effect.source_provider_event_id=event.id');
  expect(SQL).not.toMatch(/\b(update|insert|delete|truncate|commit|call)\b/iu);
 });
 it('tracks exact independent Reader purchase, without leakage or authority',async()=>{
  const client=db(),r=await inspect(client,INPUT);
  expect(r).toEqual({
   schemaVersion:'commerce-exact-reader-revocation-order-preflight-v1',
   kind:'provider_order_provenance_missing',
   sourceOrderClassification:'INCOMPARABLE',
   readerPurchaseBound:true,sameEventReplayObserved:false,
   otherActiveReaderPurchaseGrants:'1',
   refundFinalityProven:false,refundExecutionAuthorized:false,
   readerT2LockHeld:false,grantRevocationAuthorized:false,
   entitlementEffectInvoked:false,writesPerformed:false,
  });
  expect(JSON.stringify(r)).not.toContain(SUBJECT);
  expect(JSON.stringify(r)).not.toContain(RECEIPT);
  expect(JSON.stringify(r)).not.toContain(EVENT);
  expect(JSON.stringify(r)).not.toContain(READING);
  expect(JSON.stringify(r)).not.toContain('seyeon');
  expect(client.queries[0][0]).toContain('repeatable read read only');
  expect(client.queries.at(-1)[0]).toBe('rollback');
 });
 it('existing exact revoked event is a SAME replay, not a second revoke',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   grantStatus:'revoked',sameEventEffectCount:'1',sameEventRevokedCount:'1',
  }]}),INPUT);
  expect(r).toMatchObject({
   kind:'exact_event_revocation_replay_observed',
   sourceOrderClassification:'SAME',
   sameEventReplayObserved:true,
   otherActiveReaderPurchaseGrants:'1',
   entitlementEffectInvoked:false,
   grantRevocationAuthorized:false,
  });
 });
 it('same source but different effect semantics cannot be considered replay',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   grantStatus:'revoked',sameEventEffectCount:'1',sameEventRevokedCount:'0',
  }]}),INPUT);
  expect(r.kind).toBe('same_event_effect_provenance_conflict');
  expect(r.sameEventReplayObserved).toBe(false);
 });
 it('duplicate same-source events are inconsistent',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   sameEventEffectCount:'2',sameEventRevokedCount:'2',
  }]}),INPUT);
  expect(r.kind).toBe('same_event_effect_provenance_conflict');
  expect(r.grantRevocationAuthorized).toBe(false);
 });
 it('revoked for another reason cannot be revoked by this cancellation',async()=>{
  const r=await inspect(db({rows:[{...ROW,grantStatus:'revoked'}]}),INPUT);
  expect(r.kind).toBe('grant_not_active_for_revocation');
 });
 it('expired purchase is not an active revocation target',async()=>{
  const r=await inspect(db({rows:[{...ROW,grantStatus:'expired'}]}),INPUT);
  expect(r.kind).toBe('grant_not_active_for_revocation');
 });
 it('pending cancellation cannot reach a Reader effect',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   providerEventType:'Transaction.CancelPending',
  }]}),INPUT);
  expect(r.kind).toBe('provider_cancellation_pending');
  expect(r.entitlementEffectInvoked).toBe(false);
 });
 it('partial cancellation cannot assume whole Reader purchase revocation',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   providerEventType:'Transaction.PartialCancelled',
  }]}),INPUT);
  expect(r.kind).toBe('partial_cancellation_scope_review_required');
  expect(r.refundFinalityProven).toBe(false);
 });
 it('even an event key and grant key cannot be lexically compared as newer',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   eventProviderOrderingKey:'provider-999',
   grantLastProviderOrderingKey:'provider-100',
  }]}),INPUT);
  expect(r.kind).toBe('provider_order_incomparable');
  expect(r.sourceOrderClassification).toBe('INCOMPARABLE');
 });
 it('matching order keys without same-source revoke do not imply SAME replay',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   eventProviderOrderingKey:'provider-100',
   grantLastProviderOrderingKey:'provider-100',
  }]}),INPUT);
  expect(r.kind).toBe('provider_order_incomparable');
  expect(r.sourceOrderClassification).toBe('INCOMPARABLE');
 });
 it('other active Reader purchase cannot change inspection authorization',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   otherActiveReaderPurchaseGrants:'2',
  }]}),INPUT);
  expect(r.otherActiveReaderPurchaseGrants).toBe('2');
  expect(r.grantRevocationAuthorized).toBe(false);
 });
 it('no exact event/Reader purchase is not evidence of a matching purchase',async()=>{
  const r=await inspect(db({rows:[]}),INPUT);
  expect(r.kind).toBe('exact_reader_purchase_not_found');
  expect(r.readerPurchaseBound).toBe(false);
 });
 it('ambiguous Reader access is rejected',async()=>{
  await expect(inspect(db({rows:[ROW,ROW]}),INPUT)).rejects.toThrow('AMBIGUOUS');
 });
 it.each([
  {receiptId:READING},
  {grantSubjectId:READING},
  {grantSourceReceiptId:READING},
  {eventTransactionId:'other transaction'},
  {eventOriginalTransactionId:null},
  {readerCharacterId:''},
  {grantRevision:'-1'},
  {sameEventEffectCount:'NaN'},
  {receiptPaidMinor:'0'},
  {receiptCurrency:'usd'},
  {eventProviderOrderingKey:'invalid\nkey'},
  {otherActiveReaderPurchaseGrants:'-1'},
 ])('rejects invalid authoritative row %j',async bad=>{
  await expect(inspect(db({rows:[{...ROW,...bad}]}),INPUT)).rejects.toThrow('INVALID');
 });
 it.each([
  {providerEventId:'bad',entitlementGrantId:GRANT},
  {providerEventId:EVENT,entitlementGrantId:'bad'},
 ])('invalid external operations lookup input rejects before DB query',async bad=>{
  const client=db();
  await expect(inspect(client,bad)).rejects.toThrow('INVALID');
  expect(client.query).not.toHaveBeenCalled();
 });
 it('requires fully visible immutable read-only operations snapshot',async()=>{
  const client=db({completeVisibility:false});
  await expect(inspect(client,INPUT)).rejects.toThrow('AUTHORITY_REQUIRED');
  expect(client.queries.some(([sql])=>sql===SQL)).toBe(false);
  expect(client.queries.at(-1)[0]).toBe('rollback');
 });
 it('requires read-only transaction',async()=>{
  const client=db({readOnly:false});
  await expect(inspect(client,INPUT)).rejects.toThrow('AUTHORITY_REQUIRED');
  expect(client.queries.at(-1)[0]).toBe('rollback');
 });
 it('DB exceptions always roll back and never authorize revocation',async()=>{
  const client=db({error:Error('db visibility failure')});
  await expect(inspect(client,INPUT)).rejects.toThrow();
  expect(client.queries.at(-1)[0]).toBe('rollback');
 });
});

describe('P4 exact cancellation item amount vs cumulative refund observation',()=>{
 it('never mistakes a single 3000 cancellation for an 8900 whole-Reader revoke',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   exactSucceededCancellationAmountMinor:'3000',
   observedCumulativeCancelledAmountMinor:'8900',
  }]}),INPUT);
  expect(r.kind).toBe('cumulative_payment_cancel_does_not_prove_single_item_full');
  expect(r.sourceOrderClassification).toBe('INCOMPARABLE');
  expect(r.grantRevocationAuthorized).toBe(false);
  expect(r.otherActiveReaderPurchaseGrants).toBe('1');
 });
 it('rejects a stored GET aggregate exceeding paid Receipt',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   exactSucceededCancellationAmountMinor:'3000',
   observedCumulativeCancelledAmountMinor:'9000',
  }]}),INPUT);
  expect(r.kind).toBe('exact_cancellation_amount_evidence_inconsistent');
  expect(r.entitlementEffectInvoked).toBe(false);
 });
 it('no matching successful cancellation ID fingerprint is not review evidence',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   cancelEvidenceIdHmac:null,
  }]}),INPUT);
  expect(r.kind).toBe('exact_cancellation_amount_evidence_missing');
 });
 it('a REQUESTED cancellation is not a SUCCEEDED one',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   cancelEvidenceStatus:'REQUESTED',
  }]}),INPUT);
  expect(r.kind).toBe('exact_cancellation_amount_evidence_missing');
 });
 it('a prior source-v1 payload cannot impersonate v2 exact amount facts',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   cancelEvidenceSchema:'commerce-portone-cancellation-source-v1',
  }]}),INPUT);
  expect(r.kind).toBe('exact_cancellation_amount_evidence_missing');
 });
 it('an exact full item still cannot bypass unknown provider order',async()=>{
  const r=await inspect(db({rows:[{...ROW,
   exactSucceededCancellationAmountMinor:'8900',
   observedCumulativeCancelledAmountMinor:'8900',
  }]}),INPUT);
  expect(r.kind).toBe('provider_order_provenance_missing');
  expect(r.readerT2LockHeld).toBe(false);
  expect(r.grantRevocationAuthorized).toBe(false);
 });
});
