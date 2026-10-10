import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  assertServerPreparedStandardChatPreflightV2,
  type CharacterStandardReadingChatTurnPreflightV2,
} from './character-standard-reading-chat-turn-preflight-v2.js';
import {
  assertServerPreparedStandardChatGroundingV2,
  type CharacterStandardChatGroundingV2,
} from './character-standard-reading-chat-grounding-v2.js';
import {
  selectCharacterStandardFollowupEvidenceV1,
  type ValidatedStandardFollowupAnchorAuthorityPortV1,
} from './character-standard-reading-chat-followup-evidence-v1.js';
import {
  classifyExactOfficialReadingReferenceV1,
} from './character-standard-reading-chat-question-scope-v1.js';
import { closeCharacterStandardReaderSourceFocusV1 } from './character-standard-reading-chat-source-closure-v1.js';

export const STANDARD_FIRST_QUESTION_SOURCE_ENTRY_VERSION_V1 =
  'myeongha-standard-first-question-source-entry-v1' as const;

type HoldReasonV1 =
  'unsupported_question' | 'new_authority_required' |
  'prior_answer_exists' | 'clarification_required' | 'insufficient_evidence';

export type CharacterStandardFirstQuestionSourceEntryDecisionV1 =
  | Readonly<{
      schemaVersion: typeof STANDARD_FIRST_QUESTION_SOURCE_ENTRY_VERSION_V1;
      mode: 'grounded_source_candidate' | 'protected_only_candidate';
      source: 'official_reading_without_prior_guarded_answer';
      subjectId: string;
      threadId: string;
      readerCharacterId: string;
      readingRef: string;
      requestedDomain: CharacterStandardChatGroundingV2['scope']['sajuDomain'];
      officialArtifactResponseHash: string;
      groundingHash: string;
      questionHash: string;
      rootUnitId: string;
      selectedUnitIds: readonly string[];
      requiredDisclosureRefs: readonly string[];
      requiredAmbiguityRefs: readonly string[];
      selectionHash: string;
    }>
  | Readonly<{
      schemaVersion: typeof STANDARD_FIRST_QUESTION_SOURCE_ENTRY_VERSION_V1;
      mode: 'hold';
      reason: HoldReasonV1;
    }>;

const mintedFirstQuestionEntries = new WeakSet<object>();

export function assertServerPreparedStandardFirstQuestionSourceEntryV1(
  candidate: unknown,
): asserts candidate is Exclude<
  CharacterStandardFirstQuestionSourceEntryDecisionV1, { readonly mode: 'hold' }
> {
  if (candidate === null || typeof candidate !== 'object' ||
      !mintedFirstQuestionEntries.has(candidate)) {
    throw new Error('Official Reader first-question source entry is unavailable.');
  }
}

function hold(reason: HoldReasonV1): CharacterStandardFirstQuestionSourceEntryDecisionV1 {
  return Object.freeze({
    schemaVersion: STANDARD_FIRST_QUESTION_SOURCE_ENTRY_VERSION_V1,
    mode: 'hold' as const,
    reason,
  });
}

/**
 * First official Reader question, NOT the PR2 follow-up selection path.
 *
 * The ordinary follow-up selector is reused for exact preflight/grounding
 * source scope validation AND to read the DB-owned latest guarded answer once.
 * Only an authoritative null (no committed answer for this exact scope) may
 * enter source-only first-question selection. An existing, ambiguous or stale
 * assistant anchor cannot be silently downgraded into a "first" answer.
 *
 * A single explicit primary root must own every Grounding Unit by required
 * companion closure. No user-provided focus, free-text semantic matching or
 * model-selected Unit ref is accepted. Otherwise request clarification.
 *
 * This is an internal admission candidate, never a permission to render,
 * persist, reveal, recalculate Saju, or enable public Reader Chat.
 */
export async function selectCharacterStandardFirstQuestionSourceEntryV1(input: Readonly<{
  preflight: CharacterStandardReadingChatTurnPreflightV2;
  grounded: CharacterStandardChatGroundingV2;
  anchorAuthorityPort: ValidatedStandardFollowupAnchorAuthorityPortV1;
}>): Promise<CharacterStandardFirstQuestionSourceEntryDecisionV1> {
  assertServerPreparedStandardChatPreflightV2(input.preflight);
  assertServerPreparedStandardChatGroundingV2(input.grounded);

  const question = input.preflight.receivePlan.normalizedRequest.text;
  const domain = input.grounded.scope.sajuDomain;
  const lexical = classifyExactOfficialReadingReferenceV1(question, domain);
  if (lexical !== 'admitted') return hold(lexical);

  // Reuse the existing server-side exact identity/source checks. Any DB read
  // error propagates as ACCESS_DENIED, NEVER as absence-of-previous-answer.
  let sawAuthoritativeNull = false;
  const prior = await selectCharacterStandardFollowupEvidenceV1({
    preflight: input.preflight,
    grounded: input.grounded,
    anchorAuthorityPort: {
      readLatestValidatedAnchor: async scope => {
        const anchor = await input.anchorAuthorityPort.readLatestValidatedAnchor(scope);
        sawAuthoritativeNull = anchor === null;
        return anchor;
      },
    },
  });
  if (!sawAuthoritativeNull) return hold('prior_answer_exists');
  if (prior.mode !== 'hold' || prior.reason !== 'clarification_required') {
    throw new Error('Official Reader first-question prior evidence state mismatch.');
  }

  const units = input.grounded.grounding.units;
  if (units.length === 0) return hold('insufficient_evidence');
  if (units.length > 12) return hold('clarification_required');

  const byId = new Map(units.map(unit => [unit.unitId, unit]));
  if (byId.size !== units.length) throw new Error('Official source contains duplicate Units.');
  const referencedCompanions = new Set(
    units.flatMap(unit => [...unit.requiredCompanionUnitRefs]),
  );
  const roots = units.filter(unit =>
    unit.narrativeRole === 'primary' && !referencedCompanions.has(unit.unitId),
  );
  if (roots.length !== 1) return hold('clarification_required');

  // RR-02: Saju V1 source-level ambiguity and disclosure obligations cannot
  // disappear when a multi-Unit official source is narrowed to the first focus.
  const closure = closeCharacterStandardReaderSourceFocusV1({
    grounded: input.grounded,
    rootUnitId: roots[0]!.unitId,
  });
  if (closure.mode === 'hold' ||
      closure.selectedUnitIds.length !== units.length) {
    return hold('clarification_required');
  }

  const scope = input.grounded.scope;
  const withoutHash = {
    schemaVersion: STANDARD_FIRST_QUESTION_SOURCE_ENTRY_VERSION_V1,
    mode: closure.protectedOnly ? 'protected_only_candidate' as const
      : 'grounded_source_candidate' as const,
    source: 'official_reading_without_prior_guarded_answer' as const,
    subjectId: scope.subjectId,
    threadId: scope.threadId,
    readerCharacterId: scope.readerCharacterId,
    readingRef: scope.readingId,
    requestedDomain: scope.sajuDomain,
    officialArtifactResponseHash: scope.officialArtifactResponseHash,
    groundingHash: input.grounded.grounding.groundingHash,
    questionHash: `sha256:v1:${createHash('sha256').update(question as string).digest('hex')}`,
    rootUnitId: roots[0]!.unitId,
    selectedUnitIds: closure.selectedUnitIds,
    requiredDisclosureRefs: closure.requiredDisclosureRefs,
    requiredAmbiguityRefs: closure.requiredAmbiguityRefs,
  };
  const result = Object.freeze({
    ...withoutHash,
    selectionHash: `sha256:v1:${createHash('sha256').update(canonicalJson(withoutHash)).digest('hex')}`,
  });
  mintedFirstQuestionEntries.add(result);
  return result;
}
