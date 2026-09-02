import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  PostgresGuestBootstrapAuthorityPortV1,
  PRODUCTION_GUEST_BOOTSTRAP_RUNTIME_BINDINGS_V1,
  createProductionGuestBootstrapIdentityResolverPortV1,
  type IdentityEvidenceVerificationPortV1,
} from '../apps/api/src/production-guest-bootstrap-runtime.js';
import {
  type PostgresQueryResultV1,
  type PostgresSubjectConnectionV1,
  type PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const MEMBER_AUTH_USER_ID = '81000000-0000-0000-0000-000000000001';
const MEMBER_SUBJECT_ID = '82000000-0000-0000-0000-000000000001';
const GUEST_SUBJECT_ID = '83000000-0000-0000-0000-000000000001';
const GUEST_SESSION_ID = '84000000-0000-0000-0000-000000000001';
const GUEST_HASH =
  'myeongha-guest-bearer-hmac-sha256-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const EXPIRES_AT = '2099-01-01T00:00:00.000Z';

type QueryCall = Readonly<{ text: string; values: readonly unknown[] }>;

function postgresError(constraint: string, message = constraint): Error & {
  code: string;
  constraint: string;
} {
  return Object.assign(new Error(message), {
    code: constraint === 'guest_bootstrap_runtime_verifier_format' ? '23514' : '28000',
    constraint,
  });
}

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls: QueryCall[] = [];
  readonly releases: unknown[] = [];
  memberRows: readonly Record<string, unknown>[] = [
    { subjectId: MEMBER_SUBJECT_ID, subjectKind: 'member' },
  ];
  guestRows: readonly Record<string, unknown>[] = [
    { subjectId: GUEST_SUBJECT_ID, subjectKind: 'guest' },
  ];
  currentGuestRows: readonly Record<string, unknown>[] = [
    {
      subjectId: GUEST_SUBJECT_ID,
      guestSessionId: GUEST_SESSION_ID,
      expiresAt: EXPIRES_AT,
    },
  ];
  createRows: readonly Record<string, unknown>[] = [
    {
      subjectId: GUEST_SUBJECT_ID,
      guestSessionId: GUEST_SESSION_ID,
      expiresAt: EXPIRES_AT,
      replayed: false,
    },
  ];
  currentGuestError: unknown;
  createError: unknown;
  rollbackError: unknown;

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push(Object.freeze({ text, values: Object.freeze([...values]) }));

    if (text.includes('begin_member_subject_context_v1')) {
      return { rows: this.memberRows as readonly Row[] };
    }
    if (text.includes('begin_guest_subject_context_v1')) {
      return { rows: this.guestRows as readonly Row[] };
    }
    if (text.includes('qry_guest_bootstrap_current_v1')) {
      if (this.currentGuestError !== undefined) throw this.currentGuestError;
      return { rows: this.currentGuestRows as readonly Row[] };
    }
    if (text.includes('cmd_create_guest_session_runtime_v1')) {
      if (this.createError !== undefined) throw this.createError;
      return { rows: this.createRows as readonly Row[] };
    }
    if (text === 'ROLLBACK' && this.rollbackError !== undefined) {
      throw this.rollbackError;
    }
    return { rows: [] };
  }

  release(error?: unknown): void {
    this.releases.push(error);
  }
}

class FakePool implements PostgresSubjectPoolV1 {
  connectCalls = 0;
  constructor(readonly connection: FakeConnection) {}
  connect(): FakeConnection {
    this.connectCalls += 1;
    return this.connection;
  }
}

class FakeVerifier implements IdentityEvidenceVerificationPortV1 {
  calls = 0;
  result: VerifiedSubjectIdentityEvidenceV1 | null = null;
  async verifyRequestIdentity(): Promise<VerifiedSubjectIdentityEvidenceV1 | null> {
    this.calls += 1;
    return this.result;
  }
}

function texts(connection: FakeConnection): string[] {
  return connection.calls.map((call) => call.text);
}

function request(authorization?: string): Request {
  return new Request('https://myeongha.example/api/session/bootstrap', {
    method: 'POST',
    headers: authorization === undefined ? undefined : { authorization },
  });
}

describe('production Guest bootstrap runtime', () => {
  it('pins runtime work to the least-privilege executor authorities', () => {
    expect(PRODUCTION_GUEST_BOOTSTRAP_RUNTIME_BINDINGS_V1).toEqual({
      executionRole: 'myeongha_api_executor',
      createGuestSession: 'public.cmd_create_guest_session_runtime_v1',
      readCurrentGuestSession: 'public.qry_guest_bootstrap_current_v1',
    });
  });

  it('allows fresh Guest creation only when Authorization is absent', async () => {
    const verifier = new FakeVerifier();
    const pool = new FakePool(new FakeConnection());
    const resolver = createProductionGuestBootstrapIdentityResolverPortV1({
      request: request(),
      identityVerifier: verifier,
      pool,
    });

    await expect(resolver.resolveExistingBootstrapIdentity()).resolves.toBeNull();
    expect(verifier.calls).toBe(0);
    expect(pool.connectCalls).toBe(0);
  });

  it('fails closed when any supplied Authorization cannot be verified', async () => {
    const verifier = new FakeVerifier();
    const pool = new FakePool(new FakeConnection());
    const resolver = createProductionGuestBootstrapIdentityResolverPortV1({
      request: request('Bearer malformed-or-rejected'),
      identityVerifier: verifier,
      pool,
    });

    await expect(resolver.resolveExistingBootstrapIdentity()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    } satisfies Partial<ApiCommandError>);
    expect(verifier.calls).toBe(1);
    expect(pool.connectCalls).toBe(0);
  });

  it('reuses a verified Member through canonical subject resolution without Guest lookup', async () => {
    const verifier = new FakeVerifier();
    verifier.result = { kind: 'member', verifiedAuthUserId: MEMBER_AUTH_USER_ID };
    const connection = new FakeConnection();
    const resolver = createProductionGuestBootstrapIdentityResolverPortV1({
      request: request('Bearer member.jwt.shape'),
      identityVerifier: verifier,
      pool: new FakePool(connection),
    });

    await expect(resolver.resolveExistingBootstrapIdentity()).resolves.toEqual({
      kind: 'member',
      subjectId: MEMBER_SUBJECT_ID,
    });
    expect(texts(connection)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('begin_member_subject_context_v1'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      'COMMIT',
    ]);
    expect(texts(connection).some((text) => text.includes('qry_guest_bootstrap_current_v1'))).toBe(false);
  });

  it('reuses a verified Guest only after canonical subject binding and current-session query', async () => {
    const verifier = new FakeVerifier();
    verifier.result = { kind: 'guest', verifiedGuestTokenHash: GUEST_HASH };
    const connection = new FakeConnection();
    const resolver = createProductionGuestBootstrapIdentityResolverPortV1({
      request: request('Bearer opaque-existing-guest-credential-value'),
      identityVerifier: verifier,
      pool: new FakePool(connection),
    });

    await expect(resolver.resolveExistingBootstrapIdentity()).resolves.toEqual({
      kind: 'guest',
      subjectId: GUEST_SUBJECT_ID,
      guestSessionId: GUEST_SESSION_ID,
      expiresAt: EXPIRES_AT,
    });
    expect(texts(connection)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('begin_guest_subject_context_v1'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      expect.stringContaining('qry_guest_bootstrap_current_v1'),
      'COMMIT',
    ]);
    expect(connection.calls[2]?.values).toEqual([GUEST_HASH]);
    expect(connection.calls[4]?.values).toEqual([GUEST_SUBJECT_ID]);
  });

  it('maps a no-longer-current verified Guest to AUTH_REQUIRED and rolls back', async () => {
    const verifier = new FakeVerifier();
    verifier.result = { kind: 'guest', verifiedGuestTokenHash: GUEST_HASH };
    const connection = new FakeConnection();
    connection.currentGuestError = postgresError('guest_bootstrap_current_unresolved');
    const resolver = createProductionGuestBootstrapIdentityResolverPortV1({
      request: request('Bearer opaque-existing-guest-credential-value'),
      identityVerifier: verifier,
      pool: new FakePool(connection),
    });

    await expect(resolver.resolveExistingBootstrapIdentity()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    } satisfies Partial<ApiCommandError>);
    expect(texts(connection).at(-1)).toBe('ROLLBACK');
    expect(texts(connection)).not.toContain('COMMIT');
  });

  it('creates fresh Guest state only through the runtime wrapper in one executor transaction', async () => {
    const connection = new FakeConnection();
    const port = new PostgresGuestBootstrapAuthorityPortV1(new FakePool(connection));

    await expect(
      port.createGuestSession({
        subjectId: GUEST_SUBJECT_ID,
        guestSessionId: GUEST_SESSION_ID,
        tokenHash: GUEST_HASH,
        expiresAt: EXPIRES_AT,
      }),
    ).resolves.toEqual([
      {
        subjectId: GUEST_SUBJECT_ID,
        guestSessionId: GUEST_SESSION_ID,
        expiresAt: EXPIRES_AT,
        replayed: false,
      },
    ]);

    expect(texts(connection)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('cmd_create_guest_session_runtime_v1'),
      'COMMIT',
    ]);
    expect(connection.calls[2]?.values).toEqual([
      GUEST_SUBJECT_ID,
      GUEST_SESSION_ID,
      GUEST_HASH,
      EXPIRES_AT,
    ]);
    expect(connection.releases).toEqual([undefined]);
  });

  it('maps governed create rejection to a typed authority error and rolls back', async () => {
    const connection = new FakeConnection();
    connection.createError = postgresError('guest_bootstrap_runtime_verifier_format');
    const port = new PostgresGuestBootstrapAuthorityPortV1(new FakePool(connection));

    await expect(
      port.createGuestSession({
        subjectId: GUEST_SUBJECT_ID,
        guestSessionId: GUEST_SESSION_ID,
        tokenHash: 'invalid',
        expiresAt: EXPIRES_AT,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(texts(connection).at(-1)).toBe('ROLLBACK');
    expect(texts(connection)).not.toContain('COMMIT');
  });

  it('rethrows database infrastructure failures unchanged', async () => {
    const connection = new FakeConnection();
    const failure = new Error('database unavailable');
    connection.createError = failure;
    const port = new PostgresGuestBootstrapAuthorityPortV1(new FakePool(connection));

    await expect(
      port.createGuestSession({
        subjectId: GUEST_SUBJECT_ID,
        guestSessionId: GUEST_SESSION_ID,
        tokenHash: GUEST_HASH,
        expiresAt: EXPIRES_AT,
      }),
    ).rejects.toBe(failure);
    expect(texts(connection).at(-1)).toBe('ROLLBACK');
  });

  it('discards the connection when rollback also fails', async () => {
    const connection = new FakeConnection();
    connection.createError = new Error('create failed');
    const rollbackFailure = new Error('rollback failed');
    connection.rollbackError = rollbackFailure;
    const port = new PostgresGuestBootstrapAuthorityPortV1(new FakePool(connection));

    await expect(
      port.createGuestSession({
        subjectId: GUEST_SUBJECT_ID,
        guestSessionId: GUEST_SESSION_ID,
        tokenHash: GUEST_HASH,
        expiresAt: EXPIRES_AT,
      }),
    ).rejects.toBeInstanceOf(AggregateError);
    expect(connection.releases).toEqual([rollbackFailure]);
  });
});
