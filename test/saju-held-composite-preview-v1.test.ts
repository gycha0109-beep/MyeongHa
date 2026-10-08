import { describe, expect, it, vi } from 'vitest';
import {
  rehearseCurrentSubjectHeldCompositePreviewV1,
} from '../apps/api/src/saju-held-composite-preview-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';
import type {
  PostgresSubjectPoolV1,
  PostgresSubjectConnectionV1,
  PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const REVISION_ID = '44444444-4444-4444-8444-444444444444';
const evidence: VerifiedSubjectIdentityEvidenceV1 = {
  kind: 'member', verifiedAuthUserId: AUTH_ID,
};

type Mutation = 'revision' | 'input' | 'archive';
function poolFactory(events: string[], mutation?: Mutation, absent = false) {
  let currentRead = 0;
  const connection: PostgresSubjectConnectionV1 = {
    async query<Row = Record<string, unknown>>(sql: string): Promise<PostgresQueryResultV1<Row>> {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
        || sql === 'SET LOCAL ROLE myeongha_api_executor') {
        events.push(sql);
        return { rows: [] };
      }
      if (sql.includes('begin_member_subject_context_v1')) {
        events.push('SUBJECT_CONTEXT');
        return { rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' }] as unknown as Row[] };
      }
      if (sql.includes('assert_myeongha_subject_context_v1')) {
        return { rows: [{}] as unknown as Row[] };
      }
      if (sql.includes('qry_self_birth_profile_current_v1')) {
        currentRead += 1;
        events.push('CURRENT_BIRTH_READ');
        if (absent) return { rows: [] };
        return { rows: [{
          subjectId: SUBJECT_ID,
          birthProfileId: PROFILE_ID,
          currentRevisionId: mutation === 'revision' && currentRead > 1
            ? '55555555-5555-4555-8555-555555555555' : REVISION_ID,
          currentRevisionNo: mutation === 'revision' && currentRead > 1 ? 8 : 7,
          profileUpdatedAt: '2026-09-19T13:00:00.000Z',
        }] as unknown as Row[] };
      }
      if (sql.includes('qry_birth_profile_current_revision_v1')) {
        const newRevision = mutation === 'revision' && currentRead > 1;
        const id = newRevision ? '55555555-5555-4555-8555-555555555555' : REVISION_ID;
        return { rows: [{
          birthProfileId: PROFILE_ID,
          profileKind: 'self',
          label: null,
          currentRevisionId: id,
          archivedAt: mutation === 'archive' && currentRead > 1
            ? '2026-09-20T13:00:00.000Z' : null,
          currentRevisionNo: newRevision ? 8 : 7,
          currentCalendarType: 'solar',
          currentBirthDate: mutation === 'input' && currentRead > 1 ? '2001-07-15' : '2001-07-14',
          currentBirthTime: '15:20:00',
          currentTimeKnown: true,
          currentIsLeapMonth: false,
          currentSex: 'female',
          revisionId: id,
          revisionNo: newRevision ? 8 : 7,
          isCurrentRevision: true,
        }] as unknown as Row[] };
      }
      throw new Error('Unexpected SQL in fixture: ' + sql);
    },
    release() { events.push('RELEASE'); },
  };

  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      events.push('CONNECT');
      return connection;
    },
  };
  return { pool, getReadCount: () => currentRead };
}

function response(serial: number, state: 'delivered' | 'insufficient_evidence' = 'delivered') {
  const common = {
    responseId: 'reading_response_' + String(serial).repeat(24),
    responseVersion: 'myeonghwa-product-reading-response-v2',
  };
  if (state === 'insufficient_evidence') {
    return {
      ...common,
      state: 'insufficient_evidence',
      messageCode: 'READING_EVIDENCE_INSUFFICIENT',
      requiredAction: 'none',
      coverage: { state: 'insufficient', hasAvailableEvidence: false, missingRequirementCount: 1 },
    };
  }
  return {
    ...common,
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId: 'reading-synthetic-' + serial,
      sections: [{ sectionType: 'overview', state: 'complete',
        title: '합성 테스트 문장', blocks: [{ type: 'paragraph', text: '이 문장은 원전 해석이 아닙니다' }] }],
      disclosures: [{ type: 'scope_limitation', text: '연구·테스트 전용' }],
    },
  };
}

type FetchMode = 'ok' | 'missing_admission' | 'wrong_lifecycle'
  | 'not_delivered' | 'duplicate_identity' | 'malformed' | 'network_error';
function transport(events: string[], mode: FetchMode = 'ok') {
  let sequence = 0;
  const fetchImpl = vi.fn(async (url: string, init: {
    method: string;
    body?: string;
    headers?: Record<string, string>;
  }): Promise<Response> => {
    sequence += 1;
    events.push('HTTP_' + sequence);
    expect(url).toBe('https://saju.test/api/preview/readings');
    expect(init.method).toBe('POST');
    expect(init.headers?.authorization).toBe('Bearer synthetic-service-token');
    if (mode === 'network_error') throw new Error('fixture network failure');
    const request = JSON.parse(String(init.body));
    expect(request).toMatchObject({
      birth: { date: '2001-07-14', time: '15:20', calendarType: 'solar', sex: 'female' },
    });
    expect(request.reading.text).toBe(sequence === 1 ? '전체 사주' : '연애운');

    const result = mode === 'malformed' ? { unexpected: true }
      : response(mode === 'duplicate_identity' ? 1 : sequence,
        mode === 'not_delivered' ? 'insufficient_evidence' : 'delivered');
    return Response.json(result, {
      headers: {
        'content-type': 'application/json',
        'x-myeonghwa-reading-lifecycle': mode === 'wrong_lifecycle' ? 'production' : 'preview',
        ...(mode === 'missing_admission' ? {} : {
          'x-myeonghwa-product-reading-response-admitted': 'myeonghwa-product-reading-response-v2',
        }),
      },
    });
  });
  return {
    fetchImpl,
    adapterConfig: { baseUrl: 'https://saju.test', bearerToken: 'synthetic-service-token', fetchImpl },
  };
}

function makeFixture(options: { mutation?: Mutation; absent?: boolean; mode?: FetchMode } = {}) {
  const events: string[] = [];
  const { pool, getReadCount } = poolFactory(events, options.mutation, options.absent);
  const transportPort = transport(events, options.mode);
  return { events, pool, getReadCount, ...transportPort };
}

describe('2B-2: server-only held composite Preview rehearsal', () => {
  it('uses one authoritative birth snapshot for both real Preview transport calls and never promotes release', async () => {
    const f = makeFixture();
    const result = await rehearseCurrentSubjectHeldCompositePreviewV1({
      verifiedEvidence: evidence, pool: f.pool, adapterConfig: f.adapterConfig,
    });
    expect(result).toEqual({
      version: 'myeongha-held-composite-preview-v1',
      status: 'hold',
      reason: 'source_provenance_not_exposed',
      checkedSlots: ['natal', 'relationship'],
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false,
      canPublish: false,
      canSell: false,
    });
    expect(f.getReadCount()).toBe(2);
    expect(f.fetchImpl).toHaveBeenCalledTimes(2);
    expect(f.events.filter((x) => x === 'CONNECT')).toHaveLength(2);
    expect(f.events.filter((x) => x === 'COMMIT')).toHaveLength(2);
    expect(f.events.filter((x) => x === 'RELEASE')).toHaveLength(2);
    expect(f.events.indexOf('HTTP_1')).toBeGreaterThan(f.events.indexOf('RELEASE'));
    expect(f.events.indexOf('HTTP_2')).toBeLessThan(f.events.lastIndexOf('CONNECT'));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checkedSlots)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('원전 해석');
  });

  it.each([
    ['revision', 'current_birth_revision_changed'],
    ['input', 'current_birth_revision_changed'],
    // The existing Birth authority refuses archived data before snapshot comparison.
    ['archive', 'birth_profile_unavailable'],
  ] as const)(
    'discards all responses when the current Birth snapshot changes during Preview: %s',
    async (mutation, expectedReason) => {
      const f = makeFixture({ mutation });
      const result = await rehearseCurrentSubjectHeldCompositePreviewV1({
        verifiedEvidence: evidence, pool: f.pool, adapterConfig: f.adapterConfig,
      });
      expect(result).toMatchObject({
        status: 'blocked',
        reason: expectedReason,
        checkedSlots: [],
        canPublish: false,
      });
      expect(f.fetchImpl).toHaveBeenCalledTimes(2);
      expect(f.getReadCount()).toBe(2);
    },
  );

  it('does not call Saju when the owned self birth profile is unavailable', async () => {
    const f = makeFixture({ absent: true });
    const result = await rehearseCurrentSubjectHeldCompositePreviewV1({
      verifiedEvidence: evidence, pool: f.pool, adapterConfig: f.adapterConfig,
    });
    expect(result).toMatchObject({
      status: 'blocked', reason: 'birth_profile_unavailable', checkedSlots: [],
    });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['missing_admission', 'preview_transport_unavailable'],
    ['wrong_lifecycle', 'preview_transport_unavailable'],
    ['malformed', 'preview_transport_unavailable'],
    ['network_error', 'preview_transport_unavailable'],
    ['not_delivered', 'preview_response_not_delivered'],
    ['duplicate_identity', 'duplicate_reading_identity'],
  ] as const)('fails closed for %s', async (mode, reason) => {
    const f = makeFixture({ mode });
    const result = await rehearseCurrentSubjectHeldCompositePreviewV1({
      verifiedEvidence: evidence, pool: f.pool, adapterConfig: f.adapterConfig,
    });
    expect(result).toMatchObject({
      status: 'blocked', reason, checkedSlots: [], canExecute: false, canSell: false,
    });
    expect(f.getReadCount()).toBe(1);
  });

  it('rejects an invalid Preview-only adapter configuration before making any HTTP call', async () => {
    const f = makeFixture();
    const result = await rehearseCurrentSubjectHeldCompositePreviewV1({
      verifiedEvidence: evidence, pool: f.pool,
      adapterConfig: { ...f.adapterConfig, baseUrl: 'file:///tmp/test' },
    });
    expect(result).toMatchObject({
      status: 'blocked', reason: 'preview_transport_unavailable',
    });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});
