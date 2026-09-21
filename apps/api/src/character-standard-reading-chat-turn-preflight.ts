import {
  assertServerPreparedChatReceivePlanV1,
  type ChatReceivePlan,
} from './chat-receive.js';
import {
  prepareCharacterStandardReadingThreadRuntimeV1,
  type CharacterStandardReadingThreadRuntimeV1,
} from './character-standard-reading-chat-turn-context.js';
import type { CharacterStandardReadingChatBaseContextInputV1 } from './character-standard-reading-chat-context.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from './character-standard-reading-knowledge.js';
import type { ChatThreadRuntimeBindingReadAuthorityPortV1 } from './chat-thread-runtime-binding-read.js';

export interface PrepareCharacterStandardReadingChatTurnPreflightInputV1 {
  readonly resolvedSubjectId?: string;
  readonly receivePlan: ChatReceivePlan;
  readonly readingId: unknown;
  readonly effectiveAt: unknown;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly contextInput: CharacterStandardReadingChatBaseContextInputV1;
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
 * This boundary composes two independently governed results:
 * 1. a Chat receive plan minted only after request/content compatibility authority
 *    accepted the request; and
 * 2. a fresh owner/thread/Reader/Official-Reading reread assembled by the
 *    thread-bound Reader Knowledge runtime.
 *
 * It does not call a model/provider, create a chat turn/attempt, commit a message,
 * expose an HTTP send route, or weaken SRC-15 fail-closed behavior. Until the
 * client/content compatibility authority is resolved, Production cannot mint a
 * positive receive plan and therefore cannot pass this preflight.
 */
export async function prepareCharacterStandardReadingChatTurnPreflightV1(
  input: PrepareCharacterStandardReadingChatTurnPreflightInputV1,
): Promise<CharacterStandardReadingChatTurnPreflightV1> {
  assertServerPreparedChatReceivePlanV1(input.receivePlan);

  const request = input.receivePlan.normalizedRequest;
  if (input.receivePlan.isNewThread || request.threadId === undefined) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Official Reading Reader follow-up preflight requires an existing server-bound thread.',
    );
  }

  const runtime = await prepareCharacterStandardReadingThreadRuntimeV1({
    ...(input.resolvedSubjectId === undefined
      ? {}
      : { resolvedSubjectId: input.resolvedSubjectId }),
    threadId: request.threadId,
    readingId: input.readingId,
    effectiveAt: input.effectiveAt,
    threadBindingAuthorityPort: input.threadBindingAuthorityPort,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
    contextInput: input.contextInput,
  });

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
  if (
    input.receivePlan.requestedCharacterId !== undefined &&
    input.receivePlan.requestedCharacterId !== runtime.source.readerCharacterId
  ) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Chat receive Character no longer matches the current thread Reader.',
    );
  }

  return Object.freeze({
    receivePlan: input.receivePlan,
    runtime,
  });
}
