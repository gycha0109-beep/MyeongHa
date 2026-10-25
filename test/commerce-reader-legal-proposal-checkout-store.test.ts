import { describe, expect, it, vi } from 'vitest';
import {
  createCommerceReaderLegalProposalCheckoutNoticeStoreV1,
  READER_LEGAL_PROPOSED_CHECKOUT_NOTICE_SQL_V1,
} from '../apps/api/src/commerce-reader-legal-proposal-checkout-notice-store-v1.js';
import {
  reviewOfficialReaderWithdrawalFromOriginalLedgerV1,
} from '../apps/api/src/commerce-reader-postgres-checkout-notice-authority-v1.js';
import type {
  PostgresSubjectExecutionScopeV1,
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const INTENT='22222222-2222-4222-8222-222222222222';
const GRANT='33333333-3333-4333-8333-333333333333';
const BODY='44444444-4444-4444-8444-444444444444';
const ITEM='reader-original-capability-item';
const SPEC='reader-product-v1';

function notice() {
  return {
    purchaseIntentId: INTENT,
    pinnedCapabilityItemKey: ITEM,
    productSpecVersion: SPEC,
    noticeRevision: 'checkout-notice-rev-1',
    previewOrInformationRevision: 'sample-rev-1',
    snapshotRecordedAt: '2026-10-26T00:01:00Z',
    noticePresentedAt: '2026-10-26T00:02:00Z',
    acknowledgedAt: '2026-10-26T00:03:00Z',
  };
}

function fixture(input: {
  missingNotice?: boolean;
  noticeOverride?: Record<string, unknown>;
  missingOriginal?: boolean;
  subjectKind?: 'guest' | 'member';
} = {}) {
  const query=vi.fn(async (sql: string, args?: readonly unknown[]) => {
    if (sql.includes('internal_qry_official_reader_withdrawal_delivery_state_v2')
        && sql.includes('delivery_attempt_count')) {
      expect(args).toEqual([SUBJECT,INTENT,GRANT,BODY]);
      return { rows: input.missingOriginal?[]:[{
        purchaseIntentId:INTENT,unitId:GRANT,productSpecVersion:SPEC,
        s5CommittedAt:'2026-10-26T00:05:00Z',
        responsePreparedAt:'2026-10-26T00:06:00Z',
        clientAcknowledgedAt:'2026-10-26T00:07:00Z',
        deliveryAttemptCount:'1',acknowledgedAttemptCount:'1',
        originalReceiptStatus:'verified',
      }] };
    }
    if (sql.includes('ORIGINAL_CHECKOUT_UNIT_SQL_V1') ||
        (sql.includes('internal_qry_official_reader_withdrawal_delivery_state_v2')
        && sql.includes('first_attempt.created_at'))) {
      expect(args).toEqual([SUBJECT,INTENT,GRANT,BODY]);
      return { rows: input.missingOriginal?[]:[{
        purchaseIntentId:INTENT,
        originatingGrantId:GRANT,
        pinnedCapabilityItemKey:ITEM,
        originalPaymentAttemptCreatedAt:'2026-10-26T00:04:00Z',
        originalPurchaseIntentCreatedAt:'2026-10-26T00:00:00Z',
        s5CommittedAt:'2026-10-26T00:05:00Z',
      }] };
    }
    if (sql === READER_LEGAL_PROPOSED_CHECKOUT_NOTICE_SQL_V1) {
      expect(args).toEqual([SUBJECT,INTENT,ITEM,SPEC]);
      return { rows: input.missingNotice?[]:[{
        ...notice(), ...input.noticeOverride,
      }] };
    }
    throw new Error('Unexpected Checkout proposal query');
  });
  const scope = {
    resolvedSubject:{subjectId:SUBJECT,subjectKind:input.subjectKind??'member'},
    client:{query} as unknown as PostgresTransactionQueryV1,
  } as PostgresSubjectExecutionScopeV1;
  return {scope,query};
}

describe('Owner-held Legal 1743 original-Checkout notice reader', () => {
  it('uses only the original Purchase Intent + pre-Grant capability item as the proposed Notice key', () => {
    expect(READER_LEGAL_PROPOSED_CHECKOUT_NOTICE_SQL_V1)
      .toContain("notice.unit_id='standard-reading:' || selection.reader_character_id");
    expect(READER_LEGAL_PROPOSED_CHECKOUT_NOTICE_SQL_V1)
      .toContain('item.item_key=$3::text');
    expect(READER_LEGAL_PROPOSED_CHECKOUT_NOTICE_SQL_V1)
      .toContain('notice.product_spec_version=$4::text');
    expect(READER_LEGAL_PROPOSED_CHECKOUT_NOTICE_SQL_V1)
      .not.toMatch(/\b(?:update|insert|delete|grant|revoke)\b/iu);
    expect(READER_LEGAL_PROPOSED_CHECKOUT_NOTICE_SQL_V1)
      .not.toContain('source_receipt_id=');
  });

  it('reads an approved-shape original notice only from an authenticated Subject SQL scope', async () => {
    const f=fixture();
    const store=createCommerceReaderLegalProposalCheckoutNoticeStoreV1({scope:f.scope});
    const record=await store.readOriginalNotice({
      purchaseIntentId:INTENT,pinnedCapabilityItemKey:ITEM,productSpecVersion:SPEC,
    });
    expect(record).toMatchObject({
      authority:'checkout_owner_immutable_prepayment_record_v1',
      purchaseIntentId:INTENT,
      pinnedCapabilityItemKey:ITEM,
      productSpecVersion:SPEC,
      acknowledged:true,
      noticeRevision:'checkout-notice-rev-1',
      acknowledgedAt:'2026-10-26T00:03:00.000Z',
    });
    expect(f.query).toHaveBeenCalledTimes(1);
  });

  it('connects 2250 S7 original Grant -> Commerce original Capability Item -> proposed checkout notice only for manual review', async () => {
    const f=fixture();
    const output=await reviewOfficialReaderWithdrawalFromOriginalLedgerV1({
      scope:f.scope,purchaseIntentId:INTENT,originatingGrantId:GRANT,bodyId:BODY,
      claim:{purchaseIntentId:INTENT,unitId:GRANT,reason:'change_of_mind'},
      immutableCheckoutNoticeStore:createCommerceReaderLegalProposalCheckoutNoticeStoreV1({
        scope:f.scope,
      }),
    });
    expect(output.checkoutNoticeEvidenceState).toBe('attested_original_checkout_notice');
    expect(output.timeline.retainedDeliveryEvidenceState)
      .toBe('client_ack_recorded_delivery_unproven');
    expect(output.timeline.consumerDeliveryProven).toBe(false);
    expect(output.timeline.legallyProvenDeliveredAt).toBeNull();
    expect(output.review.classification).toBe('not_proven_delivered');
    expect(output.refundAuthorized).toBe(false);
    expect(output.entitlementMutationAuthorized).toBe(false);
    expect(f.query).toHaveBeenCalledTimes(3);
  });

  it.each([
    {title:'missing table rows', settings:{missingNotice:true}},
    {title:'another original Purchase', settings:{noticeOverride:{purchaseIntentId:BODY}}},
    {title:'another pinned Item', settings:{noticeOverride:{pinnedCapabilityItemKey:'sibling-item'}}},
    {title:'different Product Spec', settings:{noticeOverride:{productSpecVersion:'sibling-v1'}}},
    {title:'no customer acknowledgement', settings:{noticeOverride:{acknowledgedAt:null}}},
    {title:'later-than-ack presented time', settings:{noticeOverride:{noticePresentedAt:'2026-10-26T00:04:00Z'}}},
  ])('returns no notice for $title without manufacturing purchase delivery proof', async ({settings}) => {
    const f=fixture(settings);
    const output=await reviewOfficialReaderWithdrawalFromOriginalLedgerV1({
      scope:f.scope,purchaseIntentId:INTENT,originatingGrantId:GRANT,bodyId:BODY,
      claim:{purchaseIntentId:INTENT,unitId:GRANT,reason:'change_of_mind'},
      immutableCheckoutNoticeStore:createCommerceReaderLegalProposalCheckoutNoticeStoreV1({
        scope:f.scope,
      }),
    });
    expect(output.checkoutNoticeEvidenceState).toBe('missing_or_unverifiable');
    expect(output.review.classification).toBe('not_proven_delivered');
    expect(output.timeline.legallyProvenDeliveredAt).toBeNull();
  });

  it('denies a guest, absent original S5 lineage, invalid selectors and proposed-store database failures', async () => {
    const guest=fixture({subjectKind:'guest'});
    const store=createCommerceReaderLegalProposalCheckoutNoticeStoreV1({scope:guest.scope});
    expect(await store.readOriginalNotice({
      purchaseIntentId:INTENT,pinnedCapabilityItemKey:ITEM,productSpecVersion:SPEC,
    })).toBeNull();
    expect(guest.query).not.toHaveBeenCalled();

    const missing=fixture({missingOriginal:true});
    const outputPromise=reviewOfficialReaderWithdrawalFromOriginalLedgerV1({
      scope:missing.scope,purchaseIntentId:INTENT,originatingGrantId:GRANT,bodyId:BODY,
      claim:{purchaseIntentId:INTENT,unitId:GRANT,reason:'change_of_mind'},
      immutableCheckoutNoticeStore:createCommerceReaderLegalProposalCheckoutNoticeStoreV1({
        scope:missing.scope,
      }),
    });
    await expect(outputPromise).rejects.toMatchObject({
      code:'COMMERCE_READER_WITHDRAWAL_EVIDENCE_UNAVAILABLE',
    });
    expect(missing.query).toHaveBeenCalledTimes(1);

    const fail=fixture();
    const dbError=vi.fn(async () => {throw new Error('proposal not installed');});
    const brokenScope={
      ...fail.scope,
      client:{ query:dbError } as unknown as PostgresTransactionQueryV1,
    } as PostgresSubjectExecutionScopeV1;
    const absent=await createCommerceReaderLegalProposalCheckoutNoticeStoreV1({
      scope:brokenScope,
    }).readOriginalNotice({
      purchaseIntentId:INTENT,pinnedCapabilityItemKey:ITEM,productSpecVersion:SPEC,
    });
    expect(absent).toBeNull();
  });
});
