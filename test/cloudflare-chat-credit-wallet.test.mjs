import {describe,it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({
  poolClose:vi.fn(async()=>{}),
  poolCreate:vi.fn(),
  handle:vi.fn(async()=>Response.json({ok:true,data:{
    availableCredits:50,totalCredits:50,requiredCredits:10,
    operatorFreeChat:true,operatorSandboxCheckout:true,
  }},{headers:{'Cache-Control':'no-store'}})),
}));
vi.mock('../workers/cloudflare-auth-db-api.mjs',()=>({
  approvedCloudflareAuthOriginV1:()=> 'https://myeongha.test',
  approvedCloudflareStage5HandoffV1:()=>true,
  approvedCloudflarePostgresTargetV1:()=>true,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1:{'Cache-Control':'no-store'},
}));
vi.mock('../workers/cloudflare-hyperdrive-subject-pool.mjs',()=>({
  createCloudflareSubjectPoolV1:state.poolCreate.mockImplementation(()=>({close:state.poolClose})),
}));
vi.mock('../apps/api/src/production-user-data-runtime-config.js',()=>({
  parseProductionUserDataRuntimeConfigV1:()=>({approved:true}),
}));
vi.mock('../apps/api/src/production-chat-credit-wallet-runtime-v1.js',()=>({
  createProductionChatCreditWalletRuntimeV1:()=>({
    handleRequest:state.handle,close:async()=>{},
  }),
}));
import {tryHandleCloudflareMemberCreditWalletV1}
  from '../workers/cloudflare-chat-credit-wallet.mjs';

beforeEach(()=>{state.poolClose.mockClear();state.poolCreate.mockClear();state.handle.mockClear();});
const route={id:'rewrite.chat.credit-wallet'};
describe('read-only Cloudflare credit wallet ingress',()=>{
 it('keeps unrelated requests outside its boundary',async()=>{
  const response=await tryHandleCloudflareMemberCreditWalletV1(
    new Request('https://myeongha.test/api/me'),{},route);
  expect(response?.status).toBe(404);
  expect(state.poolCreate).not.toHaveBeenCalled();
 });
 it('rejects writes before any database operation',async()=>{
  const result=await tryHandleCloudflareMemberCreditWalletV1(
    new Request('https://myeongha.test/api/me/credits',{method:'POST'}),{},route);
  expect(result.status).toBe(405);
  expect(state.poolCreate).not.toHaveBeenCalled();
 });
 it('serves only authenticated Member wallet contract via fresh private pool',async()=>{
  const request=new Request('https://myeongha.test/api/me/credits');
  const result=await tryHandleCloudflareMemberCreditWalletV1(request,{},route);
  expect(result.status).toBe(200);
  expect(result.headers.get('Cache-Control')).toBe('no-store');
  expect(state.poolCreate).toHaveBeenCalledOnce();
  expect(state.handle).toHaveBeenCalledOnce();
  expect(state.poolClose).toHaveBeenCalledOnce();
 });
});
