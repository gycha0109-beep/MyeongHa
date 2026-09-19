import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_SUBJECT_SAJU_PREVIEW_READING_HTTP_BINDINGS_V1,
  handleCurrentSubjectSajuPreviewReadingRequestV1,
} from '../apps/api/src/current-subject-saju-preview-reading-http.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { SajuProductionReadingHttpAdapterV1 } from '../apps/api/src/saju-production-reading-http-adapter.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = '22222222-2222-4222-8222-222222222222';
const BIRTH_PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const REVISION_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = 'request:saju-preview:1';
const SERVER_TIME = '2026-09-19T14:00:00.000Z';

function createPool(options: { omitSelfBirthProfile?: boolean; events?: string[] } = {}): PostgresSubjectPoolV1 {
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
          rows: [{
            subjectId: SUBJECT_ID,
            birthProfileId: BIRTH_PROFILE_ID,
            currentRevisionId: REVISION_ID,
            currentRevisionNo: 7,
            profileUpdatedAt: '2026-09-19T13:00:00.000Z',
          }] as unknown as readonly Row[],
        };
      }
      if (text.includes('qry_birth_profile_current_revision_v1')) {
        return {
          rows: [{
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
          }] as unknown as readonly Row[],
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

function verifier(verified = true): IdentityEvidenceVerificationPortV1 {
  return {
    verifyRequestIdentity: vi.fn(async () =>
      verified
        ? ({ kind: 'member', verifiedAuthUserId: AUTH_USER_ID } as const)
        : null),
  };
}

function adapter(events?: string[]): SajuProductionReadingHttpAdapterV1<unknown> & {
  requestReading: ReturnType<typeof vi.fn>;
} {
  return {
    requestReading: vi.fn(async () => {
      events?.push('SAJU_PREVIEW_READING');
      return {
        responseVersion: 'myeonghwa-product-reading-response-v2',
        state: 'delivered',
        sections: [{ sectionId: 'core', title: '이 사주의 핵심', blocks: [] }],
      };
    }),
  };
}

function request(readingText = '전체 사주', method = 'POST'): Request {
  return new Request(
    `https://myeongha.example${CURRENT_SUBJECT_SAJU_PREVIEW_READING_HTTP_BINDINGS_V1.route}`,
    {
      method,
      ...(method === 'POST'
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ readingText }),
          }
        : {}),
    },
  );
}

describe('current-subject Saju Preview Reading HTTP boundary v1', () => {
  it('allows only the provisionally approved Preview Reading texts', async () => {
    const saju = adapter();
    const connect = vi.fn();
    const response = await handleCurrentSubjectSajuPreviewReadingRequestV1({
      request: request('올해 운세'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: verifier(),
      pool: { connect } as unknown as PostgresSubjectPoolV1,
      sajuAdapter: saju,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'SAJU_PREVIEW_READING_UNAVAILABLE', retryable: false },
    });
    expect(connect).not.toHaveBeenCalled();
    expect(saju.requestReading).not.toHaveBeenCalled();
  });

  it('requires authenticated current-subject evidence before touching PostgreSQL', async () => {
    const connect = vi.fn();
    const saju = adapter();
    const response = await handleCurrentSubjectSajuPreviewReadingRequestV1({
      request: request(),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: verifier(false),
      pool: { connect } as unknown as PostgresSubjectPoolV1,
      sajuAdapter: saju,
    });

    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
    expect(saju.requestReading).not.toHaveBeenCalled();
  });

  it('binds the authoritative current Birth revision and commits before Preview transport', async () => {
    const events: string[] = [];
    const saju = adapter(events);
    const response = await handleCurrentSubjectSajuPreviewReadingRequestV1({
      request: request('재물운'),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: verifier(),
      pool: createPool({ events }),
      sajuAdapter: saju,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        lifecycle: 'preview',
        reading: {
          responseVersion: 'myeonghwa-product-reading-response-v2',
          state: 'delivered',
        },
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: REQUEST_ID,
        serverTime: SERVER_TIME,
      },
    });
    expect(saju.requestReading).toHaveBeenCalledWith({
      birth: {
        calendarType: 'solar',
        date: '2001-07-14',
        time: '15:20',
        sex: 'female',
      },
      reading: { text: '재물운' },
    });
    expect(events.indexOf('COMMIT')).toBeGreaterThan(-1);
    expect(events.indexOf('SAJU_PREVIEW_READING')).toBeGreaterThan(events.indexOf('COMMIT'));
    expect(events.indexOf('RELEASE')).toBeLessThan(events.indexOf('SAJU_PREVIEW_READING'));
  });

  it('returns a non-retryable Birth Profile requirement when current self Birth data is absent', async () => {
    const saju = adapter();
    const response = await handleCurrentSubjectSajuPreviewReadingRequestV1({
      request: request('직업운'),
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
    expect(saju.requestReading).not.toHaveBeenCalled();
  });

  it('rejects extra client authority fields instead of accepting client Birth or lifecycle input', async () => {
    const saju = adapter();
    const response = await handleCurrentSubjectSajuPreviewReadingRequestV1({
      request: new Request(
        `https://myeongha.example${CURRENT_SUBJECT_SAJU_PREVIEW_READING_HTTP_BINDINGS_V1.route}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            readingText: '전체 사주',
            lifecycle: 'production',
            birth: { date: '1900-01-01' },
          }),
        },
      ),
      requestId: REQUEST_ID,
      serverTime: SERVER_TIME,
      identityEvidenceVerifier: verifier(),
      pool: createPool(),
      sajuAdapter: saju,
    });

    expect(response.status).toBe(400);
    expect(saju.requestReading).not.toHaveBeenCalled();
  });
});
