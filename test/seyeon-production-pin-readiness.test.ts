import { describe, expect, it, vi } from 'vitest';
import {
  SeyeonProductionPinMigrationRequiredV1,
  assertSeyeonProductionPinReadinessV1,
} from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import type { SeyeonProductionSubjectTransactionRunnerV1 } from '../apps/api/src/seyeon-production-subject-transaction-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';

function runnerFor(rows: unknown[], onQuery?: (sql: string) => void) {
  return {
    run: vi.fn(async (subject: string, execute: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
      expect(subject).toBe(subjectId);
      return execute({ query: async (sql) => {
        onQuery?.(sql);
        return { rows };
      } });
    }),
    resolveSubject: vi.fn(),
  };
}

describe('production Se-yeon pinned Chat DB readiness', () => {
  it('allows only an installed owner RPC with executor EXECUTE; query is read-only', async () => {
    const sql: string[] = [];
    const runner = runnerFor([{ ready: true }], s => sql.push(s));
    await expect(assertSeyeonProductionPinReadinessV1(runner as unknown as SeyeonProductionSubjectTransactionRunnerV1, subjectId)).resolves.toBeUndefined();
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain('to_regprocedure(');
    expect(sql[0]).toContain('has_function_privilege(');
    expect(sql[0]).toContain('myeongha_api_executor');
    expect(sql[0]).not.toMatch(/\b(insert|update|delete|grant|alter|create)\b/i);
  });

  it.each([[{ ready: false }], [], [{ ready: null }], [{ ready: true }, { ready: true }]])(
    'fails closed without an exact, executor-authorized Pin RPC: %j',
    async (...rows) => {
      const runner = runnerFor(rows);
      await expect(assertSeyeonProductionPinReadinessV1(runner as unknown as SeyeonProductionSubjectTransactionRunnerV1, subjectId))
        .rejects.toBeInstanceOf(SeyeonProductionPinMigrationRequiredV1);
    },
  );

  it('preserves transaction/query errors without inventing DB readiness', async () => {
    const failure = new Error('connection failed');
    const runner = { resolveSubject: vi.fn(), run: vi.fn(async () => { throw failure; }) };
    await expect(assertSeyeonProductionPinReadinessV1(runner, subjectId)).rejects.toBe(failure);
  });

  it('occurs before any turn receive and routes known mismatch to structured 503', async () => {
    const { readFile } = await import('node:fs/promises');
    const runtime = await readFile(new URL('../apps/api/src/production-seyeon-chat-runtime-v1.ts',import.meta.url),'utf8');
    const http = await readFile(new URL('../apps/api/src/chat-turn-send-http.ts',import.meta.url),'utf8');
    expect(runtime.indexOf('await assertSeyeonProductionPinReadinessV1(runner, resolvedSubject.subjectId)'))
      .toBeLessThan(runtime.indexOf('const execution = await runSeyeonTurnRuntimePhaseV1('));
    expect(http).toContain("code: 'CAPABILITY_UNAVAILABLE'");
    expect(http).toContain("messageKey: 'chat.secure_runtime_migration_required'");
  });
});
