import {
  getCharacterRelationship,
  type CharacterRelationshipReadAuthorityPortV1,
} from './character-relationship-read.js';
import type {
  ReaderContextMemoryReadAuthorityPortV1,
} from './reader-context-memory-read.js';
import type {
  ReaderContextNonMemoryReadAuthorityPortV1,
} from './reader-context-non-memory-read.js';
import {
  buildCharacterWorkingMemoryProjectionV1,
  type CharacterWorkingMemoryProjectionV1,
  type CharacterWorkingMemoryRecordProjectorV1,
} from '../../../packages/domain/src/character-working-memory-projection-v1.js';

export interface PrepareCharacterWorkingMemoryContextInputV1 {
  readonly resolvedSubjectId: string;
  readonly threadBinding: Readonly<{
    readonly threadId: string;
    readonly participantCharacterIds: readonly string[];
  }>;
  readonly characterId: string;
  readonly currentUserMessageRef: string;
  readonly expectedRelationshipRevision: number | null;
  readonly recentMessageLimit: number;
  readonly relationshipEventLimit: number;
  readonly memoryAuthorityPort: ReaderContextMemoryReadAuthorityPortV1;
  readonly nonMemoryAuthorityPort: ReaderContextNonMemoryReadAuthorityPortV1;
  readonly relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1;
  /** Server-owned positive projector registry; intentionally empty until source-approved. */
  readonly projectors?: readonly CharacterWorkingMemoryRecordProjectorV1[];
}

function requirePositiveLimit(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value >= Number.MAX_SAFE_INTEGER) {
    throw new TypeError(label + ' must be a positive safe integer.');
  }
  return value;
}

/**
 * Reads the existing owner/Character authorities and creates a read-only
 * Working Memory projection for one pinned thread turn.
 *
 * All supplied PostgreSQL ports MUST share the same transaction-bound client
 * and canonical Subject context. The thread binding must already have been
 * resolved by server authority. This function never calls a model/provider,
 * writes a record, changes a grant, or retrieves Official Reading content.
 */
export async function prepareCharacterWorkingMemoryContextV1(
  input: PrepareCharacterWorkingMemoryContextInputV1,
): Promise<CharacterWorkingMemoryProjectionV1> {
  if (
    typeof input.resolvedSubjectId !== 'string' ||
    input.resolvedSubjectId.trim().length === 0 ||
    typeof input.characterId !== 'string' ||
    input.characterId.trim().length === 0 ||
    typeof input.threadBinding.threadId !== 'string' ||
    input.threadBinding.threadId.trim().length === 0 ||
    !input.threadBinding.participantCharacterIds.includes(input.characterId)
  ) {
    throw new TypeError(
      'Working Memory requires a resolved Subject and an active server-bound Character thread.',
    );
  }

  const recentMessageLimit = requirePositiveLimit(
    input.recentMessageLimit,
    'recentMessageLimit',
  );
  const relationshipEventLimit = requirePositiveLimit(
    input.relationshipEventLimit,
    'relationshipEventLimit',
  );
  const beforeRevision = input.expectedRelationshipRevision ?? 0;
  if (
    input.expectedRelationshipRevision !== null &&
    (!Number.isSafeInteger(input.expectedRelationshipRevision) ||
      input.expectedRelationshipRevision < 0)
  ) {
    throw new TypeError('expectedRelationshipRevision must be a non-negative integer or null.');
  }

  const [memories, lifeFacts, relationshipEvents, recentMessages, relationshipResponse] =
    await Promise.all([
      input.memoryAuthorityPort.readGrantedMemories({
        subjectId: input.resolvedSubjectId,
        characterId: input.characterId,
      }),
      input.nonMemoryAuthorityPort.readGrantedLifeFacts({
        subjectId: input.resolvedSubjectId,
        characterId: input.characterId,
      }),
      input.nonMemoryAuthorityPort.readRelationshipEvents({
        subjectId: input.resolvedSubjectId,
        characterId: input.characterId,
        beforeRevision,
        limit: relationshipEventLimit,
      }),
      input.nonMemoryAuthorityPort.readRecentMessages({
        subjectId: input.resolvedSubjectId,
        threadId: input.threadBinding.threadId,
        limit: recentMessageLimit + 1,
      }),
      getCharacterRelationship({
        resolvedSubjectId: input.resolvedSubjectId,
        characterId: input.characterId,
        authorityPort: input.relationshipAuthorityPort,
      }),
    ]);

  return buildCharacterWorkingMemoryProjectionV1({
    scope: {
      subjectId: input.resolvedSubjectId,
      characterId: input.characterId,
      threadId: input.threadBinding.threadId,
      authorizedThreadCharacterIds: input.threadBinding.participantCharacterIds,
      relationshipRevision: input.expectedRelationshipRevision,
    },
    currentUserMessageRef: input.currentUserMessageRef,
    memories,
    lifeFacts,
    relationship: relationshipResponse.relationship,
    relationshipEvents,
    recentMessages,
    projectors: input.projectors,
  });
}
