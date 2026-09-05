import { describe, expect, it } from 'vitest';
import {
  CHAT_READ_HTTP_BINDING_V1,
  handleChatReadRequestV1,
  type HandleChatReadRequestInputV1,
} from '../apps/api/src/chat-read-http.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const AUTH_USER_ID = '91000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '92000000-0000-4000-8000-000000000001';
const THREAD_ID = '93000000-0000-4000-8000-000000000001';
const RELEASE_ID = '94000000-0000-4000-8000-000000000001';
const BUNDLE_ID = '95000000-0000-4000-8000-000000000001';
const PRIMARY_CHARACTER_ID = 'canonical-primary';
const OTHER_CHARACTER_ID = 'canonical-other';
const REQUEST_ID = 'req-chat-read-1';
const SERVER_TIME = '2026-09-06T00:00:00.000Z';

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
  bindingError: unknown;

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
    if (text.includes('qry_chat_thread_runtime_binding_v1')) {
      if (this.bindingError !== undefined) throw this.bindingError;
      return {
        rows: [{
          threadId: THREAD_ID,
          status: 'active',
          activeContentReleaseId: RELEASE_ID,
          activeContentBundleId: BUNDLE_ID,
          contentRevision: 7,
          participantCharacterIds: [PRIMARY_CHARACTER_ID, OTHER_CHARACTER_ID],
        }] as unknown as readonly Row[],
      };
    }
    if (text.includes('qry_chat_thread_stream_v1')) {
      return {
        rows: [{
          messageId: '96000000-0000-4000-8000-000000000001',
          sequenceNo: 4,
          senderType: 'character',
          characterId: PRIMARY_CHARACTER_ID,
          bodyText: 'source-backed message',
          messagePayloadJsonb: {},
          messageSchemaVersion: 'v1',
          createdAt: new Date('2026-09-05T15:00:00.000Z'),
          redacted: false,
          redactedAt: null,
        }] as unknown as readonly Row[],
      };
    }
    if (text.includes('qry_character_relationship_v1')) {
      return {
        rows: [{
          stateId: '97000000-0000-4000-8000-000000000001',
          characterId: PRIMARY_CHARACTER_ID,
          closeness: 10,
          trust: 20,
          friction: 3,
          relationshipStage: 'acquaintance',
          policyVersion: 'v1',
          revision: 2,
          lastInteractionAt: new Date('2026-09-05T15:00:00.000Z'),
          updatedAt: new Date('2026-09-05T15:00:00.000Z'),
        }] as unknown as readonly Row[],
      };
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

function fixture(url = `https://myeongha.test/api/chat/${THREAD_ID}?afterSequenceNo=0`, method = 'GET') {
  const request = new Request(url, { method });
  const verifier = new FakeVerifier();
  const connection = new FakeConnection();
  const pool = new FakePool(connection);
  const input: HandleChatReadRequestInputV1 = {
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

describe('owner Chat read HTTP boundary', () => {
  it('pins GET /api/chat/:threadId to DB-owned thread, ordered participant and stream authorities', () => {
    expect(CHAT_READ_HTTP_BINDING_V1).toEqual({
      method: 'GET',
      route: '/api/chat/:threadId',
      threadBindingAuthority: 'public.qry_chat_thread_runtime_binding_v1',
      primaryCharacterAuthority: 'ordered-participant-character-ids[0]:v1',
      streamAuthority: 'public.qry_chat_thread_stream_v1',
      relationshipAuthority: 'public.qry_character_relationship_v1',
      apiContractVersion: 'v0.9',
    });
  });

  it('uses the server-resolved canonical subject and first DB-ordered participant as character authority', async () => {
    const f = fixture();
    const response = await handleChatReadRequestV1(f.input);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        threadId: THREAD_ID,
        characterId: PRIMARY_CHARACTER_ID,
        contentReleaseId: RELEASE_ID,
        contentBundleId: BUNDLE_ID,
        contentRevision: 7,
        afterSequenceNo: 0,
        lastSequenceNo: 4,
        messages: [{
          sequenceNo: 4,
          senderType: 'character',
          characterId: PRIMARY_CHARACTER_ID,
          bodyText: 'source-backed message',
          redacted: false,
        }],
        latestCharacterMessage: {
          characterId: PRIMARY_CHARACTER_ID,
          bodyText: 'source-backed message',
        },
        relationship: {
          characterId: PRIMARY_CHARACTER_ID,
          closeness: 10,
          trust: 20,
          friction: 3,
        },
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
      expect.stringContaining('public.qry_chat_thread_runtime_binding_v1($1::uuid, $2::uuid)'),
      expect.stringContaining('public.qry_chat_thread_stream_v1($1::uuid, $2::uuid, $3::bigint)'),
      expect.stringContaining('public.qry_character_relationship_v1($1::uuid, $2::text)'),
      'COMMIT',
    ]);
    expect(f.connection.calls[4]?.values).toEqual([SUBJECT_ID, THREAD_ID]);
    expect(f.connection.calls[5]?.values).toEqual([SUBJECT_ID, THREAD_ID, 0]);
    expect(f.connection.calls[6]?.values).toEqual([SUBJECT_ID, PRIMARY_CHARACTER_ID]);
  });

  it('fails closed with 401/no-store before PostgreSQL when identity is absent', async () => {
    const f = fixture();
    f.verifier.result = null;

    const response = await handleChatReadRequestV1(f.input);

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(f.pool.connectCalls).toBe(0);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'AUTH_REQUIRED', retryable: false },
    });
  });

  it.each(['subjectId', 'characterId', 'presentationKey', 'unexpected']) (
    'rejects client authority/unknown query key %s before identity or DB work',
    async (key) => {
      const f = fixture(
        `https://myeongha.test/api/chat/${THREAD_ID}?afterSequenceNo=0&${key}=attacker-value`,
      );
      const response = await handleChatReadRequestV1(f.input);

      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(f.verifier.calls).toHaveLength(0);
      expect(f.pool.connectCalls).toBe(0);
    },
  );

  it('maps unavailable/cross-subject thread authority to NOT_FOUND and rolls back', async () => {
    const f = fixture();
    f.connection.bindingError = postgresError('qry_chat_thread_runtime_binding_thread_unavailable');

    const response = await handleChatReadRequestV1(f.input);

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', retryable: false },
    });
    expect(callTexts(f.connection).at(-1)).toBe('ROLLBACK');
  });

  it('rejects non-GET methods before identity or DB work', async () => {
    const f = fixture(`https://myeongha.test/api/chat/${THREAD_ID}`, 'POST');
    const response = await handleChatReadRequestV1(f.input);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(f.verifier.calls).toHaveLength(0);
    expect(f.pool.connectCalls).toBe(0);
  });
});
