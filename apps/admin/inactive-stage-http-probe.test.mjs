import {describe,it,expect} from 'vitest';
import {assertInactiveAdminHttpDenialV1,verifyInactiveAdminHttpDenialV1} from './inactive-stage-http-probe.mjs';

const response=(status,location=null)=>({
 status,headers:{get(name){return name==='location'?location:null;}},
});
describe('anonymous inactive Admin Worker staging HTTP checks',()=>{
 it('checks the admin page, direct asset route and API without credentials',async()=>{
  const calls=[];
  const result=await verifyInactiveAdminHttpDenialV1(async(url,options)=>{
   calls.push({url,options});
   return response(403);
  });
  expect(result.anonymousEndpointsDenied).toBe(3);
  expect(calls.map(c=>new URL(c.url).pathname)).toEqual([
   '/admin/','/admin/index.html','/api/admin/session',
  ]);
  for(const call of calls){
   expect(call.options).toMatchObject({
    method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',
   });
   expect(call.options.headers).not.toHaveProperty('Authorization');
  }
 });
 it('accepts only deny responses or genuine Access login redirects',()=>{
  const target='https://myeongha-admin.gycha0109.workers.dev/admin/';
  for(const status of [401,403,503]){
   expect(assertInactiveAdminHttpDenialV1(response(status),target)).toBe(true);
  }
  expect(assertInactiveAdminHttpDenialV1(
   response(302,'https://noisy-star-3d9a.cloudflareaccess.com/cdn-cgi/access/login/'),target,
  )).toBe(true);
  expect(assertInactiveAdminHttpDenialV1(
   response(302,'/cdn-cgi/access/login/'),target,
  )).toBe(true);
  for(const status of [200,204,404,500,502]){
   expect(()=>assertInactiveAdminHttpDenialV1(response(status),target)).toThrow();
  }
  expect(()=>assertInactiveAdminHttpDenialV1(response(302,'/admin/'),target)).toThrow();
  expect(()=>assertInactiveAdminHttpDenialV1(response(302,'https://other.example/login'),target)).toThrow();
 });
 it('does not accept unreachable routes as evidence of safe deployment',async()=>{
  await expect(verifyInactiveAdminHttpDenialV1(async()=>{throw Error('secret token');}))
   .rejects.toThrow('Admin inactive endpoint unavailable');
  await expect(verifyInactiveAdminHttpDenialV1(async()=>response(200)))
   .rejects.toThrow('Admin inactive endpoint is not reliably denied');
 });
});
