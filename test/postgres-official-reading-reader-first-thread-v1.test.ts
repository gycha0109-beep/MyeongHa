import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  openPostgresOfficialReadingReaderFirstThreadV1,
} from '../apps/api/src/postgres-official-reading-reader-first-thread-v1.js';
import type {
  PostgresQueryResultV1, PostgresSubjectConnectionV1, PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { ProductReaderRuleLookupV1 } from '../apps/api/src/product-reader-eligibility-policy-v1.js';

const SUBJECT = '92000000-0000-4000-8000-000000000001';
const AUTH = '91000000-0000-4000-8000-000000000001';
const READING = '93000000-0000-4000-8000-000000000001';
const THREAD = '94000000-0000-4000-8000-000000000001';
const PARTICIPANT = '94000000-0000-4000-8000-000000000002';
const BUNDLE = '95000000-0000-4000-8000-000000000001';
const OTHER_BUNDLE = '95000000-0000-4000-8000-000000000002';
const RELEASE = '95000000-0000-4000-8000-000000000003';
const PRODUCT = '96000000-0000-4000-8000-000000000001';
const TIME = new Date('2026-10-11T03:00:00.000Z');

type Options = Readonly<{
  existing?: boolean;
  duplicate?: boolean;
  revoked?: boolean;
  revokeAfterOpen?: boolean;
  missingAfterOpen?: boolean;
  product?: ProductReaderRuleLookupV1;
  policyDrift?: boolean;
  openerBundle?: string;
  boundBundle?: string;
  openerCreated?: boolean;
  openerCharacter?: string;
  malformedOpen?: boolean;
  subjectKind?: 'member' | 'guest';
  clock?: unknown;
  openerThrows?: boolean;
}>;

type Call = Readonly<{ sql: string; args: readonly unknown[] }>;
class Connection implements PostgresSubjectConnectionV1 {
  readonly calls: Call[] = [];
  readonly released: unknown[] = [];
  accessReads = 0;
  opened = false;
  commandCalls = 0;
  constructor(readonly opts: Options) {}

  async query<Row = Record<string, unknown>>(
    sql: string, args: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({ sql, args: [...args] });
    let rows: readonly Record<string, unknown>[] = [];
    if (sql.includes('begin_member_subject_context_v1')) {
      rows = [{ subjectId: SUBJECT, subjectKind: this.opts.subjectKind ?? 'member' }];
    } else if (sql.includes('transaction_timestamp()')) {
      rows = [{ effectiveAt: this.opts.clock === undefined ? TIME : this.opts.clock }];
    } else if (sql.includes('qry_character_standard_reading_access_runtime_v2')) {
      this.accessReads += 1;
      if (!this.opts.revoked && !(this.opts.revokeAfterOpen && this.opened)) {
        rows = [{
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
          sajuEngineVersion: 'engine-v1', responseHash: 'sha256:official-source',
        }];
      }
    } else if (sql.includes('qry_member_single_character_thread_locator_v1')) {
      rows = this.opts.duplicate
        ? [{ threadId: THREAD }, { threadId: PARTICIPANT }]
        : this.opts.missingAfterOpen && this.opened
          ? []
          : (this.opts.existing || this.opened)
            ? [{ threadId: THREAD }] : [];
    } else if (sql.includes('cmd_open_member_single_character_thread_v1')) {
      this.commandCalls += 1;
      if (this.opts.openerThrows) throw new Error('Chat command unavailable');
      this.opened = true;
      rows = this.opts.malformedOpen ? [] : [{
        threadId: THREAD, threadCharacterId: PARTICIPANT,
        created: this.opts.openerCreated ?? true,
        activeContentReleaseId: RELEASE,
        activeContentBundleId: this.opts.openerBundle ?? BUNDLE,
        characterId: this.opts.openerCharacter ?? 'seyeon',
      }];
    } else if (sql.includes('qry_chat_thread_runtime_binding_v1')) {
      rows = [{
        threadId: THREAD, status: 'active',
        activeContentReleaseId: RELEASE,
        activeContentBundleId: this.opts.boundBundle ?? BUNDLE,
        contentRevision: 0, participantCharacterIds: ['seyeon'],
      }];
    }
    return { rows: rows as readonly Row[] };
  }
  release(error?: unknown) { this.released.push(error); }
}
function fixture(opts: Options = {}) {
  const db = new Connection(opts);
  const pool: PostgresSubjectPoolV1 = { connect: () => db };
  const policyCalls: string[] = [];
  const candidateCalls: string[] = [];
  const input = {
    pool,
    verifiedEvidence: { kind: 'member' as const, verifiedAuthUserId: AUTH },
    readingId: READING,
    readerCharacterId: 'seyeon',
    createUuid: () => {
      const id = candidateCalls.length === 0 ? THREAD : PARTICIPANT;
      candidateCalls.push(id);
      return id;
    },
    createProductReaderPolicyAuthorityPort(client: unknown) {
      expect(client).toBe(db);
      return {
        async readApprovedRule(source: { productId: string; effectiveAt: string }) {
          expect(source.productId).toBe(PRODUCT);
          expect(source.effectiveAt).toBe(TIME.toISOString());
          policyCalls.push(source.effectiveAt);
          return opts.policyDrift && policyCalls.length > 1
            ? { status: 'withheld' as const, reason: 'stale' as const }
            : opts.product ?? {
              status: 'approved' as const,
              rule: {
                kind: 'standard_all_readers' as const,
                productId: PRODUCT, productSpecVersion: 'standard-reading-v1',
                sajuDomain: 'general' as const,
                ruleVersion: 'approved-v1', approvedPolicyRevision: 'revision-v1',
              },
            };
        },
      };
    },
  };
  return { db, input, policyCalls, candidateCalls };
}
function steps(db: Connection) {
  return db.calls.map(({ sql }) => {
    if (['BEGIN', 'ROLLBACK', 'COMMIT'].includes(sql)) return sql;
    if (sql.startsWith('SET LOCAL ROLE')) return 'ROLE';
    if (sql.includes('begin_member_subject_context_v1')) return 'SUBJECT';
    if (sql.includes('assert_myeongha_subject_context_v1')) return 'ASSERT';
    if (sql.includes('transaction_timestamp()')) return 'CLOCK';
    if (sql.includes('qry_character_standard_reading_access_runtime_v2')) return 'GRANT';
    if (sql.includes('qry_member_single_character_thread_locator_v1')) return 'LOCATOR';
    if (sql.includes('cmd_open_member_single_character_thread_v1')) return 'OPEN';
    if (sql.includes('qry_chat_thread_runtime_binding_v1')) return 'BINDING';
    return 'OTHER';
  });
}
async function denied(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    name: 'OfficialReadingReaderThreadResolutionErrorV1', code,
  });
}

describe('D-05-C dormant first Thread open/reuse, no public activation', () => {
  it('first use gates exact Grant and approved Product BEFORE the existing atomic opener', async () => {
    const f = fixture();
    const value = await openPostgresOfficialReadingReaderFirstThreadV1(f.input);
    expect(value.created).toBe(true);
    expect(value.resolved).toMatchObject({
      subjectId: SUBJECT, readingId: READING, readerCharacterId: 'seyeon',
      threadId: THREAD, activeContentBundleId: BUNDLE,
      sourceResponseHash: 'sha256:official-source',
    });
    expect(Object.isFrozen(value)).toBe(true);
    const s = steps(f.db);
    expect(s).toEqual([
      'BEGIN', 'ROLE', 'SUBJECT', 'ASSERT', 'CLOCK',
      'GRANT', 'LOCATOR', 'OPEN',
      'GRANT', 'LOCATOR', 'BINDING', 'GRANT', 'BINDING', 'GRANT', 'COMMIT',
    ]);
    expect(f.policyCalls.length).toBe(4);
    expect(f.candidateCalls).toEqual([THREAD, PARTICIPANT]);
    const open = f.db.calls.find((x) => x.sql.includes('cmd_open_member_single_character_thread_v1'));
    expect(open?.args).toEqual([SUBJECT, 'seyeon', THREAD, PARTICIPANT]);
    expect(open?.sql).not.toMatch(/\b(insert|update|delete)\b/iu);
  });

  it('re-enters existing verified Thread without any command or candidate UUID', async () => {
    const f = fixture({ existing: true });
    const value = await openPostgresOfficialReadingReaderFirstThreadV1(f.input);
    expect(value.created).toBe(false);
    expect(value.resolved.threadId).toBe(THREAD);
    expect(steps(f.db)).not.toContain('OPEN');
    expect(f.candidateCalls).toEqual([]);
    expect(steps(f.db).at(-1)).toBe('COMMIT');
  });

  it('a concurrent opener may return created:false; authoritative re-read still binds identity', async () => {
    const f = fixture({ openerCreated: false });
    const value = await openPostgresOfficialReadingReaderFirstThreadV1(f.input);
    expect(value.created).toBe(false);
    expect(value.resolved.threadId).toBe(THREAD);
    expect(f.db.commandCalls).toBe(1);
    expect(steps(f.db).at(-1)).toBe('COMMIT');
  });

  it('Guest, invalid Reading and malformed Reader are blocked before connecting', async () => {
    for (const patch of [
      { verifiedEvidence: { kind: 'guest' as const, verifiedGuestTokenHash: 'verified' } },
      { readingId: 'forged' }, { readerCharacterId: '  ' },
    ]) {
      const f = fixture();
      await denied(openPostgresOfficialReadingReaderFirstThreadV1({
        ...f.input, ...patch,
      }), 'ACCESS_DENIED');
      expect(f.db.calls).toEqual([]);
    }
  });

  it('missing/revoked Grant, excluded/withheld Product policy or duplicate candidates never open', async () => {
    for (const [options, code] of [
      [{ revoked: true }, 'ACCESS_DENIED'],
      [{ product: { status: 'withheld', reason: 'disabled' } }, 'POLICY_HOLD'],
      [{ duplicate: true }, 'THREAD_AMBIGUOUS'],
    ] as const) {
      const f = fixture(options);
      await denied(openPostgresOfficialReadingReaderFirstThreadV1(f.input), code);
      expect(f.db.commandCalls).toBe(0);
      expect(f.candidateCalls.length).toBe(0);
      expect(steps(f.db).at(-1)).toBe('ROLLBACK');
    }
  });

  it('default Release/Grant Bundle mismatch aborts the newly opened Thread transaction', async () => {
    const f = fixture({ openerBundle: OTHER_BUNDLE });
    await denied(openPostgresOfficialReadingReaderFirstThreadV1(f.input), 'THREAD_INCOMPATIBLE');
    expect(f.db.commandCalls).toBe(1);
    expect(steps(f.db).at(-1)).toBe('ROLLBACK');
    expect(steps(f.db)).not.toContain('COMMIT');
  });

  it('existing wrong Bundle denies without a new open', async () => {
    const f = fixture({ existing: true, boundBundle: OTHER_BUNDLE });
    await denied(openPostgresOfficialReadingReaderFirstThreadV1(f.input), 'THREAD_INCOMPATIBLE');
    expect(steps(f.db)).not.toContain('OPEN');
    expect(steps(f.db).at(-1)).toBe('ROLLBACK');
  });

  it('revoke, policy drift or disappearing Thread after the command triggers rollback', async () => {
    for (const [opts, code] of [
      [{ revokeAfterOpen: true }, 'ACCESS_DENIED'],
      [{ policyDrift: true }, 'POLICY_HOLD'],
      [{ missingAfterOpen: true }, 'THREAD_UNAVAILABLE'],
    ] as const) {
      const f = fixture(opts);
      await denied(openPostgresOfficialReadingReaderFirstThreadV1(f.input), code);
      expect(f.db.commandCalls).toBe(1);
      expect(steps(f.db).at(-1)).toBe('ROLLBACK');
    }
  });

  it('invalid command results cannot commit any Thread', async () => {
    for (const opts of [
      { malformedOpen: true }, { openerCharacter: 'baekheon' },
    ]) {
      const f = fixture(opts);
      await denied(openPostgresOfficialReadingReaderFirstThreadV1(f.input), 'THREAD_INCOMPATIBLE');
      expect(steps(f.db).at(-1)).toBe('ROLLBACK');
    }
  });

  it('a failed opener rolls back; a bad DB clock cannot reach purchase or Thread authority', async () => {
    const a = fixture({ openerThrows: true });
    await expect(openPostgresOfficialReadingReaderFirstThreadV1(a.input))
      .rejects.toThrow('Chat command unavailable');
    expect(steps(a.db).at(-1)).toBe('ROLLBACK');
    const b = fixture({ clock: 'invalid' });
    await denied(openPostgresOfficialReadingReaderFirstThreadV1(b.input), 'ACCESS_DENIED');
    expect(steps(b.db)).toEqual([
      'BEGIN', 'ROLE', 'SUBJECT', 'ASSERT', 'CLOCK', 'ROLLBACK',
    ]);
  });

  it('remains unconnected to public HTTP, paid Reader Chat or client selectors', async () => {
    const read = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');
    const [server, mobile, generalOpen] = await Promise.all([
      read('apps/api/src/postgres-official-reading-reader-first-thread-v1.ts'),
      read('apps/mobile/src/features/reading/MobileOfficialReadingReaderEntry.tsx'),
      read('apps/api/src/chat-open-http.ts'),
    ]);
    expect(server).toContain('cmd_open_member_single_character_thread_v1');
    expect(server).toContain('resolveOfficialReadingReaderThreadV1');
    expect(server).toContain('createProductReaderPolicyAuthorityPort');
    expect(server).not.toContain('export async function handle');
    expect(mobile).toContain('Reader 해설 진입 비활성');
    expect(generalOpen).not.toContain('officialReadingId');
  });
});
