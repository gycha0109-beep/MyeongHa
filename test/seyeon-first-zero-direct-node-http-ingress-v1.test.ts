// Watchtower-Track: security
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { ProductionSeyeonChatRuntimeV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import {
  handleSeyeonFirstZeroDirectNodeHttpV1,
  SEYEON_FIRST_ZERO_DIRECT_NODE_HTTP_INGRESS_V1,
  type SeyeonFirstZeroNodeHttpOutcomeV1,
} from '../apps/api/src/seyeon-first-zero-node-http-ingress-v1.js';

const authId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
const threadId = '33333333-3333-4333-8333-333333333333';
const turnId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';
const messageId = '66666666-6666-4666-8666-666666666666';
const clientTurnId = '77777777-7777-4777-8777-777777777777';
const secureDbAnswer = 'DB 원본에서 잠금 상태로 읽은 첫 답장';
const untrustedModelAnswer = 'NEVER_SERIALIZE_MODEL_RESPONSE_CANARY';

function database(input: { ready?: boolean; assistant?: string | null } = {}) {
  const events: string[] = [];
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
          if (sql.includes('from pg_catalog.pg_proc p') &&
              sql.includes('qry_seyeon_locked_first_zero_source_reveal_v1')) {
            events.push('readiness');
            return { rows: [{ ready: input.ready ?? true }] };
          }
          if (sql.includes('from public.qry_seyeon_locked_first_zero_source_reveal_v1')) {
            events.push('fresh-original-read');
            expect(args).toEqual([subjectId, threadId, turnId, attemptId]);
            return { rows: input.assistant === null
              ? [] : [{ assistantText: input.assistant ?? secureDbAnswer }] };
          }
          return { rows: [] };
        },
        release() { events.push('release'); },
      };
    },
  } as unknown as PostgresSubjectPoolV1;
  return { pool, events, get connects() { return connects; } };
}

function committedResult() {
  return {
    subjectId,
    threadBinding: { threadId },
    execution: {
      disposition: 'executed',
      receivedTurn: { turnId },
      committedTurn: {
        turnId, attemptId, assistantMessageId: messageId,
        sequenceNo: 2, replayed: false,
      },
      get runtimeResult() {
        throw new Error('MODEL_RESULT_ACCESS_IS_UNAUTHORIZED');
      },
      get assistantText() { return untrustedModelAnswer; },
    },
  } as never;
}

async function exercise(input: {
  verify?: IdentityEvidenceVerificationPortV1['verifyRequestIdentity'];
  pool?: ReturnType<typeof database>;
  runtime?: Pick<ProductionSeyeonChatRuntimeV1, 'run'>;
  method?: string;
  body?: unknown;
  path?: string;
  requestId?: string;
}) {
  const db = input.pool ?? database();
  const outcomes: SeyeonFirstZeroNodeHttpOutcomeV1[] = [];
  let handlerFailure: unknown;
  let resolveHandled!: () => void;
  const handled = new Promise<void>((resolve) => { resolveHandled = resolve; });
  const server = createServer((incoming, response) => {
    void handleSeyeonFirstZeroDirectNodeHttpV1({
      incoming,
      response,
      identityEvidenceVerifier: {
        verifyRequestIdentity: input.verify ?? (async () => ({
          kind: 'member' as const,
          verifiedAuthUserId: authId,
        })),
      },
      pool: db.pool,
      runtime: input.runtime ?? { run: async () => committedResult() },
      requestId: input.requestId ?? 'node-first-zero-test',
      serverTime: '2026-10-19T00:00:00.000Z',
    }).then(outcome => {
      outcomes.push(outcome);
    }).catch(error => {
      handlerFailure = error;
      response.destroy();
    }).finally(resolveHandled);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    const method = input.method ?? 'POST';
    const response = await fetch(
      `http://127.0.0.1:${address.port}${input.path ?? `/api/chat/${threadId}/turns`}`,
      {
        method,
        headers: { Authorization: 'Bearer synthetic-member', 'Content-Type': 'application/json' },
        ...(method === 'GET' || method === 'HEAD' ? {} : {
          body: JSON.stringify(input.body ?? { clientTurnId, text: '  안녕 세연  ' }),
        }),
      },
    );
    const status = response.status;
    const text = await response.text();
    await handled;
    if (handlerFailure !== undefined) throw handlerFailure;
    return { status, text, json: text ? JSON.parse(text) as any : null, outcomes, db };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('unmounted Seyeon direct Node HTTP first-zero ingress', () => {
  it('remains outside the deployed Vercel Fetch transport', () => {
    expect(SEYEON_FIRST_ZERO_DIRECT_NODE_HTTP_INGRESS_V1).toMatchObject({
      productionRouteMounted: false,
      vercelFetchSupported: false,
      proxyHandoffProven: false,
      positiveOrHistoricalSourceReveal: false,
    });
  });

  it('authenticates Member, validates the exact payload, checks DB before runtime, and sends ONLY the freshly locked DB original', async () => {
    const db = database();
    const response = await exercise({
      pool: db,
      runtime: { run: async args => {
        db.events.push('model');
        expect(args).toMatchObject({
          threadId, clientTurnId, text: '안녕 세연',
          verifiedEvidence: { kind: 'member', verifiedAuthUserId: authId },
        });
        return committedResult();
      }},
    });
    expect(response.status).toBe(200);
    expect(response.outcomes).toEqual(['assistant_sent']);
    expect(db.events.indexOf('readiness')).toBeLessThan(db.events.indexOf('model'));
    expect(db.events.indexOf('model')).toBeLessThan(db.events.indexOf('fresh-original-read'));
    expect(db.events.slice(-2)).toEqual(['COMMIT','release']);
    expect(db.connects).toBe(2);
    expect(response.json).toMatchObject({
      ok: true,
      data: {
        turnId,
        assistantMessageId: messageId,
        assistantText: secureDbAnswer,
        sequenceNo: 2,
        replayed: false,
      },
      meta: { apiContractVersion: 'v0.9', requestId: 'node-first-zero-test' },
    });
    expect(response.text).not.toContain(untrustedModelAnswer);
    expect(response.text).not.toContain('MODEL_RESULT_ACCESS_IS_UNAUTHORIZED');
  });

  it.each([
    ['anonymous', async () => null, 401],
    ['guest', async () => ({ kind: 'guest' as const, verifiedGuestTokenHash: 'synthetic' }), 403],
  ])('%s cannot reach the Postgres or Provider boundary', async (_name, verify, status) => {
    let calls = 0;
    const db = database();
    const r = await exercise({ pool: db, verify, runtime: {
      run: async () => { calls++; return committedResult(); },
    }});
    expect(r.status).toBe(status);
    expect(r.outcomes).toEqual(['preflight_denied']);
    expect(r.json.ok).toBe(false);
    expect(db.connects).toBe(0);
    expect(calls).toBe(0);
    expect(r.text).not.toContain(secureDbAnswer);
  });

  it('rejects client authority injection and malformed turn keys before DB/model', async () => {
    const db = database();
    let calls = 0;
    const result = await exercise({ pool: db, body: {
      clientTurnId, text: '안녕', subjectId: 'client-trust-injection',
    }, runtime: { run: async () => { calls++; return committedResult(); } } });
    expect(result.status).toBe(400);
    expect(result.outcomes).toEqual(['preflight_denied']);
    expect(db.connects).toBe(0);
    expect(calls).toBe(0);
  });

  it('rejects an unauthorized HTTP method without authenticating or accessing DB', async () => {
    const db = database();
    let identityCalls = 0;
    const result = await exercise({ method: 'GET', pool: db,
      verify: async () => { identityCalls++; return null; } });
    expect(result.status).toBe(405);
    expect(result.outcomes).toEqual(['preflight_denied']);
    expect(identityCalls).toBe(0);
    expect(db.connects).toBe(0);
  });

  it('fails closed before paid runtime when installed SQL/ACL readiness is unavailable', async () => {
    const db = database({ ready: false });
    let calls = 0;
    const result = await exercise({ pool: db, runtime: {
      run: async () => { calls++; return committedResult(); },
    } });
    expect(result.status).toBe(503);
    expect(result.outcomes).toEqual(['reveal_held']);
    expect(result.json.error.code).toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
    expect(result.text).not.toContain(secureDbAnswer);
    expect(db.connects).toBe(1);
    expect(calls).toBe(0);
  });

  it('rejects a stale/no-source committed attempt with static 503, not model output', async () => {
    const result = await exercise({ pool: database({ assistant: null }) });
    expect(result.status).toBe(503);
    expect(result.outcomes).toEqual(['reveal_held']);
    expect(result.text).not.toContain(secureDbAnswer);
    expect(result.text).not.toContain('assistantText');
  });

  it('rejects malformed server-owned request metadata before DB/provider', async () => {
    const db = database();
    let calls = 0;
    const result = await exercise({ pool: db, requestId: '<attacker>', runtime: {
      run: async () => { calls++; return committedResult(); },
    } });
    expect(result.status).toBe(503);
    expect(result.outcomes).toEqual(['reveal_held']);
    expect(result.text).not.toContain('<attacker>');
    expect(db.connects).toBe(0);
    expect(calls).toBe(0);
  });
});
