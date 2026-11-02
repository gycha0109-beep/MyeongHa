import { describe, expect, it, vi } from 'vitest';
import {
  createPostgresDigitalReadingWithdrawalEvidencePrivateV1,
  POSTGRES_DIGITAL_READING_WITHDRAWAL_EVIDENCE_PRIVATE_V1,
} from '../apps/api/src/postgres-digital-reading-withdrawal-evidence-private-v1.js';
import { prepareDigitalReadingWithdrawalReviewV1 } from
  '../apps/api/src/commerce-digital-reading-withdrawal-review-preflight-v1.js';
import type { PostgresTransactionQueryV1 } from
  '../apps/api/src/postgres-subject-execution.js';

const SUBJECT = '00000000-0000-4000-8000-000000000001';
const PURCHASE = '00000000-0000-4000-8000-000000000002';
const UNIT = '00000000-0000-4000-8000-000000000003';
const SPEC = 'standard-v1';
const ROW = Object.freeze({
  subjectId: SUBJECT,
  purchaseIntentId: PURCHASE,
  unitId: UNIT,
  productSpecVersion: SPEC,
});
const NOTICE = Object.freeze({
  purchaseIntentId: PURCHASE,
  unitId: UNIT,
  productSpecVersion: SPEC,
  noticeRevision: 'approved_notice_v1',
  previewOrInformationRevision: 'approved_preview_v1',
});

function setup(input: {
  purchaseRows?: readonly unknown[];
  noticeRows?: readonly unknown[];
  failOnQuery?: number;
} = {}) {
  const executed: string[] = [];
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    executed.push(sql);
    if (input.failOnQuery === executed.length) throw Error('private DB failure');
    if (values?.length !== 3 && values?.length !== 4) {
      throw Error('Unexpected SQL parameter count');
    }
    return {
      rows: executed.length === 1
        ? (input.purchaseRows ?? [ROW])
        : (input.noticeRows ?? [NOTICE]),
    };
  });
  const client: PostgresTransactionQueryV1 = { query: async <Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => ({ rows: (await query(sql, values)).rows as readonly Row[] }) };
  return { port: createPostgresDigitalReadingWithdrawalEvidencePrivateV1(client),
    query, executed };
}

describe('private PostgreSQL withdrawal evidence (never public)', () => {
  it('has no public route, DB mutation, delivery, or provider refund authority', () => {
    expect(POSTGRES_DIGITAL_READING_WITHDRAWAL_EVIDENCE_PRIVATE_V1).toEqual({
      intendedRole: 'trusted_operations_read_only',
      publicRouteMounted: false,
      writesPerformed: false,
      deliveryAuthorityAvailable: false,
      providerRefundEnabled: false,
    });
  });

  it('requires verified production PortOne receipt, canonical owner, exact Reader and paid money', async () => {
    const { port, query, executed } = setup();
    const purchased = await port.readOwnedVerifiedPurchase({
      subjectId: SUBJECT, purchaseIntentId: PURCHASE, unitId: UNIT,
    });
    expect(purchased).toEqual({ ...ROW, status: 'verified' });
    expect(Object.isFrozen(purchased)).toBe(true);
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.any(String), [PURCHASE, SUBJECT, UNIT]);
    expect(executed[0]).toContain("receipt.provider = 'portone_v2'");
    expect(executed[0]).toContain("receipt.environment = 'production'");
    expect(executed[0]).toContain("receipt.verification_status = 'verified'");
    expect(executed[0]).toContain('receipt.verified_amount_minor = pi.expected_amount_minor');
    expect(executed[0]).toContain('receipt.verified_currency = pi.expected_currency');
    expect(executed[0]).toContain('presentation.reader_character_id = selection.reader_character_id');
    expect(executed[0]).toContain('pi.subject_id = $2::uuid');
    expect(executed[0]).toContain('limit 2');
    expect(executed[0]).not.toMatch(/\b(insert|update|delete|grant|set role)\b/i);
  });

  it('consumes the existing notice reader with exact accepted purchase identity', async () => {
    const { port, query, executed } = setup();
    const purchase = await port.readOwnedVerifiedPurchase({
      subjectId: SUBJECT, purchaseIntentId: PURCHASE, unitId: UNIT,
    });
    expect(purchase).not.toBeNull();
    const notice = await port.readCheckoutNotice(purchase!);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [PURCHASE, SUBJECT, UNIT, SPEC]);
    expect(executed[1]).toContain('digital_reading_checkout_notice_acknowledgments_v1');
    expect(executed[1]).toContain("receipt.verification_status='verified'");
    expect(notice).toMatchObject({
      authority: 'server_checkout_snapshot',
      acknowledged: true,
      purchaseIntentId: PURCHASE,
      unitId: UNIT,
      productSpecVersion: SPEC,
    });
  });

  it('rejects client-shaped IDs without issuing an unsafe SQL cast or lookup', async () => {
    const { port, query } = setup();
    expect(await port.readOwnedVerifiedPurchase({
      subjectId: SUBJECT, purchaseIntentId: PURCHASE, unitId: 'legacy-not-uuid',
    })).toBeNull();
    expect(await port.readOwnedVerifiedPurchase({
      subjectId: SUBJECT, purchaseIntentId: 'other', unitId: UNIT,
    })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    [],
    [ROW, ROW],
    [{ ...ROW, subjectId: '00000000-0000-4000-8000-000000000099' }],
    [{ ...ROW, purchaseIntentId: '00000000-0000-4000-8000-000000000099' }],
    [{ ...ROW, unitId: '00000000-0000-4000-8000-000000000099' }],
    [{ ...ROW, productSpecVersion: ' ' }],
  ].map((rows) => [rows]))('does not admit ambiguous, missing, mismatched or invalid purchase authority: %j', async rows => {
    const { port } = setup({ purchaseRows: rows });
    expect(await port.readOwnedVerifiedPurchase({
      subjectId: SUBJECT, purchaseIntentId: PURCHASE, unitId: UNIT,
    })).toBeNull();
  });

  it('does not synthesize paid delivery from receipt or notice evidence', async () => {
    const { port } = setup();
    const purchase = await port.readOwnedVerifiedPurchase({
      subjectId: SUBJECT, purchaseIntentId: PURCHASE, unitId: UNIT,
    });
    expect(await port.readDeliveryEvidence(purchase!)).toBeNull();
  });

  it('entire preflight remains manual evidence review without durable delivery', async () => {
    const { port, query } = setup();
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT,
      request: { purchaseIntentId: PURCHASE, unitId: UNIT, reason: 'change_of_mind' },
      evidencePort: port,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      kind: 'manual_review_candidate',
      review: { classification: 'evidence_review_required' },
      requestRecorded: false, providerRefundAuthorized: false,
      entitlementMutationAuthorized: false,
    });
  });

  it('retains statutory-exception review even if delivery is unavailable', async () => {
    const { port } = setup({ noticeRows: [] });
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT,
      request: { purchaseIntentId: PURCHASE, unitId: UNIT, reason: 'duplicate_charge' },
      evidencePort: port,
    });
    expect(result).toMatchObject({
      kind: 'manual_review_candidate',
      review: { classification: 'statutory_exception_review' },
      providerRefundAuthorized: false,
    });
  });

  it.each([1,2])('fails closed on DB/notice authority error at query %i', async failOnQuery => {
    const { port } = setup({ failOnQuery });
    const result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: SUBJECT,
      request: { purchaseIntentId: PURCHASE, unitId: UNIT, reason: 'change_of_mind' },
      evidencePort: port,
    });
    expect(result).toEqual({
      kind: 'not_admitted', requestRecorded: false,
      providerRefundAuthorized: false, entitlementMutationAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toContain('private DB failure');
  });
});
