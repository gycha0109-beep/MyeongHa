import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  CURRENT_SUBJECT_PROFILE_HTTP_BINDINGS_V1,
  handleCurrentSubjectProfileRequestV1,
  type IdentityEvidenceVerificationPortV1,
} from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const MEMBER_AUTH_USER_ID = '91000000-0000-0000-0000-000000000001';
const MEMBER_SUBJECT_ID = '92000000-0000-0000-0000-000000000001';
const OTHER_SUBJECT_ID = '92000000-0000-0000-0000-000000000099';
const GUEST_SUBJECT_ID = '93000000-0000-0000-0000-000000000001';
const GUEST_TOKEN_HASH = 'hmac-sha256:k2:verified-fingerprint';
const REQUEST_ID = 'req-current-subject-1';
const SERVER_TIME = '2026-09-02T00:00:00.000Z';

type QueryCall = Readonly<{
  text: string;
  values: readonly unknown[];
}>;

function postgresError(constraint: string): Error & {
  code: string;
  constraint: string;
} {
  return Object.assign(new Error(constraint), {
    code: 'P0001',
    constraint,
  });
}

class FakeIdentityEvidenceVerificationPortV1
  implements IdentityEvidenceVerificationPortV1
{
  readonly calls: Request[] = [];

  result: VerifiedSubjectIdentityEvidenceV1 | null = {
    kind: 'member',
    verifiedAuthUserId: MEMBER_AUTH_USER_ID,
  };

  verifyRequestIdentity(request: Request): VerifiedSubjectIdentityEvidenceV1 | null {
    this.calls.push(request);
    return this.result;
  }
}

class FakeCurrentSubjectConnectionV1 implements PostgresSubjectConnectionV1 {
  readonly calls: QueryCall[] = [];
  readonly releases: unknown[] = [];

  memberRows: readonly Record<string, unknown>[] = [
    { subjectId: MEMBER_SUBJECT_ID, subjectKind: 'member' },
  ];
  guestRows: readonly Record<string, unknown>[] = [
    { subjectId: GUEST_SUBJECT_ID, subjectKind: 'guest' },
  ];
  profileRows: readonly Record<string, unknown>[] = [
    {
      subjectId: MEMBER_SUBJECT_ID,
      subjectKind: 'member',
      subjectStatus: 'active',
      displayName: '명하',
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      onboardingState: 'onboarding-v1:complete',
      profileUpdatedAt: '2026-09-01T12:34:56.000Z',
    },
  ];

  memberError: unknown;
  guestError: unknown;
  profileError: unknown;

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push(Object.freeze({ text, values: Object.freeze([...values]) }));

    if (text.includes('begin_member_subject_context_v1')) {
      if (this.memberError !== undefined) throw this.memberError;
      return { rows: this.memberRows as readonly Row[] };
    }

    if (text.includes('begin_guest_subject_context_v1')) {
      if (this.guestError !== undefined) throw this.guestError;
      return { rows: this.guestRows as readonly Row[] };
    }

    if (text.includes('qry_subject_profile_current_v1')) {
      if (this.profileError !== undefined) throw this.profileError;
      return { rows: this.profileRows as readonly Row[] };
    }

    return { rows: [] };
  }

  release(error?: unknown): void {
    this.releases.push(error);
  }
}

class FakeCurrentSubjectPoolV1 implements PostgresSubjectPoolV1 {
  connectCalls = 0;

  constructor(readonly connection: FakeCurrentSubjectConnectionV1) {}

  connect(): FakeCurrentSubjectConnectionV1 {
    this.connectCalls += 1;
    return this.connection;
  }
}

function makeInput(overrides?: {
  request?: Request;
  verifier?: FakeIdentityEvidenceVerificationPortV1;
  connection?: FakeCurrentSubjectConnectionV1;
}) {
  const request = overrides?.request ?? new Request('https://myeongha.test/api/me');
  const verifier = overrides?.verifier ?? new FakeIdentityEvidenceVerificationPortV1();
  const connection = overrides?.connection ?? new FakeCurrentSubjectConnectionV1();
  const pool = new FakeCurrentSubjectPoolV1(connection);

  return {
    request,
    verifier,
    connection,
    pool,
    input: {
      request,
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: verifier,
      pool,
    },
  };
}

function callTexts(connection: FakeCurrentSubjectConnectionV1): string[] {
  return connection.calls.map((call) => call.text);
}

describe('current subject profile HTTP/application boundary', () => {
  it('pins GET /api/me to the existing v0.9 contract and PostgreSQL read authority', () => {
    expect(CURRENT_SUBJECT_PROFILE_HTTP_BINDINGS_V1).toEqual({
      method: 'GET',
      route: '/api/me',
      readCurrent: 'public.qry_subject_profile_current_v1',
      apiContractVersion: 'v0.9',
    });
  });

  it('verifies Member evidence then resolves, binds and reads the current profile in one transaction', async () => {
    const fixture = makeInput();

    const response = await handleCurrentSubjectProfileRequestV1(fixture.input);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        subjectId: MEMBER_SUBJECT_ID,
        subjectKind: 'member',
        subjectStatus: 'active',
        profile: {
          displayName: '명하',
          locale: 'ko-KR',
          timezone: 'Asia/Seoul',
          onboardingState: 'onboarding-v1:complete',
          updatedAt: '2026-09-01T12:34:56.000Z',
        },
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: REQUEST_ID,
        serverTime: SERVER_TIME,
      },
    });

    expect(fixture.verifier.calls).toEqual([fixture.request]);
    expect(fixture.pool.connectCalls).toBe(1);
    expect(callTexts(fixture.connection)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('public.begin_member_subject_context_v1($1::uuid)'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      expect.stringContaining('public.qry_subject_profile_current_v1($1::uuid)'),
      'COMMIT',
    ]);
    expect(fixture.connection.calls[2]?.values).toEqual([MEMBER_AUTH_USER_ID]);
    expect(fixture.connection.calls[3]?.values).toEqual([MEMBER_SUBJECT_ID]);
    expect(fixture.connection.calls[4]?.values).toEqual([MEMBER_SUBJECT_ID]);
    expect(fixture.connection.releases).toEqual([undefined]);
  });

  it('keeps Guest support transport-neutral and passes only verified fingerprint evidence to PostgreSQL', async () => {
    const verifier = new FakeIdentityEvidenceVerificationPortV1();
    verifier.result = {
      kind: 'guest',
      verifiedGuestTokenHash: GUEST_TOKEN_HASH,
    };
    const connection = new FakeCurrentSubjectConnectionV1();
    connection.profileRows = [
      {
        subjectId: GUEST_SUBJECT_ID,
        subjectKind: 'guest',
        subjectStatus: 'active',
        displayName: null,
        locale: null,
        timezone: null,
        onboardingState: null,
        profileUpdatedAt: null,
      },
    ];
    const fixture = makeInput({ verifier, connection });

    const response = await handleCurrentSubjectProfileRequestV1(fixture.input);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        subjectId: GUEST_SUBJECT_ID,
        subjectKind: 'guest',
        subjectStatus: 'active',
        profile: null,
      },
    });
    expect(fixture.connection.calls[2]?.text).toContain(
      'public.begin_guest_subject_context_v1($1::text)',
    );
    expect(fixture.connection.calls[2]?.values).toEqual([GUEST_TOKEN_HASH]);
    expect(fixture.connection.calls[4]?.values).toEqual([GUEST_SUBJECT_ID]);
  });

  it('returns the required 401 contract without opening a DB connection when no verified identity exists', async () => {
    const verifier = new FakeIdentityEvidenceVerificationPortV1();
    verifier.result = null;
    const fixture = makeInput({ verifier });

    const response = await handleCurrentSubjectProfileRequestV1(fixture.input);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        messageKey: 'auth.required',
        retryable: false,
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: REQUEST_ID,
      },
    });
    expect(fixture.pool.connectCalls).toBe(0);
    expect(fixture.connection.calls).toEqual([]);
  });

  it('maps a verified identity that no longer resolves in PostgreSQL to 401 and rolls back', async () => {
    const connection = new FakeCurrentSubjectConnectionV1();
    connection.memberError = postgresError('member_subject_context_unresolved');
    const fixture = makeInput({ connection });

    const response = await handleCurrentSubjectProfileRequestV1(fixture.input);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'AUTH_REQUIRED' },
    });
    expect(callTexts(connection).at(-1)).toBe('ROLLBACK');
    expect(callTexts(connection)).not.toContain('COMMIT');
  });

  it('rejects non-GET methods before identity verification or DB access', async () => {
    const request = new Request('https://myeongha.test/api/me', { method: 'POST' });
    const fixture = makeInput({ request });

    const response = await handleCurrentSubjectProfileRequestV1(fixture.input);

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    expect(fixture.verifier.calls).toEqual([]);
    expect(fixture.pool.connectCalls).toBe(0);
  });

  it('keeps a no-longer-current subject as NOT_FOUND and rolls the transaction back', async () => {
    const connection = new FakeCurrentSubjectConnectionV1();
    connection.profileError = postgresError('qry_subject_profile_subject_ineligible');
    const fixture = makeInput({ connection });

    try {
      await handleCurrentSubjectProfileRequestV1(fixture.input);
      throw new Error('Expected current subject profile read to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiCommandError);
      expect((error as ApiCommandError).code).toBe('NOT_FOUND');
    }

    expect(callTexts(connection).at(-1)).toBe('ROLLBACK');
    expect(callTexts(connection)).not.toContain('COMMIT');
  });

  it('fails closed if the profile authority returns another subject identity', async () => {
    const connection = new FakeCurrentSubjectConnectionV1();
    connection.profileRows = [
      {
        subjectId: OTHER_SUBJECT_ID,
        subjectKind: 'member',
        subjectStatus: 'active',
        displayName: 'other',
        locale: 'ko-KR',
        timezone: 'Asia/Seoul',
        onboardingState: null,
        profileUpdatedAt: new Date('2026-09-01T12:34:56.000Z'),
      },
    ];
    const fixture = makeInput({ connection });

    await expect(handleCurrentSubjectProfileRequestV1(fixture.input)).rejects.toThrow(
      'different subject',
    );

    expect(callTexts(connection).at(-1)).toBe('ROLLBACK');
    expect(callTexts(connection)).not.toContain('COMMIT');
  });
});
