import {describe,it,expect} from 'vitest';
import {verifyInactiveAdminOwnerBoundaryV1} from './inactive-stage-owner-probe.mjs';
import {adminStageProbePathsV1} from './inactive-stage-http-probe.mjs';
const input={ownerAccessJwt:'owner.payload.signature',deniedAccessJwt:'denied.payload.signature',
 paths:adminStageProbePathsV1(['index-build.js','index-build.css'])};
const owner=()=>Response.json({error:'ADMIN_PRIVATE_DISABLED'},{status:503,headers:{'Cache-Control':'no-store'}});
describe('real-session inactive Owner boundary verification',()=>{
 it('checks both identities on the API, pages and actual assets without claiming Member or data verification',async()=>{
  const calls=[];
  const result=await verifyInactiveAdminOwnerBoundaryV1({...input,fetchImpl:async(url,options)=>{
   calls.push({url,options});return options.headers.Cookie.includes('owner.')?owner():new Response(null,{status:403});
  }});
  expect(result).toMatchObject({ownerAccessVerified:true,nonOwnerAccessDenied:true,
   memberAuthenticationVerified:false,productionReadsVerified:false,activationEnabled:false});
  expect(calls).toHaveLength(input.paths.length*2);
  expect(calls.map(x=>new URL(x.url).pathname)).toContain('/assets/index-build.js');
  for(const call of calls){expect(call.options.redirect).toBe('manual');expect(call.options.credentials).toBe('omit');}
  expect(JSON.stringify(result)).not.toContain('signature');
 });
 it.each([()=>new Response(null,{status:503}),()=>Response.json({error:'ADMIN_HOSTED_UNAVAILABLE'},{status:503}),
  ()=>new Response('private asset',{status:200}),()=>new Response(null,{status:302,headers:{Location:'/cdn-cgi/access/login/'}})])
 ('does not accept outages, unconfigured Workers or login redirects as signed Owner evidence',async response=>{
  await expect(verifyInactiveAdminOwnerBoundaryV1({...input,fetchImpl:async()=>response()})).rejects.toThrow();
 });
 it('rejects an Owner-only deployment that accidentally permits the second identity',async()=>{
  await expect(verifyInactiveAdminOwnerBoundaryV1({...input,fetchImpl:async()=>owner()})).rejects.toThrow();
 });
 it('requires two separate sessions and a real emitted JS build asset',async()=>{
  await expect(verifyInactiveAdminOwnerBoundaryV1({...input,deniedAccessJwt:input.ownerAccessJwt})).rejects.toThrow();
  expect(()=>adminStageProbePathsV1([])).toThrow();
  expect(()=>adminStageProbePathsV1(['../secret.js'])).toThrow();
 });
});
