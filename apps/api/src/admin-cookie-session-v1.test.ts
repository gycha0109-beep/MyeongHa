import {describe,expect,it} from 'vitest';
import {createAdminSessionCookieV1,clearAdminSessionCookieV1,readAdminSessionCookieV1,withAdminSessionCookieV1,ADMIN_SESSION_COOKIE_NAME_V1} from './admin-cookie-session-v1.js';
const token=(exp:number)=>Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url') + '.' + Buffer.from(JSON.stringify({exp})).toString('base64url') + '.signature';
const ORIGIN='https://myeongha-admin.gycha0109.workers.dev';
describe('private Admin host-only cookie session',()=>{
  it('sets strict HttpOnly Secure host-only cookie bounded by provider expiry',()=>{
    const value=createAdminSessionCookieV1(token(2_000),1_000_000);
    expect(value).toContain(ADMIN_SESSION_COOKIE_NAME_V1+'=');
    expect(value).toContain('Max-Age=1000; Path=/; Secure; HttpOnly; SameSite=Strict');
    expect(value).not.toContain('Domain=');
    expect(createAdminSessionCookieV1(token(10_000),1_000_000)).toContain('Max-Age=3600;');
    expect(()=>createAdminSessionCookieV1(token(900),1_000_000)).toThrow();
    expect(()=>createAdminSessionCookieV1('malformed',1_000_000)).toThrow();
    expect(clearAdminSessionCookieV1()).toContain('Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict');
  });
  it('rejects ambiguous cookies and never reflects cookies to non-read requests',()=>{
    const t=token(2_000);
    expect(readAdminSessionCookieV1('other=123; '+ADMIN_SESSION_COOKIE_NAME_V1+'='+t)).toBe(t);
    expect(readAdminSessionCookieV1(ADMIN_SESSION_COOKIE_NAME_V1+'='+t+'; '+ADMIN_SESSION_COOKIE_NAME_V1+'='+t)).toBeNull();
    expect(readAdminSessionCookieV1('other=123')).toBeNull();
    const get=withAdminSessionCookieV1(new Request(ORIGIN+'/api/admin/users',{headers:{Cookie:ADMIN_SESSION_COOKIE_NAME_V1+'='+t}}));
    expect(get.headers.get('Authorization')).toBe('Bearer '+t);
    const command=withAdminSessionCookieV1(new Request(ORIGIN+'/api/admin/commands/execute',{method:'POST',headers:{Cookie:ADMIN_SESSION_COOKIE_NAME_V1+'='+t}}));
    expect(command.headers.get('Authorization')).toBeNull();
    const asset=withAdminSessionCookieV1(new Request(ORIGIN+'/admin/users',{headers:{Cookie:ADMIN_SESSION_COOKIE_NAME_V1+'='+t}}));
    expect(asset.headers.get('Authorization')).toBeNull();
    const explicit=withAdminSessionCookieV1(new Request(ORIGIN+'/api/admin/session',{headers:{Cookie:ADMIN_SESSION_COOKIE_NAME_V1+'='+t,Authorization:'Bearer another'}}));
    expect(explicit.headers.get('Authorization')).toBe('Bearer another');
  });
});
