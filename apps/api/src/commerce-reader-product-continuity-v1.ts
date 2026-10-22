import type {
  AppliedVerifiedReaderReceiptBindV1,
} from './commerce-verified-reader-receipt-bind.js';
import {
  getOfficialReadingRecord,
  type OfficialReadingRecordReadAuthorityPortV1,
  type OfficialReadingRecordV1,
} from './official-reading-record-read.js';
import {
  resolveOfficialReadingReaderThreadV1,
  OfficialReadingReaderThreadResolutionErrorV1,
  type ResolveOfficialReadingReaderThreadInputV1,
} from './official-reading-reader-thread-resolution-v1.js';

/**
 * Product contract: one independently stored Official Reading; a selected
 * Reader receives an exact separately verified purchase Grant and, where
 * currently authorized, reuses that Reader's existing member Chat thread.
 *
 * Receipt/Grant binding is historical evidence, NOT live Reader access.
 * Records ownership is distinct from Reader entitlement; a revoked Reader
 * cannot recover interpretation text through this projection, but an owned
 * Official Reading may remain in Records under its original privacy policy.
 *
 * This is an internal Commerce/Records handoff. It never invokes Saju,
 * invents semantic summaries, opens checkout or creates an additional LLM
 * call, Chat thread, memory entry, source authority, or public Reader route.
 */
export const COMMERCE_READER_PRODUCT_CONTINUITY_VERSION_V1 =
  'commerce-reader-product-continuity-v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface CommerceReaderReceiptContinuationV1 {
  readonly contractVersion: typeof COMMERCE_READER_PRODUCT_CONTINUITY_VERSION_V1;
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly receiptBinding: 'issued' | 'historical_replay';
  /** This describes the product sequence, not a request to produce content. */
  readonly summary: 'requires_authorized_saju_source_and_reader_delivery';
  readonly readerFollowup: 'requires_fresh_exact_grant_and_existing_thread';
  readonly recordDetail: 'requires_current_subject_owned_read';
  readonly checkoutEnabled: false;
  readonly paidContentRevealed: false;
}

export interface CommerceReaderRecordContinuityV1 {
  readonly contractVersion: typeof COMMERCE_READER_PRODUCT_CONTINUITY_VERSION_V1;
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  /** ONE Reader-independent official report, never a per-Reader copy. */
  readonly officialRecord: OfficialReadingRecordV1;
  readonly summary: 'held_pending_authorized_reader_delivery';
  readonly readerFollowup:
    | Readonly<{
        readonly state: 'existing_thread_candidate';
        readonly threadId: string;
        readonly contentBundleId: string;
        readonly contentReleaseId: string;
        readonly contentRevision: number;
        readonly productRuleVersion: string;
        readonly approvedPolicyRevision: string;
        readonly requiresFreshGateAtUse: true;
      }>
    | Readonly<{
        readonly state: 'not_available';
        readonly requiresFreshGateAtUse: true;
      }>;
  readonly readerInterpretation: 'private_current_entitlement_only';
  readonly canBypassS5OrS6: false;
  readonly canInjectPaidReadingIntoMemory: false;
}

export class CommerceReaderProductContinuityErrorV1 extends Error {
  constructor() {
    super('Official Reading purchase continuity is unavailable.');
    this.name = 'CommerceReaderProductContinuityErrorV1';
  }
}
function unavailable(): never {
  throw new CommerceReaderProductContinuityErrorV1();
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return unavailable();
  return value.toLowerCase();
}
function reader(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128
      || value.trim() !== value) return unavailable();
  return value;
}

/**
 * Called only after the existing Commerce S2 DB transaction has returned.
 * The returned IDs allow subsequent owner-scoped Records navigation, but
 * replayed=true NEVER means current access, delivery, or a new purchase.
 */
export function continuationFromVerifiedReaderBindV1(
  bind: AppliedVerifiedReaderReceiptBindV1,
): CommerceReaderReceiptContinuationV1 {
  if (!bind || (bind.kind !== 'issued' && bind.kind !== 'already_bound')
      || !Number.isSafeInteger(bind.capabilityEffectCount)
      || bind.capabilityEffectCount < 1
      || !UUID.test(bind.receiptId)
      || !UUID.test(bind.purchaseIntentId)
      || !UUID.test(bind.entitlementGrantId)) return unavailable();
  return Object.freeze({
    contractVersion: COMMERCE_READER_PRODUCT_CONTINUITY_VERSION_V1,
    officialReadingId: uuid(bind.officialReadingId),
    readerCharacterId: reader(bind.readerCharacterId),
    receiptBinding: bind.kind === 'issued' ? 'issued' : 'historical_replay',
    summary: 'requires_authorized_saju_source_and_reader_delivery',
    readerFollowup: 'requires_fresh_exact_grant_and_existing_thread',
    recordDetail: 'requires_current_subject_owned_read',
    checkoutEnabled: false,
    paidContentRevealed: false,
  });
}

type ReaderThreadAuthorityV1 = Pick<
  ResolveOfficialReadingReaderThreadInputV1,
  | 'accessAuthorityPort'
  | 'productReaderEligibilityAuthorityPort'
  | 'threadLocatorAuthorityPort'
  | 'threadBindingAuthorityPort'
>;

/**
 * Called inside an authenticated, owner-scoped subject READ transaction.
 * The existing Official Record authority decides whether the customer owns
 * a readable report; Reader D-05 resolution independently checks CURRENT
 * Grant, Product/Reader policy, pinned Bundle/Release and the one canonical
 * Member x Character conversation. This is only a navigation candidate:
 * S5/S6 must repeat the same DB purchase check before paid content use.
 *
 * Refund does not delete an otherwise legitimate owned Official Reading;
 * it removes the affected Reader's future access and memory injection.
 */
export async function resolveCommerceReaderRecordContinuityV1(input: {
  readonly resolvedSubjectId: string;
  readonly resolvedSubjectKind: 'member' | 'guest';
  readonly readingId: string;
  readonly readerCharacterId: string;
  readonly effectiveAt: string;
  readonly recordAuthorityPort: OfficialReadingRecordReadAuthorityPortV1;
  readonly readerAuthorities: ReaderThreadAuthorityV1;
}): Promise<CommerceReaderRecordContinuityV1> {
  const subjectId = uuid(input.resolvedSubjectId);
  const readingId = uuid(input.readingId);
  const readerCharacterId = reader(input.readerCharacterId);
  if (input.resolvedSubjectKind !== 'member'
      && input.resolvedSubjectKind !== 'guest') return unavailable();
  if (typeof input.effectiveAt !== 'string'
      || !Number.isFinite(Date.parse(input.effectiveAt))) return unavailable();

  // Independent, existing owner-scoped Records authority. Reader provenance
  // in this record is historical and MUST NOT be read as an active Grant.
  const officialRecord = await getOfficialReadingRecord({
    resolvedSubjectId: subjectId,
    readingId,
    authorityPort: input.recordAuthorityPort,
  });
  if (officialRecord.readingId.toLowerCase() !== readingId) return unavailable();

  let followup: CommerceReaderRecordContinuityV1['readerFollowup'] =
    Object.freeze({ state: 'not_available', requiresFreshGateAtUse: true });
  if (input.resolvedSubjectKind === 'member') {
    try {
      const result = await resolveOfficialReadingReaderThreadV1({
        resolvedSubjectId: subjectId,
        resolvedSubjectKind: 'member',
        readingId,
        readerCharacterId,
        effectiveAt: input.effectiveAt,
        ...input.readerAuthorities,
      });
      if (result.subjectId !== subjectId
          || result.readingId !== readingId
          || result.readerCharacterId !== readerCharacterId) return unavailable();
      followup = Object.freeze({
        state: 'existing_thread_candidate',
        threadId: uuid(result.threadId),
        contentBundleId: uuid(result.activeContentBundleId),
        contentReleaseId: uuid(result.activeContentReleaseId),
        contentRevision: result.contentRevision,
        productRuleVersion: result.productRuleVersion,
        approvedPolicyRevision: result.approvedPolicyRevision,
        requiresFreshGateAtUse: true,
      });
    } catch (error) {
      if (!(error instanceof OfficialReadingReaderThreadResolutionErrorV1)) {
        throw error;
      }
      // No Reader entitlement, mismatch, ambiguity or lack of a thread:
      // never infer permission from the purchase/record history instead.
    }
  }

  return Object.freeze({
    contractVersion: COMMERCE_READER_PRODUCT_CONTINUITY_VERSION_V1,
    officialReadingId: readingId,
    readerCharacterId,
    officialRecord,
    summary: 'held_pending_authorized_reader_delivery',
    readerFollowup: followup,
    readerInterpretation: 'private_current_entitlement_only',
    canBypassS5OrS6: false,
    canInjectPaidReadingIntoMemory: false,
  });
}
