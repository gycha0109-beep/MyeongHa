import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSocialAuthStartRequestV1 } from '../apps/api/src/social-auth-start-http.js';
import { handleSupabaseAuthRequestV1 } from '../apps/api/src/supabase-auth-http.js';
import type { SupabasePreenrollmentMemberBindingPortV1 } from '../apps/api/src/supabase-auth-http.js';
import { readFileSync } from 'node:fs';

const env = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
  MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT: 'ENFORCE',
  MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE: 'APPROVED_AND_APPLIED',
  MYEONGHA_PORTONE_IDENTITY_PRIVACY_DISPOSITION_STATE: 'APPROVED',
  MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED: 'true',
};
const id = '22222222-2222-4222-8222-222222222222';
const socialStartRequest = () => new Request('https://myeongha.vercel.app/api/auth/social/start', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: 'google', redirectUri:
    'https://myeongha.vercel.app/auth.html?social=callback' }),
});
const socialCompleteRequest = () => new Request('https://myeongha.vercel.app/api/auth/social/complete', {
  method: 'POST', headers: {
    'Content-Type': 'application/json',
    'X-MyeongHa-Auth-Transport': 'web-cookie-v1',
  },
  body: JSON.stringify({ refreshToken: 'untrusted-oauth-token' }),
});
const admission = (found: boolean): SupabasePreenrollmentMemberBindingPortV1 => ({
  readVerified: vi.fn(async () => found),
  bindMember: vi.fn(async () => undefined),
  admitExistingMember: vi.fn(async () => false),
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('A1 Social Auth preverified age hold and atomic Member binding', () => {
  it('denies Social OAuth start without server-verified actor proof', async () => {
    const response = await handleSocialAuthStartRequestV1({
      request: socialStartRequest(), env,
    });
    expect(response.status).toBe(503);
    const declined = await handleSocialAuthStartRequestV1({
      request: socialStartRequest(), env,
      preenrollmentMemberPort: admission(false),
    });
    expect(declined.status).toBe(403);
    expect((await declined.json()).error.code).toBe('AGE_VERIFICATION_REQUIRED');
  });

  it('allows only preverified Social start without exposing secrets or age DOB', async () => {
    const proof = admission(true);
    const response = await handleSocialAuthStartRequestV1({
      request: socialStartRequest(), env,
      preenrollmentMemberPort: proof,
      nowEpochMs: () => Date.parse('2026-10-24T08:00:00Z'),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.provider).toBe('google');
    expect(payload.data.authorizationUrl).toContain('/auth/v1/authorize');
    expect(JSON.stringify(payload)).not.toContain('MYEONGHA_PORTONE');
    expect(proof.readVerified).toHaveBeenCalledOnce();
  });

  it('never exchanges Social tokens without an approved admission port', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const missing = await handleSupabaseAuthRequestV1({
      request: socialCompleteRequest(), env, action: 'social-complete',
    });
    expect(missing.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('denies a newly-created OAuth user AFTER provider lookup if proof is missing', async () => {
    const upstream = vi.fn(async () => Response.json({
      access_token: 'fresh-access-token', refresh_token: 'fresh-refresh-token',
      expires_in: 3600, user: { id, email: 'unverified@example.com' },
    }));
    vi.stubGlobal('fetch', upstream);
    const proof = admission(false);
    const response = await handleSupabaseAuthRequestV1({
      request: socialCompleteRequest(), env, action: 'social-complete',
      preenrollmentMemberPort: proof,
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('AGE_VERIFICATION_REQUIRED');
    expect(upstream).toHaveBeenCalledOnce();
    expect(proof.admitExistingMember).toHaveBeenCalledWith(id);
    expect(proof.readVerified).toHaveBeenCalledOnce();
    expect(proof.bindMember).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('binds the fresh OAuth Auth UUID before returning tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      access_token: 'fresh-access-token', refresh_token: 'fresh-refresh-token',
      expires_in: 3600, user: { id, email: 'new@example.com' },
    })));
    const proof = admission(true);
    const response = await handleSupabaseAuthRequestV1({
      request: socialCompleteRequest(), env, action: 'social-complete',
      preenrollmentMemberPort: proof,
    });
    expect(response.status).toBe(200);
    expect(proof.admitExistingMember).toHaveBeenCalledWith(id);
    expect(proof.bindMember).toHaveBeenCalledWith(id);
    expect((await response.json()).data.status).toBe('authenticated');
  });

  it('does not mint a new Subject for already-verified existing Member, and withholds tokens on DB errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      access_token: 'fresh-access-token', refresh_token: 'fresh-refresh-token',
      expires_in: 3600, user: { id, email: 'existing@example.com' },
    })));
    const existing = {
      ...admission(true),
      admitExistingMember: vi.fn(async () => true),
    };
    const success = await handleSupabaseAuthRequestV1({
      request: socialCompleteRequest(), env, action: 'social-complete',
      preenrollmentMemberPort: existing,
    });
    expect(success.status).toBe(200);
    expect(existing.bindMember).not.toHaveBeenCalled();
    expect(existing.readVerified).not.toHaveBeenCalled();

    const failed = {
      ...admission(true),
      bindMember: vi.fn(async () => { throw new Error('Age DB unavailable'); }),
    };
    const blocked = await handleSupabaseAuthRequestV1({
      request: socialCompleteRequest(), env, action: 'social-complete',
      preenrollmentMemberPort: failed,
    });
    expect(blocked.status).toBe(503);
    expect(blocked.headers.get('set-cookie')).toBeNull();
    expect(JSON.stringify(await blocked.json())).not.toContain('fresh-access-token');
  });

  it('does not accidentally consume the age proof by creating a Guest before approved Social OAuth', () => {
    const authPage = readFileSync(new URL('../apps/web/auth-page.js', import.meta.url), 'utf8');
    expect(authPage).toContain('preenrollmentCapabilityAvailable');
    expect(authPage).toContain('if (!await preenrollmentCapabilityAvailable())');
    expect(authPage).toContain('await ensureGuestBearer()');
  });
});
