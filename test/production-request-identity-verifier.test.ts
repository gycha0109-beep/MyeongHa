import { describe, expect, it, vi } from 'vitest';
import {
  PRODUCTION_GUEST_BEARER_FINGERPRINT_VERSION_V1,
  createProductionGuestBearerTokenFingerprintPortV1,
  createProductionRequestIdentityVerifierV1,
  fingerprintProductionGuestBearerTokenV1,
} from '../apps/api/src/production-request-identity-verifier.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  type ProductionUserDataRuntimeConfigV1,
} from '../apps/api/src/production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from '../apps/api/src/supabase-member-identity-verifier.js';

const MEMBER_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';
const MEMBER_USER_ID = '019535d7-31c3-7cc4-ae2b-3e4f5a6b7c8d';
const GUEST_TOKEN = 'myeongha_guest_token_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GUEST_SECRET = 'guest-fingerprint-secret-material-at-least-thirty-two-bytes';

function configFixture(): ProductionUserDataRuntimeConfigV1 {
  return {
    databaseUrl:
      'postgresql://myeongha_runtime:password@db.example.internal/postgres?sslmode=require',
    databasePrincipal: 'myeongha_runtime',
    databaseExecutionRole: 'myeongha_api_executor',
    supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    supabaseApiKey: 'sb_publishable_example_key_for_runtime_contract',
    guestFingerprintSecret: GUEST_SECRET,
  };
}

function request(token?: string): Request {
  return new Request('https://myeongha.vercel.app/api/me', {
    ...(token === undefined ? {} : { headers: { Authorization: `Bearer ${token}` } }),
  });
}

describe('production request identity verifier v1', () => {
  it('delegates JWT-shaped credentials exclusively to the authoritative Supabase Member verifier', async () => {
    const memberFetch = vi.fn(async () =>
      Response.json({ id: MEMBER_USER_ID }),
    );
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      memberFetchImpl: memberFetch as SupabaseMemberVerifierFetchV1,
    });

    await expect(verifier.verifyRequestIdentity(request(MEMBER_TOKEN))).resolves.toEqual({
      kind: 'member',
      verifiedAuthUserId: MEMBER_USER_ID,
    });
    expect(memberFetch).toHaveBeenCalledTimes(1);
  });

  it('never falls a rejected JWT-shaped Member credential through to Guest identity', async () => {
    const memberFetch = vi.fn(async () =>
      new Response('{"message":"invalid"}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      memberFetchImpl: memberFetch as SupabaseMemberVerifierFetchV1,
    });

    await expect(verifier.verifyRequestIdentity(request(MEMBER_TOKEN))).resolves.toBeNull();
    expect(memberFetch).toHaveBeenCalledTimes(1);
  });

  it('fingerprints supported opaque Guest bearers locally without contacting Supabase', async () => {
    const memberFetch = vi.fn();
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      memberFetchImpl: memberFetch as SupabaseMemberVerifierFetchV1,
    });
    const expected = fingerprintProductionGuestBearerTokenV1({
      rawBearerToken: GUEST_TOKEN,
      secret: GUEST_SECRET,
    });

    await expect(verifier.verifyRequestIdentity(request(GUEST_TOKEN))).resolves.toEqual({
      kind: 'guest',
      verifiedGuestTokenHash: expected,
    });
    expect(expected).toMatch(
      new RegExp(`^${PRODUCTION_GUEST_BEARER_FINGERPRINT_VERSION_V1}:[0-9a-f]{64}$`, 'u'),
    );
    expect(expected).not.toContain(GUEST_TOKEN);
    expect(memberFetch).not.toHaveBeenCalled();
  });

  it('uses the exact same Guest fingerprint contract for bootstrap storage', () => {
    const port = createProductionGuestBearerTokenFingerprintPortV1(configFixture());
    expect(port.fingerprintGuestBearerToken({ rawBearerToken: GUEST_TOKEN })).toBe(
      fingerprintProductionGuestBearerTokenV1({
        rawBearerToken: GUEST_TOKEN,
        secret: GUEST_SECRET,
      }),
    );
  });

  it('rejects malformed authorization and unsupported Guest bearer shapes before identity lookup', async () => {
    const memberFetch = vi.fn();
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      memberFetchImpl: memberFetch as SupabaseMemberVerifierFetchV1,
    });

    await expect(verifier.verifyRequestIdentity(request())).resolves.toBeNull();
    await expect(verifier.verifyRequestIdentity(request('too-short'))).resolves.toBeNull();
    await expect(
      verifier.verifyRequestIdentity(
        new Request('https://myeongha.vercel.app/api/me', {
          headers: { Authorization: 'Basic not-supported' },
        }),
      ),
    ).resolves.toBeNull();
    expect(memberFetch).not.toHaveBeenCalled();
  });

  it('prevents JWT-shaped credentials from entering the Guest fingerprint contract directly', () => {
    expect(() =>
      fingerprintProductionGuestBearerTokenV1({
        rawBearerToken: MEMBER_TOKEN,
        secret: GUEST_SECRET,
      }),
    ).toThrow('outside the production V1 transport contract');
  });
});
