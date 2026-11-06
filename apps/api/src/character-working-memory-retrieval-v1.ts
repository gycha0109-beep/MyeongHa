import {
  prepareCharacterWorkingMemoryContextV1,
  type PrepareCharacterWorkingMemoryContextInputV1,
} from './character-working-memory-context-v1.js';
import {
  retrieveCharacterWorkingMemoryV1,
  type CharacterMemoryRetrievalResultV1,
} from '../../../packages/domain/src/character-memory-retrieval-v1.js';
import type {
  CharacterWorkingMemoryProjectionV1,
} from '../../../packages/domain/src/character-working-memory-projection-v1.js';

export interface RetrieveCharacterWorkingMemoryForTurnInputV1
  extends PrepareCharacterWorkingMemoryContextInputV1 {
  readonly currentUserMessageText: string;
  readonly now: string;
  readonly limit: number;
  readonly explicitCallbackRequested?: boolean;
}

export interface RetrieveCharacterWorkingMemoryForTurnResultV1 {
  readonly projection: CharacterWorkingMemoryProjectionV1;
  readonly retrieval: CharacterMemoryRetrievalResultV1;
}

/**
 * Server-side retrieval entrypoint for one canonical Subject, Character, and
 * server-bound thread. All authority ports must share the same Subject-bound
 * transaction client. The caller supplies the exact committed current-turn
 * text from the same pinned turn as currentUserMessageRef.
 *
 * This performs reads and ranking only; it never writes Memory, changes grants,
 * mutates relationships, calls a Provider, or reads protected Saju content.
 */
export async function retrieveCharacterWorkingMemoryForTurnV1(
  input: RetrieveCharacterWorkingMemoryForTurnInputV1,
): Promise<RetrieveCharacterWorkingMemoryForTurnResultV1> {
  const projection = await prepareCharacterWorkingMemoryContextV1(input);
  const retrieval = retrieveCharacterWorkingMemoryV1({
    projection,
    expectedScope: {
      subjectId: input.resolvedSubjectId,
      characterId: input.characterId,
      threadId: input.threadBinding.threadId,
    },
    queryText: input.currentUserMessageText,
    now: input.now,
    limit: input.limit,
    explicitCallbackRequested: input.explicitCallbackRequested,
  });
  return Object.freeze({ projection, retrieval });
}
