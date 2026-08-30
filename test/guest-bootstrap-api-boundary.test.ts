import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  GUEST_BOOTSTRAP_AUTHORITY_BINDING_V1,
  GuestBootstrapAuthorityPortErrorV1,
  bootstrapSession,
  type GuestBootstrapAuthorityPortV1,
  type GuestBootstrapAuthorityRowV1,
  type GuestBootstrapCredentialIssuerPortV1,
  type GuestBootstrapIdentityResolverPortV1,
  type GuestBootstrapTokenFingerprintPortV1,
  type IssuedGuestBootstrapCredentialV1,
  type ReusableBootstrapIdentityV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '61000000-0000-0000-0000-00000000b123';
const SESSION_ID = '62000000-0000-0000-0000-00000000b123';
const RAW_TOKEN = 'opaque.guest.bearer.token';
const TOKEN_HASH = 'hmac-sha256:k2:guest-bootstrap-token';
const EXPIRES_AT = '2099-01-01T00:00:00.000Z';

class FakeIdentityResolverPortV1 implements GuestBootstrapIdentityResolverPortV1 {
  calls = 0;
  result: ReusableBootstrapIdentityV1 | null | Error = null;

  resolveExistingBootstrapIdentity(): ReusableBootstrapIdentityV1 | null {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeCredentialIssuerPortV1 implements GuestBootstrapCredentialIssuerPortV1 {
  calls = 0;
  result: IssuedGuestBootstrapCredentialV1 | Error = Object.freeze({
    subjectId: SUBJECT_ID,
    guestSessionId: SESSION_ID,
    bearerToken: RAW_TOKEN,
    expiresAt: EXPIRES_AT,
  });

  issueGuestBootstrapCredential(): IssuedGuestBootstrapCredentialV1 {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeTokenFingerprintPortV1 implements GuestBootstrapTokenFingerprintPortV1 {
  readonly calls: Array<{ rawBearerToken: string }> = [];
  result: string | Error = TOKEN_HASH;

  fingerprintGuestBearerToken(input: { readonly rawBearerToken: string }): string {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeAuthorityPortV1 implements GuestBootstrapAuthorityPortV1 {
  readonly calls: Array<{
    subjectId: string;
    guestSessionId: string;
    tokenHash: string;
    expiresAt: string;
  }> = [];
  result: readonly GuestBootstrapAuthorityRowV1[] | Error = Object.freeze([
    Object.freeze({
      subjectId: SUBJECT_ID,
      guestSessionId: SESSION_ID,
      expiresAt: EXPIRES_AT,
      replayed: false,
    }),
  ]);

  createGuestSession(input: {
    readonly subjectId: string;
    readonly guestSessionId: string;
    readonly tokenHash: string;
    readonly expiresAt: string;
  }): readonly GuestBootstrapAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

function ports() {
  return {
    identityResolverPort: new FakeIdentityResolverPortV1(),
    credentialIssuerPort: new FakeCredentialIssuerPortV1(),
    tokenFingerprintPort: new FakeTokenFingerprintPortV1(),
    authorityPort: new FakeAuthorityPortV1(),
  };
}

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

describe('Guest session bootstrap API authority boundary', () => {
  it('pins POST /api/session/bootstrap to the atomic Guest owner/session command', () => {
    expect(GUEST_BOOTSTRAP_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_create_guest_session_v1',
    );
  });

  it('reuses an existing verified Member identity without creating Guest state', async () => {
    const p = ports();
    p.identityResolverPort.result = Object.freeze({
      kind: 'member',
      subjectId: 'member-subject-1',
    });

    const result = await bootstrapSession(p);

    expect(result).toEqual({
      subjectId: 'member-subject-1',
      kind: 'member',
      guestSession: null,
    });
    expect(p.credentialIssuerPort.calls).toBe(0);
    expect(p.tokenFingerprintPort.calls).toHaveLength(0);
    expect(p.authorityPort.calls).toHaveLength(0);
  });

  it('reuses an existing verified Guest identity without re-emitting its bearer token', async () => {
    const p = ports();
    p.identityResolverPort.result = Object.freeze({
      kind: 'guest',
      subjectId: SUBJECT_ID,
      guestSessionId: SESSION_ID,
      expiresAt: EXPIRES_AT,
    });

    const result = await bootstrapSession(p);

    expect(result).toEqual({
      subjectId: SUBJECT_ID,
      kind: 'guest',
      guestSession: {
        guestSessionId: SESSION_ID,
        expiresAt: EXPIRES_AT,
        bearerToken: null,
      },
    });
    expect(p.credentialIssuerPort.calls).toBe(0);
    expect(p.tokenFingerprintPort.calls).toHaveLength(0);
    expect(p.authorityPort.calls).toHaveLength(0);
  });

  it('creates a Guest only when no valid identity exists and sends only the fingerprint to DB authority', async () => {
    const p = ports();

    const result = await bootstrapSession(p);

    expect(p.identityResolverPort.calls).toBe(1);
    expect(p.credentialIssuerPort.calls).toBe(1);
    expect(p.tokenFingerprintPort.calls).toEqual([{ rawBearerToken: RAW_TOKEN }]);
    expect(p.authorityPort.calls).toEqual([
      {
        subjectId: SUBJECT_ID,
        guestSessionId: SESSION_ID,
        tokenHash: TOKEN_HASH,
        expiresAt: EXPIRES_AT,
      },
    ]);
    expect(p.authorityPort.calls[0]).not.toHaveProperty('bearerToken');
    expect(result).toEqual({
      subjectId: SUBJECT_ID,
      kind: 'guest',
      guestSession: {
        guestSessionId: SESSION_ID,
        expiresAt: EXPIRES_AT,
        bearerToken: RAW_TOKEN,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.guestSession && Object.isFrozen(result.guestSession)).toBe(true);
  });

  it('accepts no client-controlled bootstrap fields', async () => {
    await expect(bootstrapSession({ request: {}, ...ports() })).resolves.toBeDefined();

    for (const request of [
      null,
      [],
      'token',
      { subjectId: SUBJECT_ID },
      { guestSessionId: SESSION_ID },
      { bearerToken: RAW_TOKEN },
      { expiresAt: EXPIRES_AT },
      { idempotencyKey: 'invented-key' },
    ]) {
      const p = ports();
      await expectApiCode(bootstrapSession({ request, ...p }), 'INVALID_REQUEST');
      expect(p.identityResolverPort.calls).toBe(0);
      expect(p.credentialIssuerPort.calls).toBe(0);
      expect(p.tokenFingerprintPort.calls).toHaveLength(0);
      expect(p.authorityPort.calls).toHaveLength(0);
    }
  });

  it('does not trim or normalize the newly issued opaque bearer token', async () => {
    const p = ports();
    const significantToken = '  opaque-token-with-significant-edge-space ';
    p.credentialIssuerPort.result = Object.freeze({
      subjectId: SUBJECT_ID,
      guestSessionId: SESSION_ID,
      bearerToken: significantToken,
      expiresAt: EXPIRES_AT,
    });

    const result = await bootstrapSession(p);

    expect(p.tokenFingerprintPort.calls).toEqual([
      { rawBearerToken: significantToken },
    ]);
    expect(result.kind).toBe('guest');
    if (result.kind === 'guest') {
      expect(result.guestSession.bearerToken).toBe(significantToken);
    }
  });

  it('can return the current request credential after an exact DB replay without inventing a recovery contract', async () => {
    const p = ports();
    p.authorityPort.result = Object.freeze([
      Object.freeze({
        subjectId: SUBJECT_ID,
        guestSessionId: SESSION_ID,
        expiresAt: '2099-01-01T00:00:00Z',
        replayed: true,
      }),
    ]);

    const result = await bootstrapSession(p);

    expect(result).toEqual({
      subjectId: SUBJECT_ID,
      kind: 'guest',
      guestSession: {
        guestSessionId: SESSION_ID,
        expiresAt: '2099-01-01T00:00:00Z',
        bearerToken: RAW_TOKEN,
      },
    });
    expect(result).not.toHaveProperty('replayed');
  });

  it('fails closed on malformed trusted identity or issuance values before persistence', async () => {
    const malformedExisting = ports();
    malformedExisting.identityResolverPort.result = {
      kind: 'guest',
      subjectId: SUBJECT_ID,
      guestSessionId: '   ',
      expiresAt: EXPIRES_AT,
    };
    await expect(bootstrapSession(malformedExisting)).rejects.toThrow(
      'existing guest session id',
    );
    expect(malformedExisting.credentialIssuerPort.calls).toBe(0);

    const malformedIssued = ports();
    malformedIssued.credentialIssuerPort.result = {
      subjectId: SUBJECT_ID,
      guestSessionId: SESSION_ID,
      bearerToken: '   ',
      expiresAt: EXPIRES_AT,
    };
    await expect(bootstrapSession(malformedIssued)).rejects.toThrow(
      'invalid raw bearer token',
    );
    expect(malformedIssued.tokenFingerprintPort.calls).toHaveLength(0);
    expect(malformedIssued.authorityPort.calls).toHaveLength(0);

    const malformedExpiry = ports();
    malformedExpiry.credentialIssuerPort.result = {
      subjectId: SUBJECT_ID,
      guestSessionId: SESSION_ID,
      bearerToken: RAW_TOKEN,
      expiresAt: 'not-a-timestamp',
    };
    await expect(bootstrapSession(malformedExpiry)).rejects.toThrow('not a timestamp');
    expect(malformedExpiry.authorityPort.calls).toHaveLength(0);
  });

  it('fails closed when the trusted fingerprint is blank', async () => {
    for (const fingerprint of ['', '   ']) {
      const p = ports();
      p.tokenFingerprintPort.result = fingerprint;
      await expect(bootstrapSession(p)).rejects.toThrow('invalid fingerprint');
      expect(p.authorityPort.calls).toHaveLength(0);
    }
  });

  it('fails closed on zero/multiple rows or a different canonical identity/expiry', async () => {
    const cases: Array<readonly GuestBootstrapAuthorityRowV1[]> = [
      [],
      [
        {
          subjectId: SUBJECT_ID,
          guestSessionId: SESSION_ID,
          expiresAt: EXPIRES_AT,
          replayed: false,
        },
        {
          subjectId: SUBJECT_ID,
          guestSessionId: SESSION_ID,
          expiresAt: EXPIRES_AT,
          replayed: true,
        },
      ],
      [
        {
          subjectId: 'different-subject',
          guestSessionId: SESSION_ID,
          expiresAt: EXPIRES_AT,
          replayed: false,
        },
      ],
      [
        {
          subjectId: SUBJECT_ID,
          guestSessionId: 'different-session',
          expiresAt: EXPIRES_AT,
          replayed: false,
        },
      ],
      [
        {
          subjectId: SUBJECT_ID,
          guestSessionId: SESSION_ID,
          expiresAt: '2099-01-02T00:00:00.000Z',
          replayed: false,
        },
      ],
    ];

    for (const rows of cases) {
      const p = ports();
      p.authorityPort.result = Object.freeze(rows);
      await expect(bootstrapSession(p)).rejects.toThrow();
    }
  });

  it('treats trusted DB identity conflicts, terminal sessions, and invalid server input as internal failures', async () => {
    for (const authorityError of [
      new GuestBootstrapAuthorityPortErrorV1(
        'IDENTITY_CONFLICT',
        'raw identity collision detail',
      ),
      new GuestBootstrapAuthorityPortErrorV1(
        'SESSION_NOT_REUSABLE',
        'raw terminal session detail',
      ),
      new GuestBootstrapAuthorityPortErrorV1(
        'INVALID_INPUT',
        'raw trusted input detail',
      ),
    ]) {
      const p = ports();
      p.authorityPort.result = authorityError;
      try {
        await bootstrapSession(p);
        throw new Error('Expected internal bootstrap failure.');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(ApiCommandError);
        expect((error as Error).message).not.toContain(authorityError.message);
      }
    }
  });

  it('rethrows resolver, issuer, fingerprint, and DB infrastructure failures unchanged', async () => {
    const resolverFailure = new Error('identity resolver unavailable');
    const resolverPorts = ports();
    resolverPorts.identityResolverPort.result = resolverFailure;
    await expect(bootstrapSession(resolverPorts)).rejects.toBe(resolverFailure);

    const issuerFailure = new Error('credential issuer unavailable');
    const issuerPorts = ports();
    issuerPorts.credentialIssuerPort.result = issuerFailure;
    await expect(bootstrapSession(issuerPorts)).rejects.toBe(issuerFailure);

    const fingerprintFailure = new Error('fingerprint key service unavailable');
    const fingerprintPorts = ports();
    fingerprintPorts.tokenFingerprintPort.result = fingerprintFailure;
    await expect(bootstrapSession(fingerprintPorts)).rejects.toBe(fingerprintFailure);

    const dbFailure = new Error('database transport unavailable');
    const dbPorts = ports();
    dbPorts.authorityPort.result = dbFailure;
    await expect(bootstrapSession(dbPorts)).rejects.toBe(dbFailure);
  });
});
