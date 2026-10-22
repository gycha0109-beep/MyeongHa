// Watchtower-Track: security
// S5/G3 offline request-message lineage: no real DB, client delivery or Provider.
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1,
} from '../apps/api/src/seyeon-first-positive-memory-node-delivery-v1.js';
import type {
  RunProductionSeyeonChatResultV1,
} from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import type {
  PostgresSubjectPoolV1,
  PostgresSubjectConnectionV1,
  PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';

const AUTH = 'd0000000-0000-4000-8000-000000000001';
const SUBJECT = 'd1000000-0000-4000-8000-000000000001';
const THREAD = 'd2000000-0000-4000-8000-000000000003';
const TURN = 'd3000000-0000-4000-8000-000000000004';
const ATTEMPT = 'd4000000-0000-4000-8000-000000000005';
const ASSISTANT = 'd5000000-0000-4000-8000-000000000006';
const INPUT = '지금 이 대화에 답해주세요';
const CANARY = 'SYNTHETIC_DB_AUTHORIZED_G3_ANSWER';

function fakeRuntimeResult(userText: unknown): RunProductionSeyeonChatResultV1 {
  return {
    subjectId: SUBJECT,
    threadBinding: {threadId: THREAD},
    execution: {
      disposition: 'executed',
      receivedTurn: {turnId: TURN, userText, threadCharacterId: 'seyeon'},
      attempt: {attemptId: ATTEMPT, replayed: false},
      committedTurn: {
        turnId: TURN,
        attemptId: ATTEMPT,
        assistantMessageId: ASSISTANT,
        sequenceNo: 1,
        replayed: false,
      },
    },
  } as unknown as RunProductionSeyeonChatResultV1;
}

function syntheticDb(): {
  readonly pool: PostgresSubjectPoolV1;
  readonly statements: string[];
} {
  const statements: string[] = [];
  const client: PostgresSubjectConnectionV1 = {
    async query<Row = Record<string, unknown>>(
      text: string,
      _values: readonly unknown[] = [],
    ): Promise<PostgresQueryResultV1<Row>> {
      statements.push(text);
      if (text.includes('public.begin_member_subject_context_v1')) {
        return {rows: [{subjectId: SUBJECT, subjectKind: 'member'}] as unknown as readonly Row[]};
      }
      if (text.includes('to_regprocedure(')) {
        return {rows: [{ready: true}] as unknown as readonly Row[]};
      }
      if (text.includes('from public.qry_seyeon_positive_first_memory_locked_reveal_v1(')) {
        return {rows: [{assistantText: CANARY}] as unknown as readonly Row[]};
      }
      return {rows: []};
    },
    release() {},
  };
  return {pool: {connect: () => client}, statements};
}

function syntheticResponse() {
  const reply = new EventEmitter() as EventEmitter & {
    headersSent: boolean;
    writableEnded: boolean;
    destroyed: boolean;
    socket: object;
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(payload: Buffer): void;
    destroy(): void;
  };
  reply.headersSent = false;
  reply.writableEnded = false;
  reply.destroyed = false;
  reply.socket = {};
  reply.statusCode = 0;
  reply.setHeader = () => {};
  reply.end = (_payload: Buffer) => {
    reply.headersSent = true;
    reply.writableEnded = true;
    reply.emit('finish');
  };
  reply.destroy = () => {
    reply.destroyed = true;
    reply.emit('close');
  };
  return {
    response: reply as unknown as ServerResponse,
    get destroyed() { return reply.destroyed; },
    get statusCode() { return reply.statusCode; },
  };
}

describe('G3 exact current request ↔ executed DB user message binding', () => {
  it.each([
    ['other message', '이전에 저장한 다른 메시지'],
    ['empty message', ''],
    ['missing message', undefined],
    ['whitespace drift', INPUT + ' '],
  ])('holds %s before any protected G3 read, even with ready owner RPCs', async (_name, observed) => {
    const {pool, statements} = syntheticDb();
    const socket = syntheticResponse();
    let runtimeCalls = 0;
    await expect(executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1({
      response: socket.response,
      requestSignal: new AbortController().signal,
      pool,
      verifiedEvidence: {kind: 'member', verifiedAuthUserId: AUTH},
      threadId: THREAD,
      clientTurnId: TURN,
      text: ' ' + INPUT + ' ',
      requestId: 'g3-exact-user-text',
      serverTime: '2026-10-22T00:00:00.000Z',
      runtime: {
        async run() {
          runtimeCalls++;
          return fakeRuntimeResult(observed);
        },
      },
    })).rejects.toMatchObject({code: 'INVALID_COMMIT'});
    expect(socket.destroyed).toBe(true);
    expect(runtimeCalls).toBe(1);
    expect(statements.some(s => s.includes('to_regprocedure('))).toBe(true);
    expect(statements.some(s =>
      s.includes('from public.qry_seyeon_positive_first_memory_locked_reveal_v1('),
    )).toBe(false);
    expect(socket.statusCode).toBe(0);
  });

  it('preserves exact-message synthetic candidate, but still requires original DB Grant read', async () => {
    const {pool, statements} = syntheticDb();
    const socket = syntheticResponse();
    const outcome = await executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1({
      response: socket.response,
      requestSignal: new AbortController().signal,
      pool,
      verifiedEvidence: {kind: 'member', verifiedAuthUserId: AUTH},
      threadId: THREAD,
      clientTurnId: TURN,
      text: ' ' + INPUT + ' ',
      requestId: 'g3-exact-user-text',
      serverTime: '2026-10-22T00:00:00.000Z',
      runtime: {
        async run() { return fakeRuntimeResult(INPUT); },
      },
    });
    expect(outcome).toBe('assistant_sent');
    expect(socket.destroyed).toBe(false);
    expect(socket.statusCode).toBe(200);
    expect(statements.some(s =>
      s.includes('from public.qry_seyeon_positive_first_memory_locked_reveal_v1('),
    )).toBe(true);
  });
});
