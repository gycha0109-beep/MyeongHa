import { describe, expect, it, vi } from 'vitest';
import {
  createSajuSourceProofPostgresNonceClaimV1,
} from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import type {
  PostgresQueryResultV1, PostgresSubjectConnectionV1, PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const NOW = 1_800_000_000_000;
const replay = 'saju-preview-service:myeongha-api-service:' + 'Q'.repeat(24);

function fixture(input: {
  unavailable?: 'connect' | 'begin' | 'role' | 'insert' | 'commit' | 'rollback';
  mismatch?: boolean;
  duplicateRows?: boolean;
} = {}) {
  const log: { sql: string; args?: readonly unknown[] }[] = [];
  const seen = new Set<string>();
  const release = vi.fn((_error?: unknown) => undefined);
  const connection: PostgresSubjectConnectionV1 = {
    async query<Row = Record<string, unknown>>(
      sql: string, args?: readonly unknown[],
    ): Promise<PostgresQueryResultV1<Row>> {
      log.push(args === undefined ? { sql } : { sql, args });
      if (input.unavailable === 'begin' && sql === 'BEGIN') throw Error('begin failed');
      if (input.unavailable === 'role' && sql.startsWith('SET LOCAL ROLE')) {
        throw Error('no role membership');
      }
      if (input.unavailable === 'commit' && sql === 'COMMIT') throw Error('commit failed');
      if (input.unavailable === 'rollback' && sql === 'ROLLBACK') throw Error('rollback failed');
      if (sql.includes('insert into public.saju_source_proof_nonce_claims')) {
        if (input.unavailable === 'insert') throw Error('relation missing');
        const key = args?.[0] as string;
        if (input.duplicateRows) {
          return { rows: [{ replay_key_digest: key }, { replay_key_digest: key }] as Row[] };
        }
        if (input.mismatch) {
          return { rows: [{ replay_key_digest: '0'.repeat(64) }] as Row[] };
        }
        if (seen.has(key)) return { rows: [] };
        seen.add(key);
        return { rows: [{ replay_key_digest: key }] as Row[] };
      }
      return { rows: [] };
    },
    release,
  };
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      if (input.unavailable === 'connect') throw Error('pool unavailable');
      return connection;
    },
  };
  return { log, release, pool, claim: createSajuSourceProofPostgresNonceClaimV1({
    pool, nowMsFactory: () => NOW,
  }) };
}

describe('2B-3C-7A shared PostgreSQL source proof nonce claim adapter', () => {
  it('atomically claims a unique digest once, with role-bound transaction and retention', async () => {
    const f = fixture();
    expect(await f.claim(replay, NOW + 60_000)).toBe(true);
    expect(await f.claim(replay, NOW + 60_000)).toBe(false);
    expect(f.log.map(x => x.sql.startsWith('insert into') ? 'INSERT' : x.sql))
      .toEqual(['BEGIN', 'SET LOCAL ROLE myeongha_saju_proof_nonce_runtime',
        'INSERT', 'COMMIT', 'BEGIN', 'SET LOCAL ROLE myeongha_saju_proof_nonce_runtime',
        'INSERT', 'COMMIT']);
    const insert = f.log.find(x => x.sql.startsWith('insert into'));
    expect(insert?.sql).toContain('on conflict (replay_key_digest) do nothing');
    expect(insert?.sql).toContain('returning replay_key_digest');
    expect(insert?.args?.[0]).toMatch(/^[a-f0-9]{64}$/u);
    expect(insert?.args?.[0]).not.toContain(replay);
    expect(insert?.args?.[1]).toBe(new Date(NOW + 90_000).toISOString());
    expect(f.release).toHaveBeenCalledTimes(2);
  });

  it('treats different source proof keys as independent', async () => {
    const f = fixture();
    expect(await f.claim(replay, NOW + 40_000)).toBe(true);
    expect(await f.claim(replay.slice(0, -1) + 'R', NOW + 40_000)).toBe(true);
  });

  it.each([
    ['', NOW + 60_000], ['a'.repeat(513), NOW + 60_000],
    ['invalid key with whitespace', NOW + 60_000],
    [replay, NOW], [replay, NOW - 1], [replay, NOW + 135_001],
    [replay, NaN], [replay, Infinity],
  ])('denies malformed replay metadata without opening DB', async (key, expiry) => {
    const f = fixture();
    expect(await f.claim(key, expiry)).toBe(false);
    expect(f.log).toHaveLength(0);
  });

  it.each(['connect', 'begin', 'role', 'insert', 'commit', 'rollback'] as const)(
    'fails closed during %s failure', async (unavailable) => {
      const f = fixture({ unavailable });
      expect(await f.claim(replay, NOW + 60_000)).toBe(false);
      if (unavailable !== 'connect') expect(f.release).toHaveBeenCalledOnce();
      if (unavailable === 'commit' || unavailable === 'insert'
        || unavailable === 'role') {
        expect(f.log.map(x => x.sql)).toContain('ROLLBACK');
      }
    },
  );

  it('rejects unexpected returned rows or mismatched authority digest', async () => {
    for (const config of [{ mismatch: true }, { duplicateRows: true }]) {
      const f = fixture(config);
      expect(await f.claim(replay, NOW + 60_000)).toBe(false);
      expect(f.log.map(x => x.sql)).toContain('ROLLBACK');
    }
  });
});
