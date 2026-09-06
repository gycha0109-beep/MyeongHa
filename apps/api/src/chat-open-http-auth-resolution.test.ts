import { describe, expect, it, vi } from 'vitest';
import { handleChatOpenRequestV1 } from './chat-open-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const CANDIDATE_THREAD_ID = '77777777-7777-4777-8777-777777777777';
const CANDIDATE_THREAD_CHARACTER_ID = '88888888-8888-4888-8888-888888888888';

describe('Member thread open canonical subject resolution', () => {
  it('normalizes verified-but-unresolved Member identity to AUTH_REQUIRED', async () => {
    let commandCalled = false;
    const pool: PostgresSubjectPoolV1 = {
      async connect() {
        return {
          async query<Row = Record<string, unknown>>(text: string): Promise<{ rows: readonly Row[] }> {
            if (text === 'BEGIN' || text.startsWith('SET LOCAL ROLE') || text === 'ROLLBACK') {
              return { rows: [] };
            }
            if (text.includes('begin_member_subject_context_v1')) {
              throw Object.assign(new Error('private subject resolution detail'), {
                constraint: 'member_subject_context_unresolved',
              });
            }
            if (text.includes('cmd_open_member_single_character_thread_v1')) {
              commandCalled = true;
            }
            throw new Error(`Unexpected SQL: ${text}`);
          },
          release: vi.fn(),
        };
      },
    };
    const uuids = [CANDIDATE_THREAD_ID, CANDIDATE_THREAD_CHARACTER_ID];

    const response = await handleChatOpenRequestV1({
      request: new Request('https://myeongha.internal/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer member-token' },
        body: JSON.stringify({ characterId: 'seyeon' }),
      }),
      requestId: 'req-unresolved-member',
      serverTime: '2026-09-06T15:15:00.000Z',
      identityEvidenceVerifier: {
        verifyRequestIdentity: vi.fn(async () => ({
          kind: 'member' as const,
          verifiedAuthUserId: '11111111-1111-4111-8111-111111111111',
        })),
      },
      pool,
      createUuid: () => {
        const value = uuids.shift();
        if (value === undefined) throw new Error('UUID test fixture exhausted.');
        return value;
      },
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error.code).toBe('AUTH_REQUIRED');
    expect(JSON.stringify(payload)).not.toContain('private subject resolution detail');
    expect(commandCalled).toBe(false);
  });
});
