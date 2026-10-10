import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
  type ChatThreadRuntimeBindingV1,
} from './chat-thread-runtime-binding-read.js';
import {
  resolveCharacterStandardReadingAccessMetadataV1,
  type CharacterStandardReadingAccessAuthorityPortV1,
  type CharacterStandardReadingAccessMetadataV1,
} from './character-standard-reading-knowledge.js';
import {
  resolveProductReaderEligibilityV1,
  type ProductReaderEligibilityAuthorityPortV1,
} from './product-reader-eligibility-policy-v1.js';

/**
 * D-05 read-only discovery seam. A production locator/DB authority is NOT
 * approved yet; do not implement it with client-supplied threadIds, a broad
 * chat list, public REST, or the mutating member chat-open command.
 */
export interface OfficialReadingReaderThreadLocatorAuthorityPortV1 {
  readActiveMemberSingleCharacterThreads(input: Readonly<{
    subjectId: string;
    readerCharacterId: string;
  }>): Promise<readonly Readonly<{ threadId: string }>[]>;
}

export interface ResolveOfficialReadingReaderThreadInputV1 {
  /** The authenticated canonical Subject from the existing DB transaction. */
  readonly resolvedSubjectId?: string;
  /** Must be derived from that same server-side Subject resolution. */
  readonly resolvedSubjectKind: 'member' | 'guest';
  /** Selectors only; neither is an authorization credential. */
  readonly readingId: unknown;
  readonly readerCharacterId: unknown;
  /** Server-owned DB evaluation time. Not a client timestamp. */
  readonly effectiveAt: unknown;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly productReaderEligibilityAuthorityPort: ProductReaderEligibilityAuthorityPortV1;
  readonly threadLocatorAuthorityPort: OfficialReadingReaderThreadLocatorAuthorityPortV1;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
}

export interface ResolvedOfficialReadingReaderThreadV1 {
  readonly subjectId: string;
  readonly readingId: string;
  readonly readerCharacterId: string;
  readonly threadId: string;
  readonly activeContentReleaseId: string;
  readonly activeContentBundleId: string;
  readonly contentRevision: number;
  readonly sourceResponseHash: string;
  readonly productRuleVersion: string;
  readonly approvedPolicyRevision: string;
}

export type OfficialReadingReaderThreadResolutionErrorCodeV1 =
  | 'ACCESS_DENIED'
  | 'POLICY_HOLD'
  | 'THREAD_UNAVAILABLE'
  | 'THREAD_AMBIGUOUS'
  | 'THREAD_INCOMPATIBLE';

export class OfficialReadingReaderThreadResolutionErrorV1 extends Error {
  constructor(readonly code: OfficialReadingReaderThreadResolutionErrorCodeV1) {
    super('Official Reading Reader thread is unavailable.');
    this.name = 'OfficialReadingReaderThreadResolutionErrorV1';
  }
}

function deny(code: OfficialReadingReaderThreadResolutionErrorCodeV1): never {
  throw new OfficialReadingReaderThreadResolutionErrorV1(code);
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= 200 &&
    value.trim() === value;
}

function sameAccess(
  before: CharacterStandardReadingAccessMetadataV1,
  after: CharacterStandardReadingAccessMetadataV1,
): boolean {
  return before.subjectId === after.subjectId &&
    before.readingId === after.readingId &&
    before.readerCharacterId === after.readerCharacterId &&
    before.readerContentBundleId === after.readerContentBundleId &&
    before.readingSessionId === after.readingSessionId &&
    before.productId === after.productId &&
    before.topicKey === after.topicKey &&
    before.readingPeriod === after.readingPeriod &&
    before.readingVariant === after.readingVariant &&
    before.productSpecVersion === after.productSpecVersion &&
    before.sajuDomain === after.sajuDomain &&
    before.readingContractVersion === after.readingContractVersion &&
    before.responseHash === after.responseHash &&
    before.sourceBirthRevisionId === after.sourceBirthRevisionId &&
    before.domainCapabilityVersion === after.domainCapabilityVersion &&
    before.sajuEngineVersion === after.sajuEngineVersion;
}

function sameThread(
  before: ChatThreadRuntimeBindingV1,
  after: ChatThreadRuntimeBindingV1,
): boolean {
  return before.threadId === after.threadId &&
    before.activeContentReleaseId === after.activeContentReleaseId &&
    before.activeContentBundleId === after.activeContentBundleId &&
    before.contentRevision === after.contentRevision &&
    before.participantCharacterIds.length === 1 &&
    after.participantCharacterIds.length === 1 &&
    before.participantCharacterIds[0] === after.participantCharacterIds[0];
}

function assertThreadMatches(
  thread: ChatThreadRuntimeBindingV1,
  reader: string,
  bundle: string,
): void {
  if (thread.participantCharacterIds.length !== 1 ||
      thread.participantCharacterIds[0] !== reader ||
      thread.activeContentBundleId !== bundle) {
    deny('THREAD_INCOMPATIBLE');
  }
}

/**
 * INTERNAL, read-only, deny-by-default D-05 composition. This resolves an
 * existing Member×Reader thread only; it never creates one. Every authority
 * port must be bound in the canonical authenticated Subject transaction.
 *
 * Success is not a Grant, admission ticket, durable permission, generated
 * interpretation, or public send/reveal authorization. A2/T1/T2 rechecking
 * and the pending #1827/#1828 owner decisions remain mandatory.
 */
export async function resolveOfficialReadingReaderThreadV1(
  input: ResolveOfficialReadingReaderThreadInputV1,
): Promise<ResolvedOfficialReadingReaderThreadV1> {
  if (!identifier(input.resolvedSubjectId) ||
      input.resolvedSubjectKind !== 'member' ||
      !identifier(input.readingId) ||
      !identifier(input.readerCharacterId) ||
      !identifier(input.effectiveAt) ||
      !Number.isFinite(Date.parse(input.effectiveAt))) {
    return deny('ACCESS_DENIED');
  }

  const subjectId = input.resolvedSubjectId;
  const readingId = input.readingId;
  const readerCharacterId = input.readerCharacterId;
  const effectiveAt = input.effectiveAt;

  async function readAccess(): Promise<CharacterStandardReadingAccessMetadataV1> {
    try {
      return await resolveCharacterStandardReadingAccessMetadataV1({
        resolvedSubjectId: subjectId,
        readingId,
        readerCharacterId,
        effectiveAt,
        accessAuthorityPort: input.accessAuthorityPort,
      });
    } catch {
      return deny('ACCESS_DENIED');
    }
  }

  const access = await readAccess();

  async function readEligibility() {
    const eligibility = await resolveProductReaderEligibilityV1({
      source: Object.freeze({
        productId: access.productId,
        productSpecVersion: access.productSpecVersion,
        sajuDomain: access.sajuDomain,
      }),
      serverReaderId: readerCharacterId,
      effectiveAt,
      authorityPort: input.productReaderEligibilityAuthorityPort,
    });
    if (eligibility.status !== 'eligible') return deny('POLICY_HOLD');
    return eligibility;
  }

  const policy = await readEligibility();

  let candidates: readonly Readonly<{ threadId: string }>[];
  try {
    candidates = await input.threadLocatorAuthorityPort.readActiveMemberSingleCharacterThreads({
      subjectId,
      readerCharacterId,
    });
  } catch {
    return deny('THREAD_UNAVAILABLE');
  }
  if (!Array.isArray(candidates)) return deny('THREAD_UNAVAILABLE');
  if (candidates.length === 0) return deny('THREAD_UNAVAILABLE');
  if (candidates.length !== 1) return deny('THREAD_AMBIGUOUS');
  const threadId = candidates[0]?.threadId;
  if (!identifier(threadId)) return deny('THREAD_INCOMPATIBLE');

  async function readThread(): Promise<ChatThreadRuntimeBindingV1> {
    try {
      return await getChatThreadRuntimeBinding({
        resolvedSubjectId: subjectId,
        threadId,
        authorityPort: input.threadBindingAuthorityPort,
      });
    } catch {
      return deny('THREAD_UNAVAILABLE');
    }
  }

  const thread = await readThread();
  assertThreadMatches(thread, readerCharacterId, access.readerContentBundleId);

  // Detect drift within this internal lookup. Neither a repeated read nor
  // a fixed effectiveAt can prove post-transaction revocation safety.
  const currentAccess = await readAccess();
  if (!sameAccess(access, currentAccess)) return deny('ACCESS_DENIED');
  const currentPolicy = await readEligibility();
  if (currentPolicy.ruleVersion !== policy.ruleVersion ||
      currentPolicy.approvedPolicyRevision !== policy.approvedPolicyRevision ||
      currentPolicy.readerCharacterId !== policy.readerCharacterId) {
    return deny('POLICY_HOLD');
  }
  const currentThread = await readThread();
  if (!sameThread(thread, currentThread)) return deny('THREAD_INCOMPATIBLE');
  assertThreadMatches(currentThread, readerCharacterId, currentAccess.readerContentBundleId);

  return Object.freeze({
    subjectId,
    readingId,
    readerCharacterId,
    threadId: currentThread.threadId,
    activeContentReleaseId: currentThread.activeContentReleaseId,
    activeContentBundleId: currentThread.activeContentBundleId,
    contentRevision: currentThread.contentRevision,
    sourceResponseHash: currentAccess.responseHash,
    productRuleVersion: currentPolicy.ruleVersion,
    approvedPolicyRevision: currentPolicy.approvedPolicyRevision,
  });
}
