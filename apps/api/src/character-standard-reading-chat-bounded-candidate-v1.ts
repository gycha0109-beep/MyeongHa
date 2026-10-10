import {
  guardCharacterSajuSemanticPreservationV2,
  renderCharacterSajuBoundedExactCoreV2,
  resolveCharacterSajuCommonPerspectiveV1,
  type CharacterSajuUtteranceV1,
} from '../../../packages/domain/src/index.js';
import {
  assertServerPreparedStandardChatGroundingV2,
  type CharacterStandardChatGroundingV2,
} from './character-standard-reading-chat-grounding-v2.js';
import {
  assertServerPreparedStandardFollowupQuestionScopeV1,
  type CharacterStandardFollowupQuestionScopeDecisionV1,
} from './character-standard-reading-chat-question-scope-v1.js';
import { closeCharacterStandardReaderSourceFocusV1 } from './character-standard-reading-chat-source-closure-v1.js';

export const STANDARD_READER_BOUNDED_CANDIDATE_VERSION_V1 =
  'myeongha-standard-reader-bounded-candidate-v1' as const;

/**
 * RR-06 internal semantic candidate. This contract deliberately does NOT
 * contain a final Output Guard proof, committed message or reveal authority.
 */
export type CharacterStandardReaderBoundedCandidateV1 =
  | Readonly<{
      mode: 'semantic_guarded_candidate';
      schemaVersion: typeof STANDARD_READER_BOUNDED_CANDIDATE_VERSION_V1;
      scopeHash: string;
      readingRef: string;
      readerCharacterId: string;
      sourceUnitRefs: readonly string[];
      requiredDisclosureRefs: readonly string[];
      utterance: CharacterSajuUtteranceV1;
    }>
  | Readonly<{
      mode: 'hold';
      reason: 'source_scope_mismatch' | 'protected_source' |
        'selection_mismatch' | 'renderer_unavailable' | 'semantic_guard_failed';
    }>;

const mintedSemanticCandidates = new WeakSet<object>();

export function assertServerGuardedStandardReaderBoundedCandidateV1(
  value: unknown,
): asserts value is Extract<CharacterStandardReaderBoundedCandidateV1, {
  mode: 'semantic_guarded_candidate';
}> {
  if (typeof value !== 'object' || value === null ||
      !mintedSemanticCandidates.has(value)) {
    throw new Error('Official Reader bounded semantic candidate is unavailable.');
  }
}

function hold(
  reason: Extract<CharacterStandardReaderBoundedCandidateV1, { mode: 'hold' }>['reason'],
): CharacterStandardReaderBoundedCandidateV1 {
  return Object.freeze({ mode: 'hold' as const, reason });
}

function exactMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every(value => right.includes(value));
}

/**
 * Reuses the existing approved Character perspective, bounded renderer and
 * semantic guard, but refuses any template plan that selects more/other Saju
 * Units than the DB-owned, previously verified Assistant evidence allowed.
 *
 * The Preview renderer is permitted to propose an internal candidate only.
 * A later separate Output Guard, fresh DB transaction, atomic provenance
 * Commit and controlled Reveal remain mandatory, and no public route calls
 * this helper. No LLM is invoked here.
 */
export function prepareCharacterStandardReaderBoundedCandidateV1(input: Readonly<{
  grounded: CharacterStandardChatGroundingV2;
  questionScope: CharacterStandardFollowupQuestionScopeDecisionV1;
}>): CharacterStandardReaderBoundedCandidateV1 {
  assertServerPreparedStandardChatGroundingV2(input.grounded);
  assertServerPreparedStandardFollowupQuestionScopeV1(input.questionScope);
  const { scope, context, grounding } = input.grounded;
  const evidence = input.questionScope.evidence;

  if (evidence.subjectId !== scope.subjectId ||
      evidence.threadId !== scope.threadId ||
      evidence.readerCharacterId !== scope.readerCharacterId ||
      evidence.readingRef !== scope.readingId ||
      evidence.requestedDomain !== scope.sajuDomain ||
      evidence.officialArtifactResponseHash !== scope.officialArtifactResponseHash ||
      evidence.groundingHash !== grounding.groundingHash ||
      context.characterId !== scope.readerCharacterId ||
      context.saju.eligibility.readingRef !== scope.readingId ||
      context.saju.eligibility.subjectId !== scope.subjectId ||
      context.saju.groundingRef.groundingHash !== grounding.groundingHash) {
    return hold('source_scope_mismatch');
  }

  const closure = closeCharacterStandardReaderSourceFocusV1({
    grounded: input.grounded, rootUnitId: evidence.focusedUnitRef,
  });
  if (closure.mode !== 'closed' ||
      !exactMembers(closure.selectedUnitIds, evidence.selectedUnitIds) ||
      !exactMembers(closure.requiredDisclosureRefs, evidence.requiredDisclosureRefs) ||
      !exactMembers(closure.requiredAmbiguityRefs, evidence.requiredAmbiguityRefs)) {
    return hold('source_scope_mismatch');
  }
  if (closure.protectedOnly ||
      input.questionScope.mode === 'protected_only_candidate' ||
      closure.requiredAmbiguityRefs.length !== 0) {
    return hold('protected_source');
  }

  let rendered: ReturnType<typeof renderCharacterSajuBoundedExactCoreV2>;
  let perspective: ReturnType<typeof resolveCharacterSajuCommonPerspectiveV1>;
  try {
    perspective = resolveCharacterSajuCommonPerspectiveV1({
      characterId: context.characterId,
      contentVersion: context.contentVersion,
      sajuProfile: context.sajuProfile,
    });
    rendered = renderCharacterSajuBoundedExactCoreV2({
      context, grounding, perspective, requestedDomain: scope.sajuDomain,
    });
  } catch {
    return hold('renderer_unavailable');
  }
  if (rendered.mode !== 'bounded_exact_core') return hold('renderer_unavailable');
  if (!exactMembers(rendered.planDecision.selection.selectedUnitIds, closure.selectedUnitIds) ||
      !exactMembers(rendered.utterance.renderedUnitIds, closure.selectedUnitIds) ||
      rendered.utterance.readingRef !== scope.readingId ||
      rendered.utterance.characterId !== scope.readerCharacterId ||
      rendered.utterance.requestedDomain !== scope.sajuDomain) {
    return hold('selection_mismatch');
  }

  let guard: ReturnType<typeof guardCharacterSajuSemanticPreservationV2>;
  try {
    guard = guardCharacterSajuSemanticPreservationV2({
      candidate: rendered.utterance, context, grounding, perspective,
      requestedDomain: scope.sajuDomain,
    });
  } catch {
    return hold('semantic_guard_failed');
  }
  if (guard.mode !== 'accepted' ||
      !exactMembers(guard.evidence.validatedUnitIds, closure.selectedUnitIds) ||
      !exactMembers(guard.evidence.validatedDisclosureRefs, closure.requiredDisclosureRefs) ||
      guard.utterance.utteranceId !== rendered.utterance.utteranceId) {
    return hold('semantic_guard_failed');
  }

  const result = Object.freeze({
    mode: 'semantic_guarded_candidate' as const,
    schemaVersion: STANDARD_READER_BOUNDED_CANDIDATE_VERSION_V1,
    scopeHash: input.questionScope.scopeHash,
    readingRef: scope.readingId,
    readerCharacterId: scope.readerCharacterId,
    sourceUnitRefs: closure.selectedUnitIds,
    requiredDisclosureRefs: closure.requiredDisclosureRefs,
    utterance: guard.utterance,
  });
  mintedSemanticCandidates.add(result);
  return result;
}
