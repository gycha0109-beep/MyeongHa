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
import { readBoundSajuComparisonBirthsV1 } from '../apps/api/src/saju-bound-comparison-births-v1.js';
import { executeSajuComparisonPreviewV1 } from '../apps/api/src/saju-comparison-preview-execution-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = '22222222-2222-4222-8222-222222222222';
const BIRTH_PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const REVISION_ID = '44444444-4444-4444-8444-444444444444';
const TARGET_ID = '55555555-5555-4555-8555-555555555555';
const TARGET_BIRTH_ID = '66666666-6666-4666-8666-666666666666';
const TARGET_REVISION_ID = '77777777-7777-4777-8777-777777777777';

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
  readonly targetRevisionId?: string;
  readonly events?: string[];
}

function createPool(options: DatabaseFixtureOptions = {}): PostgresSubjectPoolV1 {
  const events = options.events ?? [];
  const connection: PostgresSubjectConnectionV1 = {
    async query<Row = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
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
      if (text.includes('qry_target_person_v1')) {
        if (values?.[0] !== SUBJECT_ID || values[1] !== TARGET_ID) {
          throw Object.assign(new Error('Target unavailable'), {
            constraint: 'qry_target_person_unavailable',
          });
        }
        return { rows: [{
          targetPersonId: TARGET_ID,
          displayLabel: 'private label',
          relationshipLabel: null,
          birthProfileId: TARGET_BIRTH_ID,
          currentBirthRevisionId: options.targetRevisionId ?? TARGET_REVISION_ID,
          currentRevisionNo: 2,
          currentCalendarType: 'solar',
          currentBirthDate: '2000-03-19',
          currentBirthTime: null,
          currentTimeKnown: false,
          currentIsLeapMonth: false,
          currentSex: null,
        }] as unknown as readonly Row[] };
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

describe('owner-bound comparison revisions', () => {
  const pinned = {
    verifiedEvidence: { kind: 'member', verifiedAuthUserId: AUTH_USER_ID } as const,
    targetPersonId: TARGET_ID,
    sourceBirthRevisionId: REVISION_ID,
    targetBirthRevisionId: TARGET_REVISION_ID,
  };

  it('resolves both exact revisions under one member transaction and leaves unknown time unset', async () => {
    const events: string[] = [];
    const result = await readBoundSajuComparisonBirthsV1({ ...pinned, pool: createPool({ events }) });
    expect(result).toMatchObject({
      subjectId: SUBJECT_ID, targetPersonId: TARGET_ID,
      sourceBirthRevisionId: REVISION_ID, targetBirthRevisionId: TARGET_REVISION_ID,
      previewRequest: {
        birth: { date: '2001-07-14', time: '15:20' },
        partnerBirth: { date: '2000-03-19', time: null },
      },
    });
    expect(JSON.stringify(result.previewRequest)).not.toContain(TARGET_ID);
    expect(JSON.stringify(result)).not.toContain('private label');
    expect(events.filter(event => event === 'BEGIN')).toHaveLength(1);
    expect(events.slice(-2)).toEqual(['COMMIT', 'RELEASE']);
  });

  it('rejects a stale target revision and another member’s target', async () => {
    const events: string[] = [];
    const differentId = '88888888-8888-4888-8888-888888888888';
    await expect(readBoundSajuComparisonBirthsV1({
      ...pinned, pool: createPool({ events, targetRevisionId: differentId }),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(events.slice(-2)).toEqual(['ROLLBACK', 'RELEASE']);
    await expect(readBoundSajuComparisonBirthsV1({
      ...pinned, targetPersonId: differentId, pool: createPool(),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  const env = {
    MYEONGHA_SAJU_SERVICE_ORIGIN: 'https://saju.example.test',
    MYEONGHA_SAJU_SERVICE_BEARER: 'synthetic-service-credential',
  };
  const pillar = { status: 'resolved', value: '甲子' };
  function response(overrides: Record<string, unknown> = {}) {
    return Response.json({
      lifecycle: 'internal_preview_only', coverage: 'calculation_facts_only',
      generatedInterpretationClaims: false, mayPublish: false, mayPersist: false, maySell: false,
      subjects: [
        { role: 'self', pillars: { year: pillar, month: pillar, day: pillar, hour: pillar } },
        { role: 'partner', pillars: { year: pillar, month: pillar, day: pillar, hour: { status: 'unavailable' } } },
      ],
      ...overrides,
    }, { headers: { 'x-myeonghwa-reading-lifecycle': 'preview' } });
  }

  it('dispatches the owner-bound inputs only after exact-use authorization and rechecks it on return', async () => {
    const events: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(events.slice(-2)).toEqual(['COMMIT', 'RELEASE']);
      expect(url).toBe('https://saju.example.test/api/preview/compatibility-charts');
      expect(init.redirect).toBe('manual');
      const body = JSON.parse(String(init.body));
      expect(Object.keys(body)).toEqual(['birth', 'partnerBirth']);
      expect(body.partnerBirth).toEqual({ calendarType: 'solar', date: '2000-03-19', time: null });
      expect(JSON.stringify(body)).not.toContain(TARGET_ID);
      return response();
    });
    const admit = vi.fn(async () => true);
    const result = await executeSajuComparisonPreviewV1({
      ...pinned, env, pool: createPool({ events }), fetchImpl, useAuthority: { admit },
    });
    expect(result).toMatchObject({ lifecycle: 'internal_preview_only', maySell: false });
    expect(admit).toHaveBeenCalledTimes(2);
    expect(admit).toHaveBeenNthCalledWith(1, {
      purpose: 'saju_comparison_preview', subjectId: SUBJECT_ID, targetPersonId: TARGET_ID,
      sourceBirthRevisionId: REVISION_ID, targetBirthRevisionId: TARGET_REVISION_ID,
    });
    expect(events.filter(event => event === 'BEGIN')).toHaveLength(2);
  });

  it('blocks missing authorization before dispatch and suppresses results if authorization is withdrawn', async () => {
    const fetchImpl = vi.fn(async () => response());
    const request = { ...pinned, env, pool: createPool(), fetchImpl };
    await expect(executeSajuComparisonPreviewV1(request)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
    await expect(executeSajuComparisonPreviewV1({
      ...request, useAuthority: { admit: async () => false },
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(fetchImpl).not.toHaveBeenCalled();
    const admit = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(executeSajuComparisonPreviewV1({
      ...request, useAuthority: { admit },
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a source response that claims to provide an interpretation', async () => {
    await expect(executeSajuComparisonPreviewV1({
      ...pinned, env, pool: createPool(), useAuthority: { admit: async () => true },
      fetchImpl: async () => response({ generatedInterpretationClaims: true }),
    })).rejects.toMatchObject({ code: 'SAJU_TEMPORARILY_UNAVAILABLE' });
  });
});

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

  it.each([false, true])('commits the authoritative Birth Profile transaction before external Saju transport (admission=%s)', async (admissionEnabled) => {
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
      ...(admissionEnabled ? { sajuAbuseAdmission: {
        secret: 'synthetic-admission-secret-over-thirty-two-bytes',
        admissionPort: { admit: async () => {
          events.push('SAJU_ADMIT');
          return { allowed: true, requestCount: 1, resetAt: new Date(Date.parse(SERVER_TIME) + 60_000).toISOString(), evaluatedAt: SERVER_TIME,
            policy: { policyVersion: 'synthetic-v1', policyHash: 'a'.repeat(64), windowSeconds: 60, requestLimit: 3, blockedCountSaturation: 4, retryAfterMaximumSeconds: 60, cleanupRetentionSeconds: 60 } };
        } },
      } } : {}),
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
    if (admissionEnabled) expect(events.indexOf('SAJU_ADMIT')).toBeLessThan(events.indexOf('CONNECT'));
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
