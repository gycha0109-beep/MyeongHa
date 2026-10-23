import { describe, expect, it } from 'vitest';
import {
  createPostgresPortOneVerifiedAgeAdmissionPortV1,
} from '../apps/api/src/portone-v2-verified-age-admission-v1.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const subjectId = '92000000-0000-0000-0000-000000000001';
const evidence = { kind: 'member', verifiedAuthUserId: '91000000-0000-0000-0000-000000000001' } as const;

function harness(ageBand: unknown) {
  const calls: string[] = [];
  const params: (readonly unknown[])[] = [];
  const connection: PostgresSubjectConnectionV1 = {
    query: async <Row = Record<string, unknown>>(sql: string, values: readonly unknown[] = []) => {
      calls.push(sql);
      params.push(values);
      if (sql.includes('begin_member_subject_context_v1')) {
        return { rows: [{ subjectId, subjectKind: 'member' }] as unknown as Row[] };
      }
      if (sql.includes('qry_verified_legal_portone_age_v1')) {
        return { rows: [{ ageBand }] as unknown as Row[] };
      }
      return { rows: [] as Row[] };
    },
    release: () => undefined,
  };
  const pool: PostgresSubjectPoolV1 = { connect: async () => connection };
  return {
    port: createPostgresPortOneVerifiedAgeAdmissionPortV1(pool),
    calls, params,
  };
}

describe('LEGAL L2 verified age admission', () => {
  it('denies missing age, admits 14-18 only for free use, and adults for both', async () => {
    for (const [band, free, paid] of [
      [null, false, false],
      ['free_minor', true, false],
      ['adult', true, true],
    ] as const) {
      const ctx = harness(band);
      expect(await ctx.port.admitFreePersonalization(evidence)).toBe(free);
      expect(await ctx.port.admitAdultDirectPurchase(evidence)).toBe(paid);
      const ageQueries = ctx.calls.filter(sql => sql.includes('qry_verified_legal_portone_age_v1'));
      expect(ageQueries).toHaveLength(2);
      expect(ctx.params.filter(x => x.length === 1 && x[0] === subjectId).length).toBeGreaterThanOrEqual(2);
      expect(ctx.calls.filter(x => x === 'COMMIT')).toHaveLength(2);
    }
  });

  it('fails closed on unexpected DB age band and rolls back', async () => {
    const ctx = harness('claimed-adult');
    await expect(ctx.port.admitAdultDirectPurchase(evidence)).rejects.toThrow('invalid band');
    expect(ctx.calls).toContain('ROLLBACK');
    expect(ctx.calls).not.toContain('COMMIT');
  });
});
