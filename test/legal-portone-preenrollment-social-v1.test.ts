import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSocialAuthStartRequestV1 } from '../apps/api/src/social-auth-start-http.js';
import { handleSupabaseAuthRequestV1 } from '../apps/api/src/supabase-auth-http.js';
import type { SupabasePreenrollmentMemberBindingPortV1 } from '../apps/api/src/supabase-auth-http.js';
import { readFileSync } from 'node:fs';
import { issuePortOneBoundSocialStateV1, verifyPortOneBoundSocialStateV1 } from '../apps/api/src/portone-v2-preenrollment-social-state-v1.js';

const env = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
  MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT: 'ENFORCE',
  MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE: 'APPROVED_AND_APPLIED',
  MYEONGHA_PORTONE_IDENTITY_PRIVACY_DISPOSITION_STATE: 'APPROVED',
  MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED: 'true',
};
const id = '22222222-2222-4222-8222-222222222222';
const socialClock = Date.parse('2026-10-24T08:00:00Z');
const socialSecret = 'test-a1-oauth-state-bound-cookie-secret-at-least-32-chars';
const socialDigest = 'a'.repeat(64);
const signedSocialState = issuePortOneBoundSocialStateV1({
  secret: socialSecret, bindingDigest: socialDigest,
  nowEpochMs: socialClock, nonce: 'c'.repeat(32),
});
const socialStartRequest = () => new Request('https://myeongha.vercel.app/api/auth/social/start', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: 'google', redirectUri:
    'https://myeongha.vercel.app/auth.html?social=callback' }),
});
const socialCompleteRequest = (state = signedSocialState) => new Request('https://myeongha.vercel.app/api/auth/social/complete', {
  method: 'POST', headers: {
    'Content-Type': 'application/json',
    'X-MyeongHa-Auth-Transport': 'web-cookie-v1',
  },
  body: JSON.stringify({ refreshToken: 'untrusted-oauth-token', state }),
});
const admission = (found: boolean): SupabasePreenrollmentMemberBindingPortV1 => ({
  readVerified: vi.fn(async () => found),
  bindMember: vi.fn(async () => undefined),
  admitExistingMember: vi.fn(async () => false),
  issueSocialState: vi.fn(() => signedSocialState),
  verifySocialState: vi.fn((state: string) => state === signedSocialState),
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

  it('lets verified EXISTING Social Members discover Web OAuth without a new proof', async () => {
    const request = new Request('https://myeongha.vercel.app/api/auth/social/start', {
      method: 'POST',
      headers: { Origin: 'https://myeongha.vercel.app', 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'google',
        redirectUri: 'https://myeongha.vercel.app/auth.html?social=callback' }),
    });
    const result = await handleSocialAuthStartRequestV1({
      request, env, approvedExistingMemberStart: true,
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.data.authorizationUrl).toContain('/auth/v1/authorize');
    expect(body.data.state).toMatch(/^[A-Za-z0-9_-]{16,128}$/u);
    expect(body.data.state).not.toBe(signedSocialState);

    const unauthorized = await handleSocialAuthStartRequestV1({
      request: socialStartRequest(), env, approvedExistingMemberStart: true,
    });
    expect(unauthorized.status).toBe(403);

    const native = await handleSocialAuthStartRequestV1({
      request: new Request('https://myeongha.vercel.app/api/auth/social/start', {
        method: 'POST',
        headers: { Origin: 'https://myeongha.vercel.app', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google', redirectUri: 'myeongha://auth/callback',
        }),
      }),
      env, approvedExistingMemberStart: true,
    });
    expect(native.status).toBe(403);
  });

  it('does not grant an unverified OAuth account access on existing-member-only callback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600,
      user: { id, email: 'new-social@example.com' },
    })));
    const existingOnly: SupabasePreenrollmentMemberBindingPortV1 = {
      ...admission(false),
      admitExistingMember: vi.fn(async () => false),
    };
    const result = await handleSupabaseAuthRequestV1({
      request: socialCompleteRequest('legacy-state-for-existing-member'),
      env, action: 'social-complete', preenrollmentMemberPort: existingOnly,
    });
    expect(result.status).toBe(403);
    expect(existingOnly.bindMember).not.toHaveBeenCalled();
    expect(result.headers.get('set-cookie')).toBeNull();
  });

  it('allows only preverified Social start without exposing secrets or age DOB', async () => {
    const proof = admission(true);
    const response = await handleSocialAuthStartRequestV1({
      request: socialStartRequest(), env,
      preenrollmentMemberPort: proof,
      nowEpochMs: () => socialClock,
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.provider).toBe('google');
    expect(payload.data.authorizationUrl).toContain('/auth/v1/authorize');
    expect(JSON.stringify(payload)).not.toContain('MYEONGHA_PORTONE');
    expect(proof.readVerified).toHaveBeenCalledOnce();
    expect(proof.issueSocialState).toHaveBeenCalledWith(socialClock);
    expect(payload.data.state).toBe(signedSocialState);
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
    expect(proof.verifySocialState).toHaveBeenCalledWith(signedSocialState);
    expect((await response.json()).data.status).toBe('authenticated');
    expect(response.headers.get('set-cookie')).toContain('__Host-myeongha-preage-v1=;');
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
  it('refuses a Social callback state from a different preenrollment actor before Member creation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      access_token: 'stolen-access-token',
      refresh_token: 'stolen-refresh-token',
      expires_in: 3600, user: { id, email: 'different@example.com' },
    })));
    const proof = admission(true);
    const foreignState = issuePortOneBoundSocialStateV1({
      secret: socialSecret, bindingDigest: 'b'.repeat(64),
      nowEpochMs: socialClock, nonce: 'd'.repeat(32),
    });
    const response = await handleSupabaseAuthRequestV1({
      request: socialCompleteRequest(foreignState), action: 'social-complete',
      env, preenrollmentMemberPort: proof,
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('SOCIAL_AUTH_CALLBACK_STATE_MISMATCH');
    expect(proof.bindMember).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('validates signed social state expiry, anti-tamper and browser digest equality', () => {
    const valid = {
      secret: socialSecret, bindingDigest: socialDigest,
      state: signedSocialState, nowEpochMs: socialClock + 30_000,
    };
    expect(verifyPortOneBoundSocialStateV1(valid)).toBe(true);
    expect(verifyPortOneBoundSocialStateV1({ ...valid, bindingDigest: 'b'.repeat(64) })).toBe(false);
    expect(verifyPortOneBoundSocialStateV1({ ...valid, state: signedSocialState.slice(0, -1) + (signedSocialState.endsWith('A') ? 'B' : 'A') })).toBe(false);
    expect(verifyPortOneBoundSocialStateV1({ ...valid, nowEpochMs: socialClock + 601_000 })).toBe(false);
    expect(verifyPortOneBoundSocialStateV1({ ...valid, nowEpochMs: socialClock - 31_000 })).toBe(false);
  });

});
