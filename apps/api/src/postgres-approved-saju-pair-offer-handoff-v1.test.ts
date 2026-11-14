import { describe, expect, it, vi } from 'vitest';
import { inspectApprovedSajuPairSourceV1, verifyApprovedSajuPreparedPairIssueV1 } from './postgres-approved-saju-issuance-v1.js';
import type { createSajuT10ProductionPairIssueSourceV1 } from './saju-t10-production-pair-issue-source-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const PURCHASE = '22222222-2222-4222-8222-222222222222';
const REVISION = '33333333-3333-4333-8333-333333333333';
const TARGET_REVISION = '44444444-4444-4444-8444-444444444444';
const TARGET_PERSON = '55555555-5555-4555-8555-555555555555';
type Offer = 'first-counterpart' | 'additional-counterpart' | 'relationship-plus-first';

function scope(offer: Offer) {
  return {
    admissionHash: 'a'.repeat(64),
    approvedOfferId: offer,
    counterpartOrder: offer === 'additional-counterpart' ? 'additional' : 'first',
    targetPersonId: TARGET_PERSON,
    useApprovalRef: 'approved-consent-ref',
    birthRevisionId: REVISION,
    targetBirthRevisionId: TARGET_REVISION,
    sourceBirthInputHash: 'sha256:v1:' + 'b'.repeat(64),
    targetBirthInputHash: 'sha256:v1:' + 'c'.repeat(64),
    periodReferenceDateTime: null,
    releaseRef: 't10-release-candidate',
    birth: {
      calendarType: 'solar', birthDate: '1990-05-15', birthTime: '14:30',
      timeKnown: true, isLeapMonth: false, sex: 'female',
    },
    targetBirth: {
      calendarType: 'solar', birthDate: '1996-06-05', birthTime: '09:30',
      timeKnown: true, isLeapMonth: false, sex: 'male',
    },
  };
}

function pool(initial: ReturnType<typeof scope>, changed = initial, admitted = true) {
  let pairReads = 0;
  const actions: string[] = [];
  const database: PostgresSubjectPoolV1 = {
    async connect() {
      return {
        async query<Row>(sql: string, args?: readonly unknown[]) {
          actions.push(sql.trim().split(/\s+/u).slice(0, 4).join(' '));
          if (sql.includes('begin_member_subject_context_v1')) {
            return { rows: [{ subjectId: SUBJECT, subjectKind: 'member' }] as unknown as Row[] };
          }
          if (sql.includes('admit_approved_saju_issue_attempt_v1')) {
            expect(args?.[2]).toBe('compatibility');
            expect(args?.[8]).toBe(TARGET_REVISION);
            return { rows: [{ admitted }] as unknown as Row[] };
          }
          if (sql.includes('qry_approved_saju_pair_issue_scope_v1')) {
            expect(args).toEqual([SUBJECT, PURCHASE]);
            pairReads += 1;
            return { rows: [{ scope: pairReads === 1 ? initial : changed }] as unknown as Row[] };
          }
          return { rows: [] as Row[] };
        },
        release() {},
      };
    },
  };
  return { database, actions, reads: () => pairReads };
}

describe('purchase-locked pair source review for 3 approved offers', () => {
  it.each([
    'first-counterpart', 'additional-counterpart', 'relationship-plus-first',
  ] as const)('keeps the exact %s offer and target during a protected review', async offer => {
    const a = pool(scope(offer));
    const source = vi.fn(async (_request: unknown) => ({
      lifecycle: 'internal_preview_only', maySell: false, mayPersist: false,
    }));
    const result = await inspectApprovedSajuPairSourceV1({
      pool: a.database,
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: SUBJECT },
      subjectId: SUBJECT,
      purchaseIntentId: PURCHASE,
      inspectSource: source,
    });
    expect(a.reads()).toBe(2);
    expect(source).toHaveBeenCalledTimes(1);
    expect(source.mock.calls[0]?.[0]).toEqual({
      birth: { calendarType: 'solar', date: '1990-05-15', time: '14:30', sex: 'female' },
      partnerBirth: { calendarType: 'solar', date: '1996-06-05', time: '09:30', sex: 'male' },
    });
    expect(result).toMatchObject({
      state: 'held', canSell: false,
      paidComparison: {
        offerId: offer,
        counterpartOrder: offer === 'additional-counterpart' ? 'additional' : 'first',
        targetPersonId: TARGET_PERSON,
        useApprovalRef: 'approved-consent-ref',
        authorizedForIssue: false,
      },
    });
    expect(result?.paidComparison.requiredComponents).toEqual(
      offer === 'relationship-plus-first' ? ['relationship', 'compatibility'] : ['compatibility'],
    );
    expect(a.actions.some(text => text.includes('SET LOCAL ROLE'))).toBe(true);
    expect(a.actions.filter(text => text === 'COMMIT')).toHaveLength(2);
  });

  it.each([
    ['offer substitution', (s: ReturnType<typeof scope>) =>
      ({ ...s, approvedOfferId: 'relationship-plus-first' as Offer })],
    ['consent changed', (s: ReturnType<typeof scope>) =>
      ({ ...s, useApprovalRef: 'different-approval' })],
    ['target revision changed', (s: ReturnType<typeof scope>) =>
      ({ ...s, targetBirthRevisionId: '66666666-6666-4666-8666-666666666666' })],
    ['release changed', (s: ReturnType<typeof scope>) =>
      ({ ...s, releaseRef: 'changed-release' })],
  ] as const)('denies %s after the source call even when the first query was valid',
    async (_name, transform) => {
      const original = scope('first-counterpart');
      const a = pool(original, transform(original));
      const result = await inspectApprovedSajuPairSourceV1({
        pool: a.database,
        verifiedEvidence: { kind: 'member', verifiedAuthUserId: SUBJECT },
        subjectId: SUBJECT,
        purchaseIntentId: PURCHASE,
        inspectSource: async () => ({ preview: true }),
      });
      expect(a.reads()).toBe(2);
      expect(result).toBeNull();
    },
  );

  it('never reads a protected pair for an unverified subject', async () => {
    const a = pool(scope('first-counterpart'));
    const source = vi.fn(async () => ({ preview: true }));
    const result = await inspectApprovedSajuPairSourceV1({
      pool: a.database,
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: SUBJECT },
      subjectId: TARGET_PERSON,
      purchaseIntentId: PURCHASE,
      inspectSource: source,
    });
    expect(result).toBeNull();
    expect(source).not.toHaveBeenCalled();
    expect(a.reads()).toBe(0);
  });
});

describe('prepared pair official source checks current purchase and consent both ways', () => {
  const READING = '66666666-6666-4666-8666-666666666666';
  const SESSION = '77777777-7777-4777-8777-777777777777';
  const ATTEMPT = '88888888-8888-4888-8888-888888888888';
  const sourceFixture = () => {
    const issuePreparedPair = vi.fn(async () => ({
      state: 'production_pair_source_verified' as const,
      responseHash: 'sha256:v1:' + 'a'.repeat(64),
      proofFingerprint: 'sha256:v1:' + 'b'.repeat(64),
      materialHash: 'c'.repeat(64), body: {}, proof: {},
    }));
    const source = { issuePreparedPair } as unknown as
      ReturnType<typeof createSajuT10ProductionPairIssueSourceV1>;
    return { source, issuePreparedPair };
  };
  const input = (database: PostgresSubjectPoolV1,
    source: ReturnType<typeof createSajuT10ProductionPairIssueSourceV1>) => ({
    pool: database, source,
    verifiedEvidence: { kind: 'member' as const, verifiedAuthUserId: SUBJECT },
    subjectId: SUBJECT, purchaseIntentId: PURCHASE,
    readingId: READING, readingSessionId: SESSION, executionAttemptId: ATTEMPT,
    expectedReleaseRef: 't10-release-candidate',
  });

  it.each(['first-counterpart', 'additional-counterpart', 'relationship-plus-first'] as const)(
    'admits only an already running pair attempt for %s', async offer => {
      const a = pool(scope(offer));
      const b = sourceFixture();
      const verified = await verifyApprovedSajuPreparedPairIssueV1(input(a.database, b.source));
      expect(verified?.state).toBe('source_verified_not_committed');
      expect(a.reads()).toBe(2);
      expect(b.issuePreparedPair).toHaveBeenCalledTimes(1);
      expect(b.issuePreparedPair.mock.calls[0]?.[0]).toMatchObject({
        purchaseIntentId: PURCHASE, executionAttemptId: ATTEMPT, readingId: READING,
        scope: { paidComparison: { offerId: offer, useApprovalRef: 'approved-consent-ref' } },
      });
    },
  );

  it('does not call Production Source unless the actual DB attempt is admitted', async () => {
    const a = pool(scope('first-counterpart'), scope('first-counterpart'), false);
    const b = sourceFixture();
    expect(await verifyApprovedSajuPreparedPairIssueV1(input(a.database, b.source))).toBeNull();
    expect(b.issuePreparedPair).not.toHaveBeenCalled();
  });

  it('refuses an official source after consent or counterpart drift', async () => {
    const before = scope('first-counterpart');
    const a = pool(before, { ...before, useApprovalRef: 'revoked-or-replaced-consent' });
    const b = sourceFixture();
    expect(await verifyApprovedSajuPreparedPairIssueV1(input(a.database, b.source))).toBeNull();
    expect(b.issuePreparedPair).toHaveBeenCalledTimes(1);
  });
});
