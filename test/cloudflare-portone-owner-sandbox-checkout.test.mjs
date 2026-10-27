// Watchtower-Track: commerce-payment
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
  identity:{kind:'member',verifiedAuthUserId:'11111111-1111-4111-8111-111111111111'},
  close:vi.fn(async()=>{}),
  handoff:vi.fn(),
  commit:vi.fn(async()=>{}),
  origin:'https://example.test',
  admitted:true,
}));
vi.mock('../workers/cloudflare-hyperdrive-subject-pool.mjs',()=>({
  createCloudflareSubjectPoolV1:()=>({close:state.close}),
}));
vi.mock('../workers/cloudflare-auth-db-api.mjs',()=>({
  approvedCloudflareAuthOriginV1:()=>state.origin,
  approvedCloudflareStage5HandoffV1:()=>state.admitted,
  approvedCloudflarePostgresTargetV1:()=>true,
  approvedCloudflareSameOriginPostV1:(request,origin)=>
    request.headers.get('origin')===origin,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},
}));
vi.mock('../apps/api/src/production-user-data-runtime-config.js',()=>({
  parseProductionUserDataRuntimeConfigV1:()=>({}),
}));
vi.mock('../apps/api/src/production-request-identity-verifier.js',()=>({
  createProductionRequestIdentityVerifierV1:()=>({
    verifyRequestIdentity:async()=>state.identity,
  }),
}));
vi.mock('../apps/api/src/cloudflare-portone-owner-sandbox-checkout-handoff-v1.js',()=>({
  loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1:state.handoff,
}));
vi.mock('../apps/api/src/cloudflare-owner-portone-sandbox-handoff-commit-v1.js',()=>({
  commitCloudflareOwnerPortOneSandboxHandoffV1:state.commit,
}));
import {tryHandleCloudflareOwnerPortOneSandboxCheckoutV1}
  from '../workers/cloudflare-portone-owner-sandbox-checkout.mjs';

const PATH='/api/me/credits/portone/test-checkout';
const ATTEMPT='22222222-2222-4222-8222-222222222222';
const CHECKOUT={
  storeId:'store-d9211773-4c6a-4736-9be7-c828405238bc',
  channelKey:'channel-key-d8049c19-c6e9-4729-8da1-ff6a1ab23100',
  paymentId:'mha_pa_'+'b'.repeat(32),
  orderName:'명하 채팅 크레딧 300개',
  totalAmount:1900,currency:'CURRENCY_KRW',payMethod:'CARD',
};
const ROUTE={id:'rewrite.commerce.owner-sandbox-checkout'};
function req(path=PATH,body={paymentAttemptId:ATTEMPT},
  headers={'Origin':'https://example.test','Content-Type':'application/json'},method='POST'){
  return new Request('https://example.test'+path,{
    method,headers,...(method==='POST'?{body:JSON.stringify(body)}:{}),
  });
}
beforeEach(()=>{
  state.identity={kind:'member',verifiedAuthUserId:'11111111-1111-4111-8111-111111111111'};
  state.admitted=true;state.origin='https://example.test';
  state.handoff.mockReset();state.handoff.mockResolvedValue(CHECKOUT);
  state.commit.mockReset();state.commit.mockResolvedValue(undefined);
  state.close.mockClear();
});
describe('Cloudflare Owner PortOne TEST checkout HTTP routing',()=>{
  it('returns only browser-safe checkout for an authenticated canonical Member',async()=>{
    const res=await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(),{},ROUTE);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const raw=await res.text();
    expect(JSON.parse(raw)).toEqual({ok:true,data:{
      paymentAttemptId:ATTEMPT,environment:'sandbox',checkout:CHECKOUT,
    }});
    expect(raw).not.toContain('V2_API_Secret');
    expect(raw).not.toContain('MYEONGHA_COMMERCE_EVIDENCE_HMAC');
    expect(state.handoff).toHaveBeenCalledTimes(1);
    expect(state.commit).toHaveBeenCalledTimes(1);
    expect(state.commit.mock.calls[0]?.[0]).toMatchObject({
      paymentAttemptId:ATTEMPT,providerRequestId:CHECKOUT.paymentId,
    });
    expect(state.handoff.mock.calls[0]?.[0]).toMatchObject({paymentAttemptId:ATTEMPT});
    expect(state.close).toHaveBeenCalledTimes(1);
  });
  it('does not even parse/read a request while origin or runtime authority is held',async()=>{
    state.origin=null;
    expect((await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(),{},ROUTE)).status).toBe(503);
    state.origin='https://example.test';state.admitted=false;
    expect((await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(),{},ROUTE)).status).toBe(503);
    expect(state.handoff).not.toHaveBeenCalled();
    expect(state.close).not.toHaveBeenCalled();
  });
  it('prevents cross-origin POST and accepts no query string or wrong method',async()=>{
    const cross=req(PATH,{paymentAttemptId:ATTEMPT},
      {'Origin':'https://attacker.invalid','Content-Type':'application/json'});
    expect((await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(cross,{},ROUTE)).status).toBe(403);
    expect((await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(PATH+'?paymentId=fake'),{},ROUTE)).status).toBe(404);
    expect((await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(PATH,{},{} ,'GET'),{},ROUTE)).status).toBe(405);
    expect(await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(),{},null)).toBeNull();
    expect(state.handoff).not.toHaveBeenCalled();
  });
  it('rejects forged identities, invalid request body and oversized input',async()=>{
    for(const body of [null,{},[],{paymentAttemptId:'bad'},
      {paymentAttemptId:ATTEMPT,price:1},{paymentAttemptId:ATTEMPT,subjectId:ATTEMPT}]){
      expect((await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(PATH,body),{},ROUTE)).status).toBe(400);
    }
    const big=req(PATH,{paymentAttemptId:ATTEMPT,other:'a'.repeat(500)});
    expect((await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(big,{},ROUTE)).status).toBe(400);
    expect(state.handoff).not.toHaveBeenCalled();
  });
  it('does not reveal SDK config when DB handoff status transition fails',async()=>{
    state.commit.mockRejectedValueOnce(new Error('transaction was rolled back'));
    const response=await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(),{},ROUTE);
    expect(response.status).toBe(503);
    const responseText=await response.text();
    expect(responseText).not.toContain(CHECKOUT.channelKey);
    expect(responseText).not.toContain('transaction was rolled back');
    expect(state.close).toHaveBeenCalledTimes(1);
  });
    it('does not expose checkout to non-member, unverified or unavailable DB paths',async()=>{
    state.identity=null;
    expect((await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(),{},ROUTE)).status).toBe(401);
    state.identity={kind:'guest',verifiedGuestTokenHash:'test-guest-hash'};
    expect((await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(),{},ROUTE)).status).toBe(403);
    state.identity={kind:'member',verifiedAuthUserId:'11111111-1111-4111-8111-111111111111'};
    state.handoff.mockRejectedValueOnce(new Error('secret DB detail should remain private'));
    const res=await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(req(),{},ROUTE);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('secret DB detail');
    expect(state.close).toHaveBeenCalledTimes(1);
  });
});
