import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createPostgresSajuReadingAttemptVerifierV1,
  READING_AI_BINDING_READER_PRINCIPAL_V1,
} from './reading-ai-saju-attempt-db-verifier-v1.js';

const request = {
  externalRequestRef: 'private-transport-ref-1',
  executionAttemptId: '123e4567-e89b-42d3-a456-426614174002',
};
const row = {
  ...request,
  readingId: '123e4567-e89b-42d3-a456-426614174001',
  subjectId: '123e4567-e89b-42d3-a456-426614174000',
};

function fixture(options: Readonly<{
  principal?: string;
  rows?: readonly unknown[];
  queryError?: boolean;
}> = {}) {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const released: unknown[] = [];
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      return {
        async query<T>(sql: string, values?: readonly unknown[]) {
          queries.push(values === undefined ? { sql } : { sql, values });
          if (sql.includes('current_user')) {
            return { rows: [{ currentUser: options.principal ??
              READING_AI_BINDING_READER_PRINCIPAL_V1 }] as T[] };
          }
          if (sql.includes('FROM public.reading_execution_attempts a')) {
            if (options.queryError) throw Error('db read denied');
            return { rows: (options.rows ?? [row]) as T[] };
          }
          return { rows: [] as T[] };
        },
        release(error?: unknown) { released.push(error); },
      };
    },
  };
  return { verifier: createPostgresSajuReadingAttemptVerifierV1({ pool }),
    queries, released };
}

describe('A4 offline authoritative DB attempt verifier', () => {
  it('reads one terminal attempt, requires unique ref, and uses a read-only transaction', async () => {
    const x = fixture();
    await expect(x.verifier.verifyDbAttempt(request)).resolves.toEqual(row);
    expect(x.queries.map(q => q.sql)).toEqual([
      'BEGIN READ ONLY', 'SELECT current_user::text AS "currentUser"',
      expect.stringContaining('FROM public.reading_execution_attempts a'), 'COMMIT',
    ]);
    expect(x.queries[2]?.values).toEqual([request.executionAttemptId,request.externalRequestRef]);
    const sql = x.queries[2]?.sql ?? '';
    expect(sql).toContain('a.id = $1::uuid');
    expect(sql).toContain('a.external_request_ref = $2::text');
    expect(sql).toContain("a.state IN ('succeeded', 'failed_retryable', 'failed_final')");
    expect(sql).toContain('count(*) FROM public.reading_execution_attempts d');
    expect(sql).toContain('d.external_request_ref = $2::text) = 1');
    expect(x.released).toHaveLength(1);
  });
  it('does not turn absent, duplicated or mismatched database evidence into a match', async () => {
    for (const rows of [
      [], [row, row], [{ ...row, externalRequestRef: 'different-ref' }],
      [{ ...row, executionAttemptId: '123e4567-e89b-42d3-a456-426614174099' }],
      [{ ...row, readingId: 'not-a-uuid' }],
    ]) {
      const x = fixture({ rows });
      await expect(x.verifier.verifyDbAttempt(request)).resolves.toBeNull();
      expect(x.queries.at(-1)?.sql).toBe('COMMIT');
    }
  });
  it('rejects incorrect DB principals before reading any customer attempt data', async () => {
    for (const principal of ['postgres', 'myeongha_reading_ai_cost_writer_v1',
      'myeongha_admin_reader','service_role']) {
      const x = fixture({ principal });
      await expect(x.verifier.verifyDbAttempt(request))
        .rejects.toThrow('Dedicated read-only Reading binding authority required');
      expect(x.queries.map(q => q.sql)).toEqual([
        'BEGIN READ ONLY', 'SELECT current_user::text AS "currentUser"', 'ROLLBACK',
      ]);
    }
  });
  it('fails invalid refs before any connection and rolls back database errors', async () => {
    const x = fixture();
    for (const ref of ['', 'bad\nref', ' an-external-ref', 'x'.repeat(257)]) {
      await expect(x.verifier.verifyDbAttempt({ ...request, externalRequestRef: ref }))
        .resolves.toBeNull();
    }
    await expect(x.verifier.verifyDbAttempt({ ...request, executionAttemptId: 'not-a-uuid' }))
      .resolves.toBeNull();
    expect(x.queries).toHaveLength(0);
    const failed = fixture({ queryError: true });
    await expect(failed.verifier.verifyDbAttempt(request)).rejects.toThrow('db read denied');
    expect(failed.queries.at(-1)?.sql).toBe('ROLLBACK');
  });
});
