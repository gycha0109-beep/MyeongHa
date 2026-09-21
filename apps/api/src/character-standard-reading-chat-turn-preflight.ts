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
  const contentEntry = getServerPreparedChatReceiveContentEntryV1(input.receivePlan);
  const request = input.receivePlan.normalizedRequest;

  if (input.receivePlan.isNewThread || request.threadId === undefined) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Official Reading Reader follow-up preflight requires an existing server-bound thread.',
    );
  }

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

  return Object.freeze({
    receivePlan: input.receivePlan,
    runtime,
  });
}
