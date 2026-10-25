import { describe, expect, it, vi } from 'vitest';
import {
  createPostgresExistingMemberSocialStateAuthorityV1,
} from '../apps/api/src/portone-v2-existing-social-state-authority-v1.js';
import type { PostgresSubjectPoolV1, PostgresSubjectConnectionV1 } from '../apps/api/src/postgres-subject-execution.js';

const DIGEST = 'f'.repeat(64);

function pool(result: unknown = true, fail?: Error) {
  const statements: Array<{ sql: string; args?: readonly unknown[] }> = [];
  const release = vi.fn();
  const client: PostgresSubjectConnectionV1 = {
    async query<Row = Record<string, unknown>>(sql: string, args?: readonly unknown[]) {
      statements.push({ sql, ...(args ? { args } : {}) });
      if (fail && sql.includes('cmd_')) throw fail;
      if (sql.includes('cmd_')) return { rows: [{ accepted: result } as Row] };
      return { rows: [] as readonly Row[] };
    },
    release,
  };
  const db: PostgresSubjectPoolV1 = { connect: async () => client };
  return { db, statements, release };
}

describe('existing Member OAuth durable state proposal-only adapter', () => {
  it('issues and consumes a one-use HMAC digest as the server executor', async () => {
    const x = pool();
    const adapter = createPostgresExistingMemberSocialStateAuthorityV1(x.db);
    await expect(adapter.issue(DIGEST)).resolves.toBe(true);
    await expect(adapter.consume(DIGEST)).resolves.toBe(true);
    expect(x.statements.map(s => s.sql)).toEqual([
      'BEGIN', 'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('cmd_issue_existing_member_social_state_v1'),
      'COMMIT',
      'BEGIN', 'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('cmd_consume_existing_member_social_state_v1'),
      'COMMIT',
    ]);
    expect(x.statements[2]?.args).toEqual([DIGEST]);
    expect(x.statements[6]?.args).toEqual([DIGEST]);
    expect(x.release).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid state digests without opening a database connection', async () => {
    const connect = vi.fn();
    const x = createPostgresExistingMemberSocialStateAuthorityV1({ connect });
    expect(await x.issue('browser-state')).toBe(false);
    expect(await x.consume('0'.repeat(63))).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('preserves a false response from a consumed/expired state without claiming success', async () => {
    const x = pool(false);
    expect(await createPostgresExistingMemberSocialStateAuthorityV1(x.db).consume(DIGEST))
      .toBe(false);
  });

  it('rolls back on DB infrastructure failure and does not release a successful claim', async () => {
    const error = new Error('opaque DB error');
    const x = pool(true, error);
    await expect(createPostgresExistingMemberSocialStateAuthorityV1(x.db).issue(DIGEST))
      .rejects.toBe(error);
    expect(x.statements.map(s => s.sql).at(-1)).toBe('ROLLBACK');
    expect(x.statements.map(s => s.sql)).not.toContain('COMMIT');
  });

  it('rejects malformed DB return rows before claim acceptance', async () => {
    const x = pool('true');
    await expect(createPostgresExistingMemberSocialStateAuthorityV1(x.db).consume(DIGEST))
      .rejects.toThrow('malformed evidence');
    expect(x.statements.map(s => s.sql).at(-1)).toBe('ROLLBACK');
  });
});
