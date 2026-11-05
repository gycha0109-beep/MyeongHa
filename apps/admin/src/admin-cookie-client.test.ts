import {describe,expect,it} from 'vitest';
import {ADMIN_SESSION_MARKER_V1,fetchAdminReadV1,verifyAdminOwnerSessionV1,
  signOutAdminSessionV1,signInForAdminSessionV1,AdminSignInFailureV1} from './admin-client.js';
describe('Admin browser uses cookie only',()=>{
  it('never sends Member bearer token while restoring Owner and reading data',async()=>{
    const seen: Array<{path:string;auth:string|null;credentials:RequestCredentials}> = [];
    const fake=(async(path:RequestInfo|URL,init?:RequestInit)=>{
      const headers=new Headers(init?.headers);
      seen.push({path:String(path),auth:headers.get('Authorization'),credentials:init?.credentials??'omit'});
      return String(path)==='/api/admin/session' ? Response.json({authorized:true}) :
        Response.json({kind:'users',rows:[],nextCursor:null});
    }) as typeof fetch;
    await verifyAdminOwnerSessionV1(ADMIN_SESSION_MARKER_V1,fake);
    await fetchAdminReadV1('/api/admin/users',ADMIN_SESSION_MARKER_V1,fake);
    expect(seen.map(x=>x.path)).toEqual(['/api/admin/session','/api/admin/users']);
    expect(seen.every(x=>x.auth===null&&x.credentials==='same-origin')).toBe(true);
  });
  it('accepts only an explicit cookie-session sign-in response, never the raw Member JWT',async()=>{
    const valid=(async()=>Response.json({ok:true,data:{status:'authenticated',session:{mode:'cookie'}}})) as typeof fetch;
    await expect(signInForAdminSessionV1('owner@example.test','password',valid)).resolves.toBe(ADMIN_SESSION_MARKER_V1);
    const legacy=(async()=>Response.json({ok:true,data:{status:'authenticated',session:{accessToken:'a.b.c'}}})) as typeof fetch;
    await expect(signInForAdminSessionV1('owner@example.test','password',legacy)).rejects.toBeInstanceOf(AdminSignInFailureV1);
  });
  it('performs explicit POST logout and requires success from the host',async()=>{
    let called=0;
    const fake=(async(path:RequestInfo|URL,init?:RequestInit)=>{
      called++;
      expect(path).toBe('/api/admin/logout');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      expect(init?.credentials).toBe('same-origin');
      return new Response(null,{status:204});
    }) as typeof fetch;
    await signOutAdminSessionV1(fake);
    expect(called).toBe(1);
  });
});
