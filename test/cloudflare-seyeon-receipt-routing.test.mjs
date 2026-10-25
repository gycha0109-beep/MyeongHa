import {afterEach,describe,expect,it,vi} from 'vitest';
const handleRequest=vi.fn(async()=>Response.json({ok:true,data:{accepted:true}}));
const close=vi.fn(async()=>{});
const create=vi.fn(()=>({handleRequest,close}));
vi.mock('../apps/api/src/seyeon-security-s0-production-policy-v1.js',()=>({
  SEYEON_SECURITY_S0_PRODUCTION_V1:{receiptAndWithdrawalEnabled:true,modelUseEnabled:true,
    creditBilling:{productionMounted:true}},
  SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1:{},
}));
vi.mock('../apps/api/src/production-seyeon-first-memory-fetch-runtime-v1.js',()=>({
  createProductionSeyeonFirstMemoryFetchRuntimeV1:create,
}));
const worker=await import('../cloudflare/myeongha-worker.mjs');
const {SEYEON_SECURITY_S0_PRODUCTION_V1:policy}=await import(
  '../apps/api/src/seyeon-security-s0-production-policy-v1.js');
const root='https://myeongha.gycha0109.workers.dev';
const id='a8100000-0000-4000-8000-000000000001';
const request=(path)=>new Request(root+path,{method:'POST',body:'{}'});
const env=()=>({MYEONGHA_AUTH_RATE_LIMIT_SECRET:'x'.repeat(64),
  AUTH_RATE_LIMITER:{limit:vi.fn(async()=>({success:true}))}});
afterEach(()=>vi.clearAllMocks());
describe('primary Worker S0 receipt routing',()=>{
 it('admits exact receipt through the shared edge limiter before the request-local runtime',async()=>{
   const bindings=env();const r=await worker.default.fetch(request('/api/chat/delivery-receipts/'+id),bindings,{});
   expect(r.status).toBe(200);expect(create).toHaveBeenCalledTimes(1);
   expect(close).toHaveBeenCalledTimes(1);expect(bindings.AUTH_RATE_LIMITER.limit).toHaveBeenCalledTimes(1);
 });
 it('fails closed before any DB runtime when admission is absent or rate limited',async()=>{
   expect((await worker.default.fetch(request('/api/chat/delivery-receipts/'+id),{},{})).status).toBe(503);
   const bindings=env();bindings.AUTH_RATE_LIMITER.limit.mockResolvedValue({success:false});
   expect((await worker.default.fetch(request('/api/chat/delivery-receipts/'+id),bindings,{})).status).toBe(429);
   expect(create).not.toHaveBeenCalled();
 });
 it('blocks paid model use when credit reservation and ACK billing are not mounted',async()=>{
   policy.creditBilling.productionMounted=false;
   try{
     const bindings=env();
     const response=await worker.default.fetch(request('/api/chat/'+id+'/turns'),bindings,{});
     expect(response.status).toBe(503);
     expect(create).not.toHaveBeenCalled();
     expect(bindings.AUTH_RATE_LIMITER.limit).not.toHaveBeenCalled();
   }finally{policy.creditBilling.productionMounted=true;}
 });
 it('preserves alias holds and blocks fresh model use during emergency hold while retaining receipts',async()=>{
   const bindings={...env(),MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD:'true'};
   for(const path of ['/api/%63hat/'+id+'/turns','/api/chat/'+id+'/turns?__myeongha_chat_x=1','/api/chat/'+id+'/turns']){
     expect((await worker.default.fetch(request(path),bindings,{})).status).toBe(503);
   }
   expect(create).not.toHaveBeenCalled();
   expect((await worker.default.fetch(request('/api/chat/delivery-receipts/'+id),bindings,{})).status).toBe(200);
   expect(create).toHaveBeenCalledTimes(1);
 });
});
