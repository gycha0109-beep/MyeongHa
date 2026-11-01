import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 COMMERCE_READER_DELIVERY_TRANSPORT_CAPTURE_V1 as POLICY,
 PREPARE_SQL_V1,ACK_SQL_V1,
 prepareExactReaderDeliveryTransportCandidateV1 as prepare,
 acknowledgeExactReaderDeliveryTransportCandidateV1 as acknowledge,
} from '../scripts/operations/commerce-reader-delivery-transport-capture-v1.mjs';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const scope={
 deliveryAttemptId:id(1),purchaseIntentId:id(2),subjectId:id(3),
 entitlementGrantId:id(4),officialReadingId:id(5),
 readerCharacterId:'seyeon',readerContentBundleId:id(6),
 protectedBodyId:id(7),safeMessageId:id(8),
 ackChallengeHmac:'hmac-sha256:k1:'+'a'.repeat(64),
};
const time='2026-11-01T08:00:00.000Z';
const successDb=()=>({
 query:vi.fn(async(sql)=>{
  if(sql===PREPARE_SQL_V1)return {rows:[{deliveryAttemptId:id(1),responsePreparedAt:time}]};
  if(sql===ACK_SQL_V1)return {rows:[{clientAcknowledgedAt:time}]};
  throw Error('unexpected query');
 }),
});
const safe=result=>{
 expect(result).toMatchObject({
  consumerDeliveryProven:false,humanReadProven:false,
  legalDecisionAuthorized:false,providerRefundAuthorized:false,
  grantRevocationAuthorized:false,
 });
 const serialized=JSON.stringify(result);
 for(const secret of [scope.subjectId,scope.purchaseIntentId,scope.entitlementGrantId,
  scope.officialReadingId,scope.ackChallengeHmac,scope.protectedBodyId])
  expect(serialized).not.toContain(secret);
};

describe('paid Reader delivery transport candidate',()=>{
 it('does not mount public or Production access or infer legal delivery',()=>{
  expect(POLICY).toMatchObject({
   productionMounted:false,publicRouteMounted:false,
   legalDeliveryAuthority:false,providerRefundEnabled:false,
   entitlementEffectEnabled:false,
  });
 });
 it('prepares only the exact paid Reader request using parameterized DB authority',async()=>{
  const db=successDb();
  const result=await prepare(db,scope);
  expect(db.query).toHaveBeenCalledWith(PREPARE_SQL_V1,[
   scope.deliveryAttemptId,scope.purchaseIntentId,scope.subjectId,
   scope.entitlementGrantId,scope.officialReadingId,scope.readerCharacterId,
   scope.readerContentBundleId,scope.protectedBodyId,scope.safeMessageId,
   scope.ackChallengeHmac,
  ]);
  expect(result.stage).toBe('response_prepared_not_consumer_delivery');
  expect(result.responsePreparedAt).toBe(time);
  safe(result);
 });
 it('records client ACK separately; not a human read or delivery completion',async()=>{
  const db=successDb();
  const result=await acknowledge(db,{
   deliveryAttemptId:scope.deliveryAttemptId,
   subjectId:scope.subjectId,ackChallengeHmac:scope.ackChallengeHmac,
  });
  expect(db.query).toHaveBeenCalledWith(ACK_SQL_V1,[
   scope.deliveryAttemptId,scope.subjectId,scope.ackChallengeHmac,
  ]);
  expect(result.stage).toBe('client_acknowledged_not_human_read');
  expect(result.clientAcknowledgedAt).toBe(time);
  safe(result);
 });
 it('rejects input identity/secret shapes without touching DB',async()=>{
  for(const patch of [
   {subjectId:id(9)+' bad'},
   {readerCharacterId:'seyeon\n'},
   {ackChallengeHmac:'a'.repeat(64)},
   {purchaseIntentId:null},
   {protectedBodyId:undefined},
  ]){
   const db=successDb();
   await expect(prepare(db,{...scope,...patch})).rejects.toThrow();
   expect(db.query).not.toHaveBeenCalled();
  }
  const db=successDb();
  await expect(acknowledge(db,{
   deliveryAttemptId:id(1),subjectId:id(3),ackChallengeHmac:'raw-secret',
  })).rejects.toThrow();
  expect(db.query).not.toHaveBeenCalled();
 });
 it('fails closed on wrong write result or malformed timestamps',async()=>{
  for(const rows of [[],[{deliveryAttemptId:id(20),responsePreparedAt:time}],
    [{deliveryAttemptId:id(1),responsePreparedAt:'no date'}]]){
   await expect(prepare({query:vi.fn(async()=>({rows}))},scope)).rejects.toThrow();
  }
  await expect(acknowledge({query:vi.fn(async()=>({rows:[]}))},{
   deliveryAttemptId:id(1),subjectId:id(3),ackChallengeHmac:scope.ackChallengeHmac,
  })).rejects.toThrow();
 });
 it('uses a non-deployed exact-grant DB write with replay/ACK equality and revoked-role restrictions',()=>{
  const sql=readFileSync(new URL(
   '../docs/operations/candidates/commerce_reader_delivery_transport_capture_v1.sql',
   import.meta.url),'utf8');
  expect(sql).toContain('standard_reading_reader_access_grants a');
  expect(sql).toContain("pi.status='verified'");
  expect(sql).toContain("g.status='active'");
  expect(sql).toContain('a.reader_content_bundle_id=p_reader_content_bundle_id');
  expect(sql).toContain('a.entitlement_grant_id=p_entitlement_grant_id');
  expect(sql).toContain('a.official_reading_id=p_official_reading_id');
  expect(sql).toContain('on conflict (delivery_attempt_id) do nothing');
  expect(sql).toContain('p_challenge_hmac is distinct from v_preparation.ack_challenge_hmac');
  expect(sql).toContain('reader delivery entitlement no longer active');
  expect(sql).toContain('revoke all on table public.commerce_reader_delivery_preparations_v1 from public');
  expect(sql).toContain('revoke all on function public.internal_ack_reader_delivery_transport_v1');
  expect(sql).not.toContain('create policy public_delivery');
 });
});
