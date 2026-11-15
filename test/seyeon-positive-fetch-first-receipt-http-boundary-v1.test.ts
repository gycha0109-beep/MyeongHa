// Watchtower-Track: character-memory
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ids = vi.hoisted(() => ({
  subject: 'a1000000-0000-4000-8000-000000000001',
  auth: 'a2000000-0000-4000-8000-000000000002',
  thread: 'a3000000-0000-4000-8000-000000000003',
  turn: 'a4000000-0000-4000-8000-000000000004',
  attempt: 'a5000000-0000-4000-8000-000000000005',
  assistant: 'a6000000-0000-4000-8000-000000000006',
  user: 'a7000000-0000-4000-8000-000000000007',
  outbox: 'a8000000-0000-4000-8000-000000000008',
  foreignOutbox: 'a8000000-0000-4000-8000-000000000009',
  threadCharacter: 'a9000000-0000-4000-8000-000000000009',
}));
const state = vi.hoisted(() => ({ issuerCalls: 0, readCalls: 0 }));
const canary = 'PRIVATE_ORIGINAL_MEMORY_REPLY';

vi.mock('../apps/api/src/chat-turn-send-http.js', () => ({
  preflightSeyeonChatTurnSendRequestV1: async () => ({
    kind: 'admitted',
    verifiedEvidence: { kind: 'member', verifiedAuthUserId: ids.auth },
    threadId: ids.thread, clientTurnId: ids.turn, text: 'current user turn',
  }),
}));
vi.mock('../apps/api/src/postgres-subject-execution.js', () => ({
  executePostgresSubjectTransactionV1: async (input: {
    execute: (ctx: {
      client: { query: (sql: string) => Promise<{ rows: readonly Record<string, unknown>[] }> };
      resolvedSubject: { subjectKind: 'member'; subjectId: string };
    }) => Promise<unknown>;
  }) => input.execute({
    resolvedSubject: { subjectKind: 'member', subjectId: ids.subject },
    client: {
      async query(sql: string) {
        state.readCalls += 1;
        if (sql.includes('from pg_catalog.pg_proc')) return { rows: [{ ready: true }] };
        if (sql.includes('from public.cmd_issue_seyeon_positive_first_reply_v1')) {
          state.issuerCalls += 1;
          return { rows: [{ assistantText: canary }] };
        }
        throw Error('unexpected SQL in offline HTTP boundary test');
      },
    },
  }),
}));

import { handleSeyeonFirstPositiveMemoryFetchV1 } from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';
import type { RunProductionSeyeonChatResultV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';

function result(outboxId: string, status: 'deferred' | 'processed'): RunProductionSeyeonChatResultV1 {
  return {
    subjectId: ids.subject,
    threadBinding: { threadId: ids.thread, participantCharacterIds: ['seyeon'] },
    execution: {
      disposition: 'executed',
      receivedTurn: {
        turnId: ids.turn, userMessageId: ids.user, userText: 'current user turn',
        threadCharacterId: ids.threadCharacter, turnState: 'received',
        replayed: false, committedTurn: null,
      },
      attempt: { attemptId: ids.attempt, replayed: false },
      committedTurn: {
        turnId: ids.turn, attemptId: ids.attempt, assistantMessageId: ids.assistant,
        postTurnOutboxEventId: ids.outbox, sequenceNo: 1, replayed: false,
      },
      postTurnAnalysis: status === 'deferred'
        ? { status: 'deferred', outboxEventId: outboxId }
        : { status: 'processed', result: { outboxEventId: outboxId } },
    },
  } as unknown as RunProductionSeyeonChatResultV1;
}
function request(): Request {
  return new Request('https://myeongha.invalid/api/chat/' + ids.thread + '/turns', {
    method: 'POST', headers: { 'x-myeongha-delivery-receipt': 'v1' },
    body: JSON.stringify({ text: 'current user turn' }),
  });
}
async function invoke(outboxId: string, status: 'deferred' | 'processed') {
  return handleSeyeonFirstPositiveMemoryFetchV1({
    request: request(), requestId: 'offline-source-boundary',
    serverTime: '2026-11-11T00:00:00.000Z',
    identityEvidenceVerifier: {} as never,
    pool: {} as never,
    runtime: { run: vi.fn(async () => result(outboxId, status)) },
  });
}

beforeEach(() => { state.issuerCalls = 0; state.readCalls = 0; });

describe('actual S0 positive Fetch first-reveal boundary (offline, no Provider)', () => {
  it.each(['deferred', 'processed'] as const)('holds mismatched %s outbox before DB receipt issuer', async status => {
    const response = await invoke(ids.foreignOutbox, status);
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.text())).not.toContain(canary);
    expect(state.issuerCalls).toBe(0);
    expect(state.readCalls).toBe(2);
  });

  it.each(['deferred', 'processed'] as const)('preserves the already-authorized %s outbox receipt path', async status => {
    const response = await invoke(ids.outbox, status);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.assistantText).toBe(canary);
    expect(body.data.deliveryReceipt.attemptId).toBe(ids.attempt);
    expect(state.issuerCalls).toBe(1);
  });
});
