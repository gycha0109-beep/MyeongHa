import { describe, expect, it, vi } from 'vitest';
import {
  OfficialReaderHeldPreflightErrorV1,
  runOfficialReaderHeldT1T2PreflightV1,
} from '../apps/api/src/official-reader-held-t1-t2-preflight-v1.js';
import {
  prepareOfficialReadingReaderAdmissionV1,
} from '../apps/api/src/official-reading-reader-admission-v1.js';
import type {
  PostgresSubjectPoolV1,
  PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { ContentReleaseRuntimeEntry } from '../packages/world-content/src/index.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const READING = '11111111-1111-4111-8111-111111111111';
const THREAD = '66666666-6666-4666-8666-666666666666';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const BUNDLE = '55555555-5555-4555-8555-555555555555';
const RELEASE = 'synthetic-release';
const DB_TIMES = ['2026-10-10T09:01:00.000Z', '2026-10-10T09:02:00.000Z'];
const PRIVATE = 'PRIVATE_DRAFT_NEVER_PUBLIC';

function fixture(options: {
  revokedAtT2?: boolean;
  threadDriftAtT2?: boolean;
  sourceDriftAtT2?: boolean;
  policyDriftAtT2?: boolean;
  reuseT1?: boolean;
  badT2Clock?: boolean;
  differentSubjectAtT2?: boolean;
  generationFails?: boolean;
} = {}) {
  const events: string[] = [];
  let transactionNumber = 0;
  let active = false;
  const pool: PostgresSubjectPoolV1 = {
    connect: async () => {
      if (active) throw new Error('connection must have been released');
      transactionNumber += 1;
      const transaction = transactionNumber;
      events.push('connect:' + transaction);
      return {
        query: async <Row = Record<string, unknown>>(
          sql: string,
        ): Promise<PostgresQueryResultV1<Row>> => {
          let rows: unknown[] = [];
          if (sql === 'BEGIN') {
            if (active) throw new Error('already active');
            active = true;
            events.push('begin:' + transaction);
          } else if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            if (!active) throw new Error('not active');
            events.push(sql.toLowerCase() + ':' + transaction);
            active = false;
          } else if (sql.includes('begin_member_subject_context_v1')) {
            rows = [{
              subjectId: transaction === 2 && options.differentSubjectAtT2
                ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : SUBJECT,
              subjectKind: 'member',
            }];
          } else if (sql.includes('clock_timestamp()')) {
            rows = [{ effectiveAt: transaction === 2 && options.badT2Clock
              ? 'not-a-db-clock' : DB_TIMES[transaction - 1] }];
            events.push('clock:' + transaction);
          } else if (sql.includes('assert_myeongha_subject_context_v1')) {
            rows = [{}];
          } else if (sql !== 'SET LOCAL ROLE myeongha_api_executor') {
            throw new Error('unexpected SQL');
          }
          return { rows } as unknown as PostgresQueryResultV1<Row>;
        },
        release: () => {
          if (active) throw new Error('released with active transaction');
          events.push('release:' + transaction);
        },
      };
    },
  };
  const contentEntry = {
    release: { releaseId: RELEASE, bundleId: BUNDLE },
    characters: { characters: [{ characterId: 'seyeon' }] },
  } as unknown as ContentReleaseRuntimeEntry;

  let t1Admission: Awaited<ReturnType<typeof prepareOfficialReadingReaderAdmissionV1>> | undefined;
  const prepareAdmission = vi.fn(async (scope: { resolvedSubject: { subjectId: string } }, effectiveAt: string) => {
    const phase = effectiveAt === DB_TIMES[0] ? 1 : 2;
    events.push('admit:' + phase);
    if (phase === 2 && options.reuseT1 && t1Admission !== undefined) return t1Admission;
    const hash = phase === 2 && options.sourceDriftAtT2
      ? 'sha256:v1:changed-official' : 'sha256:v1:original-official';
    const readRuntimeBinding = async () => [{
      threadId: THREAD, status: 'active', activeContentReleaseId: RELEASE,
      activeContentBundleId: BUNDLE,
      contentRevision: phase === 2 && options.threadDriftAtT2 ? 3 : 2,
      participantCharacterIds: ['seyeon'],
    }];
    const prepared = await prepareOfficialReadingReaderAdmissionV1({
      resolvedSubjectId: scope.resolvedSubject.subjectId,
      threadId: THREAD, readingId: READING, effectiveAt,
      contentEntry,
      threadBindingAuthorityPort: { readRuntimeBinding },
      accessAuthorityPort: { readAccessibleReadings: async () =>
        phase === 2 && options.revokedAtT2 ? [] : [{
          subjectId: scope.resolvedSubject.subjectId,
          readingId: READING, readingSessionId: '22222222-2222-4222-8222-222222222222',
          productId: PRODUCT, readerCharacterId: 'seyeon',
          readerContentBundleId: BUNDLE, topicKey: 'general', sajuDomain: 'general',
          readingPeriod: 'original', readingVariant: 'standard',
          sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
          productSpecVersion: 'standard-reading-v1', domainCapabilityVersion: 'general-v1',
          readingContractVersion: 'myeonghwa-product-reading-response-v2',
          sajuEngineVersion: 'saju-engine-v1', responseHash: hash,
        }] },
      artifactAuthorityPort: { readArtifactSource: async () => [{
        readingId: READING, productId: PRODUCT, readerCharacterId: 'seyeon',
        readingContractVersion: 'myeonghwa-product-reading-response-v2',
        productResponseState: 'delivered',
        responseSnapshotJsonb: {
          responseVersion: 'myeonghwa-product-reading-response-v2',
          state: 'delivered',
          reading: {
            readingId: READING,
            sections: [{
              sectionType: 'overview', title: '전체',
              blocks: [{ type: 'paragraph', text: '공식 근거입니다.' }],
            }],
            disclosures: [], calculationSummary: {},
          },
        },
        responseHash: hash,
        completedAt: '2026-10-10T08:00:00Z',
      }] },
      productReaderEligibilityAuthorityPort: { readApprovedRule: async () => ({
        status: 'approved' as const,
        rule: {
          kind: 'standard_all_readers' as const,
          productId: PRODUCT, productSpecVersion: 'standard-reading-v1',
          sajuDomain: 'general' as const, ruleVersion: 'synthetic-rule',
          approvedPolicyRevision: phase === 2 && options.policyDriftAtT2
            ? 'new-policy' : 'synthetic-policy',
        },
      }) },
    });
    if (phase === 1) t1Admission = prepared;
    return prepared;
  });
  const generatePrivate = vi.fn(async () => {
    events.push('generate-private');
    if (active) throw new Error('generation happened inside a DB transaction');
    if (options.generationFails) throw new Error('SECRET PROVIDER ERROR');
    return { rawText: PRIVATE };
  });
  return {
    events, prepareAdmission, generatePrivate,
    input: {
      pool,
      verifiedEvidence: { kind: 'member' as const, verifiedAuthUserId: SUBJECT },
      prepareAdmission,
      generatePrivate,
    },
  };
}

describe('Deny-only Reader T1 / private generation / fresh T2 staging', () => {
  it('commits and releases T1 before generation; uses a new DB clock/transaction at T2; never reveals', async () => {
    const f = fixture();
    const result = await runOfficialReaderHeldT1T2PreflightV1(f.input);
    expect(f.events).toEqual([
      'connect:1', 'begin:1', 'clock:1', 'admit:1',
      'commit:1', 'release:1', 'generate-private',
      'connect:2', 'begin:2', 'clock:2', 'admit:2',
      'commit:2', 'release:2',
    ]);
    expect(f.prepareAdmission.mock.calls.map((call) => call[1])).toEqual(DB_TIMES);
    expect(result).toEqual({
      status: 'held',
      reason: 'R2_SCOPE_AND_FINAL_DISCLOSURE_OWNER_HOLD',
      publicDisclosureAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toContain(PRIVATE);
    expect(JSON.stringify(result)).not.toContain(SUBJECT);
    expect(JSON.stringify(result)).not.toContain(READING);
  });

  it.each([
    ['revoke during generation', { revokedAtT2: true }],
    ['Thread revision drift', { threadDriftAtT2: true }],
    ['Official source hash drift', { sourceDriftAtT2: true }],
    ['approved Product policy revision drift', { policyDriftAtT2: true }],
    ['reused T1 snapshot at T2', { reuseT1: true }],
    ['invalid T2 DB clock', { badT2Clock: true }],
    ['different canonical Subject at T2', { differentSubjectAtT2: true }],
  ] as const)('fails closed on %s without returning private output', async (_name, options) => {
    const f = fixture(options);
    await expect(runOfficialReaderHeldT1T2PreflightV1(f.input))
      .rejects.toMatchObject({ code: 'FINAL_DISCLOSURE_UNAVAILABLE' });
    expect(f.generatePrivate).toHaveBeenCalledTimes(1);
    expect(f.events).toContain('rollback:2');
    expect(f.events).toContain('release:2');
    expect(f.events).not.toContain('commit:2');
  });

  it('sanitizes generation failure and never starts T2', async () => {
    const f = fixture({ generationFails: true });
    await expect(runOfficialReaderHeldT1T2PreflightV1(f.input))
      .rejects.toEqual(new OfficialReaderHeldPreflightErrorV1());
    expect(f.events).not.toContain('connect:2');
    expect(f.events).toContain('release:1');
  });
});
