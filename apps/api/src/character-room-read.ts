import { ApiCommandError } from './chat-receive.js';
import {
  getCharacterRelationship,
  type CharacterRelationshipReadAuthorityPortV1,
  type CharacterRelationshipReadItemV1,
} from './character-relationship-read.js';
import {
  resolveCharacterPresentationIdentity,
  type CharacterPresentationIdentityAuthorityPortV1,
  type CharacterPresentationKeyV1,
} from './character-presentation-resolver.js';
import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import {
  getChatThreadStream,
  type ChatThreadStreamMessageV1,
  type ChatThreadStreamReadAuthorityPortV1,
} from './chat-thread-stream-read.js';

export interface CharacterRoomReadStateV1 {
  readonly threadId: string;
  readonly characterId: string;
  readonly afterSequenceNo: number;
  readonly lastSequenceNo: number;
  readonly messages: readonly ChatThreadStreamMessageV1[];
  readonly latestCharacterMessage: ChatThreadStreamMessageV1 | null;
  readonly relationship: Readonly<CharacterRelationshipReadItemV1> | null;
}

export interface CharacterRoomPresentationReadStateV1
  extends CharacterRoomReadStateV1 {
  readonly presentationKey: CharacterPresentationKeyV1;
  readonly contentReleaseId: string;
  readonly contentBundleId: string;
  readonly contentRevision: number;
}

export interface ReadCharacterRoomStateInputV1 {
  readonly resolvedSubjectId?: string;
  readonly threadId: unknown;
  readonly characterId: unknown;
  readonly afterSequenceNo?: unknown;
  readonly streamAuthorityPort: ChatThreadStreamReadAuthorityPortV1;
  readonly relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1;
}

export interface ReadCharacterRoomStateByPresentationKeyInputV1 {
  readonly resolvedSubjectId?: string;
  readonly threadId: unknown;
  readonly presentationKey: unknown;
  readonly afterSequenceNo?: unknown;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly identityAuthorityPort: CharacterPresentationIdentityAuthorityPortV1;
  readonly streamAuthorityPort: ChatThreadStreamReadAuthorityPortV1;
  readonly relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1;
}

function requireCharacterId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'characterId must be a non-empty string.');
  }
  return value.trim();
}

function requireAfterSequenceNo(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'afterSequenceNo must be a non-negative safe integer.',
    );
  }
  return value;
}

function findLatestCharacterMessage(
  messages: readonly ChatThreadStreamMessageV1[],
  characterId: string,
): ChatThreadStreamMessageV1 | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message !== undefined &&
      !message.redacted &&
      message.senderType === 'character' &&
      message.characterId === characterId &&
      message.bodyText !== null &&
      message.bodyText.trim().length > 0
    ) {
      return message;
    }
  }
  return null;
}

/**
 * Character Room read composition over already canonical server-side characterId.
 *
 * This function does not infer a Life Thread, summarize past messages, create a
 * relationship baseline, or fabricate a character line. It only combines the
 * already owner-authorized stored chat stream and current relationship projection.
 */
export async function readCharacterRoomState(
  input: ReadCharacterRoomStateInputV1,
): Promise<CharacterRoomReadStateV1> {
  const characterId = requireCharacterId(input.characterId);
  const afterSequenceNo = requireAfterSequenceNo(input.afterSequenceNo);
  const subjectBinding =
    input.resolvedSubjectId === undefined
      ? {}
      : { resolvedSubjectId: input.resolvedSubjectId };

  const [stream, relationshipResponse] = await Promise.all([
    getChatThreadStream({
      ...subjectBinding,
      threadId: input.threadId,
      afterSequenceNo,
      authorityPort: input.streamAuthorityPort,
    }),
    getCharacterRelationship({
      ...subjectBinding,
      characterId,
      authorityPort: input.relationshipAuthorityPort,
    }),
  ]);

  const lastSequenceNo =
    stream.messages.length === 0
      ? afterSequenceNo
      : (stream.messages[stream.messages.length - 1]?.sequenceNo ?? afterSequenceNo);

  return Object.freeze({
    threadId: stream.threadId,
    characterId,
    afterSequenceNo,
    lastSequenceNo,
    messages: stream.messages,
    latestCharacterMessage: findLatestCharacterMessage(stream.messages, characterId),
    relationship: relationshipResponse.relationship,
  });
}

/**
 * HTTP/UI-facing Character Room composition.
 *
 * The client supplies only its owned thread identity and a presentation key.
 * Thread authority resolves the active release/bundle and active participants;
 * content authority then resolves the presentation key inside that exact bundle.
 * The canonical character must also be an active participant before any
 * relationship or message projection is read for the room.
 */
export async function readCharacterRoomStateByPresentationKey(
  input: ReadCharacterRoomStateByPresentationKeyInputV1,
): Promise<CharacterRoomPresentationReadStateV1> {
  const subjectBinding =
    input.resolvedSubjectId === undefined
      ? {}
      : { resolvedSubjectId: input.resolvedSubjectId };

  const threadBinding = await getChatThreadRuntimeBinding({
    ...subjectBinding,
    threadId: input.threadId,
    authorityPort: input.threadBindingAuthorityPort,
  });

  const identity = await resolveCharacterPresentationIdentity({
    contentBundleId: threadBinding.activeContentBundleId,
    presentationKey: input.presentationKey,
    authorityPort: input.identityAuthorityPort,
  });

  if (!threadBinding.participantCharacterIds.includes(identity.characterId)) {
    throw new ApiCommandError(
      'NOT_FOUND',
      'Character is not an active participant in this chat thread.',
    );
  }

  const cursorBinding =
    input.afterSequenceNo === undefined
      ? {}
      : { afterSequenceNo: input.afterSequenceNo };

  const roomState = await readCharacterRoomState({
    ...subjectBinding,
    ...cursorBinding,
    threadId: threadBinding.threadId,
    characterId: identity.characterId,
    streamAuthorityPort: input.streamAuthorityPort,
    relationshipAuthorityPort: input.relationshipAuthorityPort,
  });

  return Object.freeze({
    ...roomState,
    presentationKey: identity.presentationKey,
    contentReleaseId: threadBinding.activeContentReleaseId,
    contentBundleId: threadBinding.activeContentBundleId,
    contentRevision: threadBinding.contentRevision,
  });
}
