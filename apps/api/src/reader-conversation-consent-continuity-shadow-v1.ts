import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import {
  getCharacterRelationship,
  type CharacterRelationshipReadAuthorityPortV1,
} from './character-relationship-read.js';
import {
  getMemoryItems,
  type MemoryItemsReadAuthorityPortV1,
} from './memory-items-read.js';
import {
  getMemoryGrants,
  type MemoryGrantsReadAuthorityPortV1,
} from './memory-grants-read.js';

export const READER_CONVERSATION_CONSENT_CONTINUITY_SHADOW_VERSION_V1 =
  'reader-conversation-consent-continuity-shadow-v1' as const;

export class ReaderConversationConsentContinuityHoldV1 extends Error {
  constructor(
    readonly code: 'INVALID_SCOPE' | 'SOURCE_UNAVAILABLE' |
      'READER_MISMATCH' | 'GRANT_CONFLICT' | 'SOURCE_CHANGED',
  ) {
    super('Reader conversation continuity source candidate is unavailable.');
    this.name = 'ReaderConversationConsentContinuityHoldV1';
  }
}

export interface ReaderConversationConsentContinuityMemoryRefV1 {
  readonly memoryItemId: string;
  readonly grantId: string;
  readonly memoryType: string;
  readonly schemaVersion: string;
  readonly sourceKind: 'owner_memory_item_and_reader_current_grant';
  readonly officialSajuEvidence: false;
  readonly permitsModelInjection: false;
}

export interface ReaderConversationConsentContinuityShadowV1 {
  readonly schemaVersion: typeof READER_CONVERSATION_CONSENT_CONTINUITY_SHADOW_VERSION_V1;
  readonly mode: 'non_authorizing_source_candidate';
  readonly subjectId: string;
  readonly threadId: string;
  readonly readerCharacterId: string;
  readonly contentReleaseId: string;
  readonly contentBundleId: string;
  readonly contentRevision: number;
  readonly relationship: Readonly<{
    sourceKind: 'current_reader_relationship_projection';
    revision: number;
    policyVersion: string;
    stage: string;
  }>;
  readonly consentMemoryRefs: readonly ReaderConversationConsentContinuityMemoryRefV1[];
  readonly sourceDigest: string;
  readonly officialReadingRef: null;
  readonly officialSajuSourceUnitRefs: readonly [];
  readonly modelContextPinned: false;
  readonly permitsModelInjection: false;
  readonly permitsCommit: false;
  readonly permitsHttpReveal: false;
  readonly addedModelCalls: 0;
}

export interface PrepareReaderConversationConsentContinuityShadowInputV1 {
  readonly resolvedSubjectId: string;
  readonly threadId: string;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1;
  readonly memoryItemsAuthorityPort: MemoryItemsReadAuthorityPortV1;
  readonly memoryGrantsAuthorityPort: MemoryGrantsReadAuthorityPortV1;
}

function hold(code: ReaderConversationConsentContinuityHoldV1['code']): never {
  throw new ReaderConversationConsentContinuityHoldV1(code);
}

function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 128 && value === value.trim();
}

function dataId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 256 && value === value.trim();
}

function sameThread(
  a: Awaited<ReturnType<typeof getChatThreadRuntimeBinding>>,
  b: Awaited<ReturnType<typeof getChatThreadRuntimeBinding>>,
): boolean {
  return a.threadId === b.threadId &&
    a.activeContentReleaseId === b.activeContentReleaseId &&
    a.activeContentBundleId === b.activeContentBundleId &&
    a.contentRevision === b.contentRevision &&
    a.participantCharacterIds.length === 1 &&
    b.participantCharacterIds.length === 1 &&
    a.participantCharacterIds[0] === b.participantCharacterIds[0];
}

/**
 * RR-08 server-only source candidate for conversational continuity.
 *
 * Uses the existing owned Thread, current Relationship and current per-Reader
 * Memory Grant authority. It never consults or reconstructs an Official Reading,
 * consumes raw memory content, calls a model, or grants disclosure.
 * The second reads only detect already-visible races: NO atomic G1 Pin exists
 * here. The Security/DB Owner must independently authorize and pin any
 * positive personal record before provider use or final Commit/Reveal.
 */
export async function prepareReaderConversationConsentContinuityShadowV1(
  input: PrepareReaderConversationConsentContinuityShadowInputV1,
): Promise<ReaderConversationConsentContinuityShadowV1> {
  if (!id(input.resolvedSubjectId) || !id(input.threadId)) {
    return hold('INVALID_SCOPE');
  }
  const subjectId = input.resolvedSubjectId;
  const threadId = input.threadId;
  let first: Awaited<ReturnType<typeof getChatThreadRuntimeBinding>>;
  try {
    first = await getChatThreadRuntimeBinding({
      resolvedSubjectId: subjectId,
      threadId, authorityPort: input.threadBindingAuthorityPort,
    });
  } catch {
    return hold('SOURCE_UNAVAILABLE');
  }
  if (first.participantCharacterIds.length !== 1 ||
      !dataId(first.participantCharacterIds[0])) {
    return hold('READER_MISMATCH');
  }
  const readerCharacterId = first.participantCharacterIds[0]!;

  let relationship: Awaited<ReturnType<typeof getCharacterRelationship>>['relationship'];
  let items: Awaited<ReturnType<typeof getMemoryItems>>['memories'];
  try {
    relationship = (await getCharacterRelationship({
      resolvedSubjectId: subjectId, characterId: readerCharacterId,
      authorityPort: input.relationshipAuthorityPort,
    })).relationship;
    items = (await getMemoryItems({
      resolvedSubjectId: subjectId,
      authorityPort: input.memoryItemsAuthorityPort,
    })).memories;
  } catch {
    return hold('SOURCE_UNAVAILABLE');
  }
  if (relationship === null || !Number.isSafeInteger(relationship.revision) ||
      relationship.revision < 0 ||
      !dataId(relationship.policyVersion) || !dataId(relationship.relationshipStage) ||
      items.length > 32) {
    return hold('SOURCE_UNAVAILABLE');
  }

  const selected: ReaderConversationConsentContinuityMemoryRefV1[] = [];
  const seenMemoryIds = new Set<string>();
  const seenGrantIds = new Set<string>();
  for (const memory of items) {
    if (!dataId(memory.memoryItemId) || !dataId(memory.memoryType) ||
        !dataId(memory.schemaVersion) || seenMemoryIds.has(memory.memoryItemId)) {
      return hold('SOURCE_UNAVAILABLE');
    }
    seenMemoryIds.add(memory.memoryItemId);
    let grants: Awaited<ReturnType<typeof getMemoryGrants>>['grants'];
    try {
      grants = (await getMemoryGrants({
        resolvedSubjectId: subjectId, memoryItemId: memory.memoryItemId,
        authorityPort: input.memoryGrantsAuthorityPort,
      })).grants;
    } catch {
      return hold('SOURCE_UNAVAILABLE');
    }
    const forReader = grants.filter(g => g.characterId === readerCharacterId);
    if (forReader.length > 1) return hold('GRANT_CONFLICT');
    if (forReader.length === 0) continue;
    const grant = forReader[0]!;
    if (!dataId(grant.grantId) || seenGrantIds.has(grant.grantId)) {
      return hold('GRANT_CONFLICT');
    }
    seenGrantIds.add(grant.grantId);
    if (selected.length >= 8) continue;
    selected.push(Object.freeze({
      memoryItemId: memory.memoryItemId, grantId: grant.grantId,
      memoryType: memory.memoryType, schemaVersion: memory.schemaVersion,
      sourceKind: 'owner_memory_item_and_reader_current_grant' as const,
      officialSajuEvidence: false as const,
      permitsModelInjection: false as const,
    }));
  }

  // Reject observed removal/Reader reassignment and relationship drift. A
  // concurrent revocation AFTER this read still requires the DB-owner G1 pin.
  try {
    const next = await getChatThreadRuntimeBinding({
      resolvedSubjectId: subjectId, threadId,
      authorityPort: input.threadBindingAuthorityPort,
    });
    if (!sameThread(first, next)) return hold('SOURCE_CHANGED');
    const recent = (await getCharacterRelationship({
      resolvedSubjectId: subjectId, characterId: readerCharacterId,
      authorityPort: input.relationshipAuthorityPort,
    })).relationship;
    if (!recent || recent.stateId !== relationship.stateId ||
        recent.revision !== relationship.revision ||
        recent.policyVersion !== relationship.policyVersion ||
        recent.relationshipStage !== relationship.relationshipStage) {
      return hold('SOURCE_CHANGED');
    }
    for (const ref of selected) {
      const grants = (await getMemoryGrants({
        resolvedSubjectId: subjectId, memoryItemId: ref.memoryItemId,
        authorityPort: input.memoryGrantsAuthorityPort,
      })).grants;
      const matching = grants.filter(g => g.characterId === readerCharacterId);
      if (matching.length !== 1 || matching[0]?.grantId !== ref.grantId) {
        return hold('SOURCE_CHANGED');
      }
    }
  } catch {
    return hold('SOURCE_CHANGED');
  }

  const relationshipRef = Object.freeze({
    sourceKind: 'current_reader_relationship_projection' as const,
    revision: relationship.revision,
    policyVersion: relationship.policyVersion,
    stage: relationship.relationshipStage,
  });
  const consentMemoryRefs = Object.freeze(selected);
  const source = {
    schemaVersion: READER_CONVERSATION_CONSENT_CONTINUITY_SHADOW_VERSION_V1,
    mode: 'non_authorizing_source_candidate' as const,
    subjectId, threadId, readerCharacterId,
    contentReleaseId: first.activeContentReleaseId,
    contentBundleId: first.activeContentBundleId,
    contentRevision: first.contentRevision,
    relationship: relationshipRef,
    consentMemoryRefs,
    officialReadingRef: null,
    officialSajuSourceUnitRefs: Object.freeze([]) as readonly [],
    modelContextPinned: false as const,
    permitsModelInjection: false as const,
    permitsCommit: false as const,
    permitsHttpReveal: false as const,
    addedModelCalls: 0 as const,
  };
  return Object.freeze({
    ...source,
    sourceDigest: 'sha256:v1:' + createHash('sha256')
      .update(canonicalJson(source)).digest('hex'),
  });
}
