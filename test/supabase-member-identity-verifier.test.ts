import { describe, expect, it } from 'vitest';
import {
  SupabaseMemberIdentityEvidenceVerifierV1,
  SupabaseMemberIdentityVerifierErrorV1,
  type SupabaseMemberVerifierFetchV1,
} from '../apps/api/src/supabase-member-identity-verifier.js';

const ORIGIN = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
const API_KEY = 'sb_publishable_test_key_material_1234567890';
const ACCESS_TOKEN = 'header.payload.signature';
const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

type FetchCall = Readonly<{
  input: string | URL | Request;
  init: RequestInit | undefined;
}>;

function createRequest(authorization?: string): Request {
  const headers = new Headers({
    Cookie: 'session=must-not-forward',
    'X-Client-Subject-Id': 'must-not-be-trusted',
  });
  if (authorization !== undefined) headers.set('Authorization', authorization);
  return new Request('https://myeongha.vercel.app/api/me', { headers });
}

function createVerifier(
  responseFactory: () => Response | Promise<Response>,
): {
  verifier: SupabaseMemberIdentityEvidenceVerifierV1;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl: SupabaseMemberVerifierFetchV1 = async (input, init) => {
    calls.push(Object.freeze({ input, init }));
    return responseFactory();
  };

  return {
    verifier: new SupabaseMemberIdentityEvidenceVerifierV1({
      supabaseOrigin: ORIGIN,
      supabaseApiKey: API_KEY,
      fetchImpl,
    }),
    calls,
  };
}

describe('Supabase Member identity verifier', () => {
  it('returns null without opening an upstream request when bearer evidence is absent', async () => {
    const fixture = createVerifier(() => {
      throw new Error('fetch must not be called');
    });

    await expect(
      fixture.verifier.verifyRequestIdentity(createRequest()),
    ).resolves.toBeNull();
    expect(fixture.calls).toEqual([]);
  });

  it.each([
    'Basic abc',
    'Bearer',
    'Bearer ',
    'Bearer token with spaces',
  ])('returns null for malformed authorization evidence: %s', async (authorization) => {
    const fixture = createVerifier(() => {
      throw new Error('fetch must not be called');
    });

    await expect(
      fixture.verifier.verifyRequestIdentity(createRequest(authorization)),
    ).resolves.toBeNull();
    expect(fixture.calls).toEqual([]);
  });

  it('verifies bearer evidence against the governed Supabase Auth user endpoint', async () => {
    const fixture = createVerifier(() =>
      Response.json({
        id: USER_ID,
        email: 'ignored@example.com',
        user_metadata: { subjectId: 'must-not-be-trusted' },
      }),
    );

    await expect(
      fixture.verifier.verifyRequestIdentity(
        createRequest(`bearer ${ACCESS_TOKEN}`),
      ),
    ).resolves.toEqual({
      kind: 'member',
      verifiedAuthUserId: USER_ID,
    });

    expect(fixture.calls).toHaveLength(1);
    expect(String(fixture.calls[0]?.input)).toBe(`${ORIGIN}/auth/v1/user`);
    expect(fixture.calls[0]?.init?.method).toBe('GET');

    const headers = new Headers(fixture.calls[0]?.init?.headers);
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('apikey')).toBe(API_KEY);
    expect(headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('x-client-subject-id')).toBeNull();
  });

  it.each([401, 403])('returns null when Supabase Auth rejects the access token with %s', async (status) => {
    const fixture = createVerifier(() => new Response(null, { status }));

    await expect(
      fixture.verifier.verifyRequestIdentity(
        createRequest(`Bearer ${ACCESS_TOKEN}`),
      ),
    ).resolves.toBeNull();
  });

  it('fails closed when Supabase Auth is unavailable', async () => {
    const secretInCause = `network failure ${ACCESS_TOKEN}`;
    const calls: FetchCall[] = [];
    const verifier = new SupabaseMemberIdentityEvidenceVerifierV1({
      supabaseOrigin: ORIGIN,
      supabaseApiKey: API_KEY,
      fetchImpl: async (input, init) => {
        calls.push(Object.freeze({ input, init }));
        throw new Error(secretInCause);
      },
    });

    let thrown: unknown;
    try {
      await verifier.verifyRequestIdentity(
        createRequest(`Bearer ${ACCESS_TOKEN}`),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SupabaseMemberIdentityVerifierErrorV1);
    expect(thrown).toMatchObject({
      code: 'SUPABASE_MEMBER_VERIFIER_UPSTREAM_FAILED',
    });
    expect((thrown as Error).message).not.toContain(ACCESS_TOKEN);
    expect((thrown as Error).message).not.toContain(API_KEY);
    expect(calls).toHaveLength(1);
  });

  it('does not downgrade an upstream 5xx into AUTH_REQUIRED', async () => {
    const fixture = createVerifier(() =>
      Response.json({ message: ACCESS_TOKEN }, { status: 503 }),
    );

    await expect(
      fixture.verifier.verifyRequestIdentity(
        createRequest(`Bearer ${ACCESS_TOKEN}`),
      ),
    ).rejects.toMatchObject({
      code: 'SUPABASE_MEMBER_VERIFIER_UPSTREAM_FAILED',
      message: 'Supabase Auth user verification failed with status 503.',
    });
  });

  it('fails closed on invalid JSON from a successful Auth response', async () => {
    const fixture = createVerifier(() =>
      new Response('not-json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      fixture.verifier.verifyRequestIdentity(
        createRequest(`Bearer ${ACCESS_TOKEN}`),
      ),
    ).rejects.toMatchObject({
      code: 'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID',
    });
  });

  it.each([
    null,
    {},
    { id: '' },
    { id: 'not-a-uuid' },
  ])('fails closed on malformed Auth user identity: %j', async (payload) => {
    const fixture = createVerifier(() => Response.json(payload));

    await expect(
      fixture.verifier.verifyRequestIdentity(
        createRequest(`Bearer ${ACCESS_TOKEN}`),
      ),
    ).rejects.toMatchObject({
      code: 'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID',
    });
  });

  it('rejects unsafe verifier configuration before any request can be made', () => {
    expect(
      () =>
        new SupabaseMemberIdentityEvidenceVerifierV1({
          supabaseOrigin: 'http://cnsfpcdiyofqvhpcegfc.supabase.co',
          supabaseApiKey: API_KEY,
          fetchImpl: async () => Response.json({ id: USER_ID }),
        }),
    ).toThrow('bare HTTPS origin');

    expect(
      () =>
        new SupabaseMemberIdentityEvidenceVerifierV1({
          supabaseOrigin: ORIGIN,
          supabaseApiKey: 'short',
          fetchImpl: async () => Response.json({ id: USER_ID }),
        }),
    ).toThrow('API key is missing or invalid');
  });
});
