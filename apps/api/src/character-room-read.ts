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
  readonly contentBundleId: string;
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
  readonly contentBundleId: unknown;
  readonly presentationKey: unknown;
  readonly afterSequenceNo?: unknown;
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
 * The browser-facing presentation key is resolved through trusted content
 * authority first. `contentBundleId` must be server-resolved from the pinned or
 * otherwise authoritative content release; it must never be trusted from the
 * browser as proof of content membership.
 */
export async function readCharacterRoomStateByPresentationKey(
  input: ReadCharacterRoomStateByPresentationKeyInputV1,
): Promise<CharacterRoomPresentationReadStateV1> {
  const identity = await resolveCharacterPresentationIdentity({
    contentBundleId: input.contentBundleId,
    presentationKey: input.presentationKey,
    authorityPort: input.identityAuthorityPort,
  });
  const subjectBinding =
    input.resolvedSubjectId === undefined
      ? {}
      : { resolvedSubjectId: input.resolvedSubjectId };
  const cursorBinding =
    input.afterSequenceNo === undefined
      ? {}
      : { afterSequenceNo: input.afterSequenceNo };

  const roomState = await readCharacterRoomState({
    ...subjectBinding,
    ...cursorBinding,
    threadId: input.threadId,
    characterId: identity.characterId,
    streamAuthorityPort: input.streamAuthorityPort,
    relationshipAuthorityPort: input.relationshipAuthorityPort,
  });

  return Object.freeze({
    ...roomState,
    presentationKey: identity.presentationKey,
    contentBundleId: identity.contentBundleId,
  });
}
