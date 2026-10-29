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
  streamRows: readonly Record<string, unknown>[] | undefined;
  participantCharacterIds: readonly string[] = [PRIMARY_CHARACTER_ID, OTHER_CHARACTER_ID];
  historicalSeyeon = false;
  historyGuardInstalled = false;
  historyGuardMalformed = false;

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
          participantCharacterIds: this.participantCharacterIds,
        }] as unknown as readonly Row[],
      };
    }
    if (text.includes('select exists (') &&
        text.includes('qry_chat_thread_stream_v2')) {
      return {rows:[{hasMessages:this.streamRows === undefined ||
        this.streamRows.length > 0}] as unknown as readonly Row[]};
    }
    if (text.includes('to_regprocedure') &&
        text.includes('qry_seyeon_thread_ever_involved_v1')) {
      return { rows: [{ installed: this.historyGuardInstalled }] as unknown as readonly Row[] };
    }
    if (text.includes('from public.qry_seyeon_thread_ever_involved_v1')) {
      return { rows: [{ everInvolved: this.historyGuardMalformed
        ? 'invalid' : this.historicalSeyeon }] as unknown as readonly Row[] };
    }
    if (text.includes('qry_chat_thread_stream_v2')) {
      return {
        rows: (this.streamRows ?? [{
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
        }]) as unknown as readonly Row[],
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
      streamAuthority: 'public.qry_chat_thread_stream_v2',
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
        pagination: {
          pageSize: 50,
          hasMore: false,
          nextAfterSequenceNo: null,
        },
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
      expect.stringContaining('to_regprocedure'),
      expect.stringContaining('public.qry_chat_thread_stream_v2($1::uuid, $2::uuid, $3::bigint, $4::integer)'),
      expect.stringContaining('public.qry_character_relationship_v1($1::uuid, $2::text)'),
      'COMMIT',
    ]);
    expect(f.connection.calls[4]?.values).toEqual([SUBJECT_ID, THREAD_ID]);
    expect(f.connection.calls[5]?.values).toEqual([]);
    expect(f.connection.calls[6]?.values).toEqual([SUBJECT_ID, THREAD_ID, 0, 50]);
    expect(f.connection.calls[7]?.values).toEqual([SUBJECT_ID, PRIMARY_CHARACTER_ID]);
  });

  it.each([
    ['primary', ['seyeon', OTHER_CHARACTER_ID]],
    ['secondary', [PRIMARY_CHARACTER_ID, 'seyeon']],
  ] as const)('holds nonempty Se-yeon %s Chat GET before relationship read', async (_position, participants) => {
    const f = fixture();
    f.connection.participantCharacterIds = participants;
    f.connection.streamRows = [{
      messageId: '96000000-0000-4000-8000-000000000001',
      sequenceNo: 4,
      senderType: 'character',
      characterId: 'seyeon',
      bodyText: 'PRIVATE_HISTORY_CANARY_NEVER_REVEAL',
      messagePayloadJsonb: { canary: 'PRIVATE_PAYLOAD_CANARY' },
      messageSchemaVersion: 'v1',
      createdAt: new Date('2026-09-05T15:00:00.000Z'),
      redacted: false,
      redactedAt: null,
    }];

    const response = await handleChatReadRequestV1(f.input);
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(body)).toMatchObject({
      ok: false,
      error: { code: 'SEYEON_HISTORY_REVEAL_HOLD', retryable: false },
    });
    expect(body).not.toContain('PRIVATE_HISTORY_CANARY_NEVER_REVEAL');
    expect(body).not.toContain('PRIVATE_PAYLOAD_CANARY');
    // Mixed Se-yeon remains held without reading any message body.
    expect(callTexts(f.connection).some(x => x.includes('qry_chat_thread_stream_v2'))).toBe(false);
    expect(callTexts(f.connection).some(x => x.includes('qry_character_relationship_v1'))).toBe(false);
    expect(callTexts(f.connection).at(-1)).toBe('ROLLBACK');
  });

  it.each([true,false])('returns only a redacted owner metadata shell for single Se-yeon, hasHistory=%s',async(hasHistory)=>{
    const f=fixture();
    f.connection.participantCharacterIds=['seyeon'];
    f.connection.streamRows=hasHistory ? [{
      messageId:'96000000-0000-4000-8000-000000000001',
      sequenceNo:4,senderType:'character',characterId:'seyeon',
      bodyText:'PRIVATE_HISTORY_MUST_NEVER_LEAK',
      messagePayloadJsonb:{private:'CANARY'},
      messageSchemaVersion:'v1',
      createdAt:new Date('2026-09-05T15:00:00.000Z'),
      redacted:false,redactedAt:null,
    }]:[];
    const response=await handleChatReadRequestV1(f.input);
    const body=await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const payload=JSON.parse(body);
    expect(payload).toMatchObject({
      ok:true,
      data:{
        threadId:THREAD_ID,characterId:'seyeon',
        afterSequenceNo:0,lastSequenceNo:0,
        historyWithheld:hasHistory,messages:[],
        pagination:{pageSize:50,hasMore:false,nextAfterSequenceNo:null},
      },
    });
    expect(body).not.toContain('PRIVATE_HISTORY_MUST_NEVER_LEAK');
    expect(body).not.toContain('CANARY');
    expect(body).not.toContain('messageId');
    expect(f.connection.calls.some(q=>q.text.includes('select exists (')&&
      q.text.includes('qry_chat_thread_stream_v2'))).toBe(true);
    expect(f.connection.calls.some(q=>q.text.includes('qry_character_relationship_v1'))).toBe(false);
    expect(callTexts(f.connection).at(-1)).toBe('COMMIT');
  });

  it('holds all paginated Se-yeon history even when an owned thread is active',async()=>{
    const f=fixture(`https://myeongha.test/api/chat/${THREAD_ID}?afterSequenceNo=1`);
    f.connection.participantCharacterIds=['seyeon'];
    const response=await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('SEYEON_HISTORY_REVEAL_HOLD');
    expect(f.connection.calls.some(q=>q.text.includes('qry_chat_thread_stream_v2'))).toBe(false);
  });

  it('holds an old Se-yeon speaker even when current DB participants exclude Se-yeon', async () => {
    const f = fixture(`https://myeongha.test/api/chat/${THREAD_ID}?afterSequenceNo=0&pageSize=1`);
    f.connection.participantCharacterIds = [PRIMARY_CHARACTER_ID, OTHER_CHARACTER_ID];
    f.connection.streamRows = [
      {
        messageId: '96000000-0000-4000-8000-000000000001',
        sequenceNo: 4,
        senderType: 'character',
        characterId: PRIMARY_CHARACTER_ID,
        bodyText: 'current-character-text',
        messagePayloadJsonb: {},
        messageSchemaVersion: 'v1',
        createdAt: new Date('2026-09-05T15:00:00.000Z'),
        redacted: false,
        redactedAt: null,
      },
      {
        messageId: '96000000-0000-4000-8000-000000000002',
        sequenceNo: 5,
        senderType: 'character',
        characterId: 'seyeon',
        bodyText: 'HISTORICAL_SEYEON_PRIVATE_CANARY',
        messagePayloadJsonb: { secret: 'HISTORICAL_SEYEON_PAYLOAD' },
        messageSchemaVersion: 'v1',
        createdAt: new Date('2026-09-05T15:01:00.000Z'),
        redacted: false,
        redactedAt: null,
      },
    ];

    const response = await handleChatReadRequestV1(f.input);
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toContain('SEYEON_HISTORY_REVEAL_HOLD');
    expect(body).not.toContain('HISTORICAL_SEYEON_PRIVATE_CANARY');
    expect(body).not.toContain('HISTORICAL_SEYEON_PAYLOAD');
    expect(callTexts(f.connection).some(q => q.includes('qry_chat_thread_stream_v2'))).toBe(true);
    expect(callTexts(f.connection).some(q => q.includes('qry_character_relationship_v1'))).toBe(false);
    expect(callTexts(f.connection).at(-1)).toBe('ROLLBACK');
  });

  it('holds a formerly participating Se-yeon even when the requested page has no Se-yeon row', async () => {
    const f = fixture(`https://myeongha.test/api/chat/${THREAD_ID}?afterSequenceNo=400&pageSize=1`);
    f.connection.historyGuardInstalled = true;
    f.connection.historicalSeyeon = true;
    // The old per-page test would pass this primary-only page and leak
    // derivations of a protected historic Se-yeon conversation.
    f.connection.streamRows = [{
      messageId: '96000000-0000-4000-8000-000000000001',
      sequenceNo: 401, senderType: 'character', characterId: PRIMARY_CHARACTER_ID,
      bodyText: 'HISTORICAL_PRIVATE_CANARY', messagePayloadJsonb: { secret: 'HISTORY' },
      messageSchemaVersion: 'v1', createdAt: new Date('2026-09-05T15:00:00Z'),
      redacted: false, redactedAt: null,
    }];
    const response = await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.text();
    expect(body).toContain('SEYEON_HISTORY_REVEAL_HOLD');
    expect(body).not.toContain('HISTORICAL_PRIVATE_CANARY');
    expect(f.connection.calls.some(q => q.text.includes('qry_chat_thread_stream_v2'))).toBe(false);
    expect(f.connection.calls.some(q => q.text.includes('qry_character_relationship_v1'))).toBe(false);
    const presence = f.connection.calls.find(q => q.text.includes('from public.qry_seyeon_thread_ever_involved_v1'));
    expect(presence?.values).toEqual([SUBJECT_ID, THREAD_ID]);
    expect(callTexts(f.connection).at(-1)).toBe('ROLLBACK');
  });

  it('keeps current other-Character transcripts readable after a verified negative thread-wide guard', async () => {
    const f = fixture();
    f.connection.historyGuardInstalled = true;
    f.connection.historicalSeyeon = false;
    const response = await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(200);
    expect((await response.json()).data.messages).toHaveLength(1);
    const historyCall = f.connection.calls.findIndex(q => q.text.includes('from public.qry_seyeon_thread_ever_involved_v1'));
    const streamCall = f.connection.calls.findIndex(q => q.text.includes('qry_chat_thread_stream_v2'));
    expect(historyCall).toBeGreaterThan(0);
    expect(streamCall).toBeGreaterThan(historyCall);
  });

  it('denies malformed history evidence without reading even one message body', async () => {
    const f = fixture();
    f.connection.historyGuardInstalled = true;
    f.connection.historyGuardMalformed = true;
    const response = await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('SEYEON_HISTORY_REVEAL_HOLD');
    expect(f.connection.calls.some(q => q.text.includes('qry_chat_thread_stream_v2'))).toBe(false);
  });

  it('keeps the existing page-level Se-yeon HOLD when the new SQL has not been installed', async () => {
    const f = fixture();
    f.connection.historyGuardInstalled = false;
    f.connection.streamRows = [{
      messageId: '96000000-0000-4000-8000-000000000007',
      sequenceNo: 90, senderType: 'character', characterId: 'seyeon',
      bodyText: 'PROTECTED_HISTORY_CANARY', messagePayloadJsonb: {private: true},
      messageSchemaVersion: 'v1', createdAt: new Date('2026-09-05T15:00:00Z'),
      redacted: false, redactedAt: null,
    }];
    const response = await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(503);
    expect((await response.text())).not.toContain('PROTECTED_HISTORY_CANARY');
  });

  it('does not block other Characters just because a client asks to impersonate Se-yeon', async () => {
    const f = fixture();
    const result = await handleChatReadRequestV1(f.input);
    expect(result.status).toBe(200);
    expect(callTexts(f.connection).some(x => x.includes('qry_chat_thread_stream_v2'))).toBe(true);
  });

  it('uses pageSize + 1 rows to derive a bounded next sequence cursor', async () => {
    const f = fixture(`https://myeongha.test/api/chat/${THREAD_ID}?afterSequenceNo=0&pageSize=1`);
    f.connection.streamRows = [
      {
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
      },
      {
        messageId: '96000000-0000-4000-8000-000000000002',
        sequenceNo: 5,
        senderType: 'character',
        characterId: PRIMARY_CHARACTER_ID,
        bodyText: 'next page message',
        messagePayloadJsonb: {},
        messageSchemaVersion: 'v1',
        createdAt: new Date('2026-09-05T15:01:00.000Z'),
        redacted: false,
        redactedAt: null,
      },
    ];

    const response = await handleChatReadRequestV1(f.input);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.pagination).toEqual({
      pageSize: 1,
      hasMore: true,
      nextAfterSequenceNo: 4,
    });
    expect(f.connection.calls[6]?.values).toEqual([SUBJECT_ID, THREAD_ID, 0, 1]);
  });

  it.each([
    'pageSize=0',
    'pageSize=51',
    'pageSize=1.5',
    'pageSize=1&pageSize=2',
  ])('rejects invalid page-size query %s before identity or DB work', async (query) => {
    const f = fixture(`https://myeongha.test/api/chat/${THREAD_ID}?afterSequenceNo=0&${query}`);
    const response = await handleChatReadRequestV1(f.input);

    expect(response.status).toBe(400);
    expect(f.verifier.calls).toHaveLength(0);
    expect(f.pool.connectCalls).toBe(0);
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

  it('fails closed when PostgreSQL stream sender shape contradicts the stored message authority', async () => {
    const invalidRows = [
      {
        senderType: 'assistant',
        characterId: PRIMARY_CHARACTER_ID,
        expected: 'sender type is unsupported',
      },
      {
        senderType: 'character',
        characterId: null,
        expected: 'missing character identity',
      },
      {
        senderType: 'user',
        characterId: PRIMARY_CHARACTER_ID,
        expected: 'non-Character message exposed character identity',
      },
      {
        senderType: 'system',
        characterId: PRIMARY_CHARACTER_ID,
        expected: 'non-Character message exposed character identity',
      },
    ] as const;

    for (const invalid of invalidRows) {
      const f = fixture();
      f.connection.streamRows = [{
        messageId: '96000000-0000-4000-8000-000000000001',
        sequenceNo: 4,
        senderType: invalid.senderType,
        characterId: invalid.characterId,
        bodyText: 'source-backed message',
        messagePayloadJsonb: {},
        messageSchemaVersion: 'v1',
        createdAt: new Date('2026-09-05T15:00:00.000Z'),
        redacted: false,
        redactedAt: null,
      }];

      await expect(handleChatReadRequestV1(f.input)).rejects.toThrow(invalid.expected);
      expect(callTexts(f.connection).at(-1)).toBe('ROLLBACK');
    }
  });

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
