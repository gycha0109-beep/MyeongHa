// Watchtower-Track: commerce-payment
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
  auth:{kind:'member',verifiedAuthUserId:'123e4567-e89b-42d3-a456-426614174000'},
  owner:{verifiedSubjectId:'223e4567-e89b-42d3-a456-426614174000',
    isOwnerAdmin:false,chatCreditExempt:false,sandboxCheckoutAllowed:false},
  closed:vi.fn(async()=>{}),
  query:vi.fn(async()=>({rows:[{availableCredits:'30',totalCredits:'50'}]})),
}));
vi.mock('../workers/cloudflare-hyperdrive-subject-pool.mjs',()=>({
  createCloudflareSubjectPoolV1:()=>({close:state.closed}),
}));
vi.mock('../workers/cloudflare-auth-db-api.mjs',()=>({
  approvedCloudflareAuthOriginV1:()=> 'https://example.test',
  approvedCloudflareStage5HandoffV1:()=>true,
  approvedCloudflarePostgresTargetV1:()=>true,
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
vi.mock('../apps/api/src/postgres-subject-execution.js',()=>({
  executePostgresSubjectTransactionV1:async({execute})=>
    execute({client:{query:state.query},
      resolvedSubject:{subjectId:'223e4567-e89b-42d3-a456-426614174000',
        subjectKind:'member'}}),
}));
vi.mock('../apps/api/src/myeongha-owner-admin-access-v1.js',()=>({
  readOwnerAdminAccessV1:async()=>state.owner,
}));
import {tryHandleCloudflareChatCreditWalletV1}
  from '../workers/cloudflare-chat-credit-wallet.mjs';
const request=(method='GET',path='/api/me/credits')=>
  new Request('https://example.test'+path,{method});
const route={id:'rewrite.chat.credit-wallet'};
beforeEach(()=>{
 state.auth={kind:'member',verifiedAuthUserId:'123e4567-e89b-42d3-a456-426614174000'};
 state.owner={verifiedSubjectId:'223e4567-e89b-42d3-a456-426614174000',
    isOwnerAdmin:false,chatCreditExempt:false,sandboxCheckoutAllowed:false};
 state.closed.mockClear();state.query.mockClear();
});
describe('Cloudflare Member credits read with Owner privileges',()=>{
 it('returns scoped ordinary balance without paid actions',async()=>{
  const res=await tryHandleCloudflareChatCreditWalletV1(request(),{},route);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toContain('no-store');
  const data=(await res.json()).data;
  expect(data).toMatchObject({creditExempt:false,availableCredits:30,
    totalCredits:50,requiredCredits:10});
  expect(data.topUp.saleable).toBe(false);
  expect(state.closed).toHaveBeenCalledTimes(1);
 });
 it('exposes unlimited label, without querying or spending any credit for Owner',async()=>{
  state.owner={...state.owner,isOwnerAdmin:true,chatCreditExempt:true,
    sandboxCheckoutAllowed:true};
  const res=await tryHandleCloudflareChatCreditWalletV1(request(),{},route);
  expect(res.status).toBe(200);
  expect((await res.json()).data).toMatchObject({isOwnerAdmin:true,
    creditExempt:true,availableCredits:null,totalCredits:null});
  expect(state.query).not.toHaveBeenCalled();
  expect(state.closed).toHaveBeenCalledTimes(1);
 });
 it('fails closed for absent Member identity, noncanon routes and methods',async()=>{
  state.auth=null;
  expect((await tryHandleCloudflareChatCreditWalletV1(request(),{},route)).status).toBe(401);
  expect((await tryHandleCloudflareChatCreditWalletV1(request('GET','/api/me/credits?subject=other'),{},route)).status).toBe(404);
  expect((await tryHandleCloudflareChatCreditWalletV1(request('POST'),{},route)).status).toBe(405);
 });
 it('fails closed if independent owner classification and resolved Subject differ',async()=>{
  state.owner={...state.owner,verifiedSubjectId:'323e4567-e89b-42d3-a456-426614174000'};
  const res=await tryHandleCloudflareChatCreditWalletV1(request(),{},route);
  expect(res.status).toBe(503);
  expect((await res.json()).error.code).toBe('CREDIT_AUTHORITY_UNAVAILABLE');
 });
});
