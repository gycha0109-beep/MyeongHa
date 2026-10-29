import {afterEach,describe,expect,it,vi} from 'vitest';
const handleRequest=vi.fn(async()=>Response.json({ok:true,data:{accepted:true}}));
const close=vi.fn(async()=>{});
const verifyOwnerCreditExemption=vi.fn(async()=>false);
const create=vi.fn(()=>({handleRequest,close,verifyOwnerCreditExemption}));
const privacyHandleRequest=vi.fn(async()=>Response.json({ok:true,data:{accepted:true}}));
const privacyClose=vi.fn(async()=>{});
const createPrivacy=vi.fn(()=>({handleRequest:privacyHandleRequest,close:privacyClose}));
const receiptHandleRequest=vi.fn(async()=>Response.json({ok:true,data:{accepted:true}}));
const receiptClose=vi.fn(async()=>{});
const createReceipt=vi.fn(()=>({handleRequest:receiptHandleRequest,close:receiptClose}));
vi.mock('../apps/api/src/seyeon-security-s0-production-policy-v1.js',()=>({
  SEYEON_SECURITY_S0_PRODUCTION_V1:{receiptAndWithdrawalEnabled:true,modelUseEnabled:true,
    creditBilling:{productionMounted:false}},
  SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1:{},
}));
vi.mock('../workers/cloudflare-seyeon-first-memory-runtime.mjs',()=>({
  createCloudflareSeyeonFirstMemoryRuntimeV1:create,
  createCloudflareSeyeonReceiptWithdrawalRuntimeV1:createPrivacy,
  createCloudflareSeyeonIssuedReplyReceiptRuntimeV1:createReceipt,
}));
const worker=await import('../cloudflare/myeongha-worker.mjs');
const root='https://myeongha.gycha0109.workers.dev';
const id='a8100000-0000-4000-8000-000000000001';
const request=(path)=>new Request(root+path,{method:'POST',body:'{}'});
const env=()=>({MYEONGHA_CLOUDFLARE_AUTH_DB_MODE:'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN:root,MYEONGHA_CLOUDFLARE_WORKERS_DEV_ORIGIN:root,
  MYEONGHA_AUTH_RATE_LIMIT_SECRET:'x'.repeat(64),
  AUTH_RATE_LIMITER:{limit:vi.fn(async()=>({success:true}))}});
afterEach(()=>vi.clearAllMocks());
describe('primary Worker S0 receipt routing',()=>{
 it('admits exact receipt through the shared edge limiter before the request-local runtime',async()=>{
   const bindings={...env(),CF_VERSION_METADATA:{id:'11111111-2222-4333-8444-555555555555'}};const r=await worker.default.fetch(request('/api/chat/delivery-receipts/'+id),bindings,{});
   expect(r.status).toBe(200);expect(r.headers.get('x-myeongha-worker-version')).toBe(bindings.CF_VERSION_METADATA.id);expect(createReceipt).toHaveBeenCalledTimes(1);
   expect(receiptClose).toHaveBeenCalledTimes(1);expect(bindings.AUTH_RATE_LIMITER.limit).toHaveBeenCalledTimes(1);
 });
 it('fails closed before any DB runtime when admission is absent or rate limited',async()=>{
   expect((await worker.default.fetch(request('/api/chat/delivery-receipts/'+id),{},{})).status).toBe(503);
   const bindings=env();bindings.AUTH_RATE_LIMITER.limit.mockResolvedValue({success:false});
   expect((await worker.default.fetch(request('/api/chat/delivery-receipts/'+id),bindings,{})).status).toBe(429);
   expect(createReceipt).not.toHaveBeenCalled();
   expect(createPrivacy).not.toHaveBeenCalled();
   expect(create).not.toHaveBeenCalled();
 });
 it('blocks uncharged paid turns even with model enabled, while permitting verified receipts',async()=>{
   const bindings=env();
   const blocked=await worker.default.fetch(request('/api/chat/'+id+'/turns'),bindings,{});
   expect(blocked.status).toBe(503);
   expect(create).toHaveBeenCalledTimes(1);
   expect(verifyOwnerCreditExemption).toHaveBeenCalledTimes(1);
   expect(handleRequest).not.toHaveBeenCalled();
   const receipt=await worker.default.fetch(request('/api/chat/delivery-receipts/'+id),bindings,{});
   expect(receipt.status).toBe(200);
   expect(createReceipt).toHaveBeenCalledTimes(1);
 });
 it('keeps original-memory withdrawal independent of model/cost and available during forward stop',async()=>{
   const bindings={...env(),MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD:'true'};
   const response=await worker.default.fetch(
     request('/api/memories/'+id+'/grants/seyeon/revoke'),bindings,{});
   expect(response.status).toBe(200);
   expect(createPrivacy).toHaveBeenCalledTimes(1);
   expect(privacyHandleRequest).toHaveBeenCalledTimes(1);
   expect(privacyClose).toHaveBeenCalledTimes(1);
   expect(create).not.toHaveBeenCalled();
   expect(verifyOwnerCreditExemption).not.toHaveBeenCalled();
   expect(createReceipt).not.toHaveBeenCalled();
   expect(bindings.AUTH_RATE_LIMITER.limit).toHaveBeenCalledTimes(1);
 });
 it('never constructs Member Auth or the governed model for proof-only receipts',async()=>{
   const response=await worker.default.fetch(
     request('/api/chat/delivery-receipts/'+id),
     {...env(),MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD:'true'}, {},
   );
   expect(response.status).toBe(200);
   expect(createReceipt).toHaveBeenCalledTimes(1);
   expect(createPrivacy).not.toHaveBeenCalled();
   expect(create).not.toHaveBeenCalled();
   expect(verifyOwnerCreditExemption).not.toHaveBeenCalled();
 });
 it('only a verified Owner Admin can reach protected positive-model runtime',async()=>{
   verifyOwnerCreditExemption.mockResolvedValueOnce(true);
   const response=await worker.default.fetch(request('/api/chat/'+id+'/turns'),env(),{});
   expect(response.status).toBe(200);
   expect(verifyOwnerCreditExemption).toHaveBeenCalledTimes(1);
   expect(handleRequest).toHaveBeenCalledTimes(1);
   expect(close).toHaveBeenCalledTimes(1);
 });
 it('preserves alias holds and blocks fresh model use during emergency hold while retaining receipts',async()=>{
   const bindings={...env(),MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD:'true'};
   for(const path of ['/api/%63hat/'+id+'/turns','/api/chat/'+id+'/turns?__myeongha_chat_x=1','/api/chat/'+id+'/turns']){
     expect((await worker.default.fetch(request(path),bindings,{})).status).toBe(503);
   }
   expect(create).not.toHaveBeenCalled();
   const preview=new Request('https://preview.myeongha.workers.dev/api/chat/'+id+'/turns',{method:'POST',body:'{}'});
   expect((await worker.default.fetch(preview,env(),{})).status).toBe(503);
   expect(create).not.toHaveBeenCalled();
   expect((await worker.default.fetch(request('/api/chat/delivery-receipts/'+id),bindings,{})).status).toBe(200);
   expect(createReceipt).toHaveBeenCalledTimes(1);
 });
});
