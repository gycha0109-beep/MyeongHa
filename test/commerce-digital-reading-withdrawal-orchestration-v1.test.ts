import { describe, expect, it, vi } from 'vitest';
import {
  OWNED_DIGITAL_READING_WITHDRAWAL_REVIEW_V1,
  reviewOwnedDigitalReadingWithdrawalV1,
  type OwnedDigitalReadingReviewSnapshotPortV1,
} from '../apps/api/src/commerce-digital-reading-withdrawal-orchestration-v1.js';
import type { PostgresSubjectPoolV1, PostgresSubjectConnectionV1 } from '../apps/api/src/postgres-subject-execution.js';

const AUTH_USER = '11111111-1111-4111-8111-111111111111';
const GUEST_HASH = 'myeongha-guest-bearer-hmac-sha256-v1:' + 'a'.repeat(64);
const SUBJECT = '22222222-2222-4222-8222-222222222222';
const PURCHASE_ID = '33333333-3333-4333-8333-333333333333';
const UNIT = 'reading-a-seyeon-once';
const productSpecVersion = 'synthetic-revision-v1';
const fields = { purchaseIntentId: PURCHASE_ID, unitId: UNIT, productSpecVersion };
const evidence = {
  purchase: { ...fields, status: 'verified', purchasedAt: '2026-10-12T01:00:00.000Z' },
  notice: {
    ...fields, authority: 'server_checkout_snapshot',
    noticeRevision: 'notice-v1', previewOrInformationRevision: 'sample-v1',
    safeguardMethod: 'sample', safeguardProvidedAt: '2026-10-12T00:58:10.000Z',
    displayedAt: '2026-10-12T00:58:00.000Z',
    acknowledged: true, acknowledgedAt: '2026-10-12T00:59:00.000Z',
  },
  delivery: {
    ...fields, authority: 'server_delivery_record',
    state: 'DELIVERED_PROVABLE', deliveredAt: '2026-10-12T02:00:00.000Z',
  },
};

function fakePool(input: { missingSubject?: boolean; error?: Error; guest?: boolean } = {}) {
  const log: string[] = [];
  const release = vi.fn();
  const connection: PostgresSubjectConnectionV1 = {
    async query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      log.push(text);
      if (text.includes('begin_member_subject_context_v1')) {
        expect(values).toEqual([AUTH_USER]);
        if (input.missingSubject) {
          throw Object.assign(new Error('subject not found'), {
            constraint: 'member_subject_context_unresolved',
          });
        }
        return { rows: [{ subjectId: SUBJECT, subjectKind: 'member' } as Row] };
      }
      if (text.includes('begin_guest_subject_context_v1')) {
        expect(values).toEqual([GUEST_HASH]);
        return { rows: [{ subjectId: SUBJECT, subjectKind: 'guest' } as Row] };
      }
      if (text.includes('assert_myeongha_subject_context_v1')) {
        expect(values).toEqual([SUBJECT]);
      }
      if (input.error !== undefined && text === 'COMMIT') throw input.error;
      return { rows: [] as readonly Row[] };
    },
    release,
  };
  const pool: PostgresSubjectPoolV1 = { connect: async () => connection };
  return { pool, log, release };
}

function invoke(port: OwnedDigitalReadingReviewSnapshotPortV1, pool: PostgresSubjectPoolV1, extras = {}) {
  return reviewOwnedDigitalReadingWithdrawalV1({
    pool,
    verifiedEvidence: { kind: 'member', verifiedAuthUserId: AUTH_USER },
    purchaseIntentId: PURCHASE_ID,
    unitId: UNIT,
    reason: 'change_of_mind',
    evidencePort: port,
    ...extras,
  });
}

describe('subject-owned internal digital Reading withdrawal evidence orchestration', () => {
  it('resolves the authenticated Subject and loads one server-owned DB snapshot before review', async () => {
    const { pool, log, release } = fakePool();
    const loadSnapshot = vi.fn(async ({ scope, purchaseIntentId, unitId }: Parameters<OwnedDigitalReadingReviewSnapshotPortV1['loadSnapshot']>[0]) => {
      expect(scope.resolvedSubject).toEqual({ subjectId: SUBJECT, subjectKind: 'member' });
      expect(purchaseIntentId).toBe(PURCHASE_ID);
      expect(unitId).toBe(UNIT);
      return evidence;
    });
    const review = await invoke({ loadSnapshot }, pool);
    expect(review).toEqual({
      classification: 'restriction_review_candidate',
      reason: 'DELIVERED_NOTICE_RECORDED',
      automaticDenialAuthorized: false,
      providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
    expect(loadSnapshot).toHaveBeenCalledOnce();
    expect(log).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('begin_member_subject_context_v1'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      'COMMIT',
    ]);
    expect(release).toHaveBeenCalledOnce();
    expect(JSON.stringify(review)).not.toContain(PURCHASE_ID);
    expect(OWNED_DIGITAL_READING_WITHDRAWAL_REVIEW_V1.publicRoute).toBeNull();
  });

  it('resolves a verified Guest rather than trusting a browser Subject ID', async () => {
    const { pool, log } = fakePool({ guest: true });
    const loadSnapshot = vi.fn(async ({ scope }: Parameters<OwnedDigitalReadingReviewSnapshotPortV1['loadSnapshot']>[0]) => {
      expect(scope.resolvedSubject).toEqual({ subjectId: SUBJECT, subjectKind: 'guest' });
      return evidence;
    });
    const result = await invoke({ loadSnapshot }, pool, {
      verifiedEvidence: { kind: 'guest', verifiedGuestTokenHash: GUEST_HASH },
      subjectId: 'client-other-subject',
    });
    expect(result.classification).toBe('restriction_review_candidate');
    expect(log.some(s => s.includes('begin_guest_subject_context_v1'))).toBe(true);
    expect(log.some(s => s.includes('begin_member_subject_context_v1'))).toBe(false);
  });

  it('ignores attempted caller-provided purchase, delivery and notice authority', async () => {
    const { pool } = fakePool();
    const loadSnapshot = vi.fn(async () => null);
    const result = await invoke({ loadSnapshot }, pool, {
      purchase: evidence.purchase,
      notice: evidence.notice,
      delivery: evidence.delivery,
      paid: true,
      readAt: '2026-10-12T02:00:00.000Z',
    });
    expect(result.classification).toBe('evidence_review_required');
    expect(result.automaticDenialAuthorized).toBe(false);
  });

  it('does not accept an unrelated product-unit delivery or notice', async () => {
    const { pool } = fakePool();
    const result = await invoke({
      loadSnapshot: async () => ({
        purchase: evidence.purchase,
        notice: { ...evidence.notice, unitId: 'reading-b' },
        delivery: evidence.delivery,
      }),
    }, pool);
    expect(result.classification).toBe('evidence_review_required');
  });

  it('rejects malformed purchase identity and reason before opening DB', async () => {
    const connect = vi.fn();
    const pool: PostgresSubjectPoolV1 = { connect };
    const port = { loadSnapshot: vi.fn() };
    await expect(invoke(port, pool, { purchaseIntentId: 'victim-supplied' }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(invoke(port, pool, { reason: 'always_refuse_refund' }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(connect).not.toHaveBeenCalled();
    expect(port.loadSnapshot).not.toHaveBeenCalled();
  });

  it('does not load purchase details when the current Member cannot resolve', async () => {
    const { pool, log } = fakePool({ missingSubject: true });
    const port = { loadSnapshot: vi.fn() };
    await expect(invoke(port, pool)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(port.loadSnapshot).not.toHaveBeenCalled();
    expect(log.at(-1)).toBe('ROLLBACK');
  });

  it('rolls back rather than classifying fabricated success on evidence authority failure', async () => {
    const { pool, log } = fakePool();
    const error = new Error('private delivery ledger unavailable');
    const loadSnapshot = vi.fn(async () => { throw error; });
    await expect(invoke({ loadSnapshot }, pool)).rejects.toBe(error);
    expect(log.at(-1)).toBe('ROLLBACK');
  });

  it('continues to prioritize unprovided/defective claims without a delivery snapshot', async () => {
    const { pool } = fakePool();
    const port = { loadSnapshot: async () => ({
      purchase: evidence.purchase, notice: null, delivery: null,
    }) };
    const result = await invoke(port, pool, { reason: 'delivery_failed' });
    expect(result.classification).toBe('statutory_exception_review');
    expect(result.providerRefundAuthorized).toBe(false);
  });
});
