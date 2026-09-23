import { describe, expect, it, vi } from 'vitest';
import { handleOfficialReadingRecordRequestV1 } from './official-reading-record-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const READING_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';

const ROW = Object.freeze({
  readingId: READING_ID,
  readingSessionId: SESSION_ID,
  sajuDomain: 'career',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  responseSnapshotJsonb: Object.freeze({
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    reading: Object.freeze({
      readingId: READING_ID,
      sections: Object.freeze([]),
    }),
  }),
  responseHash: 'sha256:stored-reading',
  readerCharacterIds: Object.freeze(['seyeon']),
  completedAt: '2026-09-23T00:01:00.000Z',
});

function request(query = `readingId=${READING_ID}`, method = 'GET'): Request {
  return new Request(`https://myeongha.internal/api/readings?${query}`, {
    method,
    headers: { Authorization: 'Bearer member-secret' },
  });
}

function verifier(authenticated = true) {
  return {
    verifyRequestIdentity: vi.fn(async () => authenticated
      ? { kind: 'member' as const, verifiedAuthUserId: AUTH_USER_ID }
      : null),
  };
}

function fakePool(input: {
  readonly rows?: readonly typeof ROW[];
  readonly onAuthorityQuery?: (values: readonly unknown[]) => void;
  readonly onRollback?: () => void;
} = {}): PostgresSubjectPoolV1 {
  return {
    async connect(): Promise<PostgresSubjectConnectionV1> {
      return {
        async query<ResultRow = Record<string, unknown>>(
          text: string,
          values?: readonly unknown[],
        ): Promise<{ rows: readonly ResultRow[] }> {
          if (
            text === 'BEGIN'
            || text.startsWith('SET LOCAL ROLE')
            || text === 'COMMIT'
          ) {
            return { rows: [] };
          }
          if (text === 'ROLLBACK') {
            input.onRollback?.();
            return { rows: [] };
          }
          if (text.includes('begin_member_subject_context_v1')) {
            return {
              rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' } as ResultRow],
            };
          }
          if (text.includes('assert_myeongha_subject_context_v1')) {
            expect(values).toEqual([SUBJECT_ID]);
            return { rows: [] };
          }
          if (text.includes('qry_official_reading_record_runtime_v1')) {
            input.onAuthorityQuery?.(values ?? []);
            return { rows: (input.rows ?? [ROW]) as readonly ResultRow[] };
          }
          throw new Error(`Unexpected SQL in Official Reading record HTTP test: ${text}`);
        },
        release: vi.fn(),
      };
    },
  };
}

async function invoke(input: {
  readonly request?: Request;
  readonly authenticated?: boolean;
  readonly pool?: PostgresSubjectPoolV1;
} = {}): Promise<Response> {
  return handleOfficialReadingRecordRequestV1({
    request: input.request ?? request(),
    requestId: 'req-official-reading-record',
    serverTime: '2026-09-23T00:02:00.000Z',
    identityEvidenceVerifier: verifier(input.authenticated ?? true),
    pool: input.pool ?? fakePool(),
  });
}

describe('Official Reading record HTTP adapter', () => {
  it.each([
    `readingId=${READING_ID}&readingId=${READING_ID}`,
    'readingId=reading-1',
    `readingId=${READING_ID}&threadId=77777777-7777-4777-8777-777777777777`,
  ])('fails closed before auth or PostgreSQL for non-canonical archive query: %s', async (query) => {
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const response = await invoke({
      request: request(query),
      pool: { connect },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods before identity resolution or PostgreSQL', async () => {
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const identityEvidenceVerifier = verifier();
    const response = await handleOfficialReadingRecordRequestV1({
      request: request(`readingId=${READING_ID}`, 'POST'),
      requestId: 'req-official-reading-record-method',
      serverTime: '2026-09-23T00:02:00.000Z',
      identityEvidenceVerifier,
      pool: { connect },
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(identityEvidenceVerifier.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('requires verified identity before touching PostgreSQL', async () => {
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const response = await invoke({
      authenticated: false,
      pool: { connect },
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error.code).toBe('AUTH_REQUIRED');
    expect(connect).not.toHaveBeenCalled();
  });

  it('binds the canonical owner subject and requested Reading identity to archive authority', async () => {
    const onAuthorityQuery = vi.fn((values: readonly unknown[]) => {
      expect(values).toEqual([SUBJECT_ID, READING_ID]);
    });
    const response = await invoke({ pool: fakePool({ onAuthorityQuery }) });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.data).toMatchObject({
      readingId: READING_ID,
      readingSessionId: SESSION_ID,
      sajuDomain: 'career',
      productResponseState: 'delivered',
      readerCharacterIds: ['seyeon'],
    });
    expect(payload.data).not.toHaveProperty('responseHash');
    expect(payload.data).not.toHaveProperty('threadId');
    expect(onAuthorityQuery).toHaveBeenCalledTimes(1);
  });

  it('fails closed and rolls back when owner-scoped archive authority returns duplicate rows', async () => {
    const onRollback = vi.fn();

    await expect(invoke({
      pool: fakePool({ rows: [ROW, ROW], onRollback }),
    })).rejects.toThrow('duplicate rows');

    expect(onRollback).toHaveBeenCalledTimes(1);
  });
});
