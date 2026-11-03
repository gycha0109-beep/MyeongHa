import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAdminAccessGateV1 } from './admin-access-gate-v1.js';
import { createAdminHostedHttpV1 } from './admin-hosted-http-v1.js';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const config={issuer:'https://myeongha-test.cloudflareaccess.com',audience:'a'.repeat(64),ownerEmail:'owner@example.test'};
const claims={iss:config.issuer,aud:[config.audience],email:config.ownerEmail,exp:1800000060};
function token(payload:unknown=claims,alg='RS256') {
  const content=[{alg,kid:'test-key'},payload].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return content+'.'+sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url');
}
const jwks=(async()=>Response.json({keys:[{...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig'}]})) as typeof fetch;
describe('private hosted administrator boundary',()=>{
  it('requires an actual signature, exact Owner, audience and unexpired issuer claims',async()=>{
    const gate=createAdminAccessGateV1(config,{fetchImpl:jwks,now:()=>1800000000000});
    const request=(value:string)=>new Request('https://admin.example.test/admin',{headers:{'cf-access-jwt-assertion':value}});
    expect(await gate(request(token()))).toBe(true);
    for(const value of [token({...claims,email:'member@example.test'}),token({...claims,exp:1800000000}),
      token({...claims,aud:['wrong']}),token({...claims,iss:'https://wrong.cloudflareaccess.com'}),token(claims,'none'),token()+'.bad']) {
      expect(await gate(request(value))).toBe(false);
    }
    const tampered=token().split('.');tampered[1]=Buffer.from(JSON.stringify({...claims,exp:1800000999})).toString('base64url');
    expect(await gate(request(tampered.join('.')))).toBe(false);
  });
  it('never serves HTML or calls a database/API for an unverified Access identity',async()=>{
    let calls=0;
    const handler=createAdminHostedHttpV1({origin:'https://admin.example.test',memberAuthOrigin:'https://member.example.test',
      verifyAccess:async()=>false,allowRequest:async()=>true,api:async()=>{calls++;return Response.json({});},
      assets:async()=>{calls++;return new Response('private');}});
    const response=await handler(new Request('https://admin.example.test/admin'));
    expect(response.status).toBe(403);expect(calls).toBe(0);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('strips upstream refresh cookies/identity and rejects cross-origin sign-in',async()=>{
    const jwt='header.payload.signature';let calls=0;
    const handler=createAdminHostedHttpV1({origin:'https://admin.example.test',memberAuthOrigin:'https://member.example.test',
      verifyAccess:async()=>true,allowRequest:async()=>true,api:async()=>Response.json({}),assets:async()=>new Response('app'),
      fetchImpl:(async()=>{calls++;return Response.json({ok:true,data:{status:'authenticated',session:{accessToken:jwt,refreshToken:'never-forward'},email:'never-forward'}},{headers:{'Set-Cookie':'secret=1'}});}) as typeof fetch});
    const login=(origin:string)=>handler(new Request('https://admin.example.test/api/auth/sign-in',{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'synthetic'})}));
    expect((await login('https://evil.example')).status).toBe(403);
    const response=await login('https://admin.example.test');expect(response.status).toBe(200);expect(calls).toBe(1);
    expect(response.headers.get('set-cookie')).toBeNull();expect(await response.text()).not.toContain('never-forward');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
  it('bounds requests before API and strips the admin prefix from asset paths',async()=>{
    let allow=false;const paths:string[]=[];
    const handler=createAdminHostedHttpV1({origin:'https://admin.example.test',memberAuthOrigin:'https://member.example.test',
      verifyAccess:async()=>true,allowRequest:async()=>allow,api:async()=>Response.json({}),
      assets:async request=>{paths.push(new URL(request.url).pathname);return new Response('app');}});
    expect((await handler(new Request('https://admin.example.test/admin/assets/app.js'))).status).toBe(429);
    allow=true;expect((await handler(new Request('https://admin.example.test/admin/assets/app.js'))).status).toBe(200);
    expect(paths).toEqual(['/assets/app.js']);
  });
});
