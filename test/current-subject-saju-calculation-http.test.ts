import { describe, expect, it, vi } from 'vitest';
import type { SajuProductionCalculationIngressArtifactV1 } from '../packages/domain/src/index.js';
import {
  CURRENT_SUBJECT_SAJU_CALCULATION_HTTP_BINDINGS_V1,
  handleCurrentSubjectSajuCalculationRequestV1,
} from '../apps/api/src/current-subject-saju-calculation-http.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { SajuProductionCalculationHttpAdapterV1 } from '../apps/api/src/saju-production-calculation-http-adapter.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = '22222222-2222-4222-8222-222222222222';
const BIRTH_PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const REVISION_ID = '44444444-4444-4444-8444-444444444444';

function artifactFixture(): SajuProductionCalculationIngressArtifactV1 {
  return {
    schemaVersion: 'myeongha-saju-production-calculation-ingress-v1',
    kind: 'saju_calculation_evidence',
    semanticAuthority: 'calculation_only',
    interpretationAuthorized: false,
    birthRevisionRef: REVISION_ID,
    source: {},
    snapshot: {},
  } as unknown as SajuProductionCalculationIngressArtifactV1;
}

interface DatabaseFixtureOptions {
  readonly locatorRevisionId?: string;
  readonly locatorRevisionNo?: number;
  readonly omitSelfBirthProfile?: boolean;
  readonly events?: string[];
}

function createPool(options: DatabaseFixtureOptions = {}): PostgresSubjectPoolV1 {
  const events = options.events ?? [];
  const connection: PostgresSubjectConnectionV1 = {
    async query<Row = Record<string, unknown>>(
      text: string,
      _values?: readonly unknown[],
    ): Promise<PostgresQueryResultV1<Row>> {
      events.push(text);

      if (text === 'BEGIN' || text === 'SET LOCAL ROLE myeongha_api_executor' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [] };
      }
      if (text.includes('begin_member_subject_context_v1')) {
        return {
          rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' }] as unknown as readonly Row[],
        };
      }
      if (text.includes('assert_myeongha_subject_context_v1')) {
        return { rows: [{}] as unknown as readonly Row[] };
      }
      if (text.includes('qry_self_birth_profile_current_v1')) {
        if (options.omitSelfBirthProfile) return { rows: [] };
        return {
          rows: [
            {
              subjectId: SUBJECT_ID,
              birthProfileId: BIRTH_PROFILE_ID,
              currentRevisionId: options.locatorRevisionId ?? REVISION_ID,
              currentRevisionNo: options.locatorRevisionNo ?? 7,
              profileUpdatedAt: '2026-09-01T22:00:00.000Z',
            },
          ] as unknown as readonly Row[],
        };
      }
      if (text.includes('qry_birth_profile_current_revision_v1')) {
        return {
          rows: [
            {
              birthProfileId: BIRTH_PROFILE_ID,
              profileKind: 'self',
              label: null,
              currentRevisionId: REVISION_ID,
              archivedAt: null,
              currentRevisionNo: 7,
              currentCalendarType: 'solar',
              currentBirthDate: '2001-07-14',
              currentBirthTime: '15:20:00',
              currentTimeKnown: true,
              currentIsLeapMonth: false,
              currentSex: 'female',
              revisionId: REVISION_ID,
              revisionNo: 7,
              isCurrentRevision: true,
            },
          ] as unknown as readonly Row[],
        };
      }

      throw new Error(`Unexpected SQL in test: ${text}`);
    },
    release() {
      events.push('RELEASE');
    },
  };

  return {
    async connect() {
      events.push('CONNECT');
      return connection;
    },
  };
}

function verifier(
  verified = true,
): IdentityEvidenceVerificationPortV1 & { verifyRequestIdentity: ReturnType<typeof vi.fn> } {
  return {
    verifyRequestIdentity: vi.fn(async () =>
      verified
        ? ({ kind: 'member', verifiedAuthUserId: AUTH_USER_ID } as const)
        : null,
    ),
  };
}

function adapter(
  artifact = artifactFixture(),
  events?: string[],
): SajuProductionCalculationHttpAdapterV1 & { calculate: ReturnType<typeof vi.fn> } {
  return {
    calculate: vi.fn(async () => {
      events?.push('SAJU_CALCULATE');
      return artifact;
    }),
  };
}

function request(
  init: RequestInit = { method: 'POST' },
  suffix = '',
): Request {
  return new Request(
    `https://myeongha.example${CURRENT_SUBJECT_SAJU_CALCULATION_HTTP_BINDINGS_V1.route}${suffix}`,
    init,
  );
}

const REQUEST_ID = 'request:saju:1';
const SERVER_TIME = '2026-09-02T07:00:00.000Z';

describe('current-subject Saju calculation HTTP boundary v1', () => {
  it('fixes the route to POST and rejects query-string route variants', async () => {
    const identity = verifier();
    const saju = adapter();
    const pool = createPool();

    const methodResponse = await handleCurrentSubjectSajuCalculationRequestV1({
      request: request({ method: 'GET' }),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: identity,
      pool,
      sajuAdapter: saju,
    });
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get('allow')).toBe('POST');

    const queryResponse = await handleCurrentSubjectSajuCalculationRequestV1({
      request: request({ method: 'POST' }, '?revisionId=attacker'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: identity,
      pool,
      sajuAdapter: saju,
    });
    expect(queryResponse.status).toBe(404);
    expect(identity.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(saju.calculate).not.toHaveBeenCalled();
  });

  it('rejects every client body before authentication or authority resolution', async () => {
    const identity = verifier();
    const saju = adapter();
    const pool = createPool();
    const response = await handleCurrentSubjectSajuCalculationRequestV1({
      request: request({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          calculationPolicyId: 'attacker-policy',
          revisionId: 'attacker-revision',
          baseUrl: 'https://attacker.example',
          reading: { interpretation: 'attacker' },
        }),
      }),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: identity,
      pool,
      sajuAdapter: saju,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', retryable: false },
    });
    expect(identity.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(saju.calculate).not.toHaveBeenCalled();
  });

  it('returns AUTH_REQUIRED without touching PostgreSQL when request identity is absent', async () => {
    const identity = verifier(false);
    const connect = vi.fn();
    const pool = { connect } as unknown as PostgresSubjectPoolV1;
    const saju = adapter();

    const response = await handleCurrentSubjectSajuCalculationRequestV1({
      request: request(),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: identity,
      pool,
      sajuAdapter: saju,
    });

    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
    expect(saju.calculate).not.toHaveBeenCalled();
  });

  it('commits the authoritative Birth Profile transaction before starting external Saju transport', async () => {
    const events: string[] = [];
    const identity = verifier();
    const pool = createPool({ events });
    const saju = adapter(artifactFixture(), events);

    const response = await handleCurrentSubjectSajuCalculationRequestV1({
      request: request(),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: identity,
      pool,
      sajuAdapter: saju,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        calculation: {
          semanticAuthority: 'calculation_only',
          interpretationAuthorized: false,
          birthRevisionRef: REVISION_ID,
        },
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: REQUEST_ID,
        serverTime: SERVER_TIME,
      },
    });

    expect(saju.calculate).toHaveBeenCalledWith({
      birthRevisionRef: REVISION_ID,
      calendarType: 'solar',
      birthDate: '2001-07-14',
      birthTime: '15:20:00',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'female',
    });
    expect(events.indexOf('COMMIT')).toBeGreaterThan(-1);
    expect(events.indexOf('SAJU_CALCULATE')).toBeGreaterThan(events.indexOf('COMMIT'));
    expect(events.indexOf('RELEASE')).toBeLessThan(events.indexOf('SAJU_CALCULATE'));
  });

  it('fails closed on locator/current-revision drift and never calls Saju', async () => {
    const events: string[] = [];
    const saju = adapter(artifactFixture(), events);
    const response = await handleCurrentSubjectSajuCalculationRequestV1({
      request: request(),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: verifier(),
      pool: createPool({
        locatorRevisionId: '55555555-5555-4555-8555-555555555555',
        locatorRevisionNo: 8,
        events,
      }),
      sajuAdapter: saju,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'SAJU_TEMPORARILY_UNAVAILABLE', retryable: true },
    });
    expect(events).toContain('ROLLBACK');
    expect(events).not.toContain('COMMIT');
    expect(saju.calculate).not.toHaveBeenCalled();
  });

  it('returns a non-retryable current-Birth requirement when no active self Birth Profile exists', async () => {
    const saju = adapter();
    const response = await handleCurrentSubjectSajuCalculationRequestV1({
      request: request(),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: verifier(),
      pool: createPool({ omitSelfBirthProfile: true }),
      sajuAdapter: saju,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', messageKey: 'birth_profile.required', retryable: false },
    });
    expect(saju.calculate).not.toHaveBeenCalled();
  });

  it('sanitizes adapter failures to the public Saju availability error', async () => {
    const calculate = vi.fn(async () => {
      throw new Error('private-upstream-host:9443 refused connection');
    });
    const saju = { calculate } satisfies SajuProductionCalculationHttpAdapterV1;
    const response = await handleCurrentSubjectSajuCalculationRequestV1({
      request: request(),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: verifier(),
      pool: createPool(),
      sajuAdapter: saju,
    });

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain('SAJU_TEMPORARILY_UNAVAILABLE');
    expect(text).not.toContain('private-upstream-host');
    expect(text).not.toContain('refused connection');
  });
});
