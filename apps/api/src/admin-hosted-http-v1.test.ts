import {describe,it,expect} from 'vitest';
import {createAdminHostedHttpV1} from './admin-hosted-http-v1.js';

const ORIGIN='https://myeongha-admin.gycha0109.workers.dev';
const MEMBER='https://member.example.test';
function setup(authorized=true){
 const called:string[]=[];
 const handler=createAdminHostedHttpV1({
  origin:ORIGIN,memberAuthOrigin:MEMBER,
  async verifyAccess(){called.push('access');return authorized;},
  async allowRequest(){called.push('rate');return true;},
  async api(){called.push('api');return Response.json({ok:true});},
  async assets(request){const path=new URL(request.url).pathname;called.push('asset:'+path);
    if(path==='/index.html')return new Response('<html>Owner console</html>',{headers:{'Content-Type':'text/html'}});
    if(path==='/assets/index.js')return new Response('export const loaded=true',{headers:{'Content-Type':'application/javascript'}});
    return new Response('Not found',{status:404});
  },
 });
 return {handler,called};
}
describe('Cloudflare workers.dev private Admin URL',()=>{
 it('delivers SPA navigation only after Access and sets response privacy headers',async()=>{
  const {handler,called}=setup();
  const res=await handler(new Request(ORIGIN+'/admin/users'));
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('Owner console');
  expect(called).toEqual(['access','asset:/users','asset:/index.html']);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
 });
 it('serves built /admin/assets URLs on same workers.dev hostname',async()=>{
  const {handler,called}=setup();
  const res=await handler(new Request(ORIGIN+'/admin/assets/index.js'));
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('loaded=true');
  expect(called).toEqual(['access','asset:/assets/index.js']);
 });
 it('does not render a raw 429 JSON document for authenticated page or asset loads',async()=>{
  let rateCalls=0;let assetCalls=0;
  const handler=createAdminHostedHttpV1({origin:ORIGIN,memberAuthOrigin:MEMBER,
    async verifyAccess(){return true;},
    async allowRequest(request){rateCalls++;expect(new URL(request.url).pathname).toMatch(/^\/api\//u);return false;},
    async api(){throw Error('API must not run when quota exhausted');},
    async assets(request){assetCalls++;
      return new Response('<html>Owner console</html>',{headers:{'Content-Type':'text/html'}});
    }
  });
  for(const url of ['/admin/','/admin/users','/admin/assets/index.js','/admin/assets/index.css']){
    const response=await handler(new Request(ORIGIN+url));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Owner console');
  }
  expect(assetCalls).toBeGreaterThanOrEqual(4);
  expect(rateCalls).toBe(0);
  const response=await handler(new Request(ORIGIN+'/api/admin/session'));
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
  expect(await response.json()).toEqual({error:'ADMIN_RATE_LIMITED'});
  expect(rateCalls).toBe(1);
 });
 it('denies Access failures before assets or API, including the sign-in path',async()=>{
  const {handler,called}=setup(false);
  for(const path of ['/admin','/admin/assets/index.js','/api/admin/overview','/api/auth/sign-in']){
    const res=await handler(new Request(ORIGIN+path));
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('no-store');
  }
  expect(called).toEqual(['access','access','access','access']);
 });
 it('rejects other hostnames and unknown resources without exposing assets',async()=>{
  const {handler,called}=setup();
  expect((await handler(new Request('https://untrusted.example/admin'))).status).toBe(421);
  expect((await handler(new Request(ORIGIN+'/'))).status).toBe(404);
  expect((await handler(new Request(ORIGIN+'/admin/not-a-real-page'))).status).toBe(404);
  expect(called).toEqual(['access','access','asset:/not-a-real-page']);
 });
 it('requires Owner-gated same-origin requests to proxy a Member sign-in',async()=>{
  let forwarded=0;
  const handler=createAdminHostedHttpV1({origin:ORIGIN,memberAuthOrigin:MEMBER,
    async verifyAccess(){return true;},async allowRequest(){return true;},
    async api(){throw Error('Unexpected API');},async assets(){throw Error('Unexpected assets');},
    async fetchImpl(){forwarded++;return new Response('Forbidden',{status:403});},
  });
  const body=JSON.stringify({email:'owner@example.test',password:'test-password'});
  const send=(origin?:string)=>handler(new Request(ORIGIN+'/api/auth/sign-in',{method:'POST',
    headers:{'Content-Type':'application/json',...(origin===undefined?{}:{Origin:origin})},body}));
  expect((await send()).status).toBe(403);
  expect((await send('https://untrusted.example')).status).toBe(403);
  expect(forwarded).toBe(0);
  expect((await send(ORIGIN)).status).toBe(503);
  expect(forwarded).toBe(1);
 });
});
