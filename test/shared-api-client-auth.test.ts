import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientErrorV1,
  MyeongHaApiClientV1,
  bootstrapSessionV1,
  normalizeOpaqueGuestBearerV1,
  readCurrentSubjectProfileV1,
  resolveGuestCredentialFromBootstrapV1,
  type GuestCredentialV1,
} from '../packages/api-client/src/index.js';

function apiJson(data: unknown, status = 200): Response {
  return Response.json(
    status >= 200 && status < 300
      ? { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-1' } }
      : {
          ok: false,
          error: { code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false },
          meta: { apiContractVersion: 'v0.9', requestId: 'req-1' },
        },
    { status },
  );
}

describe('shared API/auth client', () => {
  it('bootstraps a fresh Guest without client-selected identity fields', async () => {
    let observedUrl = '';
    let observedInit: RequestInit | undefined;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        observedUrl = String(input);
        observedInit = init;
        return apiJson({
          subjectId: 'subject-1',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'guest-session-1',
            expiresAt: '2026-10-06T00:00:00.000Z',
            bearerToken: 'opaque-guest-token',
          },
        });
      },
    });

    const result = await bootstrapSessionV1(client);

    expect(observedUrl).toBe('https://myeongha.test/api/session/bootstrap');
    expect(observedInit?.method).toBe('POST');
    expect(observedInit?.body).toBe('{}');
    expect(new Headers(observedInit?.headers).get('Authorization')).toBeNull();
    expect(result.kind).toBe('guest');
    if (result.kind === 'guest') {
      expect(result.guestSession.bearerToken).toBe('opaque-guest-token');
    }
  });

  it('reuses an existing Guest bearer only when the null-token response matches local authority', async () => {
    const existing: GuestCredentialV1 = Object.freeze({
      kind: 'guest',
      subjectId: 'subject-1',
      guestSessionId: 'guest-session-1',
      bearerToken: 'opaque-existing-token',
      expiresAt: '2026-10-06T00:00:00.000Z',
    });
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        return apiJson({
          subjectId: existing.subjectId,
          kind: 'guest',
          guestSession: {
            guestSessionId: existing.guestSessionId,
            expiresAt: existing.expiresAt,
            bearerToken: null,
          },
        });
      },
    });

    const bootstrap = await bootstrapSessionV1(client, existing.bearerToken);
    expect(authorization).toBe(`Bearer ${existing.bearerToken}`);
    expect(resolveGuestCredentialFromBootstrapV1(bootstrap, existing)).toBe(existing);
  });

  it('fails closed when the server reuses a Guest session but no matching local bearer exists', () => {
    expect(() =>
      resolveGuestCredentialFromBootstrapV1(
        {
          subjectId: 'subject-1',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'guest-session-1',
            expiresAt: '2026-10-06T00:00:00.000Z',
            bearerToken: null,
          },
        },
        null,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'API_GUEST_REUSE_CREDENTIAL_MISSING',
      }),
    );
  });

  it('reads the canonical current subject profile with an explicit bearer', async () => {
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        return apiJson({
          subjectId: 'subject-1',
          subjectKind: 'guest',
          subjectStatus: 'active',
          profile: {
            displayName: '지환',
            locale: 'ko-KR',
            timezone: 'Asia/Seoul',
            onboardingState: 'started',
            updatedAt: '2026-09-29T00:00:00.000Z',
          },
        });
      },
    });

    const profile = await readCurrentSubjectProfileV1(client, 'opaque-guest-token');

    expect(authorization).toBe('Bearer opaque-guest-token');
    expect(profile.subjectId).toBe('subject-1');
    expect(profile.subjectKind).toBe('guest');
    expect(profile.profile?.displayName).toBe('지환');
  });

  it('rejects JWT-shaped material as a Guest bearer', () => {
    expect(() => normalizeOpaqueGuestBearerV1('aaa.bbb.ccc')).toThrow();
  });

  it('keeps server error codes without exposing bearer material', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => apiJson(null, 401),
    });

    await expect(
      readCurrentSubjectProfileV1(client, 'opaque-secret-guest-token'),
    ).rejects.toMatchObject({
      kind: 'http',
      code: 'AUTH_REQUIRED',
      status: 401,
    });

    try {
      await readCurrentSubjectProfileV1(client, 'opaque-secret-guest-token');
    } catch (error) {
      expect(error).toBeInstanceOf(MyeongHaApiClientErrorV1);
      expect(String(error)).not.toContain('opaque-secret-guest-token');
    }
  });
});
