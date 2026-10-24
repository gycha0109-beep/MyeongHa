import { describe, expect, it, vi } from 'vitest';
import { handleChatReadRequestV1 } from './chat-read-http.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const RELEASE_ID = '55555555-5555-4555-8555-555555555555';
const BUNDLE_ID = '66666666-6666-4666-8666-666666666666';
const MESSAGE_ID = '77777777-7777-4777-8777-777777777777';
const AUTH_ID = '11111111-1111-4111-8111-111111111111';

function fakePool(options: { denied?: boolean; observed?: (sql: string, values: readonly unknown[]) => void } = {}): PostgresSubjectPoolV1 {
  return {
    async connect() {
      return {
        async query<Row = Record<string, unknown>>(sql: string, values: readonly unknown[] = []): Promise<{ rows: readonly Row[] }> {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.startsWith('SET LOCAL ROLE')) {
            return { rows: [] };
          }
          if (sql.includes('begin_member_subject_context_v1')) {
            return { rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' } as Row] };
          }
          if (sql.includes('assert_myeongha_subject_context_v1')) return { rows: [] };
          if (sql.includes('qry_chat_thread_runtime_binding_v1')) {
            options.observed?.(sql, values);
            if (options.denied) throw Object.assign(new Error('hidden database detail'), { constraint: 'thread_unavailable' });
            return {
              rows: [{
                threadId: THREAD_ID,
                status: 'active',
                activeContentReleaseId: RELEASE_ID,
                activeContentBundleId: BUNDLE_ID,
                contentRevision: 1,
                participantCharacterIds: ['seyeon'],
              } as Row],
            };
          }
          if (sql.includes('qry_chat_thread_stream_v2')) {
            options.observed?.(sql, values);
            return {
              rows: [{
                messageId: MESSAGE_ID,
                sequenceNo: 1,
                senderType: 'character',
                characterId: 'seyeon',
                bodyText: '안녕하세요.',
                messagePayloadJsonb: null,
                messageSchemaVersion: null,
                createdAt: '2026-10-24T00:00:00.000Z',
                redacted: false,
                redactedAt: null,
              } as Row],
            };
          }
          if (sql.includes('qry_character_relationship_v1')) return { rows: [] };
          throw new Error('Unexpected query in owner-only chat read test');
        },
        release: vi.fn(),
      };
    },
  };
}

function invoke(options: {
  authenticated?: boolean;
  pool?: PostgresSubjectPoolV1;
} = {}) {
  const verifier: IdentityEvidenceVerificationPortV1 = {
    verifyRequestIdentity: vi.fn(async () => options.authenticated === false
      ? null
      : { kind: 'member' as const, verifiedAuthUserId: AUTH_ID }),
  };
  return handleChatReadRequestV1({
    request: new Request(`https://myeongha.internal/api/chat/${THREAD_ID}?afterSequenceNo=0`),
    requestId: 'req-owner-chat-read',
    serverTime: '2026-10-24T00:00:00.000Z',
    identityEvidenceVerifier: verifier,
    pool: options.pool ?? fakePool(),
  });
}

describe('Seyeon owner-scoped transcript read', () => {
  it('reads the authenticated owner transcript without a character-wide 503', async () => {
    const reads: { sql: string; values: readonly unknown[] }[] = [];
    const response = await invoke({ pool: fakePool({ observed: (sql, values) => reads.push({ sql, values }) }) });
    const data = await response.json() as any;
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(data.data.characterId).toBe('seyeon');
    expect(data.data.messages).toHaveLength(1);
    expect(data.data.messages[0].bodyText).toBe('안녕하세요.');
    expect(reads).toHaveLength(2);
    expect(reads[0].values).toEqual([SUBJECT_ID, THREAD_ID]);
    expect(reads[1].values[0]).toBe(SUBJECT_ID);
    expect(reads[1].values[1]).toBe(THREAD_ID);
  });

  it('rejects missing authentication before opening the database', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const response = await invoke({ authenticated: false, pool: { connect } });
    expect(response.status).toBe(401);
    expect((await response.json() as any).error.code).toBe('AUTH_REQUIRED');
    expect(connect).not.toHaveBeenCalled();
  });

  it('does not reveal another owner’s transcript when the database denies the binding', async () => {
    const response = await invoke({ pool: fakePool({ denied: true }) });
    const payload = await response.json() as any;
    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(payload)).not.toContain('hidden database detail');
  });
});
