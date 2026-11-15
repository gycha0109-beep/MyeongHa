// Watchtower-Track: character-memory
// Permission-first, offline-only four-Character published-core assembly.
// No public route, Provider, cost reservation, publication or DB write.
import {
  composeCharacterDynamicContextV1,
  type CharacterContextSourceAdmissionPortV1,
  type CharacterDynamicContextComposerInputV1,
  type CharacterDynamicContextComposerResultV1,
} from '../../../packages/domain/src/character-dynamic-context-composer-v1.js';
import {
  selectCharacterSharedMemoryForTurnV1,
  bindCharacterSharedMemoryAdmissionV1,
  type CharacterSharedMemoryReadPortV1,
} from './character-shared-memory-context-v1.js';
import {
  retrieveCharacterWorkingMemoryForTurnV1,
  type RetrieveCharacterWorkingMemoryForTurnInputV1,
} from './character-working-memory-retrieval-v1.js';
import {
  assertFourCharacterPublishedContextSourceInputV1,
  prepareFourCharacterPublishedContextCoreV1,
  type FourCharacterPublishedContextPinV1,
} from './four-character-dynamic-context-published-core-v1.js';
import type {
  FourCharacterProductionExecutionPortsV1,
} from './four-character-production-chat-executor-v1.js';

export type PrepareFourCharacterDynamicContextForTurnInputV1<TRequest> =
  RetrieveCharacterWorkingMemoryForTurnInputV1 &
  Omit<
    CharacterDynamicContextComposerInputV1<TRequest>,
    'expectedScope' | 'context' | 'retrieval' | 'characterCore' | 'sourceAdmission' | 'sharedUserMemory'
  > &
  Readonly<{
    /** Server-pinned released source identity, not a user/browser hint. */
    publishedSourcePin: FourCharacterPublishedContextPinV1;
    publication: FourCharacterProductionExecutionPortsV1['publication'];
    /** Independent published policy/task/Bible/event admission authority. */
    otherSourceAdmission: CharacterContextSourceAdmissionPortV1;
    sharedMemoryAuthorityPort?: CharacterSharedMemoryReadPortV1;
  }>;

/**
 * Capability and Subject/thread/Memory grants are checked before publication
 * data is fetched. The returned model request is counted but NEVER dispatched.
 * An unauthorized turn cannot use even a valid published Character source.
 */
export async function prepareFourCharacterDynamicContextForTurnV1<TRequest>(
  input: PrepareFourCharacterDynamicContextForTurnInputV1<TRequest>,
): Promise<CharacterDynamicContextComposerResultV1<TRequest>> {
  const expectedScope = Object.freeze({
    subjectId: input.resolvedSubjectId,
    characterId: input.characterId,
    threadId: input.threadBinding.threadId,
  });
  // Invalid/missing independently published Character selection is held
  // BEFORE any Subject-scoped Memory, Life Fact, dialogue or relationship read.
  // This only validates the pinned input shape; Capability Gate still executes
  // before ALL authorized data reads and publication is fetched afterwards.
  assertFourCharacterPublishedContextSourceInputV1({
    scope: expectedScope,
    pin: input.publishedSourcePin,
    otherSourceAdmission: input.otherSourceAdmission,
  });
  const { context, retrieval } = await retrieveCharacterWorkingMemoryForTurnV1(input);
  const sharedUserMemory = input.sharedMemoryAuthorityPort === undefined
    ? Object.freeze([])
    : await selectCharacterSharedMemoryForTurnV1({
        scope: expectedScope,
        currentUserTurn: context.currentUserMessage,
        port: input.sharedMemoryAuthorityPort,
      });
  const published = await prepareFourCharacterPublishedContextCoreV1({
    scope: expectedScope,
    pin: input.publishedSourcePin,
    publication: input.publication,
    otherSourceAdmission: input.otherSourceAdmission,
  });

  return composeCharacterDynamicContextV1({
    expectedScope,
    context,
    retrieval,
    sharedUserMemory,
    systemSafety: input.systemSafety,
    characterCore: published.characterCore,
    responseTask: input.responseTask,
    ...(input.integrityClaimDecisions === undefined
      ? {} : { integrityClaimDecisions: input.integrityClaimDecisions }),
    ...(input.disclosureDecision === undefined
      ? {} : { disclosureDecision: input.disclosureDecision }),
    ...(input.repetitionSuppressionHints === undefined
      ? {} : { repetitionSuppressionHints: input.repetitionSuppressionHints }),
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
    sourceAdmission: input.sharedMemoryAuthorityPort === undefined ? published.sourceAdmission
      : bindCharacterSharedMemoryAdmissionV1({
          scope: expectedScope, sources: sharedUserMemory,
          baseAdmission: published.sourceAdmission,
        }),
    profile: input.profile,
    adapter: input.adapter,
    buildExactRequest: input.buildExactRequest,
  });
}
