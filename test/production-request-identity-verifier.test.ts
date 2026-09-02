import { describe, expect, it, vi } from 'vitest';
import {
  PRODUCTION_GUEST_BEARER_FINGERPRINT_VERSION_V1,
  ProductionRequestIdentityVerifierErrorV1,
  createProductionGuestBearerTokenFingerprintPortV1,
  createProductionRequestIdentityVerifierV1,
  fingerprintProductionGuestBearerTokenV1,
  type ProductionRequestIdentityFetchV1,
} from '../apps/api/src/production-request-identity-verifier.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  type ProductionUserDataRuntimeConfigV1,
} from '../apps/api/src/production-user-data-runtime-config.js';

const SUPABASE_API_KEY = 'sb_publishable_example_key_for_runtime_contract';
const GUEST_FINGERPRINT_SECRET =
  'guest-fingerprint-secret-material-at-least-thirty-two-bytes';
const MEMBER_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';
const MEMBER_USER_ID = '6d94ee38-53e8-4f3a-b36c-8801969c298e';
const GUEST_TOKEN = 'myeongha_guest_token_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function configFixture(): ProductionUserDataRuntimeConfigV1 {
  return {
    databaseUrl:
      'postgresql://myeongha_runtime:password@db.example.internal/postgres?sslmode=require',
    databasePrincipal: 'myeongha_runtime',
    databaseExecutionRole: 'myeongha_api_executor',
    supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    supabaseApiKey: SUPABASE_API_KEY,
    guestFingerprintSecret: GUEST_FINGERPRINT_SECRET,
  };
}

function requestWithAuthorization(value?: string): Request {
  return new Request('https://myeongha.vercel.app/api/me', {
    ...(value === undefined ? {} : { headers: { Authorization: value } }),
  });
}

describe('production request identity verifier v1', () => {
  it('returns no evidence for absent or malformed Authorization without calling Supabase', async () => {
    const fetchImpl = vi.fn() as unknown as ProductionRequestIdentityFetchV1;
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      fetchImpl,
    });

    await expect(verifier.verifyRequestIdentity(requestWithAuthorization())).resolves.toBeNull();
    await expect(
      verifier.verifyRequestIdentity(requestWithAuthorization('Basic abc')),
    ).resolves.toBeNull();
    await expect(
      verifier.verifyRequestIdentity(requestWithAuthorization('Bearer token with spaces')),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('verifies JWT-shaped Member credentials against the governed Supabase Auth user endpoint', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ id: MEMBER_USER_ID, email: 'must-not-be-used@example.test' }),
    ) as unknown as ProductionRequestIdentityFetchV1;
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      fetchImpl,
    });

    await expect(
      verifier.verifyRequestIdentity(requestWithAuthorization(`Bearer ${MEMBER_TOKEN}`)),
    ).resolves.toEqual({
      kind: 'member',
      verifiedAuthUserId: MEMBER_USER_ID,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(url).toBe(`${MYEONGHA_PRODUCTION_SUPABASE_ORIGIN}/auth/v1/user`);
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      headers: {
        apikey: SUPABASE_API_KEY,
        authorization: `Bearer ${MEMBER_TOKEN}`,
      },
    });
  });

  it('treats rejected JWT-shaped credentials as unauthenticated and never falls through to Guest identity', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{"message":"invalid"}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as ProductionRequestIdentityFetchV1;
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      fetchImpl,
    });

    await expect(
      verifier.verifyRequestIdentity(requestWithAuthorization(`Bearer ${MEMBER_TOKEN}`)),
    ).resolves.toBeNull();
  });

  it('fails closed when Supabase Auth is unavailable or returns malformed verified identity', async () => {
    const unavailableFetch = vi.fn(async () => {
      throw new Error(`do not leak ${MEMBER_TOKEN}`);
    }) as unknown as ProductionRequestIdentityFetchV1;
    const unavailableVerifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      fetchImpl: unavailableFetch,
    });

    await expect(
      unavailableVerifier.verifyRequestIdentity(
        requestWithAuthorization(`Bearer ${MEMBER_TOKEN}`),
      ),
    ).rejects.toMatchObject({ code: 'SUPABASE_UNAVAILABLE' });

    const malformedFetch = vi.fn(async () =>
      Response.json({ id: 'not-a-uuid' }),
    ) as unknown as ProductionRequestIdentityFetchV1;
    const malformedVerifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      fetchImpl: malformedFetch,
    });

    await expect(
      malformedVerifier.verifyRequestIdentity(
        requestWithAuthorization(`Bearer ${MEMBER_TOKEN}`),
      ),
    ).rejects.toBeInstanceOf(ProductionRequestIdentityVerifierErrorV1);
  });

  it('fingerprints non-JWT opaque Guest bearer credentials locally without calling Supabase', async () => {
    const fetchImpl = vi.fn() as unknown as ProductionRequestIdentityFetchV1;
    const config = configFixture();
    const verifier = createProductionRequestIdentityVerifierV1({ config, fetchImpl });
    const expectedFingerprint = fingerprintProductionGuestBearerTokenV1({
      rawBearerToken: GUEST_TOKEN,
      secret: GUEST_FINGERPRINT_SECRET,
    });

    const evidence = await verifier.verifyRequestIdentity(
      requestWithAuthorization(`Bearer ${GUEST_TOKEN}`),
    );
    expect(evidence).toEqual({
      kind: 'guest',
      verifiedGuestTokenHash: expectedFingerprint,
    });
    expect(expectedFingerprint).toMatch(
      new RegExp(`^${PRODUCTION_GUEST_BEARER_FINGERPRINT_VERSION_V1}:[0-9a-f]{64}$`, 'u'),
    );
    expect(JSON.stringify(evidence)).not.toContain(GUEST_TOKEN);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the exact same Guest fingerprint contract for bootstrap storage and request verification', () => {
    const config = configFixture();
    const port = createProductionGuestBearerTokenFingerprintPortV1(config);
    expect(
      port.fingerprintGuestBearerToken({ rawBearerToken: GUEST_TOKEN }),
    ).toBe(
      fingerprintProductionGuestBearerTokenV1({
        rawBearerToken: GUEST_TOKEN,
        secret: GUEST_FINGERPRINT_SECRET,
      }),
    );
  });

  it('rejects short opaque tokens and JWT-shaped tokens from the Guest fingerprint contract', async () => {
    const fetchImpl = vi.fn() as unknown as ProductionRequestIdentityFetchV1;
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      fetchImpl,
    });

    await expect(
      verifier.verifyRequestIdentity(requestWithAuthorization('Bearer too-short')),
    ).resolves.toBeNull();
    expect(() =>
      fingerprintProductionGuestBearerTokenV1({
        rawBearerToken: MEMBER_TOKEN,
        secret: GUEST_FINGERPRINT_SECRET,
      }),
    ).toThrow('outside the production V1 transport contract');
  });

  it('does not place raw credential or runtime API-key material in verifier errors', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('upstream failure', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      }),
    ) as unknown as ProductionRequestIdentityFetchV1;
    const verifier = createProductionRequestIdentityVerifierV1({
      config: configFixture(),
      fetchImpl,
    });

    let caught: unknown;
    try {
      await verifier.verifyRequestIdentity(
        requestWithAuthorization(`Bearer ${MEMBER_TOKEN}`),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProductionRequestIdentityVerifierErrorV1);
    const serialized = String(caught);
    expect(serialized).not.toContain(MEMBER_TOKEN);
    expect(serialized).not.toContain(SUPABASE_API_KEY);
    expect(serialized).not.toContain(GUEST_FINGERPRINT_SECRET);
  });
});
