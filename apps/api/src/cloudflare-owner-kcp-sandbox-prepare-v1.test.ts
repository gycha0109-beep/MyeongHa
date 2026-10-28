// Watchtower-Track: commerce-payment
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({owner:vi.fn(),execute:vi.fn(),query:vi.fn()}));
vi.mock('./myeongha-owner-admin-access-v1.js',()=>({
 readOwnerAdminAccessV1:state.owner,
}));
vi.mock('./postgres-subject-execution.js',()=>({
 executePostgresSubjectTransactionV1:state.execute,
}));
import {prepareCloudflareOwnerKcpSandboxPurchaseV1,
  CLOUDFLARE_OWNER_KCP_SANDBOX_PREPARE_V1}
 from './cloudflare-owner-kcp-sandbox-prepare-v1.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const TOKEN='a'.repeat(32);
const IDENTITY={kind:'member' as const,verifiedAuthUserId:'22222222-2222-4222-8222-222222222222'};
const INPUT={pool:{} as never,verifiedEvidence:IDENTITY,idempotencyToken:TOKEN};
let canonical:Record<string,unknown>;
beforeEach(()=>{
 vi.resetAllMocks();
 state.owner.mockResolvedValue({
   verifiedSubjectId:SUBJECT,isOwnerAdmin:true,
   chatCreditExempt:true,sandboxCheckoutAllowed:true,
 });
 state.query.mockImplementation(async(_sql:string,values:readonly unknown[])=>({
   rows:[{purchaseIntentId:values[1],paymentAttemptId:values[2],
     providerRequestId:values[4],attemptStatus:'created',replayed:false}],
 }));
 state.execute.mockImplementation(async({execute}:{execute:(scope:unknown)=>Promise<unknown>})=>
   execute({client:{query:state.query},resolvedSubject:{subjectKind:'member',subjectId:SUBJECT}}));
 canonical={};
});
describe('Owner-only KCP sandbox Purchase Intent and Payment Attempt seed',()=>{
 it('does not turn on Production credits or general paid checkout',()=>{
  expect(CLOUDFLARE_OWNER_KCP_SANDBOX_PREPARE_V1).toMatchObject({
   provider:'portone_v2',environment:'sandbox',amountMinor:1900,
   credits:300,productionCheckoutEnabled:false,productionCreditMintEnabled:false,
  });
 });
 it('derives stable internal UUIDs, idempotency key and KCP-safe 39-character paymentId',async()=>{
  const result=await prepareCloudflareOwnerKcpSandboxPurchaseV1(INPUT);
  const replay=await prepareCloudflareOwnerKcpSandboxPurchaseV1(INPUT);
  expect(result).toEqual(replay);
  expect(result.status).toBe('created');
  expect(result.productionCreditsIssued).toBe(false);
  expect(result.providerRequestId).toMatch(/^mha_pa_[a-f0-9]{32}$/);
  expect(result.providerRequestId).toHaveLength(39);
  expect(result.paymentAttemptId).toMatch(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
  expect(state.query.mock.calls[0]?.[0])
    .toContain('public.cmd_prepare_owner_portone_sandbox_credit_v1(');
  expect(state.query.mock.calls[0]?.[1][3]).toMatch(/^kcp_sbx_[a-f0-9]{32}$/);
  expect(state.query.mock.calls[0]?.[1][0]).toBe(SUBJECT);
  expect(JSON.stringify(result)).not.toContain(TOKEN);
 });
 it('rejects browser-supplied subject/offer/amount and malformed retry token',async()=>{
  for(const token of [undefined,'not-valid','b'.repeat(31),'z'.repeat(32),{}]){
   await expect(prepareCloudflareOwnerKcpSandboxPurchaseV1({
     ...INPUT,idempotencyToken:token,
   })).rejects.toThrow('Owner KCP sandbox purchase preparation unavailable.');
  }
  await expect(prepareCloudflareOwnerKcpSandboxPurchaseV1({
   ...INPUT,verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'fixture-guest'},
  })).rejects.toThrow();
  expect(state.owner).not.toHaveBeenCalled();
  expect(state.execute).not.toHaveBeenCalled();
 });
 it('fails closed when canonical Owner ACL or Subject provenance fails',async()=>{
  state.owner.mockResolvedValueOnce({isOwnerAdmin:false,sandboxCheckoutAllowed:false});
  await expect(prepareCloudflareOwnerKcpSandboxPurchaseV1(INPUT)).rejects.toThrow();
  state.execute.mockImplementationOnce(async({execute}:{execute:(scope:unknown)=>Promise<unknown>})=>
   execute({client:{query:state.query},resolvedSubject:{
     subjectKind:'member',subjectId:'33333333-3333-4333-8333-333333333333',
   }}));
  await expect(prepareCloudflareOwnerKcpSandboxPurchaseV1(INPUT)).rejects.toThrow();
 });
 it('rejects altered DB response identifiers, Production status and duplicate rows',async()=>{
  const corrupt=[
    {paymentAttemptId:SUBJECT},
    {providerRequestId:'x'.repeat(100)},
    {attemptStatus:'handed_off'},
    {replayed:'yes'},
  ];
  for(const bad of corrupt){
    state.query.mockImplementationOnce(async(_sql:string,values:readonly unknown[])=>({
      rows:[{purchaseIntentId:values[1],paymentAttemptId:values[2],
        providerRequestId:values[4],attemptStatus:'created',replayed:false,...bad}],
    }));
    await expect(prepareCloudflareOwnerKcpSandboxPurchaseV1(INPUT)).rejects.toThrow();
  }
  state.query.mockImplementationOnce(async(_sql:string,values:readonly unknown[])=>({
    rows:[{purchaseIntentId:values[1]}, {purchaseIntentId:values[1]}],
  }));
  await expect(prepareCloudflareOwnerKcpSandboxPurchaseV1(INPUT)).rejects.toThrow();
 });
});
