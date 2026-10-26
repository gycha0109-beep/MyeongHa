import { describe, expect, it, vi } from 'vitest';
import {
  scopeSeyeonCloudflareOwnedChatRequestV1,
  SEYEON_CLOUDFLARE_OWNED_THREAD_SCOPE_V1,
} from '../apps/api/src/seyeon-cloudflare-owned-thread-scope-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const THREAD = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '223e4567-e89b-42d3-a456-426614174000';
const TURN = '323e4567-e89b-42d3-a456-426614174000';
const ID = '423e4567-e89b-42d3-a456-426614174000';
const SUBJECT = '523e4567-e89b-42d3-a456-426614174000';
const RELEASE = '623e4567-e89b-42d3-a456-426614174000';
const BUNDLE = '723e4567-e89b-42d3-a456-426614174000';
const PRIVATE = 'PRIVATE_SEYEON_HISTORY_MUST_NOT_LEAK';
const ROOT = 'https://worker-preview.example.test';

function request(path: string, method = 'GET', body?: unknown): Request {
  return new Request(ROOT + path, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
}

function fixture(participants: unknown = ['seyeon'], hasStoredMessages: unknown = true) {
  const queries: { sql: string; values?: readonly unknown[] }[] = [];
  const release = vi.fn();
  const auth = {
    verifyRequestIdentity: vi.fn(async () => ({
      kind: 'member' as const, verifiedAuthUserId: OTHER,
    })),
  };
  const pool: PostgresSubjectPoolV1 = {
    connect: vi.fn(async () => ({
      release,
      async query<Row>(sql: string, values?: readonly unknown[]) {
        queries.push({ sql, ...(values === undefined ? {} : { values }) });
        if (sql.includes('begin_member_subject_context_v1')) {
          return { rows: [{ subjectId: SUBJECT, subjectKind: 'member' }] as unknown as Row[] };
        }
        if (sql.includes('qry_chat_thread_runtime_binding_v1')) {
          return {
            rows: [{
              threadId: THREAD, status: 'active',
              activeContentReleaseId: RELEASE,
              activeContentBundleId: BUNDLE,
              contentRevision: 1, participantCharacterIds: participants,
            }] as unknown as Row[],
          };
        }
        if (sql.includes('select exists (') &&
            sql.includes('qry_chat_thread_stream_v2')) {
          return {rows:[{hasMessages:hasStoredMessages}] as unknown as Row[]};
        }
        return { rows: [] as Row[] };
      },
    })),
  };
  return { pool, auth, queries, release };
}

async function assertHeld(response: Response): Promise<void> {
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('location')).toBeNull();
  const text = await response.text();
  expect(text).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
  expect(text).not.toContain(PRIVATE);
}

describe('S-CF2 owned-thread scope — OFFLINE, no router mounted', () => {
  it('does not grant Worker mounting, positive SeYeon or unrelated-chat response permission', () => {
    expect(SEYEON_CLOUDFLARE_OWNED_THREAD_SCOPE_V1).toMatchObject({
      publicRouteMounted: false, positiveRevealEnabled: false,
      unrelatedChatReplyAuthorized: false, workerEdgeSendProven: false,
    });
  });

  it.each([{ participants: ['seyeon'] }, { participants: ['baekheon', 'seyeon'] }])(
    'keeps SeYeon messages sealed while permitting independently checked single-room metadata ($participants)',
    async ({ participants }) => {
      for (const [path, method, body] of [
        ['/api/chat/' + THREAD + '/turns', 'POST', { clientTurnId: TURN, text: PRIVATE }],
        ['/api/chat/' + THREAD + '?afterSequenceNo=0&pageSize=20', 'GET', undefined],
      ] as const) {
        const f = fixture(participants);
        const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
          request: request(path, method, body),
          requestId: ID, identityEvidenceVerifier: f.auth, pool: f.pool,
        });
        if(method === 'GET' && participants.length === 1) {
          expect(result).toEqual({
            kind:'seyeon_existing_thread_shell_requires_ops_reauthorization',
            threadId:THREAD,
          });
        } else {
          expect(result.kind).toBe('seyeon_protected_held');
          if (result.kind === 'seyeon_protected_held') await assertHeld(result.response);
        }
        expect(f.queries.some(x => x.sql.includes('qry_chat_thread_runtime_binding_v1'))).toBe(true);
        expect(f.queries.some(x => x.sql.includes('qry_chat_thread_stream_v2')))
          .toBe(method === 'GET' && participants.length === 1);
        expect(f.queries.some(x => x.sql.includes('SET LOCAL ROLE myeongha_api_executor'))).toBe(true);
        expect(f.queries.some(x =>
          x.sql.includes('qry_chat_thread_runtime_binding_v1') &&
          x.values?.[0] === SUBJECT && x.values?.[1] === THREAD,
        )).toBe(true);
        expect(f.queries.some(x => x.sql === 'COMMIT')).toBe(true);
        expect(f.release).toHaveBeenCalledTimes(1);
      }
    },
  );

  it('admits only a verified owner-scoped, first-page, single-Se-yeon empty shell for independent reauthorization', async () => {
    const f = fixture(['seyeon'], false);
    const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
      request: request('/api/chat/' + THREAD + '?afterSequenceNo=0&pageSize=50'),
      requestId: ID, identityEvidenceVerifier: f.auth, pool: f.pool,
    });
    expect(result).toEqual({
      kind: 'seyeon_empty_thread_requires_ops_reauthorization', threadId: THREAD,
    });
    expect('response' in result).toBe(false);
    const query = f.queries.find(x => x.sql.includes('qry_chat_thread_stream_v2'));
    expect(query?.sql).toContain('select exists (');
    expect(query?.values).toEqual([SUBJECT, THREAD]);
    expect(f.queries.some(x => x.sql === 'COMMIT')).toBe(true);
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    {participants:['seyeon'],empty:false,cursor:'?afterSequenceNo=1'},
    {participants:['baekheon','seyeon'],empty:false,cursor:'?afterSequenceNo=0'},
    {participants:['seyeon'],empty:true,cursor:'?afterSequenceNo=0'},
    {participants:['seyeon'],empty:'unknown',cursor:'?afterSequenceNo=0'},
  ])('holds a non-first page, mixed thread, stored history or invalid existence proof', async ({participants,empty,cursor}) => {
    const f = fixture(participants,empty);
    const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
      request: request('/api/chat/' + THREAD + cursor),
      requestId: ID, identityEvidenceVerifier: f.auth, pool: f.pool,
    });
    if (typeof empty !== 'boolean' && participants.length === 1) {
      expect(result.kind).toBe('denied');
    } else if (empty === true && participants.length === 1) {
      expect(result).toEqual({
        kind:'seyeon_existing_thread_shell_requires_ops_reauthorization',threadId:THREAD,
      });
    } else {
      expect(result.kind).toBe('seyeon_protected_held');
    }
    if (result.kind === 'denied' || result.kind === 'seyeon_protected_held') {
      await assertHeld(result.response);
    }
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('never admits a paid message from an owned and empty room', async () => {
    const f = fixture(['seyeon'],false);
    const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
      request: request('/api/chat/'+THREAD+'/turns','POST',{clientTurnId:TURN,text:'test'}),
      requestId: ID,identityEvidenceVerifier:f.auth,pool:f.pool,
    });
    expect(result.kind).toBe('seyeon_protected_held');
    expect(f.queries.some(x=>x.sql.includes('qry_chat_thread_stream_v2'))).toBe(false);
  });

  it('classifies a DB-confirmed other Character without a response or bypass authorization', async () => {
    const f = fixture(['baekheon']);
    const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
      request: request('/api/chat/' + THREAD + '?pageSize=50'),
      requestId: ID, identityEvidenceVerifier: f.auth, pool: f.pool,
    });
    expect(result).toEqual({
      kind: 'unrelated_thread_requires_ops_reauthorization', threadId: THREAD,
    });
    expect('response' in result).toBe(false);
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('does not consult DB or infer SeYeon for a Chat-open request', async () => {
    const f = fixture();
    expect(await scopeSeyeonCloudflareOwnedChatRequestV1({
      request: request('/api/chat', 'POST', { characterId: 'seyeon' }),
      requestId: ID, identityEvidenceVerifier: f.auth, pool: f.pool,
    })).toEqual({ kind: 'chat_open_requires_ops_authority' });
    expect(f.auth.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(f.queries).toHaveLength(0);
  });

  it('keeps unrelated API paths outside this boundary', async () => {
    const f = fixture();
    for (const path of ['/api/me', '/api/health', '/index.html', '/api/chatother']) {
      expect(await scopeSeyeonCloudflareOwnedChatRequestV1({
        request: request(path), requestId: ID, identityEvidenceVerifier: f.auth, pool: f.pool,
      })).toEqual({ kind: 'not_chat' });
    }
    expect(f.queries).toHaveLength(0);
  });

  it.each([
    '/api/chat/' + THREAD + '/replay',
    '/api/chat/' + THREAD + '/turns?x=1',
    '/api/chat/' + THREAD + '?afterSequenceNo=0&afterSequenceNo=1',
    '/api/chat/' + THREAD + '?pageSize=51',
    '/api/chat/' + THREAD + '?pageSize=0',
    '/api/chat/' + THREAD + '?afterSequenceNo=-1',
    '/api/chat/' + THREAD + '?__myeongha_chat_thread_id=' + THREAD,
    '/api/chat/' + THREAD + '%2Fturns',
    '/api/chat/%34' + THREAD.slice(1),
    '/api/chat/',
    '/api/chat?x=1',
    '/api/chat/' + THREAD + '?x=' + PRIVATE,
  ])('denies malformed/replay/query/encoded URLs before auth or DB: %s', async path => {
    const f = fixture(['baekheon']);
    const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
      request: request(path), requestId: ID, identityEvidenceVerifier: f.auth, pool: f.pool,
    });
    expect(result.kind).toBe('denied');
    if (result.kind === 'denied') await assertHeld(result.response);
    expect(f.queries).toHaveLength(0);
    expect(f.auth.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it('does not reveal ownership of a thread for missing Member evidence', async () => {
    const f = fixture(['baekheon']);
    f.auth.verifyRequestIdentity.mockResolvedValueOnce(null as never);
    const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
      request: request('/api/chat/' + THREAD),
      requestId: ID, identityEvidenceVerifier: f.auth, pool: f.pool,
    });
    expect(result.kind).toBe('denied');
    if (result.kind === 'denied') await assertHeld(result.response);
    expect(f.queries).toHaveLength(0);
  });

  it.each([{ participants: [] }, { participants: ['seyeon', 'seyeon'] }, { participants: ['baekheon', 7] }, { participants: null }])(
    'fails closed for missing/duplicated/invalid DB participants: $participants',
    async ({ participants }) => {
      const f = fixture(participants);
      const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
        request: request('/api/chat/' + THREAD), requestId: ID,
        identityEvidenceVerifier: f.auth, pool: f.pool,
      });
      expect(result.kind).toBe('denied');
      if (result.kind === 'denied') await assertHeld(result.response);
      expect(f.release).toHaveBeenCalledTimes(1);
    },
  );

  it('fails closed for DB read errors and does not return a generic-handler pass-through', async () => {
    const f = fixture(['baekheon']);
    const failingPool: PostgresSubjectPoolV1 = {
      connect: vi.fn(async () => { throw new Error(PRIVATE); }),
    };
    const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
      request: request('/api/chat/' + THREAD), requestId: ID,
      identityEvidenceVerifier: f.auth, pool: failingPool,
    });
    expect(result.kind).toBe('denied');
    if (result.kind === 'denied') await assertHeld(result.response);
  });
  it.each([
    { method: 'GET', path: '/api/chat' },
    { method: 'HEAD', path: '/api/chat' },
    { method: 'OPTIONS', path: '/api/chat' },
    { method: 'POST', path: '/api/chat/' + THREAD },
    { method: 'HEAD', path: '/api/chat/' + THREAD },
    { method: 'POST', path: '/api/chat/' + THREAD + '?pageSize=20' },
    { method: 'OPTIONS', path: '/api/chat/' + THREAD + '/turns' },
    { method: 'GET', path: '/api/chat/' + THREAD + '/turns' },
    { method: 'PUT', path: '/api/chat/' + THREAD + '/turns' },
  ])('denies method/route mismatch before unrelated-thread DB scope: $method $path', async ({ method, path }) => {
    const f = fixture(['baekheon']);
    const result = await scopeSeyeonCloudflareOwnedChatRequestV1({
      request: request(path, method),
      requestId: ID,
      identityEvidenceVerifier: f.auth,
      pool: f.pool,
    });
    expect(result.kind).toBe('denied');
    if (result.kind === 'denied') await assertHeld(result.response);
    expect(f.auth.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(f.queries).toHaveLength(0);
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
});
