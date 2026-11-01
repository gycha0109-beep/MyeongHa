// Watchtower-Track: commerce-payment
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';

const state=vi.hoisted(()=>({
  evidence:{kind:'member',verifiedAuthUserId:'11111111-1111-4111-8111-111111111111'} as VerifiedSubjectIdentityEvidenceV1|null,
  ack:vi.fn(async()=>({kind:'settled',creditsCharged:10})),
  binding:vi.fn(async()=>({rows:[]})),
  privateTransaction:vi.fn(async({execute}:{execute:(scope:unknown)=>Promise<unknown>})=>
    execute({client:{query:state.binding}})),
  transaction:vi.fn(async({execute}:{execute:(scope:unknown)=>Promise<unknown>})=>
    execute({client:{},resolvedSubject:{
      subjectId:'22222222-2222-4222-8222-222222222222',subjectKind:'member',
    }})),
}));

vi.mock('./postgres-subject-execution.js',()=>({
  executePostgresSubjectTransactionV1:state.transaction,
}));
vi.mock('./postgres-commerce-internal-execution.js',()=>({
  executePostgresCommerceInternalTransactionV1:state.privateTransaction,
}));
vi.mock('./commerce-chat-credit-delivery-ack-candidate-v1.js',()=>({
  acknowledgeDeliveredChatCreditCandidateV1:state.ack,
}));
import {handleChatCreditDeliveryAckCandidateV1,CHAT_CREDIT_DELIVERY_ACK_HTTP_CANDIDATE_V1}
  from './commerce-chat-credit-delivery-ack-http-candidate-v1.js';

const UUIDS={
  threadId:'33333333-3333-4333-8333-333333333333',
  clientTurnId:'44444444-4444-4444-8444-444444444444',
  reservationId:'55555555-5555-4555-8555-555555555555',
  committedTurnId:'66666666-6666-4666-8666-666666666666',
  assistantMessageId:'77777777-7777-4777-8777-777777777777',
};
const URL='https://myeongha.test/api/chat/credit-delivery/ack';
function request(body:unknown=UUIDS,url=URL,method='POST'):Request{
  return new Request(url,{method,headers:{'content-type':'application/json'},
    ...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
const ordinaryPool={connect:()=>{throw Error('unmocked ordinary pool');}};
const privatePool={connect:()=>{throw Error('unmocked private pool');}};
const input=(r:Request)=>({
  request:r,requestId:'req-1',serverTime:'2026-10-27T12:00:00Z',
  identityEvidenceVerifier:{verifyRequestIdentity:async()=>state.evidence},
  pool:ordinaryPool as never,
  privateCreditPool:privatePool as never,
});
afterEach(()=>{
  state.evidence={kind:'member',verifiedAuthUserId:'11111111-1111-4111-8111-111111111111'};
  state.ack.mockClear();state.transaction.mockClear();
  state.privateTransaction.mockClear();state.binding.mockClear();
  state.ack.mockResolvedValue({kind:'settled',creditsCharged:10});
});
describe('unmounted credit ACK HTTP candidate',()=>{
 it('binds only verified Member Subject, exact ids and settled database outcome',async()=>{
   const res=await handleChatCreditDeliveryAckCandidateV1(input(request()));
   expect(res.status).toBe(200);
   expect(res.headers.get('Cache-Control')).toBe('no-store');
   expect((await res.json()).data).toMatchObject({kind:'settled',creditsCharged:10});
   expect(state.ack).toHaveBeenCalledWith(expect.objectContaining({
     canonicalSubjectId:'22222222-2222-4222-8222-222222222222',
     canonicalSubjectKind:'member',creditReservationId:UUIDS.reservationId,
     committedTurnId:UUIDS.committedTurnId,
   }));
   expect(state.transaction).toHaveBeenCalledWith(expect.objectContaining({pool:ordinaryPool}));
   expect(state.privateTransaction).toHaveBeenCalledWith(expect.objectContaining({pool:privatePool}));
   expect(state.binding).toHaveBeenCalledWith(
     "select pg_catalog.set_config('myeongha.subject_id',$1::text,true)",
     ['22222222-2222-4222-8222-222222222222'],
   );
   expect(CHAT_CREDIT_DELIVERY_ACK_HTTP_CANDIDATE_V1.productionMounted).toBe(false);
 });
 it('rejects missing Member and guest before database access',async()=>{
   state.evidence=null;
   expect((await handleChatCreditDeliveryAckCandidateV1(input(request()))).status).toBe(401);
   state.evidence={kind:'guest',verifiedGuestTokenHash:'guest-verified-hash'};
   expect((await handleChatCreditDeliveryAckCandidateV1(input(request()))).status).toBe(403);
   expect(state.transaction).not.toHaveBeenCalled();
   expect(state.privateTransaction).not.toHaveBeenCalled();
 });
 it('rejects tampered identifiers, extra fields, wrong URL or method',async()=>{
   for(const body of [{...UUIDS,clientTurnId:'bad'},{...UUIDS,subjectId:'fake'}]){
     expect((await handleChatCreditDeliveryAckCandidateV1(input(request(body)))).status).toBe(400);
   }
   expect((await handleChatCreditDeliveryAckCandidateV1(input(request(UUIDS,URL+'?subject=fake')))).status).toBe(404);
   expect((await handleChatCreditDeliveryAckCandidateV1(input(request(UUIDS,URL,'GET')))).status).toBe(405);
   expect(state.transaction).not.toHaveBeenCalled();
 });
 it('fails closed on absent or shared private executor pool',async()=>{
   const ordinary=input(request());
   for(const attempted of [
     {...ordinary,privateCreditPool:undefined as never},
     {...ordinary,privateCreditPool:ordinary.pool},
   ]){
     const res=await handleChatCreditDeliveryAckCandidateV1(attempted);
     expect(res.status).toBe(503);
   }
   expect(state.transaction).not.toHaveBeenCalled();
   expect(state.privateTransaction).not.toHaveBeenCalled();
   expect(state.ack).not.toHaveBeenCalled();
 });
 it('does not claim delivery success when the private database authority rejects',async()=>{
   state.ack.mockRejectedValueOnce(Error('ledger unavailable'));
   const res=await handleChatCreditDeliveryAckCandidateV1(input(request()));
   expect(res.status).toBe(503);
   expect((await res.json()).error.code).toBe('CREDIT_AUTHORITY_UNAVAILABLE');
 });
});
