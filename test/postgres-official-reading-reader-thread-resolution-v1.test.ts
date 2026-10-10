import { describe, expect, it } from 'vitest';
import {
  resolvePostgresOfficialReadingReaderThreadV1,
} from '../apps/api/src/postgres-official-reading-reader-thread-resolution-v1.js';
import { OfficialReadingReaderThreadResolutionErrorV1 } from '../apps/api/src/official-reading-reader-thread-resolution-v1.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { ProductReaderRuleLookupV1 } from '../apps/api/src/product-reader-eligibility-policy-v1.js';

const USER = '91000000-0000-4000-8000-000000000001';
const SUBJECT = '92000000-0000-4000-8000-000000000001';
const READING = '93000000-0000-4000-8000-000000000001';
const THREAD = '94000000-0000-4000-8000-000000000001';
const BUNDLE = '95000000-0000-4000-8000-000000000001';
const PRODUCT = '96000000-0000-4000-8000-000000000001';
const CLOCK = new Date('2026-10-11T00:01:02.000Z');

type Call = Readonly<{ sql: string; values: readonly unknown[] }>;
type FixtureOptions = Readonly<{
  kind?: 'member' | 'guest';
  accessMissing?: boolean;
  accessRevoked?: boolean;
  candidateIds?: readonly string[];
  threadBundle?: string;
  threadReader?: string;
  threadFailure?: boolean;
  clock?: unknown;
  policy?: ProductReaderRuleLookupV1;
  policyFailure?: boolean;
  subjectKind?: 'member' | 'guest';
}>;

class FakeConnection implements PostgresSubjectConnectionV1 {
  calls: Call[] = [];
  releases: unknown[] = [];
  accessReads = 0;
  readonly options: FixtureOptions;

  constructor(options: FixtureOptions) {
    this.options = options;
  }

  async query<Row = Record<string, unknown>>(
    sql: string, values: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({ sql, values: [...values] });
    let rows: readonly Record<string, unknown>[] = [];
    if (sql.includes('begin_member_subject_context_v1')) {
      rows = [{ subjectId: SUBJECT, subjectKind: this.options.subjectKind ?? 'member' }];
    } else if (sql.includes('begin_guest_subject_context_v1')) {
      rows = [{ subjectId: SUBJECT, subjectKind: 'guest' }];
    } else if (sql.includes('transaction_timestamp()')) {
      rows = [{ effectiveAt: this.options.clock === undefined ? CLOCK : this.options.clock }];
    } else if (sql.includes('qry_character_standard_reading_access_runtime_v2')) {
      this.accessReads++;
      rows = this.options.accessMissing || (this.options.accessRevoked && this.accessReads > 1)
        ? [] : [{
          subjectId: SUBJECT, readingId: READING,
          readingSessionId: '97000000-0000-4000-8000-000000000001',
          productId: PRODUCT, readerCharacterId: 'seyeon',
          readerContentBundleId: BUNDLE, topicKey: 'general',
          sajuDomain: 'general', readingPeriod: 'original',
          readingVariant: 'standard',
          sourceBirthRevisionId: '98000000-0000-4000-8000-000000000001',
          productSpecVersion: 'standard-reading-v1',
          domainCapabilityVersion: 'general-v1',
          readingContractVersion: 'myeonghwa-product-reading-response-v2',
          sajuEngineVersion: 'engine-v1',
          responseHash: 'sha256:official-provenance',
        }];
    } else if (sql.includes('qry_member_single_character_thread_locator_v1')) {
      rows = (this.options.candidateIds ?? [THREAD]).map((threadId) => ({ threadId }));
    } else if (sql.includes('qry_chat_thread_runtime_binding_v1')) {
      if (this.options.threadFailure) throw new Error('binding failed');
      rows = [{
        threadId: THREAD, status: 'active',
        activeContentReleaseId: '99000000-0000-4000-8000-000000000001',
        activeContentBundleId: this.options.threadBundle ?? BUNDLE,
        contentRevision: 3,
        participantCharacterIds: [this.options.threadReader ?? 'seyeon'],
      }];
    }
    return { rows: rows as readonly Row[] };
  }
  release(error?: unknown) {
    this.releases.push(error);
  }
}

function fixture(options: FixtureOptions = {}) {
  const connection = new FakeConnection(options);
  const pool: PostgresSubjectPoolV1 = {
    connect: async () => connection,
  };
  const policyCalls: Readonly<{ effectiveAt: string; productId: string }>[] = [];
  let factoryCalls = 0;

  const input = {
    pool,
    verifiedEvidence: options.kind === 'guest'
      ? { kind: 'guest' as const, verifiedGuestTokenHash: 'trusted-token-hash' }
      : { kind: 'member' as const, verifiedAuthUserId: USER },
    readingId: READING,
    readerCharacterId: 'seyeon',
    createProductReaderPolicyAuthorityPort(client: unknown) {
      factoryCalls++;
      expect(client).toBe(connection);
      return {
        async readApprovedRule(source: { productId: string; effectiveAt: string }) {
          policyCalls.push({
            productId: source.productId,
            effectiveAt: source.effectiveAt,
          });
          if (options.policyFailure) throw new Error('no Product Owner policy');
          return options.policy ?? {
            status: 'approved' as const,
            rule: {
              kind: 'standard_all_readers' as const,
              productId: PRODUCT,
              productSpecVersion: 'standard-reading-v1',
              sajuDomain: 'general' as const,
              ruleVersion: 'approved-v1',
              approvedPolicyRevision: 'policy-v1',
            },
          };
        },
      };
    },
  };
  return { connection, input, policyCalls, getFactoryCalls: () => factoryCalls };
}

function queryNames(connection: FakeConnection) {
  return connection.calls.map((c) => {
    if (c.sql === 'BEGIN' || c.sql === 'COMMIT' || c.sql === 'ROLLBACK') return c.sql;
    if (c.sql.includes('SET LOCAL ROLE')) return 'ROLE';
    if (c.sql.includes('begin_member_subject_context')) return 'MEMBER';
    if (c.sql.includes('begin_guest_subject_context')) return 'GUEST';
    if (c.sql.includes('assert_myeongha_subject_context')) return 'ASSERT';
    if (c.sql.includes('transaction_timestamp')) return 'CLOCK';
    if (c.sql.includes('qry_character_standard_reading_access_runtime_v2')) return 'GRANT';
    if (c.sql.includes('qry_member_single_character_thread_locator_v1')) return 'LOCATOR';
    if (c.sql.includes('qry_chat_thread_runtime_binding_v1')) return 'BINDING';
    return 'UNEXPECTED';
  });
}

async function denied(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    code,
    name: 'OfficialReadingReaderThreadResolutionErrorV1',
  } satisfies Partial<OfficialReadingReaderThreadResolutionErrorV1>);
}

describe('D-05 read-only transaction-scoped Reader Thread entry', () => {
  it('resolves only the canonical authenticated Member, pinned Grant and existing Reader Thread', async () => {
    const f = fixture();
    const result = await resolvePostgresOfficialReadingReaderThreadV1(f.input);
    expect(result).toMatchObject({
      subjectId: SUBJECT, readingId: READING, threadId: THREAD,
      readerCharacterId: 'seyeon', activeContentBundleId: BUNDLE,
      contentRevision: 3,
      sourceResponseHash: 'sha256:official-provenance',
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(queryNames(f.connection)).toEqual([
      'BEGIN', 'ROLE', 'MEMBER', 'ASSERT', 'CLOCK',
      'GRANT', 'LOCATOR', 'BINDING', 'GRANT', 'BINDING',
      'COMMIT',
    ]);
    expect(f.policyCalls).toEqual([
      { productId: PRODUCT, effectiveAt: CLOCK.toISOString() },
      { productId: PRODUCT, effectiveAt: CLOCK.toISOString() },
    ]);
    expect(f.connection.calls.filter((x) => x.sql.includes('qry_')).every(
      (x) => !/\b(insert|update|delete|cmd_open)\b/iu.test(x.sql),
    )).toBe(true);
    expect(f.connection.releases).toEqual([undefined]);
    expect(f.getFactoryCalls()).toBe(1);
  });

  it('blocks Guest and invalid selectors before borrowing a DB connection', async () => {
    const guest = fixture({ kind: 'guest' });
    await denied(resolvePostgresOfficialReadingReaderThreadV1(guest.input), 'ACCESS_DENIED');
    expect(guest.connection.calls).toEqual([]);
    expect(guest.getFactoryCalls()).toBe(0);

    for (const patch of [
      { readingId: 'not-uuid' },
      { readerCharacterId: ' ' },
      { readerCharacterId: '' },
      { readerCharacterId: 'x'.repeat(65) },
    ]) {
      const f = fixture();
      await denied(resolvePostgresOfficialReadingReaderThreadV1({
        ...f.input,
        ...patch,
      }), 'ACCESS_DENIED');
      expect(f.connection.calls).toEqual([]);
    }
  });

  it('binds current DB timestamp and rejects invalid database clock', async () => {
    for (const clock of [null, 'invalid', new Date('invalid'), 42]) {
      const f = fixture({ clock });
      await denied(resolvePostgresOfficialReadingReaderThreadV1(f.input), 'ACCESS_DENIED');
      expect(queryNames(f.connection)).toEqual([
        'BEGIN', 'ROLE', 'MEMBER', 'ASSERT', 'CLOCK', 'ROLLBACK',
      ]);
    }
  });

  it('rejects missing/revoked purchase access without leaking Thread identities', async () => {
    for (const opts of [{ accessMissing: true }, { accessRevoked: true }]) {
      const f = fixture(opts);
      await denied(resolvePostgresOfficialReadingReaderThreadV1(f.input), 'ACCESS_DENIED');
      expect(queryNames(f.connection).at(-1)).toBe('ROLLBACK');
      expect(queryNames(f.connection)).not.toContain('COMMIT');
      expect(queryNames(f.connection).filter((x) => x === 'LOCATOR').length)
        .toBe(opts.accessMissing ? 0 : 1);
    }
  });

  it('withholds Product policy before Thread discovery or raw artifact access', async () => {
    for (const opts of [
      { policyFailure: true },
      { policy: { status: 'withheld', reason: 'disabled' } as const },
    ]) {
      const f = fixture(opts);
      await denied(resolvePostgresOfficialReadingReaderThreadV1(f.input), 'POLICY_HOLD');
      expect(queryNames(f.connection)).not.toContain('LOCATOR');
      expect(queryNames(f.connection)).not.toContain('BINDING');
      expect(queryNames(f.connection).at(-1)).toBe('ROLLBACK');
    }
  });

  it('does not open Thread on zero candidates and rejects ambiguous candidates', async () => {
    for (const [ids, code] of [
      [[], 'THREAD_UNAVAILABLE'],
      [[THREAD, '94000000-0000-4000-8000-000000000002'], 'THREAD_AMBIGUOUS'],
    ] as const) {
      const f = fixture({ candidateIds: ids });
      await denied(resolvePostgresOfficialReadingReaderThreadV1(f.input), code);
      expect(queryNames(f.connection).at(-1)).toBe('ROLLBACK');
      expect(queryNames(f.connection)).not.toContain('BINDING');
    }
  });

  it('rejects incompatible Reader or pinned bundle before returning a Thread', async () => {
    for (const opts of [
      { threadReader: 'baekheon' },
      { threadBundle: '95000000-0000-4000-8000-000000000002' },
      { threadFailure: true },
    ]) {
      const f = fixture(opts);
      await expect(resolvePostgresOfficialReadingReaderThreadV1(f.input)).rejects.toBeInstanceOf(
        OfficialReadingReaderThreadResolutionErrorV1,
      );
      expect(queryNames(f.connection).at(-1)).toBe('ROLLBACK');
    }
  });

  it('does not treat malformed Member identity as delegated subject', async () => {
    const f = fixture({ subjectKind: 'guest' });
    await expect(resolvePostgresOfficialReadingReaderThreadV1(f.input))
      .rejects.toThrow('different subject kind');
    expect(queryNames(f.connection)).toEqual(['BEGIN', 'ROLE', 'MEMBER', 'ROLLBACK']);
    expect(f.getFactoryCalls()).toBe(0);
  });
});
