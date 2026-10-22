import { describe, expect, it } from 'vitest';
import {
  continuationFromVerifiedReaderBindV1,
  resolveCommerceReaderRecordContinuityV1,
} from './commerce-reader-product-continuity-v1.js';
import type {
  FulfilledVerifiedReaderReceiptV1,
} from './commerce-verified-reader-fulfillment.js';
import type {
  OfficialReadingRecordReadAuthorityPortV1,
} from './official-reading-record-read.js';
import type {
  CommerceReaderVerifiedPurchaseStateV1,
} from './commerce-reader-verified-purchase-status-v1.js';
import type {
  ResolveOfficialReadingReaderThreadInputV1,
} from './official-reading-reader-thread-resolution-v1.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const READING = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const PRODUCT = '44444444-4444-4444-8444-444444444444';
const BUNDLE = '55555555-5555-4555-8555-555555555555';
const RELEASE = '66666666-6666-4666-8666-666666666666';
const THREAD = '77777777-7777-4777-8777-777777777777';
const BIRTH = '88888888-8888-4888-8888-888888888888';
const GRANT = '99999999-9999-4999-8999-999999999999';
const RECEIPT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INTENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = '2026-10-22T01:00:00.000Z';

const BIND: FulfilledVerifiedReaderReceiptV1 = Object.freeze({
  receiptId: RECEIPT,
  purchaseIntentId: INTENT,
  entitlementGrantId: GRANT,
  officialReadingId: READING,
  readerCharacterId: 'seyeon',
  capabilityEffectCount: 1,
  kind: 'issued',
  purchaseRole: 'initial_reading',
});

const RECORD: OfficialReadingRecordReadAuthorityPortV1 = {
  readRecord: async () => ({
    readingId: READING,
    readingSessionId: SESSION,
    sajuDomain: 'career',
    readingContractVersion: 'myeonghwa-product-reading-response-v2',
    productResponseState: 'delivered',
    responseSnapshotJsonb: {
      responseVersion: 'myeonghwa-product-reading-response-v2',
      state: 'delivered',
      reading: { readingId: READING, sections: [] },
    },
    responseHash: 'sha256:v1:' + 'a'.repeat(64),
    // Historical Reader provenance is deliberately not a live Grant.
    readerCharacterIds: ['seyeon'],
    completedAt: NOW,
  }),
};

const ACCESS = Object.freeze({
  subjectId: SUBJECT,
  readingId: READING,
  readingSessionId: SESSION,
  productId: PRODUCT,
  readerCharacterId: 'seyeon',
  readerContentBundleId: BUNDLE,
  topicKey: 'career',
  sajuDomain: 'career',
  readingPeriod: 'natal',
  readingVariant: 'standard',
  sourceBirthRevisionId: BIRTH,
  productSpecVersion: 'product-spec-v1',
  domainCapabilityVersion: 'domain-capability-v1',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  sajuEngineVersion: 'saju-v2',
  responseHash: 'sha256:v1:' + 'a'.repeat(64),
});

type ReaderAuthorities = Pick<
  ResolveOfficialReadingReaderThreadInputV1,
  | 'accessAuthorityPort'
  | 'productReaderEligibilityAuthorityPort'
  | 'threadLocatorAuthorityPort'
  | 'threadBindingAuthorityPort'
>;

function authorities(
  accessRows: readonly (typeof ACCESS)[] = [ACCESS],
): ReaderAuthorities {
  return {
    accessAuthorityPort: {
      readAccessibleReadings: async () => accessRows,
    },
    productReaderEligibilityAuthorityPort: {
      readApprovedRule: async () => ({
        status: 'approved',
        rule: {
          kind: 'standard_all_readers',
          productId: PRODUCT,
          productSpecVersion: 'product-spec-v1',
          sajuDomain: 'career',
          ruleVersion: 'reader-rule-v1',
          approvedPolicyRevision: 'approved-v1',
        },
      }),
    },
    threadLocatorAuthorityPort: {
      readActiveMemberSingleCharacterThreads: async () => [{ threadId: THREAD }],
    },
    threadBindingAuthorityPort: {
      readRuntimeBinding: async () => [{
        threadId: THREAD,
        status: 'active',
        activeContentReleaseId: RELEASE,
        activeContentBundleId: BUNDLE,
        contentRevision: 2,
        participantCharacterIds: ['seyeon'],
      }],
    },
  };
}

function recordInput(
  readerAuthorities: ReaderAuthorities = authorities(),
  resolvedSubjectKind: 'member' | 'guest' = 'member',
  purchaseState: CommerceReaderVerifiedPurchaseStateV1 = 'current_verified_purchase',
) {
  return {
    resolvedSubjectId: SUBJECT,
    resolvedSubjectKind,
    readingId: READING,
    readerCharacterId: 'seyeon',
    effectiveAt: NOW,
    recordAuthorityPort: RECORD,
    readerAuthorities,
    verifiedPurchaseStatusAuthorityPort: {
      readExactCurrentPurchase: async () => ({
        state: purchaseState,
        currentVerifiedPurchaseGrantCount:
          purchaseState === 'current_verified_purchase' ? 1 : 0,
      }),
    },
  } as const;
}

describe('Commerce verified purchase -> Reader -> Official Records continuity', () => {
  it('uses stored Receipt bind identities, never grants new entitlements on replay', () => {
    const handoff = continuationFromVerifiedReaderBindV1(BIND);
    expect(handoff).toMatchObject({
      officialReadingId: READING,
      readerCharacterId: 'seyeon',
      purchaseRole: 'initial_reading',
      receiptBinding: 'issued',
      checkoutEnabled: false,
      paidContentRevealed: false,
    });
    expect(handoff).not.toHaveProperty('entitlementGrantId');
    expect(handoff).not.toHaveProperty('receiptId');

    const extra = continuationFromVerifiedReaderBindV1({
      ...BIND,
      kind: 'already_bound',
      purchaseRole: 'additional_reader_interpretation',
    });
    expect(extra).toMatchObject({
      officialReadingId: READING,
      purchaseRole: 'additional_reader_interpretation',
      receiptBinding: 'historical_replay',
      readerFollowup: 'requires_fresh_exact_grant_and_existing_thread',
    });
    expect(extra.paidContentRevealed).toBe(false);
  });

  it('keeps ONE official archive and resolves only the existing entitled Reader thread', async () => {
    const result = await resolveCommerceReaderRecordContinuityV1(recordInput());
    expect(result).toMatchObject({
      officialReadingId: READING,
      readerCharacterId: 'seyeon',
      officialRecord: { readingId: READING },
      summary: 'held_pending_authorized_reader_delivery',
      purchaseState: 'current_verified_purchase',
      readerFollowup: {
        state: 'existing_thread_candidate',
        threadId: THREAD,
        contentBundleId: BUNDLE,
        contentRevision: 2,
        requiresFreshGateAtUse: true,
      },
      canBypassS5OrS6: false,
      canInjectPaidReadingIntoMemory: false,
    });
    expect(result.officialRecord.reading).toMatchObject({ state: 'delivered' });
    expect(JSON.stringify(result.readerFollowup)).not.toContain('responseHash');
  });

  it('keeps owned official Records available after a Reader-specific refund while closing followup', async () => {
    const result = await resolveCommerceReaderRecordContinuityV1(
      recordInput(authorities([]), 'member', 'verified_full_cancellation'),
    );
    expect(result.officialRecord.readingId).toBe(READING);
    expect(result.purchaseState).toBe('verified_full_cancellation');
    expect(result.readerFollowup).toEqual({
      state: 'not_available',
      requiresFreshGateAtUse: true,
    });
    expect(result.readerInterpretation).toBe('private_current_entitlement_only');
  });

  it('does not make guest ownership or historical Reader provenance a Chat permission', async () => {
    const result = await resolveCommerceReaderRecordContinuityV1(
      recordInput(authorities([ACCESS]), 'guest'),
    );
    expect(result.officialRecord.readerCharacterIds).toEqual(['seyeon']);
    expect(result.readerFollowup.state).toBe('not_available');
  });

  it('rejects another official Reading instead of creating a duplicate or reusing its Reader bind', async () => {
    await expect(resolveCommerceReaderRecordContinuityV1({
      ...recordInput(),
      readingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    })).rejects.toThrow('different Reading identity');
  });
  it('blocks a previously resolved Reader thread after confirmed PortOne refund and last Grant revoke', async () => {
    let locatorCalls = 0;
    const existing = authorities();
    const result = await resolveCommerceReaderRecordContinuityV1(recordInput({
      ...existing,
      threadLocatorAuthorityPort: {
        readActiveMemberSingleCharacterThreads: async () => {
          locatorCalls += 1;
          return [{ threadId: THREAD }];
        },
      },
    }, 'member', 'verified_full_cancellation'));
    expect(result.purchaseState).toBe('verified_full_cancellation');
    expect(result.readerFollowup).toEqual({
      state: 'not_available',
      requiresFreshGateAtUse: true,
    });
    expect(locatorCalls).toBe(0);
    expect(result.canInjectPaidReadingIntoMemory).toBe(false);
  });

  it('does not infer a refund or expose cached Reader Chat when Commerce status is not confirmed', async () => {
    const result = await resolveCommerceReaderRecordContinuityV1(
      recordInput(authorities(), 'member', 'not_confirmed'),
    );
    expect(result.purchaseState).toBe('not_confirmed');
    expect(result.readerFollowup.state).toBe('not_available');
  });

  it('keeps Reader navigation eligible after one refund if another exact verified sibling purchase survives', async () => {
    const result = await resolveCommerceReaderRecordContinuityV1(
      recordInput(authorities(), 'member', 'current_verified_purchase'),
    );
    expect(result.purchaseState).toBe('current_verified_purchase');
    expect(result.readerFollowup).toMatchObject({
      state: 'existing_thread_candidate', threadId: THREAD,
      requiresFreshGateAtUse: true,
    });
  });

  it('rejects contradictory current-Grant evidence even with a valid archived Reading and Reader binding', async () => {
    await expect(resolveCommerceReaderRecordContinuityV1({
      ...recordInput(),
      verifiedPurchaseStatusAuthorityPort: {
        readExactCurrentPurchase: async () => ({
          state: 'verified_full_cancellation' as const,
          currentVerifiedPurchaseGrantCount: 1,
        }),
      },
    })).rejects.toThrow('purchase continuity is unavailable');
  });

});
