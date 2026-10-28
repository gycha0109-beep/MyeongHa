// Watchtower-Track: commerce-payment
import {describe,it,expect,vi} from 'vitest';
import {
 OWNER_PORTONE_SDK_PATH,PORTONE_V2_SDK_ORIGIN,
 isOwnerPortOneSdkRequestV1,serveOwnerPortOneSdkV1,
} from '../cloudflare/owner-portone-sdk-proxy.mjs';

const ORIGIN='https://myeongha.gycha0109.workers.dev';

describe('Owner KCP sandbox fixed first-party SDK relay',()=>{
 it('matches only exact script path and GET with no query',()=>{
  expect(isOwnerPortOneSdkRequestV1(new Request(ORIGIN+OWNER_PORTONE_SDK_PATH))).toBe(true);
  for(const req of [
   new Request(ORIGIN+OWNER_PORTONE_SDK_PATH+'?url=https://example.com'),
   new Request(ORIGIN+OWNER_PORTONE_SDK_PATH+'/extra'),
   new Request(ORIGIN+'/api/me/credits/portone/test-verify'),
   new Request(ORIGIN+OWNER_PORTONE_SDK_PATH,{method:'POST'}),
   new Request(ORIGIN+OWNER_PORTONE_SDK_PATH,{method:'HEAD'}),
  ])expect(isOwnerPortOneSdkRequestV1(req)).toBe(false);
 });
 it('fetches only the pinned PortOne source without forwarding credentials',async()=>{
  const upstream=vi.fn(async()=>new Response('window.PortOne={requestPayment(){}}',{
   status:200,headers:{'Content-Type':'application/javascript; charset=utf-8'},
  }));
  const response=await serveOwnerPortOneSdkV1(upstream);
  expect(upstream).toHaveBeenCalledOnce();
  expect(upstream.mock.calls[0][0]).toBe(PORTONE_V2_SDK_ORIGIN);
  expect(upstream.mock.calls[0][1]).toEqual({
   method:'GET',redirect:'manual',
   headers:{Accept:'application/javascript, text/javascript;q=0.9'},
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('javascript');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  expect(await response.text()).toContain('window.PortOne');
 });
 it('works with the Workers redirect contract and never follows a redirect',async()=>{
  // Workers throws at Request construction for redirect:error; Node does not.
  const workerFetch=vi.fn(async(_url,init)=>{
   if(init.redirect!=='manual')throw new TypeError('Unsupported redirect mode');
   return new Response('window.PortOne={requestPayment(){}}',{
    headers:{'Content-Type':'application/javascript'},
   });
  });
  expect((await serveOwnerPortOneSdkV1(workerFetch)).status).toBe(200);
  expect(workerFetch).toHaveBeenCalledOnce();
  const redirect=await serveOwnerPortOneSdkV1(async()=>new Response(null,{
   status:307,headers:{Location:'https://untrusted.example/sdk.js'},
  }));
  expect(redirect.status).toBe(503);
  expect(redirect.headers.get('X-Myeongha-Sdk-Failure')).toBe('upstream-status');
  expect(redirect.headers.get('X-Myeongha-Sdk-Upstream-Status')).toBe('307');
  expect(redirect.headers.get('Location')).toBeNull();
 });
 it('fails closed for errors, CDN HTML, redirects and unavailable source',async()=>{
  for(const response of [
   new Response('<html>challenge</html>',{headers:{'Content-Type':'text/html'}}),
   new Response('redirect',{status:302,headers:{Location:'https://example.com'}}),
   new Response('error',{status:500,headers:{'Content-Type':'application/javascript'}}),
   new Response('',{headers:{'Content-Type':'text/plain'}}),
   new Response('not JavaScript',{headers:{'Content-Type':'text/html; note=javascript'}}),
   new Response('not JavaScript',{headers:{'Content-Type':'application/javascript-invalid'}}),
  ]){
   const actual=await serveOwnerPortOneSdkV1(async()=>response);
   expect(actual.status).toBe(503);
   expect(actual.headers.get('Cache-Control')).toBe('no-store');
   expect(await actual.text()).not.toContain('challenge');
  }
  const failed=await serveOwnerPortOneSdkV1(async()=>{throw Error('private upstream details');});
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain('private');
 });
});
