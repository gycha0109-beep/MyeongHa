import { describe, expect, it, vi } from 'vitest';
import {
  recordInternalDigitalReadingEvidenceV1,
} from '../apps/api/src/postgres-digital-reading-withdrawal-evidence-v1.js';
import {
  reviewOwnedDigitalReadingWithdrawalFromPostgresV1,
} from '../apps/api/src/commerce-digital-reading-withdrawal-orchestration-v1.js';
import type {
  PostgresSubjectPoolV1, PostgresSubjectConnectionV1,
} from '../apps/api/src/postgres-subject-execution.js';

const AUTH = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const ORDER = '33333333-3333-4333-8333-333333333333';
const OTHER_ORDER = '44444444-4444-4444-8444-444444444444';
const UNIT = 'standard-reading:baekheon';
const SPEC = 'v1';
const DISPLAYED = '2026-10-25T00:00:00.000Z';
const ACK = '2026-10-25T00:01:00.000Z';
const PURCHASED = '2026-10-25T00:02:00.000Z';
const DELIVERED = '2026-10-25T00:03:00.000Z';
const DIGEST = 'f'.repeat(64);

type Events = {
  notice: boolean;
  acknowledgement: boolean;
  verifiedReceipt: boolean;
  delivery: boolean;
  generatedPrivately: boolean;
};

/**
 * Executable same-process E2E of real TypeScript producer/read/orchestration.
 * SQL is simulated here. The separate disposable-PG17 case proves actual SQL
 * constraints/permissions and must be GREEN before production activation.
 */
function fixture() {
  const state: Events = {
    notice: false, acknowledgement: false, verifiedReceipt: false,
    delivery: false, generatedPrivately: false,
  };
  const sql: string[] = [];
  const release = vi.fn();
  let role = '';
  const connection: PostgresSubjectConnectionV1 = {
    async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
      sql.push(text);
      if (text === 'BEGIN') {
        role = '';
        return { rows: [] as readonly Row[] };
      }
      if (text.startsWith('SET LOCAL ROLE ')) {
        role = text.slice('SET LOCAL ROLE '.length);
        return { rows: [] as readonly Row[] };
      }
      if (text === 'COMMIT' || text === 'ROLLBACK') {
        role = '';
        return { rows: [] as readonly Row[] };
      }
      if (text.includes('begin_member_subject_context_v1')) {
        expect(role).toBe('myeongha_api_executor');
        expect(values).toEqual([AUTH]);
        return { rows: [{ subjectId: OWNER, subjectKind: 'member' } as Row] };
      }
      if (text.includes('assert_myeongha_subject_context_v1')) {
        expect(values).toEqual([OWNER]);
        return { rows: [] as readonly Row[] };
      }

      if (text.includes('cmd_record_digital_reading_')) {
        expect(role).toBe('myeongha_commerce_internal_executor');
        const [subjectId, purchaseIntentId, unitId] = values;
        let accepted = subjectId === OWNER && purchaseIntentId === ORDER && unitId === UNIT;
        if (text.includes('checkout_display')) {
          accepted &&= !state.notice && !state.verifiedReceipt;
          if (accepted) state.notice = true;
        } else if (text.includes('checkout_ack')) {
          accepted &&= state.notice && !state.acknowledgement &&
            !state.verifiedReceipt && values[3] === 'notice-v1';
          if (accepted) state.acknowledgement = true;
        } else if (text.includes('delivery_v1')) {
          accepted &&= state.verifiedReceipt && !state.delivery && values[3] === DIGEST;
          if (accepted) state.delivery = true;
        } else throw new Error('Unexpected Commerce evidence SQL');
        return { rows: [{ accepted } as Row] };
      }
      if (text.includes('qry_owned_digital_reading_withdrawal_snapshot_v1')) {
        expect(role).toBe('myeongha_api_executor');
        const [subjectId, purchaseIntentId, unitId] = values;
        if (subjectId !== OWNER || purchaseIntentId !== ORDER || unitId !== UNIT) {
          return { rows: [] as readonly Row[] };
        }
        const scope = { purchaseIntentId: ORDER, unitId: UNIT, productSpecVersion: SPEC };
        return { rows: [{
          purchase: state.verifiedReceipt
            ? { ...scope, status: 'verified', purchasedAt: PURCHASED } : null,
          notice: state.notice ? {
            ...scope, authority: 'server_checkout_snapshot',
            noticeRevision: 'notice-v1', previewOrInformationRevision: 'sample-v1',
            safeguardMethod: 'sample', safeguardProvidedAt: DISPLAYED,
            acknowledged: state.acknowledgement, displayedAt: DISPLAYED,
            acknowledgedAt: state.acknowledgement ? ACK : null,
          } : null,
          delivery: state.delivery ? {
            ...scope, authority: 'server_delivery_record',
            state: 'DELIVERED_PROVABLE', deliveredAt: DELIVERED,
          } : null,
        } as Row] };
      }
      throw new Error('Unknown SQL in legal Commerce E2E: ' + text);
    },
    release,
  };
  const pool: PostgresSubjectPoolV1 = { connect: async () => connection };

  const record = (event: 'checkout_displayed' | 'checkout_acknowledged' | 'content_delivered',
    extra: Readonly<Record<string, unknown>> = {}) =>
    recordInternalDigitalReadingEvidenceV1({
      pool, event, subjectId: OWNER, purchaseIntentId: ORDER, unitId: UNIT,
      noticeRevision: 'notice-v1',
      previewOrInformationRevision: 'sample-v1',
      safeguardMethod: 'sample', deliveryEventDigest: DIGEST, ...extra,
    });

  const review = (extra: Readonly<Record<string, unknown>> = {}) =>
    reviewOwnedDigitalReadingWithdrawalFromPostgresV1({
      pool, verifiedEvidence: { kind: 'member', verifiedAuthUserId: AUTH },
      purchaseIntentId: ORDER, unitId: UNIT, reason: 'change_of_mind', ...extra,
    });
  return { state, sql, release, record, review };
}

describe('L4 actual internal Commerce checkout → delivery → withdrawal E2E', () => {
  it('links one owned purchase across checkout disclosure, explicit acknowledgement, payment and actual delivery', async () => {
    const e2e = fixture();
    expect(await e2e.record('checkout_displayed')).toBe(true);
    expect(await e2e.record('checkout_acknowledged')).toBe(true);
    expect((await e2e.review()).classification).toBe('evidence_review_required');

    // Simulates only the independently authenticated provider receipt (no PSP call).
    e2e.state.verifiedReceipt = true;
    expect((await e2e.review()).classification).toBe('evidence_review_required');

    // Private T2 rendering/commit does not deliver any content to the user.
    e2e.state.generatedPrivately = true;
    expect((await e2e.review()).classification).toBe('evidence_review_required');

    expect(await e2e.record('content_delivered')).toBe(true);
    const completed = await e2e.review();
    expect(completed).toEqual({
      classification: 'restriction_review_candidate',
      reason: 'DELIVERED_NOTICE_RECORDED',
      automaticDenialAuthorized: false,
      providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
    expect(e2e.sql.some(x => x.includes('cmd_record_digital_reading_checkout_display_v1'))).toBe(true);
    expect(e2e.sql.some(x => x.includes('cmd_record_digital_reading_checkout_ack_v1'))).toBe(true);
    expect(e2e.sql.some(x => x.includes('cmd_record_digital_reading_delivery_v1'))).toBe(true);
    expect(e2e.sql.some(x => x.includes('qry_owned_digital_reading_withdrawal_snapshot_v1'))).toBe(true);
    expect(e2e.sql.filter(x => x === 'COMMIT').length).toBe(7);
    expect(e2e.release).toHaveBeenCalledTimes(7);
  });

  it('rejects cross-owner writes and reads; no unauthorized refund decision', async () => {
    const e2e = fixture();
    expect(await e2e.record('checkout_displayed', { subjectId: AUTH })).toBe(false);
    expect(await e2e.record('checkout_displayed', { purchaseIntentId: OTHER_ORDER })).toBe(false);
    const other = await e2e.review({ purchaseIntentId: OTHER_ORDER });
    expect(other.classification).toBe('evidence_review_required');
    expect(other.providerRefundAuthorized).toBe(false);
    expect(e2e.state.notice).toBe(false);
  });

  it('does not use a missing notice acknowledgement to restrict a withdrawal', async () => {
    const e2e = fixture();
    expect(await e2e.record('checkout_displayed')).toBe(true);
    e2e.state.verifiedReceipt = true;
    expect(await e2e.record('content_delivered')).toBe(true);
    expect((await e2e.review()).classification).toBe('evidence_review_required');
  });

  it('blocks delivery before verified payment; duplicates never create a second event', async () => {
    const e2e = fixture();
    expect(await e2e.record('content_delivered')).toBe(false);
    expect(await e2e.record('checkout_displayed')).toBe(true);
    expect(await e2e.record('checkout_displayed')).toBe(false);
    expect(await e2e.record('checkout_acknowledged')).toBe(true);
    expect(await e2e.record('checkout_acknowledged')).toBe(false);
    e2e.state.verifiedReceipt = true;
    expect(await e2e.record('content_delivered')).toBe(true);
    expect(await e2e.record('content_delivered')).toBe(false);
  });

  it('never denies not-provided/defective/partially delivered claims, even if delivered', async () => {
    const e2e = fixture();
    await e2e.record('checkout_displayed');
    await e2e.record('checkout_acknowledged');
    e2e.state.verifiedReceipt = true;
    await e2e.record('content_delivered');
    for (const reason of ['not_provided','defect','duplicate_charge','delivery_failed']) {
      const result = await e2e.review({ reason });
      expect(result.classification).toBe('statutory_exception_review');
      expect(result.automaticDenialAuthorized).toBe(false);
    }
    expect((await e2e.review({ reason: 'unprovided_separable_part' })).classification)
      .toBe('separable_part_review');
  });
});
