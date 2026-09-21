import {
  getServerPreparedChatReceiveContentEntryV1,
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
import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import {
  getCharacterRelationship,
  type CharacterRelationshipReadAuthorityPortV1,
} from './character-relationship-read.js';

export type CharacterStandardReadingChatTurnServerContextInputV1 = Omit<
  CharacterStandardReadingChatBaseContextInputV1,
  'character' | 'contentBundleId' | 'worldRelations' | 'relationshipState'
>;

export interface PrepareCharacterStandardReadingChatTurnPreflightInputV1 {
  readonly resolvedSubjectId?: string;
  readonly receivePlan: ChatReceivePlan;
  readonly readingId: unknown;
  readonly effectiveAt: unknown;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1;
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

function assertNoCallerContentAuthorityFields(
  input: CharacterStandardReadingChatTurnServerContextInputV1,
): void {
  for (const field of [
    'character',
    'contentBundleId',
    'worldRelations',
    'relationshipState',
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      throw new CharacterStandardReadingChatTurnPreflightErrorV1(
        `Official Reading Reader follow-up preflight does not accept caller-supplied ${field} authority.`,
      );
    }
  }
}

function findExactReaderCharacter(
  characterId: string,
  characters: ReturnType<typeof getServerPreparedChatReceiveContentEntryV1>['characters']['characters'],
) {
  const matches = characters.filter((character) => character.characterId === characterId);
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Pinned Chat release does not contain exactly one authored Reader Character.',
    );
  }
  return matches[0];
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
 * Character/world canon is recovered only from the exact server-bound immutable
 * release entry. Current relationship scores/stage/revision are independently
 * re-read from stored relationship authority. Caller-supplied Character/bundle/
 * world/relationship-state authority is rejected.
 *
 * It does not call a model/provider, create a chat turn/attempt, commit a message,
 * expose an HTTP send route, or weaken SRC-15 fail-closed behavior. Until the
 * client/content compatibility authority is resolved, Production cannot mint a
 * positive receive plan and therefore cannot pass this preflight.
 */
export async function prepareCharacterStandardReadingChatTurnPreflightV1(
  input: PrepareCharacterStandardReadingChatTurnPreflightInputV1,
): Promise<CharacterStandardReadingChatTurnPreflightV1> {
  assertNoCallerContentAuthorityFields(input.contextInput);
  const contentEntry = getServerPreparedChatReceiveContentEntryV1(input.receivePlan);

  const request = input.receivePlan.normalizedRequest;
  if (input.receivePlan.isNewThread || request.threadId === undefined) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Official Reading Reader follow-up preflight requires an existing server-bound thread.',
    );
  }

  const subjectBinding =
    input.resolvedSubjectId === undefined
      ? {}
      : { resolvedSubjectId: input.resolvedSubjectId };

  const initialThreadBinding = await getChatThreadRuntimeBinding({
    ...subjectBinding,
    threadId: request.threadId,
    authorityPort: input.threadBindingAuthorityPort,
  });

  if (initialThreadBinding.participantCharacterIds.length !== 1) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Official Reading Reader follow-up preflight requires an active single-Character thread.',
    );
  }
  if (initialThreadBinding.activeContentReleaseId !== input.receivePlan.resolvedContent.releaseId) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Chat receive release no longer matches the current owned thread binding.',
    );
  }
  if (initialThreadBinding.activeContentBundleId !== input.receivePlan.resolvedContent.bundleId) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Chat receive bundle no longer matches the current owned thread binding.',
    );
  }

  const readerCharacterId = initialThreadBinding.participantCharacterIds[0];
  if (readerCharacterId === undefined) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Official Reading Reader follow-up thread has no active Reader.',
    );
  }
  if (
    input.receivePlan.requestedCharacterId !== undefined &&
    input.receivePlan.requestedCharacterId !== readerCharacterId
  ) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Chat receive Character no longer matches the current thread Reader.',
    );
  }

  const character = findExactReaderCharacter(
    readerCharacterId,
    contentEntry.characters.characters,
  );
  const worldRelations = contentEntry.world.characterRelations.filter(
    (relation) =>
      relation.fromCharacterId === readerCharacterId ||
      relation.toCharacterId === readerCharacterId,
  );

  const relationship = await getCharacterRelationship({
    ...subjectBinding,
    characterId: readerCharacterId,
    authorityPort: input.relationshipAuthorityPort,
  });
  if (relationship.relationship === null) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV1(
      'Official Reading Reader follow-up requires a stored current relationship projection.',
    );
  }
  const relationshipState = Object.freeze({
    closeness: relationship.relationship.closeness,
    trust: relationship.relationship.trust,
    friction: relationship.relationship.friction,
    stage: relationship.relationship.relationshipStage,
    revision: relationship.relationship.revision,
    policyVersion: relationship.relationship.policyVersion,
  });

  const runtime = await prepareCharacterStandardReadingThreadRuntimeV1({
    ...subjectBinding,
    threadId: request.threadId,
    readingId: input.readingId,
    effectiveAt: input.effectiveAt,
    threadBindingAuthorityPort: input.threadBindingAuthorityPort,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
    contextInput: {
      ...input.contextInput,
      character,
      contentBundleId: contentEntry.release.bundleId,
      relationshipState,
      worldRelations,
    },
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
  return Object.freeze({
    receivePlan: input.receivePlan,
    runtime,
  });
}
