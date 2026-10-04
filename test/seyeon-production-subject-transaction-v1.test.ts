import { describe, expect, it } from 'vitest';

import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  createSeyeonProductionSubjectTransactionRunnerV1,
} from '../apps/api/src/seyeon-production-subject-transaction-v1.js';

const AUTH_USER_ID = '91000000-0000-0000-0000-000000000001';
const SUBJECT_ID = '92000000-0000-0000-0000-000000000001';
const OTHER_SUBJECT_ID = '92000000-0000-0000-0000-000000000099';

class Connection implements PostgresSubjectConnectionV1 {
  readonly calls: string[] = [];

  constructor(private readonly subjectId: string) {}

  async query<Row = Record<string, unknown>>(
    text: string,
    _values: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push(text);
    if (text.includes('begin_member_subject_context_v1')) {
      return {
        rows: [
          {
            subjectId: this.subjectId,
            subjectKind: 'member',
          },
        ] as readonly Row[],
      };
    }
    return { rows: [] };
  }

  release(): void {}
}

class Pool implements PostgresSubjectPoolV1 {
  readonly connections: Connection[] = [];

  constructor(private readonly subjectIds: string[]) {}

  connect(): Connection {
    const subjectId =
      this.subjectIds[this.connections.length] ?? SUBJECT_ID;
    const connection = new Connection(subjectId);
    this.connections.push(connection);
    return connection;
  }
}

describe('Se-yeon Production short Subject transaction runner V1', () => {
  it('opens and closes one Subject transaction per authority operation', async () => {
    const pool = new Pool([SUBJECT_ID, SUBJECT_ID]);
    const runner = createSeyeonProductionSubjectTransactionRunnerV1({
      pool,
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: AUTH_USER_ID,
      },
    });

    const resolved = await runner.resolveSubject();
    expect(resolved.subjectId).toBe(SUBJECT_ID);

    await runner.run(SUBJECT_ID, async (client) => {
      await client.query('select runtime_authority_work()');
    });

    expect(pool.connections).toHaveLength(2);
    expect(pool.connections[0]?.calls.at(0)).toBe('BEGIN');
    expect(pool.connections[0]?.calls.at(-1)).toBe('COMMIT');
    expect(pool.connections[1]?.calls).toContain(
      'select runtime_authority_work()',
    );
    expect(pool.connections[1]?.calls.at(-1)).toBe('COMMIT');
  });

  it('fails closed if canonical Subject identity drifts across transactions', async () => {
    const pool = new Pool([SUBJECT_ID, OTHER_SUBJECT_ID]);
    const runner = createSeyeonProductionSubjectTransactionRunnerV1({
      pool,
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: AUTH_USER_ID,
      },
    });

    const resolved = await runner.resolveSubject();

    await expect(
      runner.run(resolved.subjectId, () => 'should-not-run'),
    ).rejects.toThrow(/canonical Subject changed/i);

    expect(pool.connections[1]?.calls.at(-1)).toBe('ROLLBACK');
  });
});
