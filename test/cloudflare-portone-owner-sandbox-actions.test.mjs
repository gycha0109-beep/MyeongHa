// Watchtower-Track: commerce-payment
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
 auth:{kind:'member',verifiedAuthUserId:'11111111-1111-4111-8111-111111111111'},
 origin:'https://example.test',
 stage:true,close:vi.fn(async()=>{}),
 prep:vi.fn(),verify:vi.fn(),
}));
vi.mock('../workers/cloudflare-hyperdrive-subject-pool.mjs',()=>({
 createCloudflareSubjectPoolV1:()=>({close:state.close}),
}));
vi.mock('../workers/cloudflare-auth-db-api.mjs',()=>({
 approvedCloudflareAuthOriginV1:()=>state.origin,
 approvedCloudflareStage5HandoffV1:()=>state.stage,
 approvedCloudflarePostgresTargetV1:()=>true,
 approvedCloudflareSameOriginPostV1:(r,origin)=>r.headers.get('origin')===origin,
 CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1:{'Cache-Control':'no-store'},
}));
vi.mock('../apps/api/src/production-user-data-runtime-config.js',()=>({
 parseProductionUserDataRuntimeConfigV1:()=>({}),
}));
vi.mock('../apps/api/src/production-request-identity-verifier.js',()=>({
 createProductionRequestIdentityVerifierV1:()=>({
  verifyRequestIdentity:async()=>state.auth,
 }),
}));
vi.mock('../apps/api/src/cloudflare-owner-kcp-sandbox-prepare-v1.js',()=>({
 prepareCloudflareOwnerKcpSandboxPurchaseV1:state.prep,
}));
vi.mock('../apps/api/src/cloudflare-owner-portone-sandbox-readonly-verification-v1.js',()=>({
 inspectCloudflareOwnerKcpSandboxPaymentV1:state.verify,
}));
import {tryHandleCloudflareOwnerSandboxActionsV1}
 from '../workers/cloudflare-portone-owner-sandbox-actions.mjs';

const ATTEMPT='22222222-2222-4222-8222-222222222222';
const TOKEN='a'.repeat(32);
const PREP='/api/me/credits/portone/test-prepare';
const VERIFY='/api/me/credits/portone/test-verify';
const rPrep={id:'rewrite.commerce.owner-sandbox-prepare'};
const rVerify={id:'rewrite.commerce.owner-sandbox-verify'};
function req(path,body,origin='https://example.test',method='POST'){
 return new Request('https://example.test'+path,{
  method,headers:{Origin:origin,'Content-Type':'application/json'},
  ...(method==='POST'?{body:JSON.stringify(body)}:{}),
 });
}
beforeEach(()=>{
 vi.clearAllMocks();state.stage=true;state.origin='https://example.test';
 state.auth={kind:'member',verifiedAuthUserId:'11111111-1111-4111-8111-111111111111'};
 state.prep.mockResolvedValue({
  purchaseIntentId:ATTEMPT,paymentAttemptId:ATTEMPT,status:'created',
  providerRequestId:'mha_pa_'+'a'.repeat(32),replayed:false,
  environment:'sandbox',productionCreditsIssued:false,
 });
 state.verify.mockResolvedValue({
  paymentAttemptId:ATTEMPT,providerVerifiedPaid:true,receiptPersisted:false,
  environment:'sandbox',productionCreditsIssued:false,
 });
});
describe('strict Cloudflare Owner sandbox preparation and server receipt APIs',()=>{
 it('returns only server-generated Owner sandbox IDs on exact prepare POST',async()=>{
  const res=await tryHandleCloudflareOwnerSandboxActionsV1(
   req(PREP,{idempotencyToken:TOKEN}),{},rPrep);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect((await res.json()).data).toMatchObject({environment:'sandbox',productionCreditsIssued:false});
  expect(state.prep).toHaveBeenCalledWith(expect.objectContaining({
   idempotencyToken:TOKEN,verifiedEvidence:state.auth,
  }));
  expect(state.verify).not.toHaveBeenCalled();
  expect(state.close).toHaveBeenCalledTimes(1);
 });
 it('only verifies by persisted Attempt UUID with no browser PSP callback trust',async()=>{
  const res=await tryHandleCloudflareOwnerSandboxActionsV1(
   req(VERIFY,{paymentAttemptId:ATTEMPT}),{},rVerify);
  expect(res.status).toBe(200);
  expect((await res.json()).data).toMatchObject({providerVerifiedPaid:true,receiptPersisted:false,productionCreditsIssued:false});
  expect(state.verify).toHaveBeenCalledWith(expect.objectContaining({paymentAttemptId:ATTEMPT}));
  expect(state.prep).not.toHaveBeenCalled();
 });
 it('rejects forged body fields, tampered prices, callback IDs and large inputs',async()=>{
  for(const [url,route,body] of [
   [PREP,rPrep,{}],[PREP,rPrep,{idempotencyToken:TOKEN,amountMinor:1}],
   [PREP,rPrep,{idempotencyToken:'invalid'}],
   [VERIFY,rVerify,{paymentAttemptId:ATTEMPT,receiptId:ATTEMPT}],
   [VERIFY,rVerify,{paymentAttemptId:'bad'}],
   [VERIFY,rVerify,{paymentAttemptId:ATTEMPT,channelKey:'other'}],
   [PREP,rPrep,{idempotencyToken:TOKEN,other:'x'.repeat(350)}],
  ]){
   const res=await tryHandleCloudflareOwnerSandboxActionsV1(req(url,body),{},route);
   expect(res.status).toBe(400);
  }
  expect(state.prep).not.toHaveBeenCalled();
  expect(state.verify).not.toHaveBeenCalled();
 });
 it('rejects wrong origin and method, marker query, unknown route, unauthenticated and Guest',async()=>{
  expect((await tryHandleCloudflareOwnerSandboxActionsV1(
   req(PREP,{idempotencyToken:TOKEN},'https://attacker.invalid'),{},rPrep)).status).toBe(403);
  expect((await tryHandleCloudflareOwnerSandboxActionsV1(req(PREP+'?force=1',{}),{},rPrep)).status).toBe(404);
  expect((await tryHandleCloudflareOwnerSandboxActionsV1(req(PREP,{},'https://example.test','GET'),{},rPrep)).status).toBe(405);
  expect(await tryHandleCloudflareOwnerSandboxActionsV1(req(PREP,{}),{},null)).toBeNull();
  state.auth=null;
  expect((await tryHandleCloudflareOwnerSandboxActionsV1(
   req(PREP,{idempotencyToken:TOKEN}),{},rPrep)).status).toBe(401);
  state.auth={kind:'guest',verifiedGuestTokenHash:'fixture'};
  expect((await tryHandleCloudflareOwnerSandboxActionsV1(
   req(VERIFY,{paymentAttemptId:ATTEMPT}),{},rVerify)).status).toBe(403);
  expect(state.prep).not.toHaveBeenCalled();
  expect(state.verify).not.toHaveBeenCalled();
 });
 it('does not read identity, pool or secrets before explicit approved Cloudflare origin',async()=>{
  state.origin=null;
  expect((await tryHandleCloudflareOwnerSandboxActionsV1(req(PREP,{idempotencyToken:TOKEN}),{},rPrep)).status).toBe(503);
  state.origin='https://example.test';state.stage=false;
  expect((await tryHandleCloudflareOwnerSandboxActionsV1(req(VERIFY,{paymentAttemptId:ATTEMPT}),{},rVerify)).status).toBe(503);
  expect(state.prep).not.toHaveBeenCalled();
  expect(state.verify).not.toHaveBeenCalled();
 });
 it('seals any database/PSP private failure without sensitive egress',async()=>{
  state.verify.mockRejectedValueOnce(Error('private-v2-api-secret'));
  const res=await tryHandleCloudflareOwnerSandboxActionsV1(req(VERIFY,{paymentAttemptId:ATTEMPT}),{},rVerify);
  expect(res.status).toBe(503);
  expect(await res.text()).not.toContain('private-v2-api-secret');
  expect(state.close).toHaveBeenCalledTimes(1);
 });
});
