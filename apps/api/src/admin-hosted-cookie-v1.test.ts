import {describe,it,expect} from 'vitest';
import {createAdminHostedHttpV1} from './admin-hosted-http-v1.js';
const ORIGIN='https://myeongha-admin.gycha0109.workers.dev';
const MEMBER='https://member.example.test';
describe('host-only Admin cookie authentication',()=>{
  it('persists via cookie, hides JWT, blocks mutations and clears on logout',async()=>{
    const token=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url') + '.' +
      Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+1800})).toString('base64url') +
      '.signature';
    let verified=0;
    const handler=createAdminHostedHttpV1({
      origin:ORIGIN,memberAuthOrigin:MEMBER,
      async verifyAccess(){return true;},async allowRequest(){return true;},
      async assets(){throw Error('Unexpected asset');},
      async api(request){
        if(new URL(request.url).pathname==='/api/admin/session'){
          verified++;
          return request.headers.get('Authorization')==='Bearer '+token
            ? Response.json({authorized:true})
            : Response.json({error:'ADMIN_FORBIDDEN'},{status:403});
        }
        return Response.json({error:'ADMIN_FORBIDDEN'},{status:403});
      },
      async fetchImpl(){
        return Response.json({ok:true,data:{status:'authenticated',
          session:{accessToken:token,refreshToken:'must-not-return'}}});
      },
    });
    const signIn=await handler(new Request(ORIGIN+'/api/auth/sign-in',{
      method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},
      body:JSON.stringify({email:'owner@example.test',password:'secret'}),
    }));
    expect(signIn.status).toBe(200);
    const body=await signIn.text();
    expect(body).toContain('"mode":"cookie"');
    expect(body).not.toContain(token);
    expect(body).not.toContain('refreshToken');
    const cookie=signIn.headers.get('Set-Cookie')!;
    expect(cookie).toContain('Secure; HttpOnly; SameSite=Strict');
    const cookieHeader=cookie.split(';')[0]!;
    const authorized=await handler(new Request(ORIGIN+'/api/admin/session',{
      headers:{Cookie:cookieHeader},
    }));
    expect(authorized.status).toBe(200);
    expect(verified).toBe(1);
    const command=await handler(new Request(ORIGIN+'/api/admin/commands/execute',{
      method:'POST',headers:{Origin:ORIGIN,Cookie:cookieHeader},
    }));
    expect(command.status).toBe(403);
    const logout=await handler(new Request(ORIGIN+'/api/admin/logout',{
      method:'POST',headers:{Origin:ORIGIN,Cookie:cookieHeader},
    }));
    expect(logout.status).toBe(204);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await handler(new Request(ORIGIN+'/api/admin/session'))).status).toBe(403);
    expect(verified).toBe(2);
    expect((await handler(new Request(ORIGIN+'/api/admin/logout',{
      method:'POST',headers:{Origin:'https://evil.test'},
    }))).status).toBe(403);
  });
});
