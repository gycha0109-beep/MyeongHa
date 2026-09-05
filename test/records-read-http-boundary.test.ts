import { describe, expect, it } from 'vitest';
import {
  RECORDS_READ_HTTP_BINDINGS_V1,
  handleLifeRecordReadRequestV1,
  handleMemoryItemsReadRequestV1,
  type HandleOwnerRecordReadRequestInputV1,
} from '../apps/api/src/records-read-http.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const AUTH_USER_ID = '91000000-0000-0000-0000-000000000001';
const SUBJECT_ID = '92000000-0000-0000-0000-000000000001';
const REQUEST_ID = 'req-records-1';
const SERVER_TIME = '2026-09-05T08:55:00.000Z';

type QueryCall = Readonly<{ text: string; values: readonly unknown[] }>;

function postgresError(constraint: string) {
  return Object.assign(new Error(constraint), { code: 'P0001', constraint });
}

class FakeVerifier implements IdentityEvidenceVerificationPortV1 {
  readonly calls: Request[] = [];
  result: VerifiedSubjectIdentityEvidenceV1 | null = {
    kind: 'member',
    verifiedAuthUserId: AUTH_USER_ID,
  };

  verifyRequestIdentity(request: Request): VerifiedSubjectIdentityEvidenceV1 | null {
    this.calls.push(request);
    return this.result;
  }
}

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls: QueryCall[] = [];
  readonly releases: unknown[] = [];
  lifeRecordError: unknown;
  memoriesError: unknown;

  lifeRecordRows: readonly Record<string, unknown>[] = [
    {
      lifeFactId: '11111111-1111-4111-8111-111111111111',
      factType: 'work.status',
      schemaVersion: 'v1',
      valueJsonb: { status: 'active' },
      validFrom: new Date('2026-09-01T00:00:00.000Z'),
      validTo: null,
      sourceKind: 'user_confirmed',
      sourceMessageId: null,
      sourceMergeActionId: null,
      supersedesFactId: null,
      confirmedAt: new Date('2026-09-03T00:00:00.000Z'),
      revokedAt: null,
      createdAt: new Date('2026-09-03T00:00:00.000Z'),
    },
  ];

  memoryRows: readonly Record<string, unknown>[] = [
    {
      memoryItemId: '22222222-2222-4222-8222-222222222222',
      memoryType: 'preference',
      schemaVersion: 'v1',
      contentJsonb: { topic: 'food' },
      createdByCharacterId: null,
      createdAt: new Date('2026-09-04T00:00:00.000Z'),
    },
  ];

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push(Object.freeze({ text, values: Object.freeze([...values]) }));

    if (text.includes('begin_member_subject_context_v1')) {
      return {
        rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' }] as unknown as readonly Row[],
      };
    }
    if (text.includes('qry_life_record_ledger_v1')) {
      if (this.lifeRecordError !== undefined) throw this.lifeRecordError;
      return { rows: this.lifeRecordRows as unknown as readonly Row[] };
    }
    if (text.includes('qry_memory_items_v1')) {
      if (this.memoriesError !== undefined) throw this.memoriesError;
      return { rows: this.memoryRows as unknown as readonly Row[] };
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

function fixture(path: '/api/life-record' | '/api/memories', method = 'GET') {
  const request = new Request(`https://myeongha.test${path}`, { method });
  const verifier = new FakeVerifier();
  const connection = new FakeConnection();
  const pool = new FakePool(connection);
  const input: HandleOwnerRecordReadRequestInputV1 = {
    request,
    requestId: REQUEST_ID,
    serverTime: SERVER_TIME,
    identityEvidenceVerifier: verifier,
    pool,
  };
  return { request, verifier, connection, pool, input };
}

function callTexts(connection: FakeConnection): string[] {
  return connection.calls.map((call) => call.text);
}

describe('owner Records read HTTP boundary', () => {
  it('pins browser routes to the v0.9 owner-scoped query authorities', () => {
    expect(RECORDS_READ_HTTP_BINDINGS_V1).toEqual({
      lifeRecord: {
        method: 'GET',
        route: '/api/life-record',
        readAuthority: 'public.qry_life_record_ledger_v1',
      },
      memories: {
        method: 'GET',
        route: '/api/memories',
        readAuthority: 'public.qry_memory_items_v1',
      },
      apiContractVersion: 'v0.9',
    });
  });

  it('reads the Life Record only after canonical subject binding in the same transaction', async () => {
    const f = fixture('/api/life-record');
    const response = await handleLifeRecordReadRequestV1(f.input);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        facts: [
          {
            lifeFactId: '11111111-1111-4111-8111-111111111111',
            factType: 'work.status',
            schemaVersion: 'v1',
            valueJsonb: { status: 'active' },
            validFrom: '2026-09-01T00:00:00.000Z',
            validTo: null,
            sourceKind: 'user_confirmed',
            sourceMessageId: null,
            sourceMergeActionId: null,
            supersedesFactId: null,
            confirmedAt: '2026-09-03T00:00:00.000Z',
            revokedAt: null,
            createdAt: '2026-09-03T00:00:00.000Z',
          },
        ],
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: REQUEST_ID,
        serverTime: SERVER_TIME,
      },
    });
    expect(callTexts(f.connection)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('public.begin_member_subject_context_v1($1::uuid)'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      expect.stringContaining('public.qry_life_record_ledger_v1($1::uuid)'),
      'COMMIT',
    ]);
    expect(f.connection.calls[4]?.values).toEqual([SUBJECT_ID]);
  });

  it('reads current Memories only with the same server-resolved canonical subject', async () => {
    const f = fixture('/api/memories');
    const response = await handleMemoryItemsReadRequestV1(f.input);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        memories: [
          {
            memoryItemId: '22222222-2222-4222-8222-222222222222',
            memoryType: 'preference',
            schemaVersion: 'v1',
            contentJsonb: { topic: 'food' },
            createdByCharacterId: null,
            createdAt: '2026-09-04T00:00:00.000Z',
          },
        ],
      },
    });
    expect(f.connection.calls[4]?.values).toEqual([SUBJECT_ID]);
    expect(f.connection.calls[4]?.text).toContain('public.qry_memory_items_v1($1::uuid)');
  });

  it('fails closed with 401/no-store before opening PostgreSQL when identity is absent', async () => {
    const f = fixture('/api/life-record');
    f.verifier.result = null;

    const response = await handleLifeRecordReadRequestV1(f.input);

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(f.pool.connectCalls).toBe(0);
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
  });

  it('does not accept client subject overrides through query parameters', async () => {
    const f = fixture('/api/memories');
    const request = new Request(
      'https://myeongha.test/api/memories?subjectId=ffffffff-ffff-4fff-8fff-ffffffffffff',
    );

    const response = await handleMemoryItemsReadRequestV1({ ...f.input, request });

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(f.verifier.calls).toHaveLength(0);
    expect(f.pool.connectCalls).toBe(0);
  });

  it('maps cross/ineligible-subject authority failure to NOT_FOUND without existence leakage', async () => {
    const f = fixture('/api/life-record');
    f.connection.lifeRecordError = postgresError('qry_life_record_ledger_subject_ineligible');

    const response = await handleLifeRecordReadRequestV1(f.input);

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', retryable: false },
    });
    expect(callTexts(f.connection).at(-1)).toBe('ROLLBACK');
  });

  it('rejects non-GET methods before identity or database work', async () => {
    const f = fixture('/api/memories', 'POST');
    const response = await handleMemoryItemsReadRequestV1(f.input);

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(f.verifier.calls).toHaveLength(0);
    expect(f.pool.connectCalls).toBe(0);
  });
});
