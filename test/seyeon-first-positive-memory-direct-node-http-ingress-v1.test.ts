// Watchtower-Track: security
// Real loopback HTTP, synthetic DB/runtime only. No paid model or DB writes.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { RunProductionSeyeonChatResultV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import {
  handleSeyeonFirstPositiveMemoryDirectNodeHttpV1,
} from '../apps/api/src/seyeon-first-positive-memory-node-http-ingress-v1.js';

const authId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
const threadId = '33333333-3333-4333-8333-333333333333';
const turnId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';
const userId = '66666666-6666-4666-8666-666666666666';
const assistantId = '77777777-7777-4777-8777-777777777777';
const outboxId = '88888888-8888-4888-8888-888888888888';
const clientTurnId = '99999999-9999-4999-8999-999999999999';
const original = '잠금 상태에서 다시 읽은 합성 원본 응답';
const privateError = 'PRIVATE_EXCEPTION_MUST_NEVER_LEAVE_SERVER';

function result(): RunProductionSeyeonChatResultV1 {
  return {
    subjectId,
    threadBinding: { threadId, participantCharacterIds: ['seyeon'] },
    execution: {
      disposition: 'executed',
      receivedTurn: {
        turnId, userMessageId: userId, threadCharacterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        turnState: 'received', replayed: false, committedTurn: null,
        userText: '안녕 세연',
      },
      attempt: { attemptId, replayed: false },
      committedTurn: {
        turnId, attemptId, assistantMessageId: assistantId,
        postTurnOutboxEventId: outboxId, sequenceNo: 1, replayed: false,
      },
      postTurnAnalysis: { status: 'deferred', outboxEventId: outboxId },
      get runtimeResult() { throw Error(privateError); },
      get assistantText() { throw Error(privateError); },
    },
  } as unknown as RunProductionSeyeonChatResultV1;
}

async function exercise(options: {
  ready?: boolean;
  authorized?: boolean;
  anonymous?: boolean;
  malformed?: boolean;
  runtimeFails?: boolean;
} = {}) {
  const events: string[] = [];
  const pool = {
    async connect() {
      events.push('connect');
      return {
        async query(sql: string, args?: readonly unknown[]) {
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) events.push(sql);
          if (sql.includes('begin_member_subject_context_v1')) {
            expect(args).toEqual([authId]);
            return { rows: [{ subjectId, subjectKind: 'member' }] };
          }
          if (sql.includes('to_regprocedure(')) {
            events.push('readiness');
            return { rows: [{ ready: options.ready ?? true }] };
          }
          if (sql.includes('from public.qry_seyeon_positive_first_memory_locked_reveal_v3(')) {
            events.push('original-read');
            expect(args).toEqual([
              subjectId, threadId, turnId, attemptId,
              userId, assistantId, outboxId, clientTurnId,
            ]);
            return { rows: options.authorized === false ? [] : [{ assistantText: original }] };
          }
          return { rows: [] };
        },
        release() { events.push('release'); },
      };
    },
  } as unknown as PostgresSubjectPoolV1;
  let complete!: () => void;
  const handled = new Promise<void>(resolve => { complete = resolve; });
  const server = createServer((incoming, response) => {
    response.once('finish', () => events.push('socket-finish'));
    void handleSeyeonFirstPositiveMemoryDirectNodeHttpV1({
      incoming, response, pool,
      identityEvidenceVerifier: {
        verifyRequestIdentity: async () => options.anonymous ? null : ({
          kind: 'member', verifiedAuthUserId: authId,
        }),
      },
      runtime: { run: async input => {
        events.push('runtime');
        expect(input).toEqual({
          verifiedEvidence: { kind: 'member', verifiedAuthUserId: authId },
          threadId, clientTurnId, text: '안녕 세연',
        });
        if (options.runtimeFails) throw Error(privateError);
        return result();
      } },
      requestId: 'positive-node-ingress',
      serverTime: '2026-10-24T00:00:00.000Z',
    }).finally(complete);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    let status: number | null = null;
    let body = '';
    let cache: string | null = null;
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/${threadId}/turns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientTurnId, text: '  안녕 세연  ',
          ...(options.malformed ? { grantId: 'client-authority' } : {}),
        }),
      });
      status = response.status;
      cache = response.headers.get('cache-control');
      body = await response.text();
    } catch (error) {
      // The existing sender destroys the socket on readiness/runtime errors.
      if (!options.runtimeFails && options.ready !== false) throw error;
    }
    await handled;
    return { status, body, cache, events };
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe('first original Memory direct Node HTTP composition', () => {
  it('runs canonical Member preflight → readiness → runtime → fresh DB read → socket finish → COMMIT', async () => {
    const response = await exercise();
    expect(response.status).toBe(200);
    expect(response.cache).toBe('no-store');
    expect(JSON.parse(response.body).data).toMatchObject({
      assistantText: original, turnId, assistantMessageId: assistantId, replayed: false,
    });
    const at = (event: string) => response.events.indexOf(event);
    expect(at('readiness')).toBeLessThan(at('runtime'));
    expect(at('runtime')).toBeLessThan(at('original-read'));
    expect(at('original-read')).toBeLessThan(at('socket-finish'));
    expect(at('socket-finish')).toBeLessThan(response.events.lastIndexOf('COMMIT'));
    expect(response.body).not.toContain(privateError);
  });

  it('rechecks current authorization after generation and emits zero protected bytes if it was revoked', async () => {
    const response = await exercise({ authorized: false });
    expect(response.status).toBe(503);
    expect(response.cache).toBe('no-store');
    expect(response.events).toContain('runtime');
    expect(response.events).toContain('original-read');
    expect(response.body).not.toContain(original);
  });

  it.each([
    [{ anonymous: true }, 401],
    [{ malformed: true }, 400],
  ])('rejects untrusted identity/body before DB and model: %j', async (options, status) => {
    const response = await exercise(options);
    expect(response.status).toBe(status);
    expect(response.events).not.toContain('connect');
    expect(response.events).not.toContain('runtime');
  });

  it('keeps missing DB authority before all runtime calls', async () => {
    const response = await exercise({ ready: false });
    expect(response.status).not.toBe(200);
    expect(response.events).not.toContain('runtime');
    expect(response.events).not.toContain('original-read');
    expect(response.body).not.toContain(original);
  });

  it('destroys a failed runtime socket without a private error or cached reply fallback', async () => {
    const response = await exercise({ runtimeFails: true });
    expect(response.status).not.toBe(200);
    expect(response.events).not.toContain('original-read');
    expect(response.body).not.toContain(original);
    expect(response.body).not.toContain(privateError);
  });
});
