import { ApiCommandError } from './chat-receive.js';
import {
  getCharacterRelationship,
  type CharacterRelationshipReadAuthorityPortV1,
  type CharacterRelationshipReadItemV1,
} from './character-relationship-read.js';
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

export interface ReadCharacterRoomStateInputV1 {
  readonly resolvedSubjectId?: string;
  readonly threadId: unknown;
  readonly characterId: unknown;
  readonly afterSequenceNo?: unknown;
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
 * Character Room read composition.
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

  const [stream, relationshipResponse] = await Promise.all([
    getChatThreadStream({
      resolvedSubjectId: input.resolvedSubjectId,
      threadId: input.threadId,
      afterSequenceNo,
      authorityPort: input.streamAuthorityPort,
    }),
    getCharacterRelationship({
      resolvedSubjectId: input.resolvedSubjectId,
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
