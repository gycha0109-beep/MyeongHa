import { describe, expect, it } from 'vitest';
import {
  MEMBER_REFRESH_COOKIE_BINDING_V1,
  clearMemberRefreshCookieV1,
  readMemberRefreshCookieV1,
  setMemberRefreshCookieV1,
} from './member-refresh-cookie.js';

describe('Member refresh cookie authority', () => {
  it('pins the refresh credential to an HttpOnly host-only strict same-site auth path cookie', () => {
    expect(MEMBER_REFRESH_COOKIE_BINDING_V1).toEqual({
      name: 'myeongha_member_refresh_v1',
      path: '/api/auth',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      domain: null,
    });

    const response = setMemberRefreshCookieV1(
      Response.json({ ok: true }),
      'refresh token/+?=value',
    );
    const cookie = response.headers.get('set-cookie');

    expect(cookie).toBe(
      'myeongha_member_refresh_v1=refresh%20token%2F%2B%3F%3Dvalue; Path=/api/auth; HttpOnly; Secure; SameSite=Strict',
    );
    expect(cookie).not.toContain('Domain=');
    expect(cookie).not.toContain('Max-Age=');
    expect(cookie).not.toContain('Expires=');
  });

  it('reads only the exact governed cookie name and decodes its value', () => {
    const request = new Request('https://myeongha.vercel.app/api/auth/refresh', {
      headers: {
        Cookie: 'other=value; myeongha_member_refresh_v1=refresh%20credential%2F1; suffix=value',
      },
    });

    expect(readMemberRefreshCookieV1(request)).toBe('refresh credential/1');
  });

  it('rejects malformed or control-character refresh cookie values', () => {
    const malformed = new Request('https://myeongha.vercel.app/api/auth/refresh', {
      headers: { Cookie: 'myeongha_member_refresh_v1=%E0%A4%A' },
    });
    const control = new Request('https://myeongha.vercel.app/api/auth/refresh', {
      headers: { Cookie: 'myeongha_member_refresh_v1=refresh%0Avalue' },
    });

    expect(readMemberRefreshCookieV1(malformed)).toBeNull();
    expect(readMemberRefreshCookieV1(control)).toBeNull();
  });

  it('clears the exact cookie without adding a domain authority', () => {
    const response = clearMemberRefreshCookieV1(Response.json({ ok: true }));
    const cookie = response.headers.get('set-cookie');

    expect(cookie).toBe(
      'myeongha_member_refresh_v1=; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    );
    expect(cookie).not.toContain('Domain=');
  });
});
