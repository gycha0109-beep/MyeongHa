import { describe, expect, it } from 'vitest';
import {
  BIRTH_PROFILE_READ_HTTP_BINDINGS_V1,
  handleBirthProfileReadRequestV1,
  type HandleBirthProfileReadRequestInputV1,
} from '../apps/api/src/birth-profile-read-http.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const SUBJECT_ID = 'b5200000-0000-0000-0000-000000000001';
const PROFILE_ID = 'b5300000-0000-0000-0000-000000000001';
const REVISION_ID = 'b5400000-0000-0000-0000-000000000001';

class FakeIdentityVerifier implements IdentityEvidenceVerificationPortV1 {
  calls = 0;
  evidence: VerifiedSubjectIdentityEvidenceV1 | null = Object.freeze({
    kind: 'guest',
    verifiedGuestTokenHash: 'hmac-sha256:v1:test-fingerprint',
  });

  verifyRequestIdentity(): VerifiedSubjectIdentityEvidenceV1 | null {
    this.calls += 1;
    return this.evidence;
  }
}

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  released = false;
  failBirthReadWithConstraint: string | null = null;

  query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): PostgresQueryResultV1<Row> {
    this.calls.push({ text, values });

    if (text.includes('begin_guest_subject_context_v1')) {
      return {
        rows: [
          { subjectId: SUBJECT_ID, subjectKind: 'guest' },
        ] as unknown as readonly Row[],
      };
    }
    if (text.includes('qry_birth_profile_current_revision_v1')) {
      if (this.failBirthReadWithConstraint !== null) {
        throw Object.assign(new Error('governed Birth Profile read failure'), {
          constraint: this.failBirthReadWithConstraint,
        });
      }
      return {
        rows: [
          {
            birthProfileId: PROFILE_ID,
            profileKind: 'self',
            label: '나의 명식록',
            currentRevisionId: REVISION_ID,
            archivedAt: null,
            currentRevisionNo: 1,
            currentCalendarType: 'solar',
            currentBirthDate: '1990-01-02',
            currentBirthTime: '08:30:00',
            currentTimeKnown: true,
            currentIsLeapMonth: false,
            currentSex: 'female',
            revisionId: REVISION_ID,
            revisionNo: 1,
            isCurrentRevision: true,
          },
        ] as unknown as readonly Row[],
      };
    }
    return { rows: [] };
  }

  release(): void {
    this.released = true;
  }
}

class FakePool implements PostgresSubjectPoolV1 {
  connectCalls = 0;
  readonly connection = new FakeConnection();

  connect(): PostgresSubjectConnectionV1 {
    this.connectCalls += 1;
    return this.connection;
  }
}

function makeInput(overrides: Partial<HandleBirthProfileReadRequestInputV1> = {}) {
  const verifier = new FakeIdentityVerifier();
  const pool = new FakePool();
  return {
    verifier,
    pool,
    input: {
      request: new Request(`https://myeongha.vercel.app/api/birth-profiles/${PROFILE_ID}`),
      requestId: 'request-birth-read-1',
      serverTime: '2026-09-03T00:00:00.000Z',
      identityEvidenceVerifier: verifier,
      pool,
      ...overrides,
    } satisfies HandleBirthProfileReadRequestInputV1,
  };
}

describe('production Birth Profile read HTTP boundary', () => {
  it('pins the route and governed PostgreSQL query', () => {
    expect(BIRTH_PROFILE_READ_HTTP_BINDINGS_V1).toEqual({
      method: 'GET',
      route: '/api/birth-profiles/:id',
      readCurrentRevision: 'public.qry_birth_profile_current_revision_v1',
      apiContractVersion: 'v0.9',
    });
  });

  it('resolves the canonical subject in PostgreSQL and reads only the requested owned profile', async () => {
    const { input, pool } = makeInput();
    const response = await handleBirthProfileReadRequestV1(input);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        birthProfileId: PROFILE_ID,
        currentRevision: {
          revisionId: REVISION_ID,
          input: { birthDate: '1990-01-02' },
        },
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: 'request-birth-read-1',
        serverTime: '2026-09-03T00:00:00.000Z',
      },
    });

    const resolverCall = pool.connection.calls.find((call) =>
      call.text.includes('begin_guest_subject_context_v1'),
    );
    expect(resolverCall?.values).toEqual(['hmac-sha256:v1:test-fingerprint']);

    const readCall = pool.connection.calls.find((call) =>
      call.text.includes('qry_birth_profile_current_revision_v1'),
    );
    expect(readCall?.values).toEqual([SUBJECT_ID, PROFILE_ID]);
    expect(pool.connection.calls.some((call) => call.text === 'SET LOCAL ROLE myeongha_api_executor')).toBe(true);
    expect(pool.connection.released).toBe(true);
    expect(JSON.stringify(body)).not.toContain('inputHash');
    expect(JSON.stringify(body)).not.toContain('input_hash');
  });

  it('returns 401 without opening PostgreSQL when request identity is absent', async () => {
    const { input, verifier, pool } = makeInput();
    verifier.evidence = null;

    const response = await handleBirthProfileReadRequestV1(input);
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'AUTH_REQUIRED', retryable: false },
    });
    expect(pool.connectCalls).toBe(0);
  });

  it('rejects invalid path ids before identity verification or PostgreSQL', async () => {
    const { input, verifier, pool } = makeInput({
      request: new Request('https://myeongha.vercel.app/api/birth-profiles/not-a-uuid'),
    });

    const response = await handleBirthProfileReadRequestV1(input);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(verifier.calls).toBe(0);
    expect(pool.connectCalls).toBe(0);
  });

  it('fails closed as NOT_FOUND for a cross-owner or unavailable Birth Profile', async () => {
    const { input, pool } = makeInput();
    pool.connection.failBirthReadWithConstraint = 'qry_birth_profile_unavailable';

    const response = await handleBirthProfileReadRequestV1(input);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', retryable: false },
    });
    expect(pool.connection.calls.some((call) => call.text === 'ROLLBACK')).toBe(true);
    expect(pool.connection.released).toBe(true);
  });

  it('returns 405/no-store and does not verify identity for unsupported methods', async () => {
    const { input, verifier, pool } = makeInput({
      request: new Request(`https://myeongha.vercel.app/api/birth-profiles/${PROFILE_ID}`, {
        method: 'POST',
      }),
    });

    const response = await handleBirthProfileReadRequestV1(input);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(verifier.calls).toBe(0);
    expect(pool.connectCalls).toBe(0);
  });

  it('returns 404/no-store for non-canonical route shapes', async () => {
    const { input, verifier, pool } = makeInput({
      request: new Request(`https://myeongha.vercel.app/api/birth-profiles/${PROFILE_ID}/extra`),
    });
    const response = await handleBirthProfileReadRequestV1(input);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(verifier.calls).toBe(0);
    expect(pool.connectCalls).toBe(0);
  });
});
