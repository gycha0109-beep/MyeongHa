import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_READER_REVOKE_LOCK_CAS_PREFLIGHT_V1 as CONFIG,
 COMMERCE_REVOKE_SOURCE_EVENT_LOCK_SQL_V1 as EVENT_SQL,
 COMMERCE_REVOKE_EXACT_READER_GRANT_LOCK_SQL_V1 as GRANT_SQL,
 inspectLockedReaderRevokeCasPreflightV1 as inspect,
} from '../scripts/operations/commerce-exact-reader-revoke-cas-locked-preflight-v1.mjs';
import {
 COMMERCE_EXACT_READER_REVOCATION_ORDER_SQL_V1 as EVIDENCE_SQL,
} from '../scripts/operations/commerce-exact-reader-revocation-order-preflight-v1.mjs';

const EVENT='00000000-0000-4000-8000-000000000001';
const GRANT='00000000-0000-4000-8000-000000000002';
const RECEIPT='00000000-0000-4000-8000-000000000003';
const SUBJECT='00000000-0000-4000-8000-000000000004';
const INTENT='00000000-0000-4000-8000-000000000005';
const SOURCE={providerEventId:EVENT,receiptId:RECEIPT,
 subjectId:SUBJECT,purchaseIntentId:INTENT};
const GRANT_ROW={grantId:GRANT,grantRevision:'3',
 lastProviderOrderingKey:null,grantStatus:'active'};
const ROW={
 providerEventId:EVENT,receiptId:RECEIPT,receiptSubjectId:SUBJECT,
 grantId:GRANT,grantSourceReceiptId:RECEIPT,grantSubjectId:SUBJECT,
 grantRevision:'3',grantLastProviderOrderingKey:null,grantStatus:'active',
 sameEventEffectCount:'0',sameEventRevokedCount:'0',
 providerEventType:'Transaction.Cancelled',
 cancelEvidenceSchema:'commerce-portone-cancellation-source-v2',
 cancelEvidenceStatus:'SUCCEEDED',
 cancelEvidenceIdHmac:'hmac-sha256:k1:'+('a'.repeat(64)),
 receiptPaidMinor:'8900',receiptCurrency:'KRW',
 exactSucceededCancellationAmountMinor:'8900',
 observedCumulativeCancelledAmountMinor:'8900',
 cancelEvidenceOriginalPaidAmountMinor:'8900',cancelEvidenceCurrency:'KRW',
 eventProviderOrderingKey:null,
};
const INPUT={providerEventId:EVENT,entitlementGrantId:GRANT,
 expectedGrantRevision:'3',expectedLastProviderOrderingKey:null};

function client({
 eventRows=[SOURCE],grantRows=[GRANT_ROW],evidenceRows=[ROW],
 authority={writable:true,completeVisibility:true,currentUser:'postgres'},
 failSql,
}={}){
 const calls=[];
 const query=vi.fn(async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===EVENT_SQL){
   expect(args).toEqual([EVENT]);
   return {rows:eventRows};
  }
  if(sql===GRANT_SQL){
   expect(args).toEqual([GRANT,RECEIPT,SUBJECT,INTENT]);
   return {rows:grantRows};
  }
  if(sql===EVIDENCE_SQL){
   expect(args).toEqual([EVENT,GRANT]);
   return {rows:evidenceRows};
  }
  if(failSql===sql)throw Error('synthetic DB failure');
  expect(sql).not.toMatch(/\b(insert|update|delete|commit|truncate|alter|drop)\b/iu);
  return {rows:[]};
 });
 return {calls,query};
}
const locked=c=>c.calls.filter(x=>x.sql===EVENT_SQL||x.sql===GRANT_SQL);
const holds=r=>{
 expect(r.grantRevocationAuthorized).toBe(false);
 expect(r.entitlementEffectInvoked).toBe(false);
 expect(r.refundExecutionAuthorized).toBeUndefined();
 expect(r.writesPerformed).toBe(false);
 expect(r.readerT2LockHeld).toBe(false);
};
describe('P4 exact Reader revoke Provider Event -> Grant atomic CAS lock bridge',()=>{
 it('is an internal-only locked rehearsal, not production revoke authority',()=>{
  expect(CONFIG).toMatchObject({
   productionMounted:false,publicRouteMounted:false,
   grantMutationEnabled:false,entitlementEffectEnabled:false,
   refundExecutionEnabled:false,readerT2LinearizationBound:false,
   providerOrderingComparatorBound:false,
  });
  expect(EVENT_SQL).toContain('for update of e');
  expect(GRANT_SQL).toContain('for update of g');
  expect(EVENT_SQL).toContain("e.provider='portone_v2'");
  expect(EVENT_SQL).toContain("e.environment='production'");
  expect(GRANT_SQL).toContain('g.source_receipt_id=$2::uuid');
  expect(GRANT_SQL).toContain('access.purchase_intent_id=$4::uuid');
  expect(EVENT_SQL+GRANT_SQL).not.toMatch(/\b(insert|delete|update public|commit)\b/iu);
 });
 it('locks one exact Event then one Reader Grant inside one serializable transaction',async()=>{
  const c=client(),r=await inspect(c,INPUT);
  expect(r).toMatchObject({
   kind:'trusted_provider_order_missing',
   sourceEventLocked:true,exactReaderGrantLocked:true,revisionProven:true,
   grantRevocationAuthorized:false,entitlementEffectInvoked:false,writesPerformed:false,
  });
  expect(locked(c).map(x=>x.sql)).toEqual([EVENT_SQL,GRANT_SQL]);
  expect(c.calls[0].sql).toBe('begin isolation level serializable');
  expect(c.calls.at(-1).sql).toBe('rollback');
  expect(c.calls.some(x=>x.sql===EVIDENCE_SQL)).toBe(true);
  for(const secret of [SUBJECT,RECEIPT,INTENT,EVENT,GRANT])
   expect(JSON.stringify(r)).not.toContain(secret);
  holds(r);
 });
 it('rejects stale Grant revision without proceeding to a source recheck',async()=>{
  const c=client({grantRows:[{...GRANT_ROW,grantRevision:'4'}]});
  const r=await inspect(c,INPUT);
  expect(r.kind).toBe('grant_cas_snapshot_changed');
  expect(r.revisionProven).toBe(false);
  expect(c.calls.some(x=>x.sql===EVIDENCE_SQL)).toBe(false);
  holds(r);
 });
 it('rejects changed last provider ordering key without guessing newer',async()=>{
  const c=client({grantRows:[{...GRANT_ROW,lastProviderOrderingKey:'order-3'}]});
  const r=await inspect(c,INPUT);
  expect(r.kind).toBe('grant_cas_snapshot_changed');
  holds(r);
 });
 it('no existing Provider Event is not a Reader revocation target',async()=>{
  const c=client({eventRows:[]}),r=await inspect(c,INPUT);
  expect(r.kind).toBe('exact_cancellation_event_not_found');
  expect(r.sourceEventLocked).toBe(false);
  expect(locked(c)).toHaveLength(1);
  holds(r);
 });
 it('no matching Reader Grant is not authorization for a different purchase',async()=>{
  const c=client({grantRows:[]}),r=await inspect(c,INPUT);
  expect(r.kind).toBe('exact_reader_grant_not_found');
  expect(r.sourceEventLocked).toBe(true);
  expect(r.exactReaderGrantLocked).toBe(false);
  holds(r);
 });
 it('Reader purchase rebinding after locks is detected',async()=>{
  const c=client({evidenceRows:[{...ROW,grantSourceReceiptId:INTENT}]});
  await expect(inspect(c,INPUT)).rejects.toThrow('LINEAGE_CHANGED');
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
 it('same provider event already revoked is only an observed replay',async()=>{
  const c=client({grantRows:[{...GRANT_ROW,grantStatus:'revoked'}],
   evidenceRows:[{...ROW,grantStatus:'revoked',
    sameEventEffectCount:'1',sameEventRevokedCount:'1'}]});
  const r=await inspect(c,INPUT);
  expect(r.kind).toBe('exact_event_revoke_replay_observed');
  holds(r);
 });
 it('existing effect of wrong semantics is a conflict, never a replay',async()=>{
  const r=await inspect(client({evidenceRows:[{...ROW,
   sameEventEffectCount:'1',sameEventRevokedCount:'0'}]}),INPUT);
  expect(r.kind).toBe('exact_event_effect_conflict');
  holds(r);
 });
 it('partial refund is never allowed to revoke a full Reader purchase',async()=>{
  const r=await inspect(client({evidenceRows:[{...ROW,
   providerEventType:'Transaction.PartialCancelled',
   exactSucceededCancellationAmountMinor:'3000'}]}),INPUT);
  expect(r.kind).toBe('partial_cancellation_review_required');
  holds(r);
 });
 it('multi-part accumulated full payment never implies exact item full',async()=>{
  const r=await inspect(client({evidenceRows:[{...ROW,
   exactSucceededCancellationAmountMinor:'3000'}]}),INPUT);
  expect(r.kind).toBe('single_cancel_does_not_cover_full_reader_purchase');
  holds(r);
 });
 it('amount guard rejects missing exact source v2 money proof',async()=>{
  const r=await inspect(client({evidenceRows:[{...ROW,
   cancelEvidenceSchema:'commerce-portone-cancellation-source-v1'}]}),INPUT);
  expect(r.kind).toBe('exact_refund_amount_evidence_missing');
  holds(r);
 });
 it('non-null ordering string cannot be assumed newer',async()=>{
  const r=await inspect(client({evidenceRows:[{...ROW,
   eventProviderOrderingKey:'provider-999'}]}),INPUT);
  expect(r.kind).toBe('provider_order_comparator_unavailable');
  expect(r.providerOrderingComparable).toBe(false);
  holds(r);
 });
 it('unprivileged actor cannot attempt the lock',async()=>{
  const c=client({authority:{writable:true,completeVisibility:false,currentUser:'member'}});
  await expect(inspect(c,INPUT)).rejects.toThrow('AUTHORITY_REQUIRED');
  expect(locked(c)).toHaveLength(0);
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
 it('service_role is forbidden even if it reports complete visibility',async()=>{
  const c=client({authority:{writable:true,completeVisibility:true,currentUser:'service_role'}});
  await expect(inspect(c,INPUT)).rejects.toThrow('AUTHORITY_REQUIRED');
  expect(locked(c)).toHaveLength(0);
 });
 it('ambiguous Provider Event source fails, rolls back',async()=>{
  const c=client({eventRows:[SOURCE,SOURCE]});
  await expect(inspect(c,INPUT)).rejects.toThrow('AMBIGUOUS');
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
 it('ambiguous Grant lock fails, rolls back',async()=>{
  const c=client({grantRows:[GRANT_ROW,GRANT_ROW]});
  await expect(inspect(c,INPUT)).rejects.toThrow('AMBIGUOUS');
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
 it('unexpected DB error releases every held lock with rollback',async()=>{
  const c=client({failSql:"set local lock_timeout='3000ms'"});
  await expect(inspect(c,INPUT)).rejects.toThrow('synthetic DB failure');
  expect(c.calls.at(-1).sql).toBe('rollback');
  expect(locked(c)).toHaveLength(0);
 });
 it.each([
  {providerEventId:'not-uuid'},
  {entitlementGrantId:'not-uuid'},
  {expectedGrantRevision:'-1'},
  {expectedGrantRevision:'1.2'},
  {expectedLastProviderOrderingKey:'bad\nkey'},
 ])('invalid input rejected before opening DB transaction %j',async invalid=>{
  const c=client();
  await expect(inspect(c,{...INPUT,...invalid})).rejects.toThrow('INVALID');
  expect(c.query).not.toHaveBeenCalled();
 });
});

describe('P4 locked source-event Receipt identity pinned to authenticated cancel set',()=>{
 it('accepts exact original Receipt only as an observation, no mutation',async()=>{
  const c=client();
  const r=await inspect(c,{...INPUT,expectedReceiptId:RECEIPT});
  expect(r.kind).toBe('trusted_provider_order_missing');
  expect(r.grantRevocationAuthorized).toBe(false);
  expect(locked(c).map(x=>x.sql)).toEqual([EVENT_SQL,GRANT_SQL]);
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
 it('a mismatched Receipt cannot reach the exact Grant lock or source evidence query',async()=>{
  const c=client();
  const r=await inspect(c,{
   ...INPUT,expectedReceiptId:'00000000-0000-4000-8000-000000000099',
  });
  expect(r).toMatchObject({
   kind:'exact_cancellation_receipt_scope_changed',
   sourceEventLocked:true,exactReaderGrantLocked:false,
   grantRevocationAuthorized:false,readerT2LockHeld:false,
   entitlementEffectInvoked:false,writesPerformed:false,
  });
  expect(locked(c).map(x=>x.sql)).toEqual([EVENT_SQL]);
  expect(c.calls.some(x=>x.sql===EVIDENCE_SQL)).toBe(false);
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
 it('invalid expected Receipt is rejected before acquiring any lock',async()=>{
  const c=client();
  await expect(inspect(c,{...INPUT,expectedReceiptId:'not-uuid'}))
   .rejects.toThrow('INVALID');
  expect(c.query).not.toHaveBeenCalled();
 });
});
