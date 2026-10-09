import {
  prepareOfficialReadingReaderAdmissionV1,
  consumeOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import type { ProductReaderEligibilityAuthorityPortV1 } from './product-reader-eligibility-policy-v1.js';
import {
  getServerPreparedChatReceiveContentEntryV1,
  type ChatReceivePlan,
} from './chat-receive.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from './character-standard-reading-knowledge.js';
import type {
  ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import type {
  CharacterRelationshipReadAuthorityPortV1,
} from './character-relationship-read.js';
import type {
  MemoryItemsReadAuthorityPortV1,
} from './memory-items-read.js';
import type {
  MemoryGrantsReadAuthorityPortV1,
} from './memory-grants-read.js';
import type {
  ReaderContextNonMemoryReadAuthorityPortV1,
} from './reader-context-non-memory-read.js';
import {
  CharacterStandardReadingServerRuntimeAuthorityErrorV1,
  prepareCharacterStandardReadingServerRuntimeV1,
  type CharacterStandardReadingServerContextInputV1,
} from './character-standard-reading-server-runtime-authority.js';
import type {
  CharacterStandardReadingThreadRuntimeV1,
} from './character-standard-reading-chat-turn-context.js';

export type CharacterStandardReadingChatTurnServerContextInputV1 =
  CharacterStandardReadingServerContextInputV1;

export interface PrepareCharacterStandardReadingChatTurnPreflightInputV1 {
  readonly resolvedSubjectId?: string;
  readonly receivePlan: ChatReceivePlan;
  readonly readingId: unknown;
  readonly effectiveAt: unknown;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  /** Mandatory A2 Product/Commerce policy authority: absence fails closed. */
  readonly productReaderEligibilityAuthorityPort?: ProductReaderEligibilityAuthorityPortV1;
  readonly relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1;
  readonly memoryItemsAuthorityPort: MemoryItemsReadAuthorityPortV1;
  readonly memoryGrantsAuthorityPort: MemoryGrantsReadAuthorityPortV1;
  readonly nonMemoryContextAuthorityPort: ReaderContextNonMemoryReadAuthorityPortV1;
  readonly contextInput: CharacterStandardReadingChatTurnServerContextInputV1;
}

export interface CharacterStandardReadingChatTurnPreflightV1 {
  readonly receivePlan: ChatReceivePlan;
  readonly runtime: CharacterStandardReadingThreadRuntimeV1;
}

export class CharacterStandardReadingChatTurnPreflightErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterStandardReadingChatTurnPreflightErrorV1';
  }
}

/**
 * Server-only, non-generative Reader follow-up preflight.
 *
 * The Chat receive plan proves compatibility and immutable release provenance.
 * Shared Reader runtime authority then re-reads the owned thread, exact pinned
 * Character/world canon, relationship state, Memory grants, Reader access and
 * Official Reading source. No caller-supplied content authority is admitted.
 */
export async function prepareCharacterStandardReadingChatTurnPreflightV1(
  input: PrepareCharacterStandardReadingChatTurnPreflightInputV1,
): Promise<CharacterStandardReadingChatTurnPreflightV1> {
  if (!input.productReaderEligibilityAuthorityPort) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Approved Product Reader policy authority is required for Official Reading Chat.',
    );
  }
  const contentEntry = getServerPreparedChatReceiveContentEntryV1(input.receivePlan);
  const request = input.receivePlan.normalizedRequest;

  if (input.receivePlan.isNewThread || request.threadId === undefined) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Official Reading Reader follow-up preflight requires an existing server-bound thread.',
    );
  }

  // Re-validate exact Subject × Thread × Reader × Reading Grant and Product
  // eligibility before the downstream legacy Character source/assembly seam.
  // The A2 ticket is one-use and is consumed only after the source and
  // current thread revision have been independently checked again.
  const admission = await prepareOfficialReadingReaderAdmissionV1({
    ...(input.resolvedSubjectId === undefined
      ? {} : { resolvedSubjectId: input.resolvedSubjectId }),
    threadId: request.threadId,
    readingId: input.readingId,
    effectiveAt: input.effectiveAt,
    contentEntry,
    threadBindingAuthorityPort: input.threadBindingAuthorityPort,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
    productReaderEligibilityAuthorityPort: input.productReaderEligibilityAuthorityPort,
  });

  let runtime: CharacterStandardReadingThreadRuntimeV1;
  try {
    runtime = await prepareCharacterStandardReadingServerRuntimeV1({
      ...(input.resolvedSubjectId === undefined
        ? {}
        : { resolvedSubjectId: input.resolvedSubjectId }),
      threadId: request.threadId,
      readingId: input.readingId,
      effectiveAt: input.effectiveAt,
      contentEntry,
      ...(input.receivePlan.requestedCharacterId === undefined
        ? {}
        : { expectedReaderCharacterId: input.receivePlan.requestedCharacterId }),
      threadBindingAuthorityPort: input.threadBindingAuthorityPort,
      accessAuthorityPort: input.accessAuthorityPort,
      artifactAuthorityPort: input.artifactAuthorityPort,
      relationshipAuthorityPort: input.relationshipAuthorityPort,
      memoryItemsAuthorityPort: input.memoryItemsAuthorityPort,
      memoryGrantsAuthorityPort: input.memoryGrantsAuthorityPort,
      nonMemoryContextAuthorityPort: input.nonMemoryContextAuthorityPort,
      contextInput: input.contextInput,
    });
  } catch (error) {
    if (error instanceof CharacterStandardReadingServerRuntimeAuthorityErrorV1) {
      throw new CharacterStandardReadingChatTurnPreflightErrorV1(error.message);
    }
    throw error;
  }

  if (runtime.threadBinding.activeContentReleaseId !== input.receivePlan.resolvedContent.releaseId) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Chat receive release no longer matches the current owned thread binding.',
    );
  }
  if (runtime.threadBinding.activeContentBundleId !== input.receivePlan.resolvedContent.bundleId) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Chat receive bundle no longer matches the current owned thread binding.',
    );
  }

  const scope = admission.scope;
  const current = runtime.source;
  const thread = runtime.threadBinding;
  if (thread.threadId !== scope.threadId ||
      thread.contentRevision !== scope.contentRevision ||
      thread.activeContentReleaseId !== scope.contentReleaseId ||
      thread.activeContentBundleId !== scope.readerContentBundleId ||
      thread.participantCharacterIds.length !== 1 ||
      thread.participantCharacterIds[0] !== scope.readerCharacterId ||
      runtime.context.characterId !== scope.readerCharacterId ||
      runtime.context.contentBundleId !== scope.readerContentBundleId ||
      current.subjectId !== scope.subjectId ||
      current.readingId !== scope.readingId ||
      current.readerCharacterId !== scope.readerCharacterId ||
      current.readerContentBundleId !== scope.readerContentBundleId ||
      current.productId !== scope.productId ||
      current.productSpecVersion !== scope.productSpecVersion ||
      current.sajuDomain !== scope.sajuDomain ||
      current.readingContractVersion !== scope.readingContractVersion ||
      current.responseHash !== scope.officialArtifactResponseHash) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Official Reading Chat source or owned Reader thread changed after A2 admission.',
    );
  }

  consumeOfficialReadingReaderAdmissionV1({
    ticket: admission.ticket,
    expectedScope: Object.freeze({
      ...scope,
      subjectId: current.subjectId,
      threadId: thread.threadId,
      contentRevision: thread.contentRevision,
      readingId: current.readingId,
      readerCharacterId: current.readerCharacterId,
      readerContentBundleId: current.readerContentBundleId,
      contentReleaseId: thread.activeContentReleaseId,
      productId: current.productId,
      productSpecVersion: current.productSpecVersion,
      sajuDomain: current.sajuDomain,
      readingContractVersion: current.readingContractVersion,
      officialArtifactResponseHash: current.responseHash,
    }),
  });

  return Object.freeze({
    receivePlan: input.receivePlan,
    runtime,
  });
}
