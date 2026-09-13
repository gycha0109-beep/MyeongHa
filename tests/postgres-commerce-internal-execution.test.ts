import { describe, expect, it, vi } from 'vitest';
import { executePostgresCommerceInternalTransactionV1 } from '../apps/api/src/postgres-commerce-internal-execution.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

function makePool() {
  const query = vi.fn(async () => ({ rows: [] }));
  const release = vi.fn();
  const connection = { query, release };
  const connect = vi.fn(async () => connection);
  const pool = { connect } as unknown as PostgresSubjectPoolV1;
  return { pool, query, release };
}

describe('postgres internal Commerce execution', () => {
  it('enters only the dedicated internal Commerce role and carries no subject context', async () => {
    const { pool, query, release } = makePool();

    const result = await executePostgresCommerceInternalTransactionV1({
      pool,
      execute: async (scope) => {
        expect(scope).toEqual({ client: expect.any(Object) });
        expect(scope).not.toHaveProperty('resolvedSubject');
        await scope.client.query('select 1');
        return 'ok';
      },
    });

    expect(result).toBe('ok');
    expect(query.mock.calls.map((call) => call[0])).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_commerce_internal_executor',
      'select 1',
      'COMMIT',
    ]);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it('rolls back provider-originated work when the slice fails', async () => {
    const { pool, query, release } = makePool();
    const failure = new Error('verification failed');

    await expect(
      executePostgresCommerceInternalTransactionV1({
        pool,
        execute: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);

    expect(query.mock.calls.map((call) => call[0])).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_commerce_internal_executor',
      'ROLLBACK',
    ]);
    expect(release).toHaveBeenCalledWith(undefined);
  });
});
