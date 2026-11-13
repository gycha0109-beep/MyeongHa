import { describe, expect, it } from 'vitest';
import {
  handleCharacterSharedMemoryRequestV1,
  validateSharedMemoryTextV1,
} from '../apps/api/src/character-shared-memory-http-v1.js';
import {
  createCharacterSharedMemoryVercelHandlerV1,
} from '../api/me/shared-memory.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const MEMBER = '92000000-0000-4000-8000-000000000001';
const GUEST = '93000000-0000-4000-8000-000000000001';
const MEMBER_AUTH = '91000000-0000-4000-8000-000000000001';
const DATE = '2026-11-09T06:00:00.000Z';
const URI = 'https://myeongha.test/api/me/shared-memory';
type Item = { id: string; text: string; createdAt: string; updatedAt: string };

class FakeConnection implements PostgresSubjectConnectionV1 {
  calls: { sql: string; args: readonly unknown[] }[] = [];
  items: Item[] = [];
  status: 'active' | 'deletion_pending' = 'active';
  released = false;

  async query<Row = Record<string, unknown>>(sql: string, args: readonly unknown[] = []): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({ sql, args });
    const rows = (data: readonly unknown[]): PostgresQueryResultV1<Row> => ({ rows: data as readonly Row[] });
    if (sql.includes('begin_member_subject_context_v1')) return rows([{ subjectId: MEMBER, subjectKind: 'member' }]);
    if (sql.includes('begin_guest_subject_context_v1')) return rows([{ subjectId: GUEST, subjectKind: 'guest' }]);
    if (sql.includes('select status from public.subjects')) return rows([{ status: this.status }]);
    if (sql.startsWith('select count(*)::text')) return rows([{ count: String(this.items.length) }]);
    if (sql.startsWith('insert into public.subject_shared_memory_items_v1')) {
      const item = { id: String(args[0]), text: String(args[2]), createdAt: DATE, updatedAt: DATE };
      this.items.unshift(item);
      return rows([item]);
    }
    if (sql.startsWith('update public.subject_shared_memory_items_v1')) {
      const item = this.items.find(x => x.id === String(args[1]).toLowerCase() && x.updatedAt === args[3]);
      if (!item) return rows([]);
      const result = { ...item, text: String(args[2]), updatedAt: '2026-11-09T06:00:01.000Z' };
      this.items = this.items.map(x => x.id === item.id ? result : x);
      return rows([result]);
    }
    if (sql.startsWith('delete from public.subject_shared_memory_items_v1')) {
      // PostgreSQL uuid casts ignore input letter case and return canonical lowercase text.
      const canonicalId = String(args[1]).toLowerCase();
      const item = this.items.find(x => x.id === canonicalId);
      this.items = this.items.filter(x => x.id !== canonicalId);
      return rows(item ? [{ id: item.id }] : []);
    }
    if (sql.includes('from public.subject_shared_memory_items_v1 where subject_id')) return rows(this.items);
    return rows([]);
  }
  release() { this.released = true; }
}
class FakePool implements PostgresSubjectPoolV1 {
  opens = 0;
  constructor(readonly connection: FakeConnection) {}
  connect() { this.opens += 1; return this.connection; }
}
class FakeIdentity implements IdentityEvidenceVerificationPortV1 {
  identity: VerifiedSubjectIdentityEvidenceV1 | null = {
    kind: 'member', verifiedAuthUserId: MEMBER_AUTH,
  };
  verifyRequestIdentity() { return this.identity; }
}
function fixture() {
  const connection = new FakeConnection();
  const pool = new FakePool(connection);
  const identityEvidenceVerifier = new FakeIdentity();
  return {
    connection, pool, identityEvidenceVerifier,
    send(method: string, body?: unknown) {
      return handleCharacterSharedMemoryRequestV1({
        request: new Request(URI, {
          method,
          ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        }),
        requestId: 'test-request', serverTime: DATE, identityEvidenceVerifier, pool,
      });
    },
  };
}

describe('member-owned manual shared-memory boundary', () => {
  it('rejects missing authentication before opening a database transaction', async () => {
    const f = fixture();
    f.identityEvidenceVerifier.identity = null;
    const response = await f.send('GET');
    expect(response.status).toBe(401);
    expect(f.pool.opens).toBe(0);
  });

  it('rejects Guests and deletion-pending Subjects without any memory read/write', async () => {
    const guest = fixture();
    guest.identityEvidenceVerifier.identity = { kind: 'guest', verifiedGuestTokenHash: 'verified-hash' };
    expect((await guest.send('GET')).status).toBe(403);
    expect(guest.connection.calls.some(x => x.sql.includes('subject_shared_memory_items_v1'))).toBe(false);

    const member = fixture();
    member.connection.status = 'deletion_pending';
    expect((await member.send('POST', { text: 'do not persist' })).status).toBe(403);
    expect(member.connection.items).toEqual([]);
  });

  it('adds, reads, edits with a verified version, and physically deletes owner text', async () => {
    const f = fixture();
    const created = await f.send('POST', { text: '  나는 고양이 두 마리를 키워요.  ' });
    expect(created.status).toBe(201);
    const added = (await created.json()).data.item as Item;
    expect(added.text).toBe('나는 고양이 두 마리를 키워요.');
    const list = await f.send('GET');
    expect((await list.json()).data.items).toEqual([added]);
    const updated = await f.send('PATCH', { id: added.id, text: '  나는 매운 음식을 좋아해요. ', updatedAt: added.updatedAt });
    expect(updated.status).toBe(200);
    const replacement = (await updated.json()).data.item as Item;
    expect(replacement.text).toBe('나는 매운 음식을 좋아해요.');
    expect(replacement.updatedAt).not.toBe(added.updatedAt);
    expect((await f.send('PATCH', { id: added.id, text: 'stale', updatedAt: added.updatedAt })).status).toBe(409);
    const deleted = await f.send('DELETE', { id: added.id });
    expect(deleted.status).toBe(200);
    expect(f.connection.items).toEqual([]);
    expect((await (await f.send('GET')).json()).data.items).toEqual([]);
    expect(f.connection.calls.some(x => x.sql.includes('delete from public.subject_shared_memory_items_v1'))).toBe(true);
    expect(f.connection.calls.every(x => x.sql !== 'SET ROLE myeongha_api_executor')).toBe(true);
  });

  it('treats mixed-case UUIDs as the same owner memo for edit and physical deletion', async () => {
    const f = fixture();
    const canonicalId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    f.connection.items = [{
      id: canonicalId, text: 'owner-saved note',
      createdAt: DATE, updatedAt: DATE,
    }];
    const mixedCaseId = 'AaAaAaAa-AaAa-4AaA-8AaA-AaAaAaAaAaAa';
    const updated = await f.send('PATCH', {
      id: mixedCaseId, text: 'revised owner note', updatedAt: DATE,
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.item.id).toBe(canonicalId);
    const deleted = await f.send('DELETE', { id: mixedCaseId });
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).data).toEqual({ deleted: true, id: canonicalId });
    expect(f.connection.items).toEqual([]);
    expect(f.connection.calls.filter(x =>
      x.sql.startsWith('delete from public.subject_shared_memory_items_v1')
    ).map(x => x.args[1])).toEqual([canonicalId]);
  });

  it('rejects invalid or oversized payloads before any personal-memory SQL', async () => {
    const f = fixture();
    expect(validateSharedMemoryTextV1(' \n ')).toBe(null);
    expect(validateSharedMemoryTextV1('a'.repeat(501))).toBe(null);
    expect((await f.send('POST', { text: '  ' })).status).toBe(400);
    expect((await f.send('PATCH', { id: 'not-a-uuid', text: 'hello', updatedAt: DATE })).status).toBe(400);
    expect((await f.send('POST', { text: 'hello', fabricatedScope: 'another-subject' })).status).toBe(400);
    expect((await f.send('POST', { text: 'a'.repeat(501) })).status).toBe(400);
    expect(f.pool.opens).toBe(0);
  });

  it('prevents a 51st manually authored entry', async () => {
    const f = fixture();
    f.connection.items = Array.from({ length: 50 }, (_, i) => ({
      id: '92000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
      text: 'test', createdAt: DATE, updatedAt: DATE,
    }));
    expect((await f.send('POST', { text: 'overflow' })).status).toBe(409);
    expect(f.connection.items).toHaveLength(50);
  });

  it('keeps its Production Vercel endpoint disabled by default', async () => {
    let calls = 0;
    const handler = createCharacterSharedMemoryVercelHandlerV1({
      enabled: false,
      getRuntime: () => ({ handleRequest: async () => {
        calls += 1;
        return Response.json({ ok: true });
      } }),
    });
    const response = await handler.fetch(new Request(URI));
    expect(response.status).toBe(503);
    expect(calls).toBe(0);
  });
});
