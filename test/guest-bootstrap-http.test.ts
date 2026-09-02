import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  GUEST_BOOTSTRAP_HTTP_BINDINGS_V1,
  handleGuestBootstrapRequestV1,
} from '../apps/api/src/guest-bootstrap-http.js';
import type {
  GuestBootstrapAuthorityPortV1,
  GuestBootstrapCredentialIssuerPortV1,
  GuestBootstrapIdentityResolverPortV1,
  GuestBootstrapTokenFingerprintPortV1,
  ReusableBootstrapIdentityV1,
} from '../apps/api/src/guest-bootstrap-command.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const EXPIRES_AT = '2099-01-01T00:00:00.000Z';
const BEARER = `myeongha_guest_v1_${'x'.repeat(40)}`;
const FINGERPRINT =
  'myeongha-guest-bearer-hmac-sha256-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const SERVER_TIME = '2026-09-02T14:00:00.000Z';

class FakeIdentityResolver implements GuestBootstrapIdentityResolverPortV1 {
  calls = 0;
  result: ReusableBootstrapIdentityV1 | null | Error = null;

  resolveExistingBootstrapIdentity(): ReusableBootstrapIdentityV1 | null {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeCredentialIssuer implements GuestBootstrapCredentialIssuerPortV1 {
  calls = 0;

  issueGuestBootstrapCredential() {
    this.calls += 1;
    return {
      subjectId: SUBJECT_ID,
      guestSessionId: SESSION_ID,
      bearerToken: BEARER,
      expiresAt: EXPIRES_AT,
    } as const;
  }
}

class FakeFingerprintPort implements GuestBootstrapTokenFingerprintPortV1 {
  calls: string[] = [];

  fingerprintGuestBearerToken(input: { readonly rawBearerToken: string }): string {
    this.calls.push(input.rawBearerToken);
    return FINGERPRINT;
  }
}

class FakeAuthorityPort implements GuestBootstrapAuthorityPortV1 {
  calls: Array<{
    subjectId: string;
    guestSessionId: string;
    tokenHash: string;
    expiresAt: string;
  }> = [];
  failure: Error | null = null;

  createGuestSession(input: {
    readonly subjectId: string;
    readonly guestSessionId: string;
    readonly tokenHash: string;
    readonly expiresAt: string;
  }) {
    this.calls.push(input);
    if (this.failure !== null) throw this.failure;
    return [
      {
        subjectId: SUBJECT_ID,
        guestSessionId: SESSION_ID,
        expiresAt: EXPIRES_AT,
        replayed: false,
      },
    ] as const;
  }
}

function ports() {
  return {
    identityResolverPort: new FakeIdentityResolver(),
    credentialIssuerPort: new FakeCredentialIssuer(),
    tokenFingerprintPort: new FakeFingerprintPort(),
    authorityPort: new FakeAuthorityPort(),
  };
}

function request(method = 'POST', body?: string): Request {
  return new Request('https://myeongha.example/api/session/bootstrap', {
    method,
    ...(body === undefined
      ? {}
      : {
          body,
          headers: { 'content-type': 'application/json' },
        }),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('Guest bootstrap HTTP boundary', () => {
  it('pins the source-safe route contract without activating a Vercel route', () => {
    expect(GUEST_BOOTSTRAP_HTTP_BINDINGS_V1).toEqual({
      method: 'POST',
      route: '/api/session/bootstrap',
      apiContractVersion: 'v0.9',
      cacheControl: 'no-store',
    });
  });

  it('rejects non-POST methods before any session authority is invoked', async () => {
    const runtimePorts = ports();
    const response = await handleGuestBootstrapRequestV1({
      request: request('GET'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      ...runtimePorts,
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(runtimePorts.identityResolverPort.calls).toBe(0);
    expect(runtimePorts.credentialIssuerPort.calls).toBe(0);
  });

  it('returns INVALID_REQUEST for malformed JSON without touching identity authority', async () => {
    const runtimePorts = ports();
    const response = await handleGuestBootstrapRequestV1({
      request: request('POST', '{'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      ...runtimePorts,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await json(response)).toEqual({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        messageKey: 'request.invalid',
        retryable: false,
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: REQUEST_ID,
      },
    });
    expect(runtimePorts.identityResolverPort.calls).toBe(0);
  });

  it.each([
    ['null', 'null'],
    ['array', '[]'],
    ['string', JSON.stringify('client-value')],
    ['number', '1'],
  ])('rejects a non-object %s body fail-closed', async (_label, body) => {
    const runtimePorts = ports();
    const response = await handleGuestBootstrapRequestV1({
      request: request('POST', body),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      ...runtimePorts,
    });

    expect(response.status).toBe(400);
    expect((await json(response)).error).toEqual({
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
    });
    expect(runtimePorts.identityResolverPort.calls).toBe(0);
    expect(runtimePorts.credentialIssuerPort.calls).toBe(0);
    expect(runtimePorts.authorityPort.calls).toHaveLength(0);
  });

  it('rejects client-controlled identity/token/expiry fields', async () => {
    const runtimePorts = ports();
    const response = await handleGuestBootstrapRequestV1({
      request: request(
        'POST',
        JSON.stringify({
          subjectId: SUBJECT_ID,
          bearerToken: BEARER,
          expiresAt: EXPIRES_AT,
        }),
      ),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      ...runtimePorts,
    });

    expect(response.status).toBe(400);
    expect((await json(response)).error).toEqual({
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
    });
    expect(runtimePorts.credentialIssuerPort.calls).toBe(0);
    expect(runtimePorts.authorityPort.calls).toHaveLength(0);
  });

  it('creates a fresh Guest from an empty body and marks the bearer response no-store', async () => {
    const runtimePorts = ports();
    const response = await handleGuestBootstrapRequestV1({
      request: request('POST'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      ...runtimePorts,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await json(response)).toEqual({
      ok: true,
      data: {
        subjectId: SUBJECT_ID,
        kind: 'guest',
        guestSession: {
          guestSessionId: SESSION_ID,
          expiresAt: EXPIRES_AT,
          bearerToken: BEARER,
        },
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: REQUEST_ID,
        serverTime: SERVER_TIME,
      },
    });
    expect(runtimePorts.credentialIssuerPort.calls).toBe(1);
    expect(runtimePorts.tokenFingerprintPort.calls).toEqual([BEARER]);
    expect(runtimePorts.authorityPort.calls).toEqual([
      {
        subjectId: SUBJECT_ID,
        guestSessionId: SESSION_ID,
        tokenHash: FINGERPRINT,
        expiresAt: EXPIRES_AT,
      },
    ]);
  });

  it('accepts an empty JSON object without turning it into client authority', async () => {
    const runtimePorts = ports();
    const response = await handleGuestBootstrapRequestV1({
      request: request('POST', '{}'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      ...runtimePorts,
    });

    expect(response.status).toBe(200);
    expect(runtimePorts.authorityPort.calls).toHaveLength(1);
  });

  it('reuses an existing Guest without re-emitting its bearer credential', async () => {
    const runtimePorts = ports();
    runtimePorts.identityResolverPort.result = {
      kind: 'guest',
      subjectId: SUBJECT_ID,
      guestSessionId: SESSION_ID,
      expiresAt: EXPIRES_AT,
    };
    const response = await handleGuestBootstrapRequestV1({
      request: request('POST'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      ...runtimePorts,
    });

    expect(response.status).toBe(200);
    expect((await json(response)).data).toEqual({
      subjectId: SUBJECT_ID,
      kind: 'guest',
      guestSession: {
        guestSessionId: SESSION_ID,
        expiresAt: EXPIRES_AT,
        bearerToken: null,
      },
    });
    expect(runtimePorts.credentialIssuerPort.calls).toBe(0);
    expect(runtimePorts.tokenFingerprintPort.calls).toHaveLength(0);
    expect(runtimePorts.authorityPort.calls).toHaveLength(0);
  });

  it('reuses an existing Member without creating any Guest state', async () => {
    const runtimePorts = ports();
    runtimePorts.identityResolverPort.result = {
      kind: 'member',
      subjectId: SUBJECT_ID,
    };
    const response = await handleGuestBootstrapRequestV1({
      request: request('POST'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      ...runtimePorts,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await json(response)).data).toEqual({
      subjectId: SUBJECT_ID,
      kind: 'member',
      guestSession: null,
    });
    expect(runtimePorts.credentialIssuerPort.calls).toBe(0);
    expect(runtimePorts.tokenFingerprintPort.calls).toHaveLength(0);
    expect(runtimePorts.authorityPort.calls).toHaveLength(0);
  });

  it('maps a rejected supplied credential to AUTH_REQUIRED and never creates a new Guest', async () => {
    const runtimePorts = ports();
    runtimePorts.identityResolverPort.result = new ApiCommandError(
      'AUTH_REQUIRED',
      'supplied credential rejected',
    );
    const response = await handleGuestBootstrapRequestV1({
      request: request('POST'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      ...runtimePorts,
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await json(response)).error).toEqual({
      code: 'AUTH_REQUIRED',
      messageKey: 'auth.required',
      retryable: false,
    });
    expect(runtimePorts.credentialIssuerPort.calls).toBe(0);
    expect(runtimePorts.authorityPort.calls).toHaveLength(0);
  });

  it('does not flatten unexpected identity infrastructure failures into client errors', async () => {
    const runtimePorts = ports();
    const failure = new Error('database unavailable');
    runtimePorts.identityResolverPort.result = failure;

    await expect(
      handleGuestBootstrapRequestV1({
        request: request('POST'),
        requestId: REQUEST_ID,
        serverTime: SERVER_TIME,
        ...runtimePorts,
      }),
    ).rejects.toBe(failure);
  });

  it('does not silently fall back after a fresh Guest authority failure', async () => {
    const runtimePorts = ports();
    const failure = new Error('guest session authority unavailable');
    runtimePorts.authorityPort.failure = failure;

    await expect(
      handleGuestBootstrapRequestV1({
        request: request('POST'),
        requestId: REQUEST_ID,
        serverTime: SERVER_TIME,
        ...runtimePorts,
      }),
    ).rejects.toBe(failure);

    expect(runtimePorts.credentialIssuerPort.calls).toBe(1);
    expect(runtimePorts.tokenFingerprintPort.calls).toEqual([BEARER]);
    expect(runtimePorts.authorityPort.calls).toHaveLength(1);
    expect(failure.message).not.toContain(BEARER);
  });
});
