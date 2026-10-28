// Watchtower-Track: commerce-payment
import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({auth:{kind:'member'},stage:true,close:vi.fn(),fulfill:vi.fn()}));
vi.mock('../workers/cloudflare-hyperdrive-subject-pool.mjs',()=>({createCloudflareSubjectPoolV1:()=>({close:state.close})}));
vi.mock('../workers/cloudflare-auth-db-api.mjs',()=>({
 approvedCloudflareAuthOriginV1:()=> 'https://example.test',approvedCloudflareStage5HandoffV1:()=>state.stage,
 approvedCloudflarePostgresTargetV1:()=>true,
 approvedCloudflareSameOriginPostV1:r=>r.headers.get('origin')==='https://example.test',
 CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1:{'Cache-Control':'no-store'},
}));
vi.mock('../apps/api/src/production-user-data-runtime-config.js',()=>({parseProductionUserDataRuntimeConfigV1:()=>({})}));
vi.mock('../apps/api/src/production-request-identity-verifier.js',()=>({createProductionRequestIdentityVerifierV1:()=>({verifyRequestIdentity:async()=>state.auth})}));
vi.mock('../apps/api/src/postgres-subject-execution.js',()=>({executePostgresSubjectTransactionV1:async x=>x.execute({resolvedSubject:{subjectId:'canonical-owner',subjectKind:'member'},client:{}})}));
vi.mock('../apps/api/src/commerce-credit-receipt-fulfillment-v1.js',()=>({fulfillCurrentMemberCreditReceiptV1:state.fulfill}));
import {tryHandleCloudflareCreditReceiptFulfillmentV1 as handle} from '../workers/cloudflare-credit-receipt-fulfillment.mjs';
const ID='11111111-1111-4111-8111-111111111111';
const route={id:'rewrite.commerce.credit-receipt-fulfill'};
function req(body={receiptId:ID},origin='https://example.test',suffix='',method='POST'){
 return new Request('https://example.test/api/me/credits/portone/fulfill'+suffix,{method,
  headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
beforeEach(()=>{vi.clearAllMocks();state.auth={kind:'member'};state.stage=true;
 state.fulfill.mockResolvedValue({receiptId:ID,outcome:'issued',creditsIssued:300});});
describe('receipt-only credit fulfillment HTTP boundary',()=>{
 it('fulfills only through current authenticated subject, without starting a provider request',async()=>{
  const network=vi.spyOn(globalThis,'fetch');
  try{const r=await handle(req(),{},route);expect(r.status).toBe(200);
   expect(state.fulfill).toHaveBeenCalledWith(expect.objectContaining({receiptId:ID,
    scope:expect.objectContaining({resolvedSubject:{subjectId:'canonical-owner',subjectKind:'member'}})}));
   expect(network).not.toHaveBeenCalled();expect(state.close).toHaveBeenCalledOnce();
  }finally{network.mockRestore();}
 });
 it.each([[null,401],[{kind:'guest'},403]])('denies invalid identity %j',async(auth,status)=>{
  state.auth=auth;expect((await handle(req(),{},route)).status).toBe(status);
  expect(state.fulfill).not.toHaveBeenCalled();
 });
 it.each([{receiptId:ID,amount:1900},{receiptId:ID,environment:'production'},
  {receiptId:ID,subjectId:ID},{receiptId:'bad'},{receiptId:'x'.repeat(500)}])('rejects forged caller authority %j',async body=>{
  expect((await handle(req(body),{},route)).status).toBe(400);expect(state.fulfill).not.toHaveBeenCalled();
 });
 it('denies cross-origin, query aliases and wrong methods',async()=>{
  expect((await handle(req(undefined,'https://evil.test'),{},route)).status).toBe(403);
  expect((await handle(req(undefined,undefined,'?mode=sandbox'),{},route)).status).toBe(404);
  expect((await handle(req(undefined,undefined,'','GET'),{},route)).status).toBe(405);
  expect(state.fulfill).not.toHaveBeenCalled();
 });
 it('fails closed and hides DB diagnostics when the RPC is absent or denies the receipt',async()=>{
  state.fulfill.mockRejectedValueOnce(Error('private database details'));
  const r=await handle(req(),{},route);expect(r.status).toBe(503);
  expect(await r.text()).not.toContain('private');expect(state.close).toHaveBeenCalledOnce();
 });
});
