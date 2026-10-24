import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createPostgresPortOnePreenrollmentPurgePortV1,
  PORTONE_PREENROLLMENT_PURGE_HOLD_V1,
} from '../apps/api/src/postgres-portone-preenrollment-purge-v1.js';
import type {
  PostgresSubjectPoolV1, PostgresSubjectConnectionV1,
} from '../apps/api/src/postgres-subject-execution.js';

function harness(count: unknown) {
  const calls: Array<{ query: string; args?: readonly unknown[] }> = [];
  const released = vi.fn();
  const connection: PostgresSubjectConnectionV1 = {
    query: async <Row = Record<string, unknown>>(query: string, args?: readonly unknown[]) => {
      calls.push(args === undefined ? { query } : { query, args });
      const rows = query.includes('internal_purge_legal_portone_preenrollment_v1')
        ? [{ removed: count }] : [];
      return { rows: rows as Row[] };
    },
    release: released,
  };
  const pool: PostgresSubjectPoolV1 = { connect: async () => connection };
  return {
    calls, released,
    port: createPostgresPortOnePreenrollmentPurgePortV1(pool),
  };
}
describe('A1 preenrollment expiry purge worker remains offline', () => {
  it('invokes only the isolated system executor with bounded batch', async () => {
    const x = harness(3);
    expect(await x.port.purgeExpiredPreenrollmentProofs(20)).toBe(3);
    expect(x.calls.map(c => c.query)).toEqual([
      'BEGIN', 'SET LOCAL ROLE myeongha_system_executor',
      expect.stringContaining('internal_purge_legal_portone_preenrollment_v1'),
      'COMMIT',
    ]);
    expect(x.calls[2]?.args).toEqual([20]);
    expect(x.released).toHaveBeenCalledOnce();
    expect(PORTONE_PREENROLLMENT_PURGE_HOLD_V1).toMatchObject({
      scheduled: false, migrationApplied: false, maxBatch: 250,
    });
  });
  it('rejects invalid batch, impossible count, and rolls back', async () => {
    const x = harness(500);
    for (const limit of [0, -1, 251, 0.5, NaN]) {
      await expect(x.port.purgeExpiredPreenrollmentProofs(limit)).rejects.toThrow('batch');
    }
    expect(x.calls).toEqual([]);
    await expect(x.port.purgeExpiredPreenrollmentProofs(10)).rejects.toThrow('affected-row');
    expect(x.calls.map(c => c.query)).toContain('ROLLBACK');
    expect(x.released).toHaveBeenCalledOnce();
  });
  it('only physically removes expired short-lived preaccount proofs, never Subject age', () => {
    const sql = readFileSync(new URL(
      '../supabase/proposals/1741_portone_preenrollment_age_authority_v1.proposed.sql', import.meta.url,
    ), 'utf8');
    const i = sql.indexOf('create function public.internal_purge_legal_portone_preenrollment_v1(');
    expect(i).toBeGreaterThan(0);
    const j = sql.indexOf('end $purge$;', i);
    const fn = sql.slice(i, j);
    expect(fn).toContain('expires_at<=clock_timestamp()');
    expect(fn).toContain('for update skip locked');
    expect(fn).toContain('delete from public.legal_portone_preenrollment_v1');
    expect(fn).not.toContain('legal_portone_verified_age_v1');
    expect(sql).toContain('to myeongha_system_executor');
  });
});
