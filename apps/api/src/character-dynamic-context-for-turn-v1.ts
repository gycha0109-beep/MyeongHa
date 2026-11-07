import {
  composeCharacterDynamicContextV1,
  type CharacterDynamicContextComposerInputV1,
  type CharacterDynamicContextComposerResultV1,
} from '../../../packages/domain/src/character-dynamic-context-composer-v1.js';
import {
  retrieveCharacterWorkingMemoryForTurnV1,
  type RetrieveCharacterWorkingMemoryForTurnInputV1,
} from './character-working-memory-retrieval-v1.js';

/**
 * Trusted server-only orchestration: authorize and retrieve before serializing.
 * No new entitlement decision, memory write, Provider dispatch or cost
 * reservation is performed here. Every authority port must use the same
 * canonical Subject-bound transaction as the existing retrieval entrypoint.
 */
export type PrepareCharacterDynamicContextForTurnInputV1<TRequest> =
  RetrieveCharacterWorkingMemoryForTurnInputV1 &
  Omit<
    CharacterDynamicContextComposerInputV1<TRequest>,
    'expectedScope' | 'context' | 'retrieval'
  >;

export async function prepareCharacterDynamicContextForTurnV1<TRequest>(
  input: PrepareCharacterDynamicContextForTurnInputV1<TRequest>,
): Promise<CharacterDynamicContextComposerResultV1<TRequest>> {
  const { context, retrieval } = await retrieveCharacterWorkingMemoryForTurnV1(input);

  return composeCharacterDynamicContextV1({
    expectedScope: {
      subjectId: input.resolvedSubjectId,
      characterId: input.characterId,
      threadId: input.threadBinding.threadId,
    },
    context,
    retrieval,
    systemSafety: input.systemSafety,
    characterCore: input.characterCore,
    ...(input.bibleCore === undefined ? {} : { bibleCore: input.bibleCore }),
    ...(input.unresolvedCausalEvents === undefined
      ? {}
      : { unresolvedCausalEvents: input.unresolvedCausalEvents }),
    ...(input.resolvedLowSalienceEvents === undefined
      ? {}
      : { resolvedLowSalienceEvents: input.resolvedLowSalienceEvents }),
    ...(input.redundantBibleExamples === undefined
      ? {}
      : { redundantBibleExamples: input.redundantBibleExamples }),
    ...(input.trivia === undefined ? {} : { trivia: input.trivia }),
    profile: input.profile,
    adapter: input.adapter,
    buildExactRequest: input.buildExactRequest,
  });
}
