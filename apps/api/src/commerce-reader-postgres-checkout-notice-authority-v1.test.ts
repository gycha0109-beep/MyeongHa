import { describe, expect, it, vi } from 'vitest';
import {
  createCommerceReaderPostgresCheckoutNoticeAuthorityV1,
  type CommerceReaderImmutableCheckoutNoticeStoreV1,
} from './commerce-reader-postgres-checkout-notice-authority-v1.js';
import {
  reviewOfficialReaderPrivateWithdrawalEvidenceV1,
} from './commerce-reader-private-withdrawal-evidence-v1.js';
import type {
  PostgresSubjectExecutionScopeV1,
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const PURCHASE='22222222-2222-4222-8222-222222222222';
const GRANT='33333333-3333-4333-8333-333333333333';
const BODY='44444444-4444-4444-8444-444444444444';
const ITEM='original-reader-unit';
const VERSION='reader-reading-v1';
const unit={purchaseIntentId:PURCHASE,unitId:GRANT,productSpecVersion:VERSION};
const snapshot={
  authority:'checkout_owner_immutable_prepayment_record_v1' as const,
  purchaseIntentId:PURCHASE,
  pinnedCapabilityItemKey:ITEM,
  productSpecVersion:VERSION,
  noticeRevision:'notice-rev-1',
  previewOrInformationRevision:'preview-rev-1',
  snapshotRecordedAt:'2026-10-23T00:00:00.000Z',
  noticePresentedAt:'2026-10-23T00:00:01.000Z',
  acknowledgedAt:'2026-10-23T00:00:02.000Z',
  acknowledged:true as const,
};

function fixture(options: {
  lineage?: readonly Record<string,unknown>[];
  evidence?: readonly Record<string,unknown>[];
  snapshot?: unknown;
  subjectKind?: 'member' | 'guest';
}={}) {
  const evidence={
    purchaseIntentId:PURCHASE,
    unitId:GRANT,
    productSpecVersion:VERSION,
    originalReceiptStatus:'verified',
    s5CommittedAt:'2026-10-23T00:05:00.000Z',
    responsePreparedAt:null,
    clientAcknowledgedAt:null,
    deliveryAttemptCount:'0',
    acknowledgedAttemptCount:'0',
  };
  const lineage={
    purchaseIntentId:PURCHASE,
    originatingGrantId:GRANT,
    pinnedCapabilityItemKey:ITEM,
    originalPaymentAttemptCreatedAt:'2026-10-23T00:01:00.000Z',
  };
  const query=vi.fn(async (sql:string,params?:readonly unknown[])=>{
    expect(params).toEqual([SUBJECT,PURCHASE,GRANT,BODY]);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|GRANT|TRUNCATE)\s+/iu);
    if (sql.includes('pinnedCapabilityItemKey')) {
      expect(sql).toContain('internal_qry_official_reader_withdrawal_delivery_state_v2');
      expect(sql).toContain("grant_row.grant_key='receipt:' || receipt.id::text");
      expect(sql).toContain('attempt_no=1');
      expect(sql).toContain('count(*)');
      return {rows:options.lineage ?? [lineage]};
    }
    expect(sql).toContain('internal_qry_official_reader_withdrawal_delivery_state_v2');
    return {rows:options.evidence ?? [evidence]};
  });
  const scope={
    resolvedSubject:{subjectId:SUBJECT,subjectKind:options.subjectKind ?? 'member'},
    client:{query} as unknown as PostgresTransactionQueryV1,
  } as PostgresSubjectExecutionScopeV1;
  const storeRead=vi.fn(async (_input:unknown)=>options.snapshot===undefined
    ? snapshot
    : options.snapshot);
  const store={readOriginalNotice:storeRead} as unknown as
    CommerceReaderImmutableCheckoutNoticeStoreV1;
  const authority=createCommerceReaderPostgresCheckoutNoticeAuthorityV1({
    scope,bodyId:BODY,immutableCheckoutNoticeStore:store,
  });
  return {scope,query,storeRead,authority};
}

describe('S7 private Postgres original Checkout notice authority',()=>{
  it('authorizes only the exact original Receipt/Grant -> uniquely pinned Item -> prepayment snapshot',async()=>{
    const f=fixture();
    const record=await f.authority.readExactServerCheckoutNotice(unit);
    expect(record).toMatchObject({
      authority:'commerce_owner_immutable_checkout_notice_v1',
      purchaseIntentId:PURCHASE,
      originatingGrantId:GRANT,
      productSpecVersion:VERSION,
      pinnedCapabilityItemKey:ITEM,
      originalGrantItemBinding:'original_receipt_purchase_intent_capability_item',
      originalPaymentAttemptCreatedAt:'2026-10-23T00:01:00.000Z',
    });
    expect(f.storeRead).toHaveBeenCalledExactlyOnceWith({
      purchaseIntentId:PURCHASE,pinnedCapabilityItemKey:ITEM,productSpecVersion:VERSION,
    });
    expect(f.query).toHaveBeenCalledTimes(1);
  });

  it('integrates original immutable Checkout notice into read-only S7 withdrawal review',async()=>{
    const f=fixture();
    const result=await reviewOfficialReaderPrivateWithdrawalEvidenceV1({
      scope:f.scope, purchaseIntentId:PURCHASE, originatingGrantId:GRANT,bodyId:BODY,
      claim:{purchaseIntentId:PURCHASE,unitId:GRANT,reason:'change_of_mind'},
      checkoutNoticeAuthority:f.authority,
    });
    expect(result.checkoutNoticeEvidenceState).toBe('attested_original_checkout_notice');
    expect(result.review.classification).toBe('not_proven_delivered');
    expect(result.timeline.consumerDeliveryProven).toBe(false);
    expect(result.timeline.legallyProvenDeliveredAt).toBeNull();
    expect(result.refundAuthorized).toBe(false);
    expect(result.entitlementMutationAuthorized).toBe(false);
    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it('without approved persisted store never queries the Purchase or fabricates a notice',async()=>{
    const f=fixture();
    const blocked=createCommerceReaderPostgresCheckoutNoticeAuthorityV1({
      scope:f.scope,bodyId:BODY,
    });
    expect(await blocked.readExactServerCheckoutNotice(unit)).toBeNull();
    expect(f.query).not.toHaveBeenCalled();
  });

  it.each([
    {lineage:[]},
    {lineage:[{},{}]},
    {lineage:[{purchaseIntentId:PURCHASE,originatingGrantId:BODY,pinnedCapabilityItemKey:ITEM,originalPaymentAttemptCreatedAt:'2026-10-23T00:01:00Z'}]},
    {lineage:[{purchaseIntentId:BODY,originatingGrantId:GRANT,pinnedCapabilityItemKey:ITEM,originalPaymentAttemptCreatedAt:'2026-10-23T00:01:00Z'}]},
    {lineage:[{purchaseIntentId:PURCHASE,originatingGrantId:GRANT,pinnedCapabilityItemKey:'',originalPaymentAttemptCreatedAt:'2026-10-23T00:01:00Z'}]},
    {lineage:[{purchaseIntentId:PURCHASE,originatingGrantId:GRANT,pinnedCapabilityItemKey:ITEM,originalPaymentAttemptCreatedAt:'invalid'}]},
  ])('does not read Checkout store for absent, ambiguous or cross-original ledger %#',async opt=>{
    const f=fixture(opt);
    expect(await f.authority.readExactServerCheckoutNotice(unit)).toBeNull();
    expect(f.storeRead).not.toHaveBeenCalled();
  });

  it.each([
    {authority:'server_checkout_snapshot'},
    {acknowledged:false},
    {purchaseIntentId:BODY},
    {pinnedCapabilityItemKey:'other-item'},
    {productSpecVersion:'other-version'},
    {noticeRevision:''},
    {acknowledgedAt:'not-an-instant'},
  ])('rejects forged Checkout Owner snapshots %#',async change=>{
    const f=fixture({snapshot:{...snapshot,...change}});
    expect(await f.authority.readExactServerCheckoutNotice(unit)).toBeNull();
  });

  it('fails closed for bad member state, cross-receipt Grant or server read outage',async()=>{
    const guest=fixture({subjectKind:'guest'});
    expect(await guest.authority.readExactServerCheckoutNotice(unit)).toBeNull();
    expect(guest.query).not.toHaveBeenCalled();

    const valid=fixture();
    expect(await valid.authority.readExactServerCheckoutNotice({
      ...unit,unitId:BODY,
    })).toBeNull();
    const outage=fixture();
    outage.query.mockRejectedValueOnce(new Error('private database failure'));
    expect(await outage.authority.readExactServerCheckoutNotice(unit)).toBeNull();
    expect(outage.storeRead).not.toHaveBeenCalled();
  });

  it('does not treat late checkout consent as early consent even with a trusted store',async()=>{
    const f=fixture({snapshot:{...snapshot,acknowledgedAt:'2026-10-23T00:02:00.000Z'}});
    const result=await reviewOfficialReaderPrivateWithdrawalEvidenceV1({
      scope:f.scope,purchaseIntentId:PURCHASE,originatingGrantId:GRANT,bodyId:BODY,
      claim:{purchaseIntentId:PURCHASE,unitId:GRANT,reason:'change_of_mind'},
      checkoutNoticeAuthority:f.authority,
    });
    expect(result.checkoutNoticeEvidenceState).toBe('missing_or_unverifiable');
    expect(result.refundAuthorized).toBe(false);
  });
});
