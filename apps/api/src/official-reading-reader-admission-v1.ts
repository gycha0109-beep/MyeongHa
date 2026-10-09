import type { SajuDomain } from '../../../packages/contracts/src/index.js';
import type { ContentReleaseRuntimeEntry } from '../../../packages/world-content/src/index.js';
import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
  type ChatThreadRuntimeBindingV1,
} from './chat-thread-runtime-binding-read.js';
import {
  resolveCharacterStandardReadingAccessMetadataV1,
  resolveCharacterStandardReadingArtifactAfterAccessV1,
  type CharacterStandardReadingAccessAuthorityPortV1,
  type CharacterStandardReadingArtifactAuthorityPortV1,
  type CharacterStandardReadingKnowledgeSourceV1,
} from './character-standard-reading-knowledge.js';
import {
  resolveProductReaderEligibilityV1,
  type ProductReaderEligibilityAuthorityPortV1,
} from './product-reader-eligibility-policy-v1.js';
import {
  projectOfficialStandardReadingToProtectedCharacterSajuContextV1,
} from './character-standard-reading-protected-context.js';

export const OFFICIAL_READER_ADMISSION_VERSION_V1 =
  'official-reading-reader-server-admission-v1' as const;

export interface OfficialReadingReaderAdmissionScopeV1 {
  readonly subjectId: string;
  readonly threadId: string;
  readonly contentRevision: number;
  readonly readingId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly contentReleaseId: string;
  readonly effectiveAt: string;
  readonly productId: string;
  readonly productSpecVersion: string;
  readonly sajuDomain: SajuDomain;
  readonly readingContractVersion: string;
  readonly officialArtifactResponseHash: string;
  readonly productRuleVersion: string;
  readonly approvedPolicyRevision: string;
}

/** This inert handle is NOT a Grant, payment credential or public Reader capability. */
export type OfficialReadingReaderAdmissionTicketV1 = Readonly<{
  readonly kind: typeof OFFICIAL_READER_ADMISSION_VERSION_V1;
}>;

export interface PrepareOfficialReadingReaderAdmissionInputV1 {
  /** Must be server-resolved inside the canonical Subject DB transaction. */
  readonly resolvedSubjectId?: string;
  readonly threadId: unknown;
  readonly readingId: unknown;
  readonly effectiveAt: unknown;
  /** Server-resolved, immutable content release; never caller-controlled. */
  readonly contentEntry: ContentReleaseRuntimeEntry;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  /** Product/Commerce-owned approved policy resolver; not a test fallback in production. */
  readonly productReaderEligibilityAuthorityPort: ProductReaderEligibilityAuthorityPortV1;
}

export interface PreparedOfficialReadingReaderAdmissionV1 {
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly scope: OfficialReadingReaderAdmissionScopeV1;
  readonly ticket: OfficialReadingReaderAdmissionTicketV1;
}

export class OfficialReadingReaderAdmissionErrorV1 extends Error {
  constructor(
    readonly code: 'ACCESS_DENIED' | 'POLICY_HOLD' | 'SOURCE_CONFLICT' | 'PROOF_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'OfficialReadingReaderAdmissionErrorV1';
  }
}

type TicketRecord = {
  readonly scope: OfficialReadingReaderAdmissionScopeV1;
  used: boolean;
};
const issuedTickets = new WeakMap<object, TicketRecord>();
const scopeKeys: readonly (keyof OfficialReadingReaderAdmissionScopeV1)[] =
  Object.freeze([
    'subjectId', 'threadId', 'contentRevision', 'readingId', 'readerCharacterId',
    'readerContentBundleId', 'contentReleaseId', 'effectiveAt', 'productId',
    'productSpecVersion', 'sajuDomain', 'readingContractVersion',
    'officialArtifactResponseHash', 'productRuleVersion', 'approvedPolicyRevision',
  ]);

function deny(
  code: OfficialReadingReaderAdmissionErrorV1['code'],
): never {
  throw new OfficialReadingReaderAdmissionErrorV1(
    code, 'Official Reading Reader admission is unavailable.',
  );
}

function assertPinned(
  binding: ChatThreadRuntimeBindingV1,
  entry: ContentReleaseRuntimeEntry,
): string {
  if (binding.participantCharacterIds.length !== 1 ||
      entry.release.releaseId !== binding.activeContentReleaseId ||
      entry.release.bundleId !== binding.activeContentBundleId) {
    return deny('ACCESS_DENIED');
  }
  const reader = binding.participantCharacterIds[0];
  if (!reader ||
      entry.characters.characters.filter((character) =>
        character.characterId === reader).length !== 1) {
    return deny('ACCESS_DENIED');
  }
  return reader;
}

function sameBinding(
  first: ChatThreadRuntimeBindingV1,
  second: ChatThreadRuntimeBindingV1,
): boolean {
  return first.threadId === second.threadId &&
    first.activeContentBundleId === second.activeContentBundleId &&
    first.activeContentReleaseId === second.activeContentReleaseId &&
    first.contentRevision === second.contentRevision &&
    first.participantCharacterIds.length === 1 &&
    second.participantCharacterIds.length === 1 &&
    first.participantCharacterIds[0] === second.participantCharacterIds[0];
}

/**
 * Dormant, server-only A2-beta composer. Policy is checked AFTER the exact DB
 * purchase-backed Reader access and BEFORE raw official artifact access.
 * Does not wire Preview/Chat, mint entitlement, or activate any Reader.
 */
export async function prepareOfficialReadingReaderAdmissionV1(
  input: PrepareOfficialReadingReaderAdmissionInputV1,
): Promise<PreparedOfficialReadingReaderAdmissionV1> {
  const thread = await getChatThreadRuntimeBinding({
    ...(input.resolvedSubjectId === undefined
      ? {} : { resolvedSubjectId: input.resolvedSubjectId }),
    threadId: input.threadId,
    authorityPort: input.threadBindingAuthorityPort,
  });
  const readerCharacterId = assertPinned(thread, input.contentEntry);

  let access;
  try {
    access = await resolveCharacterStandardReadingAccessMetadataV1({
      ...(input.resolvedSubjectId === undefined
        ? {} : { resolvedSubjectId: input.resolvedSubjectId }),
      readerCharacterId,
      readingId: input.readingId,
      effectiveAt: input.effectiveAt,
      expectedReaderContentBundleId: thread.activeContentBundleId,
      accessAuthorityPort: input.accessAuthorityPort,
    });
  } catch {
    return deny('ACCESS_DENIED');
  }

  const eligibility = await resolveProductReaderEligibilityV1({
    source: Object.freeze({
      productId: access.productId,
      productSpecVersion: access.productSpecVersion,
      sajuDomain: access.sajuDomain,
    }),
    serverReaderId: readerCharacterId,
    effectiveAt: access.effectiveAt,
    authorityPort: input.productReaderEligibilityAuthorityPort,
  });
  if (eligibility.status !== 'eligible') {
    return deny('POLICY_HOLD');
  }

  let source: CharacterStandardReadingKnowledgeSourceV1;
  try {
    source = await resolveCharacterStandardReadingArtifactAfterAccessV1({
      admittedAccess: access,
      artifactAuthorityPort: input.artifactAuthorityPort,
    });
    // Exact delivered v2 contract, stored snapshot state/identity and protected
    // canonical Saju content, not merely an arbitrary non-null JSON object.
    projectOfficialStandardReadingToProtectedCharacterSajuContextV1(source);
  } catch {
    return deny('SOURCE_CONFLICT');
  }

  const currentThread = await getChatThreadRuntimeBinding({
    resolvedSubjectId: access.subjectId,
    threadId: thread.threadId,
    authorityPort: input.threadBindingAuthorityPort,
  });
  if (!sameBinding(thread, currentThread) ||
      assertPinned(currentThread, input.contentEntry) !== readerCharacterId) {
    return deny('ACCESS_DENIED');
  }

  const scope = Object.freeze({
    subjectId: access.subjectId,
    threadId: thread.threadId,
    contentRevision: thread.contentRevision,
    readingId: source.readingId,
    readerCharacterId,
    readerContentBundleId: source.readerContentBundleId,
    contentReleaseId: thread.activeContentReleaseId,
    effectiveAt: access.effectiveAt,
    productId: source.productId,
    productSpecVersion: source.productSpecVersion,
    sajuDomain: source.sajuDomain,
    readingContractVersion: source.readingContractVersion,
    officialArtifactResponseHash: source.responseHash,
    productRuleVersion: eligibility.ruleVersion,
    approvedPolicyRevision: eligibility.approvedPolicyRevision,
  }) satisfies OfficialReadingReaderAdmissionScopeV1;
  const ticket: OfficialReadingReaderAdmissionTicketV1 =
    Object.freeze({ kind: OFFICIAL_READER_ADMISSION_VERSION_V1 });
  issuedTickets.set(ticket, { scope, used: false });
  return Object.freeze({ source, scope, ticket });
}

/**
 * Atomic, one-use private issuer check. Caller must compare the scope against
 * CURRENT server-owned thread/Reading state; passing back the issuer's original
 * scope alone is insufficient evidence that an external Grant remains active.
 * A2-gamma will wire this into internal Reader runtime; no public route here.
 */
export function consumeOfficialReadingReaderAdmissionV1(input: {
  readonly ticket: OfficialReadingReaderAdmissionTicketV1;
  readonly expectedScope: OfficialReadingReaderAdmissionScopeV1;
}): void {
  if (typeof input.ticket !== 'object' || input.ticket === null ||
      typeof input.expectedScope !== 'object' || input.expectedScope === null) {
    return deny('PROOF_INVALID');
  }
  const record = issuedTickets.get(input.ticket);
  if (!record || record.used) return deny('PROOF_INVALID');
  // Mark consumed even when the proposed scope is wrong.
  record.used = true;
  if (scopeKeys.some((key) =>
    record.scope[key] !== input.expectedScope[key]) ||
    Object.keys(input.expectedScope).length !== scopeKeys.length) {
    return deny('PROOF_INVALID');
  }
}
