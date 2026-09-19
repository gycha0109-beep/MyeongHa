import { describe, expect, it } from 'vitest';
import {
  TARGET_PERSON_READ_HTTP_BINDINGS_V1,
  handleTargetPersonReadRequestV1,
  type HandleTargetPersonReadRequestInputV1,
} from '../apps/api/src/target-person-read-http.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const SUBJECT_ID = 'b6200000-0000-0000-0000-000000000001';
const TARGET_ID = 'b6300000-0000-0000-0000-000000000001';
const BIRTH_PROFILE_ID = 'b6400000-0000-0000-0000-000000000001';
const REVISION_ID = 'b6500000-0000-0000-0000-000000000001';

class FakeIdentityVerifier implements IdentityEvidenceVerificationPortV1 {
  calls = 0;
  evidence: VerifiedSubjectIdentityEvidenceV1 | null = Object.freeze({
    kind: 'guest',
    verifiedGuestTokenHash: 'hmac-sha256:v1:target-person-test',
  });

  verifyRequestIdentity(): VerifiedSubjectIdentityEvidenceV1 | null {
    this.calls += 1;
    return this.evidence;
  }
}

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  released = false;
  failConstraint: string | null = null;

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

    if (
      text.includes('qry_target_persons_v1') ||
      text.includes('qry_target_person_v1')
    ) {
      if (this.failConstraint !== null) {
        throw Object.assign(new Error('governed Target Person read failure'), {
          constraint: this.failConstraint,
        });
      }
      return {
        rows: [
          {
            targetPersonId: TARGET_ID,
            displayLabel: '상대 A',
            relationshipLabel: 'partner',
            birthProfileId: BIRTH_PROFILE_ID,
            currentBirthRevisionId: REVISION_ID,
            currentRevisionNo: 2,
            currentCalendarType: 'solar',
            currentBirthDate: '1991-02-03',
            currentBirthTime: '09:30:00',
            currentTimeKnown: true,
            currentIsLeapMonth: false,
            currentSex: 'female',
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

function makeInput(overrides: Partial<HandleTargetPersonReadRequestInputV1> = {}) {
  const verifier = new FakeIdentityVerifier();
  const pool = new FakePool();
  return {
    verifier,
    pool,
    input: {
      request: new Request('https://myeongha.vercel.app/api/target-persons'),
      requestId: 'request-target-person-read-1',
      serverTime: '2026-09-19T12:20:00.000Z',
      identityEvidenceVerifier: verifier,
      pool,
      ...overrides,
    } satisfies HandleTargetPersonReadRequestInputV1,
  };
}

describe('production Target Person read HTTP boundary', () => {
  it('pins owner-scoped list/detail routes to the governed PostgreSQL queries', () => {
    expect(TARGET_PERSON_READ_HTTP_BINDINGS_V1).toEqual({
      method: 'GET',
      listRoute: '/api/target-persons',
      detailRoute: '/api/target-persons/:id',
      listCurrent: 'public.qry_target_persons_v1',
      readCurrent: 'public.qry_target_person_v1',
      apiContractVersion: 'v0.9',
    });
  });

  it('lists current owner Target Persons under the canonical subject transaction', async () => {
    const { input, pool } = makeInput();
    const response = await handleTargetPersonReadRequestV1(input);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: [
        {
          targetPersonId: TARGET_ID,
          displayLabel: '상대 A',
          relationshipLabel: 'partner',
          birthProfileId: BIRTH_PROFILE_ID,
          currentRevision: {
            revisionId: REVISION_ID,
            revisionNo: 2,
            input: {
              birthDate: '1991-02-03',
              birthTime: '09:30:00',
              timeKnown: true,
            },
          },
        },
      ],
      meta: {
        apiContractVersion: 'v0.9',
        requestId: 'request-target-person-read-1',
      },
    });

    const readCall = pool.connection.calls.find((call) =>
      call.text.includes('qry_target_persons_v1'),
    );
    expect(readCall?.values).toEqual([SUBJECT_ID]);
    expect(
      pool.connection.calls.some(
        (call) => call.text === 'SET LOCAL ROLE myeongha_api_executor',
      ),
    ).toBe(true);
    expect(pool.connection.released).toBe(true);
    expect(JSON.stringify(body)).not.toContain('inputHash');
  });

  it('reads one requested Target Person without trusting a client subject id', async () => {
    const { input, pool } = makeInput({
      request: new Request(
        `https://myeongha.vercel.app/api/target-persons/${TARGET_ID}`,
      ),
    });

    const response = await handleTargetPersonReadRequestV1(input);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        targetPersonId: TARGET_ID,
        birthProfileId: BIRTH_PROFILE_ID,
      },
    });

    const readCall = pool.connection.calls.find((call) =>
      call.text.includes('qry_target_person_v1'),
    );
    expect(readCall?.values).toEqual([SUBJECT_ID, TARGET_ID]);
  });

  it('rejects malformed detail ids before identity verification or PostgreSQL', async () => {
    const { input, verifier, pool } = makeInput({
      request: new Request(
        'https://myeongha.vercel.app/api/target-persons/not-a-uuid',
      ),
    });

    const response = await handleTargetPersonReadRequestV1(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(verifier.calls).toBe(0);
    expect(pool.connectCalls).toBe(0);
  });

  it('returns 401 without opening PostgreSQL when request identity is absent', async () => {
    const { input, verifier, pool } = makeInput();
    verifier.evidence = null;

    const response = await handleTargetPersonReadRequestV1(input);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'AUTH_REQUIRED', retryable: false },
    });
    expect(pool.connectCalls).toBe(0);
  });

  it('maps cross-owner/deleted detail reads to NOT_FOUND', async () => {
    const { input, pool } = makeInput({
      request: new Request(
        `https://myeongha.vercel.app/api/target-persons/${TARGET_ID}`,
      ),
    });
    pool.connection.failConstraint = 'qry_target_person_unavailable';

    const response = await handleTargetPersonReadRequestV1(input);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', retryable: false },
    });
    expect(
      pool.connection.calls.some((call) => call.text === 'ROLLBACK'),
    ).toBe(true);
  });

  it('returns 405/no-store for unsupported methods without identity resolution', async () => {
    const { input, verifier, pool } = makeInput({
      request: new Request('https://myeongha.vercel.app/api/target-persons', {
        method: 'POST',
      }),
    });

    const response = await handleTargetPersonReadRequestV1(input);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(verifier.calls).toBe(0);
    expect(pool.connectCalls).toBe(0);
  });

  it('returns 404/no-store for non-canonical query or nested path shapes', async () => {
    for (const url of [
      'https://myeongha.vercel.app/api/target-persons?subjectId=bad',
      `https://myeongha.vercel.app/api/target-persons/${TARGET_ID}/extra`,
    ]) {
      const { input, verifier, pool } = makeInput({
        request: new Request(url),
      });
      const response = await handleTargetPersonReadRequestV1(input);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(verifier.calls).toBe(0);
      expect(pool.connectCalls).toBe(0);
    }
  });
});
