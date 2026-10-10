import { describe, expect, it, vi } from 'vitest';
import {
  createPostgresOfficialReaderThreadLocatorAuthorityPortV1,
} from '../apps/api/src/postgres-official-reader-thread-locator-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';

function mockClient(rows: readonly unknown[]) {
  const query = vi.fn(async (_sql: string, _values?: readonly unknown[]) => ({
    rows,
  }));
  const client = { query } as unknown as PostgresTransactionQueryV1;
  return { client, query };
}

describe('D-05 PostgreSQL existing Member Reader thread locator adapter', () => {
  it('invokes only the bounded server-owned locator with two bound parameters', async () => {
    const f = mockClient([{ threadId: FIRST }, { threadId: SECOND }]);
    const port = createPostgresOfficialReaderThreadLocatorAuthorityPortV1(f.client);
    const rows = await port.readActiveMemberSingleCharacterThreads({
      subjectId: SUBJECT, readerCharacterId: 'seyeon',
    });
    expect(rows).toEqual([{ threadId: FIRST }, { threadId: SECOND }]);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0])).toBe(true);
    expect(f.query).toHaveBeenCalledTimes(1);
    const [sql, params] = f.query.mock.calls[0]!;
    expect(sql).toContain('qry_member_single_character_thread_locator_v1');
    expect(sql).not.toMatch(/\b(insert|update|delete|cmd_open)\b/i);
    expect(params).toEqual([SUBJECT, 'seyeon']);
  });

  it('keeps missing Thread as empty, never opens one', async () => {
    const f = mockClient([]);
    expect(await createPostgresOfficialReaderThreadLocatorAuthorityPortV1(f.client)
      .readActiveMemberSingleCharacterThreads({
        subjectId: SUBJECT, readerCharacterId: 'baekheon',
      })).toEqual([]);
    expect(f.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['null', [{ threadId: null }]],
    ['malformed', [{ threadId: 'not-a-uuid' }]],
    ['unbounded', [
      { threadId: FIRST }, { threadId: SECOND }, { threadId: FIRST },
    ]],
  ])('rejects %s database output', async (_name, rows) => {
    const f = mockClient(rows);
    await expect(createPostgresOfficialReaderThreadLocatorAuthorityPortV1(f.client)
      .readActiveMemberSingleCharacterThreads({
        subjectId: SUBJECT, readerCharacterId: 'seyeon',
      })).rejects.toThrow(/D-05 Member Reader thread locator/);
  });

  it('does not mask a PostgreSQL access error as successful discovery', async () => {
    const query = vi.fn(async () => { throw new Error('DB access denied'); });
    const port = createPostgresOfficialReaderThreadLocatorAuthorityPortV1({
      query,
    } as unknown as PostgresTransactionQueryV1);
    await expect(port.readActiveMemberSingleCharacterThreads({
      subjectId: SUBJECT, readerCharacterId: 'seyeon',
    })).rejects.toThrow('DB access denied');
  });
});
