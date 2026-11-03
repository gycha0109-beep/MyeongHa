import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_EXACT_READER_SOURCE_NOT_DELIVERY_V1 as CONFIG,
 COMMERCE_EXACT_READER_SOURCE_SNAPSHOT_SQL_V1 as SQL,
 inspectExactReaderPrivateSourceNotDeliveryV1 as inspect,
} from '../scripts/operations/commerce-exact-reader-source-not-delivery-v1.mjs';

const READING='00000000-0000-4000-8000-000000000007';
const SUBJECT='00000000-0000-4000-8000-000000000004';
const BUNDLE='00000000-0000-4000-8000-000000000055';
const GRANT='00000000-0000-4000-8000-000000000088';
const INTENT='00000000-0000-4000-8000-000000000089';
const ATTEMPT='00000000-0000-4000-8000-000000000066';
const INPUT={
 officialReadingId:READING,subjectId:SUBJECT,readerCharacterId:'seyeon',
 entitlementGrantId:GRANT,purchaseIntentId:INTENT,
 readerContentBundleId:BUNDLE,
};
const COMMITTED={
 officialReadingId:READING,subjectId:SUBJECT,readerCharacterId:'seyeon',
 entitlementGrantId:GRANT,purchaseIntentId:INTENT,
 readerContentBundleId:BUNDLE,executionStatus:'succeeded',
 committedExecutionAttemptId:ATTEMPT,hasCompletedAt:true,
 responseHash:'sha256:v1:'+'a'.repeat(64),
 internalResponseState:'delivered',
};
const PENDING={
 ...COMMITTED,executionStatus:'running',
 committedExecutionAttemptId:null,hasCompletedAt:false,responseHash:null,
 internalResponseState:null,
};
const db=(rows=[COMMITTED])=>{
 const query=vi.fn(async(sql,params)=>{
  if(sql!==SQL)throw Error('UNEXPECTED_OPERATION');
  expect(params).toEqual([READING,SUBJECT,'seyeon',GRANT,INTENT,BUNDLE]);
  return {rows};
 });
 return {query};
};
function safe(v){
 expect(v).toMatchObject({
  durableConsumerDeliveryProven:false,consumerDeliveryEventObserved:false,
  legalRefundAuthority:false,grantRevocationAuthorized:false,
  providerRefundAuthorized:false,writesPerformed:false,
 });
 for(const s of [READING,SUBJECT,BUNDLE,ATTEMPT,GRANT,INTENT,'sha256:v1:'])
  expect(JSON.stringify(v)).not.toContain(s);
}

describe('P4 exact Reader private official source is NOT consumer content delivery',()=>{
 it('is a read-only exact official Reading + Reader identity probe without notice/grant mutation',()=>{
  expect(CONFIG).toMatchObject({
   readOnly:true,productionMounted:false,publicRouteMounted:false,
   authorizedDeliveryEvidenceSource:false,createsDeliveryReceipt:false,
  });
  expect(SQL).toContain('join public.standard_reading_reader_interpretations interpretation');
  expect(SQL).toContain('from public.standard_reading_official_bindings binding');
  expect(SQL).toContain('binding.reading_id=$1::uuid');
  expect(SQL).toContain('binding.subject_id=$2::uuid');
  expect(SQL).toContain('interpretation.reader_character_id=$3::text');
  expect(SQL).toContain('paid.entitlement_grant_id=$4::uuid');
  expect(SQL).toContain('paid.purchase_intent_id=$5::uuid');
  expect(SQL).toContain('paid.reader_content_bundle_id=$6::uuid');
  expect(SQL).toContain('refs.execution_attempt_id=reading.committed_execution_attempt_id');
  expect(SQL).toContain('limit 2');
  expect(SQL).not.toMatch(/\b(insert|update|delete|commit|for update)\b/iu);
  expect(SQL).not.toContain('digital_reading_checkout_notice_presentations_v1');
 });
 it('classifies committed official source but not consumer delivery despite internal delivered state',async()=>{
  for(const response of ['delivered','delivered_with_fallback']){
   const r=await inspect(db([{...COMMITTED,internalResponseState:response}]),INPUT);
   expect(r.kind).toBe('official_source_committed_not_consumer_delivery');
   expect(r.privateReaderInterpretationIdentityObserved).toBe(true);
   expect(r.officialSourceCommittedButNotDelivered).toBe(true);
   safe(r);
  }
 });
 it('a pending, privately rendering or uncommitted reading is not consumer delivery',async()=>{
  for(const status of ['pending','running','failed']){
   const r=await inspect(db([{...PENDING,executionStatus:status}]),INPUT);
   expect(r.kind).toBe('private_source_not_committed');
   expect(r.officialSourceCommittedButNotDelivered).toBe(false);
   safe(r);
  }
 });
 it('no source row is not evidence that a customer could not submit a withdrawal',async()=>{
  const r=await inspect(db([]),INPUT);
  expect(r.kind).toBe('not_observed');
  expect(r.privateReaderInterpretationIdentityObserved).toBe(false);
  safe(r);
 });
 it.each([
  ['wrong original Reading',{officialReadingId:'00000000-0000-4000-8000-000000000099'}],
  ['wrong Subject',{subjectId:'00000000-0000-4000-8000-000000000099'}],
  ['wrong Reader',{readerCharacterId:'other'}],
  ['wrong immutable Reader bundle',{readerContentBundleId:'00000000-0000-4000-8000-000000000099'}],
  ['succeeded but no committed attempt',{committedExecutionAttemptId:null}],
  ['succeeded but no completed timestamp',{hasCompletedAt:false}],
  ['succeeded but no official source response',{responseHash:null}],
  ['succeeded but unknown internal state',{internalResponseState:'COMMITTED'}],
  ['not succeeded yet has a committed attempt',{executionStatus:'running'}],
  ['malformed response state',{internalResponseState:null}],
 ])('fails closed on %s',async(_label,change)=>{
  const r=await inspect(db([{...COMMITTED,...change}]),INPUT);
  expect(r.kind).toBe('inconsistent_private_source');
  safe(r);
 });
 it('two interpretations or ambiguous joins cannot be treated as source evidence',async()=>{
  const r=await inspect(db([COMMITTED,COMMITTED]),INPUT);
  expect(r.kind).toBe('inconsistent_private_source');
  safe(r);
 });
 it('rejects invalid identifiers before any DB query',async()=>{
  for(const changes of [
   {officialReadingId:'invalid'},{subjectId:'invalid'},
   {readerContentBundleId:'invalid'},{readerCharacterId:'x\nchanged'},
  ]){
   const client=db();
   await expect(inspect(client,{...INPUT,...changes})).rejects.toThrow('INVALID_');
   expect(client.query).not.toHaveBeenCalled();
  }
 });
 it('does not swallow failed DB reads as a fabricated source observation',async()=>{
  await expect(inspect({query:vi.fn(async()=>{throw Error('PRIVATE_DB_FAILURE')})},INPUT))
   .rejects.toThrow('PRIVATE_DB_FAILURE');
 });
});
