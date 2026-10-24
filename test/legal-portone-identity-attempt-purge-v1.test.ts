import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createPostgresPortOneIdentityAttemptPurgePortV1,
  POSTGRES_PORTONE_ATTEMPT_PURGE_BINDINGS_V1,
} from '../apps/api/src/postgres-portone-identity-attempt-purge-v1.js';
import type {
  PostgresSubjectPoolV1, PostgresSubjectConnectionV1,
} from '../apps/api/src/postgres-subject-execution.js';

function setup(removed: unknown = 2) {
  const calls: Array<{ sql: string; args: readonly unknown[] }> = [];
  let released = 0;
  const connection: PostgresSubjectConnectionV1 = {
    query: async <Row = Record<string, unknown>>(sql: string, args: readonly unknown[] = []) => {
      calls.push({ sql, args });
      return { rows: sql.includes('internal_purge_expired_legal_portone_attempts_v1')
        ? [{ removed }] as unknown as Row[] : [] as Row[] };
    },
    release: () => { released++; },
  };
  const pool: PostgresSubjectPoolV1 = { connect: async () => connection };
  return {
    port: createPostgresPortOneIdentityAttemptPurgePortV1(pool),
    calls,
    get releases() { return released; },
  };
}

describe('LEGAL L2 PortOne attempt physical cleanup (unapplied)', () => {
  it('runs one bounded cleanup under system worker role, with no per-user authority', async () => {
    const ctx = setup();
    expect(await ctx.port.purgeExpiredAttempts(25)).toBe(2);
    expect(ctx.calls.map(c => c.sql)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_system_executor',
      expect.stringContaining('internal_purge_expired_legal_portone_attempts_v1'),
      'COMMIT',
    ]);
    expect(ctx.calls[2]?.args).toEqual([25]);
    expect(ctx.releases).toBe(1);
    expect(POSTGRES_PORTONE_ATTEMPT_PURGE_BINDINGS_V1).toMatchObject({
      scheduled: false, migrationApplied: false,
    });
  });

  it('fails closed on invalid batch sizes or invalid DB responses', async () => {
    const ctx = setup(99);
    for (const invalid of [0, -1, 251, 1.5, NaN]) {
      await expect(ctx.port.purgeExpiredAttempts(invalid)).rejects.toThrow('batch size');
    }
    expect(ctx.calls).toEqual([]);
    await expect(ctx.port.purgeExpiredAttempts(3)).rejects.toThrow('affected-row count');
    expect(ctx.calls.map(c => c.sql)).toContain('ROLLBACK');
    expect(ctx.releases).toBe(1);
  });

  it('only removes expired attempt rows, never verified-age authority or active attempts', () => {
    const sql = readFileSync(new URL('../supabase/proposals/1740_portone_identity_age_authority_v1.proposed.sql', import.meta.url), 'utf8');
    const fn = sql.slice(sql.indexOf('create function public.internal_purge_expired_legal_portone_attempts_v1('));
    expect(fn).toContain('a.expires_at <= clock_timestamp()');
    expect(fn).toContain('for update skip locked');
    expect(fn).toContain('delete from public.legal_portone_identity_attempts_v1');
    expect(fn).not.toContain('delete from public.legal_portone_verified_age_v1');
    expect(fn).toContain('to myeongha_system_executor');
    expect(fn).toContain('from public, anon, authenticated, myeongha_api_executor');
  });
});
