import { describe, expect, it, vi } from 'vitest';
import {
  denyUnverifiedInitialIdentityAdmissionV1,
  PORTONE_UNVERIFIED_IDENTITY_ADMISSION_V1,
} from '../apps/api/src/portone-v2-preidentity-admission-v1.js';
import { handleSupabaseAuthRequestV1 } from '../apps/api/src/supabase-auth-http.js';
import { createProductionMemberAuthHttpRuntimeV1 } from '../apps/api/src/production-member-auth-http-runtime.js';
import { handleSocialAuthStartRequestV1 } from '../apps/api/src/social-auth-start-http.js';
import { handleNaverOAuthBridgeRequestV1 } from '../apps/api/src/naver-oauth-bridge-http.js';
import { handleChatReadRequestV1 } from '../apps/api/src/chat-read-http.js';

const enforcedEnv = {
  MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT: 'ENFORCE',
  MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE: 'APPROVED_AND_APPLIED',
  MYEONGHA_PORTONE_IDENTITY_PRIVACY_DISPOSITION_STATE: 'APPROVED',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-key-auth-transport-over-twenty-chars',
};

describe('L2 unverified initial identity admission', () => {
  it('preserves OFF behavior and denies each enrollment surface when ENFORCE', async () => {
    for (const surface of PORTONE_UNVERIFIED_IDENTITY_ADMISSION_V1.surfaces) {
      expect(denyUnverifiedInitialIdentityAdmissionV1({ env: {}, surface })).toBeNull();
      const response = denyUnverifiedInitialIdentityAdmissionV1({ env: enforcedEnv, surface });
      expect(response?.status).toBe(503);
      expect(response?.headers.get('cache-control')).toBe('no-store');
      await expect(response?.json()).resolves.toMatchObject({
        error: { code: 'AGE_VERIFICATION_UNAVAILABLE' },
      });
    }
  });

  it('denies password signup before password and Supabase network checks', async () => {
    const compromise = vi.fn(async () => ({ status: 'clear' as const }));
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(async () => { throw new Error('Unexpected auth provider request'); });
    globalThis.fetch = fetchSpy;
    try {
      const response = await handleSupabaseAuthRequestV1({
        request: new Request('https://myeongha.vercel.app/api/auth/sign-up', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'strong-untrusted' }),
        }),
        env: enforcedEnv,
        action: 'sign-up',
        passwordCompromiseGuard: { check: compromise },
      });
      expect(response.status).toBe(503);
      expect(compromise).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('denies production signup before rate-limit DB composition', async () => {
    const authHandler = vi.fn(async () => new Response(null, { status: 200 }));
    const runtime = createProductionMemberAuthHttpRuntimeV1({ env: enforcedEnv, authHandler });
    try {
      const denied = await runtime.handleRequest({
        action: 'sign-up',
        request: new Request('https://myeongha.vercel.app/api/auth/sign-up', {
          method: 'POST', body: '{}',
        }),
      });
      expect(denied.status).toBe(503);
      expect(authHandler).not.toHaveBeenCalled();
    } finally {
      await runtime.close();
    }
  });

  it('denies social start, session completion and Naver exchange', async () => {
    const social = await handleSocialAuthStartRequestV1({
      request: new Request('https://myeongha.vercel.app/api/auth/social/start', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', redirectUri: 'myeongha://auth/callback' }),
      }),
      env: enforcedEnv,
    });
    expect(social.status).toBe(503);
    const complete = await handleSupabaseAuthRequestV1({
      request: new Request('https://myeongha.vercel.app/api/auth/social/complete', {
        method: 'POST', headers: { 'x-myeongha-auth-transport': 'web-cookie-v1' },
        body: JSON.stringify({ refreshToken: 'untrusted' }),
      }),
      env: enforcedEnv,
      action: 'social-complete',
    });
    expect(complete.status).toBe(503);
    const bridge = await handleNaverOAuthBridgeRequestV1({
      request: new Request('https://myeongha.vercel.app/api/auth/social/naver/authorize'),
      action: 'authorize',
      env: enforcedEnv,
    });
    expect(bridge.status).toBe(503);
  });

  it('denies historical chat reveal before DB read if age is missing or authority fails', async () => {
    for (const fails of [false, true]) {
      const connect = vi.fn();
      const response = await handleChatReadRequestV1({
        request: new Request('https://myeongha.vercel.app/api/chat/11111111-1111-4111-8111-111111111111'),
        requestId: 'req-age-history',
        serverTime: '2026-10-24T00:00:00Z',
        identityEvidenceVerifier: {
          verifyRequestIdentity: async () => ({
            kind: 'member' as const,
            verifiedAuthUserId: '22222222-2222-4222-8222-222222222222',
          }),
        },
        pool: { connect },
        ageAdmissionPort: {
          admitFreePersonalization: async () => {
            if (fails) throw new Error('DB unavailable');
            return false;
          },
        },
      });
      expect(response.status).toBe(fails ? 503 : 403);
      expect(connect).not.toHaveBeenCalled();
    }
  });
});
