// Watchtower-Track: commerce-payment
import {createHmac} from 'node:crypto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
 adapter:vi.fn(),subject:vi.fn(),context:vi.fn(),
 verified:vi.fn(),query:vi.fn(),
}));
vi.mock('./cloudflare-portone-v2-test-bindings-v1.js',()=>({
 createCloudflarePortOneOwnerTestVerifierV1:state.adapter,
}));
vi.mock('./postgres-subject-execution.js',()=>({
 executePostgresSubjectTransactionV1:state.subject,
}));
vi.mock('./commerce-payment-verification-context-read.js',()=>({
 loadCommercePaymentVerificationContextV1:state.context,
}));
vi.mock('./commerce-payment-verification-execution.js',()=>({
 executeCommercePaymentVerificationV1:state.verified,
}));
import {
 persistCloudflareOwnerKcpSignedSandboxReceiptV1,
 CLOUDFLARE_OWNER_KCP_SIGNED_SANDBOX_RECEIPT_V1,
} from './cloudflare-owner-kcp-signed-sandbox-receipt-v1.js';

const ATTEMPT='11111111-1111-4111-8111-111111111111';
const INTENT='22222222-2222-4222-8222-222222222222';
const SUBJECT='33333333-3333-4333-8333-333333333333';
const RECEIPT='44444444-4444-4444-8444-444444444444';
const EVENT='55555555-5555-4555-8555-555555555555';
const K2='a'.repeat(96);
const INPUT={
 env:{MYEONGHA_COMMERCE_SANDBOX_RECEIPT_HMAC_K2_SECRET:K2},
 pool:{} as never,
 verifiedEvidence:{kind:'member' as const,verifiedAuthUserId:SUBJECT},
 paymentAttemptId:ATTEMPT,
};
const context={
 provider:'portone_v2',platform:'web',environment:'sandbox',
 providerRequestId:'mha_pa_'+'c'.repeat(32),
 purchaseIntentId:INTENT,expectedExternalProductId:'myeongha-chat-credits-300-v1',
 expectedAmountMinor:1900,expectedCurrency:'KRW',
};
const evidence={
 schemaVersion:'commerce-evidence-v2',provider:'portone_v2',
 platform:'web',environment:'sandbox',
 externalTransactionId:'test-pg-transaction-001',
 externalProductId:'myeongha-chat-credits-300-v1',
 currentState:'active',ownerBinding:{kind:'purchase_intent',purchaseIntentId:INTENT},
 evidenceFingerprint:'hmac-sha256:k1:'+'d'.repeat(64),
 verifierRevision:'portone-v2-test-fixture-v1',
 verifiedAmountMinor:1900,verifiedCurrency:'KRW',
 verifiedAt:'2026-10-28T00:00:00.000Z',
};
beforeEach(()=>{
 vi.resetAllMocks();
 state.adapter.mockResolvedValue({verify:vi.fn()});
 state.context.mockResolvedValue(context);
 state.verified.mockResolvedValue(evidence);
 state.query.mockResolvedValue({rows:[{
  receiptId:RECEIPT,providerEventId:EVENT,replayed:false,
 }]});
 state.subject.mockImplementation(async({execute}:{
  execute:(scope:unknown)=>Promise<unknown>;
 })=>execute({resolvedSubject:{subjectId:SUBJECT,subjectKind:'member'},
  client:{query:state.query}}));
});
describe('Owner KCP TEST signed receipt persistence',()=>{
 it('limits scope to sandbox, never Production grant or broad internal role',()=>{
  expect(CLOUDFLARE_OWNER_KCP_SIGNED_SANDBOX_RECEIPT_V1).toMatchObject({
   requiredEnv:'MYEONGHA_COMMERCE_SANDBOX_RECEIPT_HMAC_K2_SECRET',
   environment:'sandbox',productionCreditsIssued:false,
   publicCheckoutEnabled:false,
  });
 });
 it('persists only signed server-verified PSP PAID with immutable DB Owner',async()=>{
  const result=await persistCloudflareOwnerKcpSignedSandboxReceiptV1(INPUT);
  expect(result).toEqual({
   paymentAttemptId:ATTEMPT,receiptId:RECEIPT,providerEventId:EVENT,
   replayed:false,environment:'sandbox',providerVerifiedPaid:true,
   receiptPersisted:true,productionCreditsIssued:false,
  });
  const query=state.query.mock.calls[0];
  expect(query?.[0]).toContain('cmd_persist_owner_kcp_signed_sandbox_receipt_v1');
  const [subject,attempt,payload,signature]=query?.[1] as string[];
  if(typeof payload!=='string'||typeof signature!=='string')
   throw new Error('Signed receipt query did not include canonical attestation.');
  expect(subject).toBe(SUBJECT);
  expect(attempt).toBe(ATTEMPT);
  expect(JSON.parse(payload)).toMatchObject({
   subjectId:SUBJECT,paymentAttemptId:ATTEMPT,
   providerRequestId:context.providerRequestId,evidence,
  });
  expect(signature).toBe(createHmac('sha256',K2).update(payload,'utf8').digest('hex'));
  expect(JSON.stringify(result)).not.toContain(K2);
 });
 it('rejects missing K2, non-Owner evidence or malformed original Attempt before PSP',async()=>{
  for(const bad of [
   {...INPUT,env:{}},
   {...INPUT,env:{MYEONGHA_COMMERCE_SANDBOX_RECEIPT_HMAC_K2_SECRET:'short'}},
   {...INPUT,verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'guest'}},
   {...INPUT,paymentAttemptId:'bad'},
  ]){
   await expect(persistCloudflareOwnerKcpSignedSandboxReceiptV1(
    bad as typeof INPUT,
   )).rejects.toThrow('Owner KCP signed sandbox receipt unavailable.');
  }
  expect(state.adapter).not.toHaveBeenCalled();
  expect(state.subject).not.toHaveBeenCalled();
 });
 it('blocks Production, changed offer, excessive paymentId and unverified currency',async()=>{
  for(const mod of [
   {environment:'production'},{provider:'wrong'},{platform:'ios'},
   {expectedAmountMinor:1},{expectedCurrency:'USD'},
   {expectedExternalProductId:'another-product'},
   {providerRequestId:'mha_pa_'+'b'.repeat(64)},
  ]){
   state.context.mockResolvedValueOnce({...context,...mod});
   await expect(persistCloudflareOwnerKcpSignedSandboxReceiptV1(INPUT))
    .rejects.toThrow('Owner KCP signed sandbox receipt unavailable.');
  }
  expect(state.verified).not.toHaveBeenCalled();
  expect(state.query).not.toHaveBeenCalled();
 });
 it('fails closed on altered/unverified PSP evidence before DB writes',async()=>{
  for(const mod of [
   {environment:'production'},{currentState:'refunded'},
   {verifiedAmountMinor:100},{verifiedCurrency:'USD'},
   {ownerBinding:{kind:'purchase_intent',purchaseIntentId:ATTEMPT}},
  ]){
   state.verified.mockResolvedValueOnce({...evidence,...mod});
   await expect(persistCloudflareOwnerKcpSignedSandboxReceiptV1(INPUT))
    .rejects.toThrow('Owner KCP signed sandbox receipt unavailable.');
  }
  expect(state.query).not.toHaveBeenCalled();
 });
 it('records only allowlisted PortOne failure stage and HTTP class',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{
   const providerError=Object.assign(new Error('secret-provider-body'),{
    code:'HTTP_4XX',httpStatus:404,
   });
   state.verified.mockRejectedValueOnce(providerError);
   await expect(persistCloudflareOwnerKcpSignedSandboxReceiptV1(INPUT))
    .rejects.toBe(providerError);
   const logs=warn.mock.calls.filter(call=>call[0]==='MYEONGHA_OWNER_KCP_VERIFY_DIAGNOSTIC');
   expect(logs).toHaveLength(1);
   expect(JSON.parse(logs[0]?.[1] as string)).toEqual({
    stage:'provider_lookup',code:'HTTP_4XX',httpStatus:404,
   });
   expect(JSON.stringify(logs)).not.toContain('secret-provider-body');
   expect(state.query).not.toHaveBeenCalled();
  }finally{warn.mockRestore();}
 });
 it('isolates signed receipt DB constraint and never logs private HMAC material',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{
   const failure=Object.assign(new Error('private-DB-signature-key'),{
    code:'42501',constraint:'owner_sandbox_receipt_mac_mismatch',
   });
   state.query.mockRejectedValueOnce(failure);
   await expect(persistCloudflareOwnerKcpSignedSandboxReceiptV1(INPUT))
    .rejects.toBe(failure);
   const logs=warn.mock.calls.filter(call=>call[0]==='MYEONGHA_OWNER_KCP_VERIFY_DIAGNOSTIC');
   expect(logs).toHaveLength(1);
   expect(JSON.parse(logs[0]?.[1] as string)).toEqual({
    stage:'receipt_write',code:'42501',
    constraint:'owner_sandbox_receipt_mac_mismatch',
   });
   expect(JSON.stringify(logs)).not.toContain('private-DB-signature-key');
   expect(JSON.stringify(logs)).not.toContain(K2);
   warn.mockClear();
   state.query.mockRejectedValueOnce(Object.assign(new Error('DB-private'),{
    code:'EXPOSE_PRIVATE_KEY',constraint:'secrets_key_value',
   }));
   await expect(persistCloudflareOwnerKcpSignedSandboxReceiptV1(INPUT))
    .rejects.toThrow();
   const hidden=warn.mock.calls.filter(call=>call[0]==='MYEONGHA_OWNER_KCP_VERIFY_DIAGNOSTIC');
   expect(JSON.parse(hidden[0]?.[1] as string)).toEqual({
    stage:'receipt_write',code:'UNCLASSIFIED',
   });
  }finally{warn.mockRestore();}
 });
 it('reports idempotent replay only when recorded in the DB',async()=>{
  state.query.mockResolvedValueOnce({rows:[{
   receiptId:RECEIPT,providerEventId:EVENT,replayed:true,
  }]});
  await expect(persistCloudflareOwnerKcpSignedSandboxReceiptV1(INPUT))
   .resolves.toMatchObject({replayed:true,receiptPersisted:true,
    productionCreditsIssued:false});
 });
});
