import { createHash } from 'node:crypto';
import { findReadingPublicTrustLanguageViolationV1 } from '../../../packages/character-content/src/index.js';
import {
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
  canonicalJson,
  guardCharacterRendererOutput,
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


/**
 * RR-06 non-disclosing last gate. This is a privately verified, source-pinned
 * HOLD record: not a completed Assistant message, DB provenance row, credential,
 * public response, or authority to send. DB Owner RR-03/04 and final RR-09
 * transactional checks must still accept the exact source identities.
 *
 * No free-form generated Saju explanation or memory/action side effect enters
 * this gate. Provider cosmetics are restricted to pinned emotion/animation.
 */
export const STANDARD_READER_OUTPUT_HOLD_VERSION_V1 =
  'myeongha-standard-reader-output-guarded-hold-v1' as const;

export type CharacterStandardReaderOutputHoldV1 = Readonly<{
  readonly mode: 'output_guarded_hold';
  readonly schemaVersion: typeof STANDARD_READER_OUTPUT_HOLD_VERSION_V1;
  readonly guardVersion: typeof CHARACTER_OUTPUT_GUARD_VERSION_V1;
  readonly publicDisclosureAuthorized: false;
  readonly reason: 'DB_PROVENANCE_AND_FINAL_DISCLOSURE_PENDING';
  readonly scopeHash: string;
  readonly selectionHash: string;
  readonly assistantAnchorMessageId: string;
  readonly subjectId: string;
  readonly threadId: string;
  readonly readingRef: string;
  readonly readerCharacterId: string;
  readonly contentRevision: number;
  readonly contentReleaseId: string;
  readonly readerContentBundleId: string;
  readonly effectiveAt: string;
  readonly productId: string;
  readonly productSpecVersion: string;
  readonly productRuleVersion: string;
  readonly approvedPolicyRevision: string;
  readonly officialArtifactResponseHash: string;
  readonly groundingHash: string;
  readonly focusedUnitRef: string;
  readonly utteranceId: string;
  readonly utteranceHash: string;
  readonly sourceIdentityHash: string;
  readonly sourceUnitRefs: readonly string[];
  readonly requiredDisclosureRefs: readonly string[];
  readonly requiredAmbiguityRefs: readonly string[];
}>;

const mintedOutputHolds = new WeakSet<object>();

export function assertServerGuardedStandardReaderOutputHoldV1(
  value: unknown,
): asserts value is CharacterStandardReaderOutputHoldV1 {
  if (typeof value !== 'object' || value === null ||
      !mintedOutputHolds.has(value)) {
    throw new Error('Official Reader output hold is unavailable.');
  }
}

function failOutputHold(): never {
  throw new Error('Official Reader final output validation is unavailable.');
}

function orderedEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((ref, index) => ref === right[index]);
}

/**
 * Applies the existing Character Output Guard to a genuine RR-06 semantic
 * candidate, preserving the already verified Saju utterance byte-for-byte.
 * Only source IDs and hashes leave this guard: never a draft answer/envelope.
 * The result is explicitly held; no caller may treat it as a DB write/reveal.
 */
export function guardCharacterStandardReaderFinalOutputV1(input: Readonly<{
  grounded: CharacterStandardChatGroundingV2;
  questionScope: CharacterStandardFollowupQuestionScopeDecisionV1;
  candidate: CharacterStandardReaderBoundedCandidateV1;
  rendererDraft: unknown;
}>): CharacterStandardReaderOutputHoldV1 {
  assertServerPreparedStandardChatGroundingV2(input.grounded);
  assertServerPreparedStandardFollowupQuestionScopeV1(input.questionScope);
  assertServerGuardedStandardReaderBoundedCandidateV1(input.candidate);

  const { scope, grounding, context } = input.grounded;
  const evidence = input.questionScope.evidence;
  const candidate = input.candidate;
  if (candidate.scopeHash !== input.questionScope.scopeHash ||
      candidate.readerCharacterId !== scope.readerCharacterId ||
      candidate.readingRef !== scope.readingId ||
      candidate.utterance.readingRef !== scope.readingId ||
      candidate.utterance.characterId !== scope.readerCharacterId ||
      candidate.utterance.requestedDomain !== scope.sajuDomain ||
      evidence.readingRef !== scope.readingId ||
      evidence.readerCharacterId !== scope.readerCharacterId ||
      evidence.requestedDomain !== scope.sajuDomain ||
      !candidate.sourceUnitRefs.includes(evidence.focusedUnitRef) ||
      evidence.requiredAmbiguityRefs.length !== 0 ||
      evidence.subjectId !== scope.subjectId ||
      evidence.threadId !== scope.threadId ||
      evidence.officialArtifactResponseHash !== scope.officialArtifactResponseHash ||
      evidence.groundingHash !== grounding.groundingHash ||
      context.saju.groundingRef.groundingHash !== grounding.groundingHash ||
      !orderedEqual(candidate.sourceUnitRefs, evidence.selectedUnitIds) ||
      !orderedEqual(candidate.requiredDisclosureRefs, evidence.requiredDisclosureRefs) ||
      !orderedEqual(candidate.utterance.renderedUnitIds, evidence.selectedUnitIds) ||
      input.questionScope.mode !== 'bounded_explanation_candidate' ||
      !Array.isArray(candidate.utterance.segments) ||
      candidate.utterance.segments.length === 0 ||
      candidate.utterance.segments.length > 64) failOutputHold();

  // The semantic guard already reconstructed the deterministic Saju utterance.
  // Recheck all exact segment surfaces for public-trust language violations;
  // never accept separate model-authored explanation prose here.
  for (const segment of candidate.utterance.segments) {
    if (typeof segment.text !== 'string' || segment.text.trim().length === 0 ||
        segment.text.length > 4000 ||
        findReadingPublicTrustLanguageViolationV1(segment.text) !== null) {
      failOutputHold();
    }
  }

  // The existing guard admits only published Character emotion/animation
  // and injects protected Saju text from server-owned V2 context.
  // Free-form framing, memory, relationship and suggested actions have no
  // RR-07/09 approval yet: they must remain absent, not merely well-formed.
  let envelope;
  try {
    envelope = guardCharacterRendererOutput({
      rawOutput: input.rendererDraft,
      context,
      allowedSuggestedActionKeys: [],
    });
  } catch {
    return failOutputHold();
  }
  if (envelope.framingBefore !== null || envelope.framingAfter !== null ||
      envelope.memoryProposals.length !== 0 ||
      envelope.relationshipEventProposals.length !== 0 ||
      envelope.suggestedActions.length !== 0) failOutputHold();

  // Persisting a follow-up later requires *all* source and policy pins, not
  // just Unit refs. This digest is an inert T1 snapshot, NOT a DB trust proof:
  // the final DB transaction must independently validate every current source.
  const sourcePins = Object.freeze({
    subjectId: scope.subjectId,
    threadId: scope.threadId,
    readingRef: scope.readingId,
    readerCharacterId: scope.readerCharacterId,
    contentRevision: scope.contentRevision,
    contentReleaseId: scope.contentReleaseId,
    readerContentBundleId: scope.readerContentBundleId,
    effectiveAt: scope.effectiveAt,
    productId: scope.productId,
    productSpecVersion: scope.productSpecVersion,
    productRuleVersion: scope.productRuleVersion,
    approvedPolicyRevision: scope.approvedPolicyRevision,
    officialArtifactResponseHash: scope.officialArtifactResponseHash,
    groundingHash: grounding.groundingHash,
    focusedUnitRef: evidence.focusedUnitRef,
    sourceUnitRefs: Object.freeze([...candidate.sourceUnitRefs]),
    requiredDisclosureRefs: Object.freeze([...candidate.requiredDisclosureRefs]),
    requiredAmbiguityRefs: Object.freeze([...evidence.requiredAmbiguityRefs]),
  });

  const output: CharacterStandardReaderOutputHoldV1 = Object.freeze({
    mode: 'output_guarded_hold' as const,
    schemaVersion: STANDARD_READER_OUTPUT_HOLD_VERSION_V1,
    guardVersion: CHARACTER_OUTPUT_GUARD_VERSION_V1,
    publicDisclosureAuthorized: false as const,
    reason: 'DB_PROVENANCE_AND_FINAL_DISCLOSURE_PENDING' as const,
    scopeHash: input.questionScope.scopeHash,
    selectionHash: evidence.selectionHash,
    assistantAnchorMessageId: evidence.assistantMessageId,
    ...sourcePins,
    sourceIdentityHash: 'sha256:v1:' + createHash('sha256')
      .update(canonicalJson(sourcePins)).digest('hex'),
    utteranceId: candidate.utterance.utteranceId,
    utteranceHash: 'sha256:v1:' + createHash('sha256')
      .update(canonicalJson(candidate.utterance)).digest('hex'),
  });
  mintedOutputHolds.add(output);
  return output;
}
