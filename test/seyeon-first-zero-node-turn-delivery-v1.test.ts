// Watchtower-Track: security
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type {
  RunProductionSeyeonChatInputV1,
  RunProductionSeyeonChatResultV1,
} from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import {
  executeAndDeliverSeyeonFirstZeroNodeTurnV1,
  SeyeonFirstZeroNodeTurnDeliveryErrorV1,
} from '../apps/api/src/seyeon-first-zero-node-turn-delivery-v1.js';

const authId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
const threadId = '33333333-3333-4333-8333-333333333333';
const turnId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';
const messageId = '66666666-6666-4666-8666-666666666666';
const clientTurnId = '77777777-7777-4777-8777-777777777777';
const evidence = { kind: 'member' as const, verifiedAuthUserId: authId };

class ResponseDouble extends EventEmitter {
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  statusCode = 200;
  body = '';
  readonly headers = new Map<string, string>();
  setHeader(k: string, v: string) { this.headers.set(k.toLowerCase(), v); return this; }
  end(data: Buffer) {
    this.body = data.toString('utf8');
    this.headersSent = true;
    this.writableEnded = true;
    queueMicrotask(() => this.emit('finish'));
    return this;
  }
  destroy() {
    this.destroyed = true;
    this.emit('close');
    return this;
  }
}

function testDb(input: {
  ready?: boolean;
  rows?: readonly { assistantText: unknown }[];
  events?: string[];
  onReadiness?: () => void;
} = {}) {
  const events = input.events ?? [];
  let connects = 0;
  const pool = {
    async connect() {
      connects += 1;
      return {
        async query(sql: string, args?: readonly unknown[]) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            events.push(sql);
            return { rows: [] };
          }
          if (sql.includes('begin_member_subject_context_v1')) {
            expect(args).toEqual([authId]);
            return { rows: [{ subjectId, subjectKind: 'member' }] };
          }
          if (sql.includes('from pg_catalog.pg_proc p') && sql.includes('qry_seyeon_locked_first_zero_source_reveal_v1')) {
            events.push('readiness');
            input.onReadiness?.();
            expect(sql).toContain("pg_get_userbyid(p.proowner)='postgres'");
            expect(sql).toContain("'row_security=off'=any(p.proconfig)");
            expect(sql).toContain("not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')");
            expect(sql).toContain("not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')");
            expect(sql).toContain("not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')");
            return { rows: [{ ready: input.ready ?? true }] };
          }
          if (sql.includes('from public.qry_seyeon_locked_first_zero_source_reveal_v1')) {
            events.push('locked-original-read');
            expect(args).toEqual([subjectId, threadId, turnId, attemptId]);
            return { rows: input.rows ?? [{ assistantText: 'DB에서만 나온 세연 응답' }] };
          }
          return { rows: [] };
        },
        release() { events.push('release'); },
      };
    },
  } as unknown as PostgresSubjectPoolV1;
  return { pool, events, get connects() { return connects; } };
}

function committedResult(override: Partial<{
  sourceThread: string;
  commitAttemptId: string;
  receiptTurnId: string;
  disposition: 'executed' | 'committed_replay';
  replayed: boolean;
}> = {}): RunProductionSeyeonChatResultV1 {
  return {
    subjectId,
    threadBinding: { threadId: override.sourceThread ?? threadId },
    execution: {
      disposition: override.disposition ?? 'executed',
      receivedTurn: { turnId },
      committedTurn: {
        turnId: override.receiptTurnId ?? turnId,
        attemptId: override.commitAttemptId ?? attemptId,
        assistantMessageId: messageId,
        sequenceNo: 2,
        replayed: override.replayed ?? false,
      },
      // Never read the model output: only the locked original SQL can reveal.
      get runtimeResult() { throw new Error('UNTRUSTED_MODEL_RESPONSE_WAS_READ'); },
    },
  } as unknown as RunProductionSeyeonChatResultV1;
}

function request(input: {
  db: ReturnType<typeof testDb>;
  response: ResponseDouble;
  run: (args: RunProductionSeyeonChatInputV1) => Promise<RunProductionSeyeonChatResultV1>;
}) {
  return {
    pool: input.db.pool,
    response: input.response as unknown as ServerResponse,
    requestSignal: new AbortController().signal,
    verifiedEvidence: evidence,
    threadId,
    clientTurnId,
    text: '  안녕 세연  ',
    requestId: 'request-2312-synthetic',
    serverTime: '2026-10-18T13:00:00.000Z',
    runtime: { run: input.run },
  } as const;
}

describe('first zero-source Node turn execution-to-DB-to-socket bridge', () => {
  it('checks exact deployed RPC before paid runtime, then sends only freshly locked SQL text', async () => {
    const events: string[] = [];
    const db = testDb({ events });
    const response = new ResponseDouble();
    const outcome = await executeAndDeliverSeyeonFirstZeroNodeTurnV1(request({
      db, response,
      run: async (args) => {
        events.push('model');
        expect(args.text).toBe('안녕 세연');
        expect(events).toContain('readiness');
        expect(events).not.toContain('locked-original-read');
        return committedResult();
      },
    }));
    expect(outcome).toBe('assistant_sent');
    expect(db.connects).toBe(2);
    expect(events.indexOf('readiness')).toBeLessThan(events.indexOf('model'));
    expect(events.indexOf('model')).toBeLessThan(events.indexOf('locked-original-read'));
    expect(events[events.length - 2]).toBe('COMMIT');
    expect(events[events.length - 1]).toBe('release');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      data: {
        turnId,
        assistantMessageId: messageId,
        assistantText: 'DB에서만 나온 세연 응답',
        sequenceNo: 2,
        replayed: override.replayed ?? false,
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: 'request-2312-synthetic',
        serverTime: '2026-10-18T13:00:00.000Z',
      },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses absent Production RPC/EXECUTE before generating a turn or calling the model', async () => {
    const db = testDb({ ready: false });
    const response = new ResponseDouble();
    let calls = 0;
    await expect(executeAndDeliverSeyeonFirstZeroNodeTurnV1(request({
      db, response, run: async () => { calls++; return committedResult(); },
    }))).rejects.toMatchObject({ code: 'DB_NOT_READY' });
    expect(calls).toBe(0);
    expect(db.connects).toBe(1);
    expect(response.body).toBe('');
  });

  it('does not invoke a paid model when the Node socket closes during DB readiness', async () => {
    const response = new ResponseDouble();
    const db = testDb({ onReadiness: () => response.destroy() });
    let modelCalls = 0;
    await expect(executeAndDeliverSeyeonFirstZeroNodeTurnV1(request({
      db, response,
      run: async () => { modelCalls++; return committedResult(); },
    }))).rejects.toMatchObject({ code: 'INVALID_SCOPE' });
    expect(db.events).toContain('readiness');
    expect(db.connects).toBe(1);
    expect(modelCalls).toBe(0);
    expect(response.body).toBe('');
  });

  it('committed attempt without fresh eligible original returns static 503, never a cached model response', async () => {
    const db = testDb({ rows: [] });
    const response = new ResponseDouble();
    const outcome = await executeAndDeliverSeyeonFirstZeroNodeTurnV1(request({
      db, response, run: async () => committedResult(),
    }));
    expect(outcome).toBe('reveal_held');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('assistantText');
    expect(JSON.parse(response.body)).toMatchObject({
      ok: false,
      error: {
        code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
        messageKey: 'chat.secure_reveal_unavailable',
      },
      meta: {apiContractVersion: 'v0.9',requestId: 'request-2312-synthetic'},
    });
  });

  it.each([
    { name: 'replay disposition', override: { disposition: 'committed_replay' as const } },
    { name: 'replayed original receipt', override: { replayed: true } },
  ])('rejects $name before accessing the protected original body', async ({ override }) => {
    const db = testDb({ rows: [{ assistantText: 'PRIVATE_FROM_DB' }] });
    const response = new ResponseDouble();
    await expect(executeAndDeliverSeyeonFirstZeroNodeTurnV1(request({
      db, response, run: async () => committedResult(override),
    }))).rejects.toMatchObject({ code: 'REPLAY_HOLD' });
    expect(db.connects).toBe(1); // DB readiness only, never the original text query.
    expect(db.events).not.toContain('locked-original-read');
    expect(response.body).toBe('');
    expect(response.destroyed).toBe(true);
  });

  it('rejects inconsistent committed receipt without an original DB read', async () => {
    const db = testDb();
    const response = new ResponseDouble();
    await expect(executeAndDeliverSeyeonFirstZeroNodeTurnV1(request({
      db, response,
      run: async () => committedResult({ receiptTurnId: clientTurnId }),
    }))).rejects.toBeInstanceOf(SeyeonFirstZeroNodeTurnDeliveryErrorV1);
    expect(db.events).not.toContain('locked-original-read');
    expect(response.destroyed).toBe(true);
    expect(response.body).toBe('');
  });

  it('rejects malformed response metadata before model execution or database access', async () => {
    const db = testDb();
    const response = new ResponseDouble();
    let called = false;
    const req = request({
      db, response,
      run: async () => { called = true; return committedResult(); },
    });
    await expect(executeAndDeliverSeyeonFirstZeroNodeTurnV1({
      ...req, requestId: '<unsafe>',
    })).rejects.toThrow();
    expect(called).toBe(false);
    expect(db.connects).toBe(0);
    expect(response.destroyed).toBe(true);
  });

  it('rejects guest or aborted request before any DB connection or paid runtime', async () => {
    const db = testDb();
    const response = new ResponseDouble();
    let called = false;
    const req = request({db,response,run: async () => {called = true; return committedResult();}});
    await expect(executeAndDeliverSeyeonFirstZeroNodeTurnV1({
      ...req,verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'opaque'},
    })).rejects.toMatchObject({code:'INVALID_SCOPE'});
    expect(db.connects).toBe(0);
    expect(called).toBe(false);
    expect(response.destroyed).toBe(true);
  });
});
