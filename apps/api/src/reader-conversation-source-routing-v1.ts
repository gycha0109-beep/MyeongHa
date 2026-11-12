import { createHash } from 'node:crypto';
import {
  canonicalJson,
  guardCharacterRendererOutput,
  type CharacterReadingPerspectiveRefV1,
  type CharacterSajuUtteranceSegmentV1,
} from '../../../packages/domain/src/index.js';
import { prepareCharacterStandardReaderSceneSourceHandoffV1 } from './character-standard-reading-chat-scene-handoff-v1.js';
import { findReadingPublicTrustLanguageViolationV1 } from '../../../packages/character-content/src/index.js';
import {
  classifyCharacterStandardFollowupLexicalIntentV1,
  classifyExactOfficialReadingSummaryReferenceV1,
  inspectCharacterStandardFollowupSignalsV1,
} from './character-standard-reading-chat-question-scope-v1.js';
import {
  prepareReaderLatestAnchorContinuityV1,
} from './reader-conversation-latest-anchor-continuity-v1.js';
import type {
  ReaderContextNonMemoryReadAuthorityPortV1,
} from './reader-context-non-memory-read.js';
import {
  assertServerPreparedStandardChatPreflightV2,
  type CharacterStandardReadingChatTurnPreflightV2,
} from './character-standard-reading-chat-turn-preflight-v2.js';
import {
  assertServerPreparedStandardChatGroundingV2,
  type CharacterStandardChatGroundingV2,
} from './character-standard-reading-chat-grounding-v2.js';
import type {
  ValidatedStandardFollowupAnchorAuthorityPortV1,
} from './character-standard-reading-chat-followup-evidence-v1.js';
import {
  prepareCharacterStandardReaderBoundedCandidateV1,
  guardCharacterStandardReaderFinalOutputV1,
  getGuardedStandardReaderCandidateProfileV1,
  recheckCharacterStandardReaderFinalHoldV1,
  type CharacterStandardReaderBoundedCandidateV1,
  type CharacterStandardReaderOutputHoldV1,
} from './character-standard-reading-chat-bounded-candidate-v1.js';
import { reviewCharacterSajuConsultationBatchV1 } from './character-saju-consultation-multi-unit-shadow-v1.js';
import type { CharacterSajuConsultationShadowPortV1 } from './character-saju-consultation-shadow-v1.js';
import {
  assertServerGuardedReaderInterpretationSceneV2,
  getGuardedReaderSceneProfileV2,
} from './reader-interpretation-preview-runtime-v2.js';
import type {
  ReaderInterpretationPreviewEnvelopeV1,
} from './reader-interpretation-preview-runtime-v1.js';
import {
  closeCharacterStandardReaderSourceFocusV1,
} from './character-standard-reading-chat-source-closure-v1.js';

export const READER_CONVERSATION_SOURCE_ROUTING_VERSION_V1 =
  'reader-conversation-source-routing-v1' as const;

export type ReaderConversationPrimaryIntentV1 =
  | 'official_summary' | 'official_followup'
  | 'ordinary' | 'support' | 'clarification';
export type ReaderConversationSecuritySignalV1 =
  | 'possible_prompt_injection' | 'possible_self_harm' | 'possible_threat';

export type ReaderConversationIntentDecisionV1 = Readonly<{
  schemaVersion: typeof READER_CONVERSATION_SOURCE_ROUTING_VERSION_V1;
  primaryIntent: ReaderConversationPrimaryIntentV1;
  securitySignals: readonly ReaderConversationSecuritySignalV1[];
  riskAuthority: 'EXISTING_SECURITY_GATE_ONLY';
  officialSourcePolicy: 'REQUIRES_EXACT_SERVER_AUTHORITY' | 'DO_NOT_INJECT';
  memorySourcePolicy: 'EXISTING_CONSENT_GRANT_AND_PIN_ONLY' | 'DO_NOT_INJECT';
  clarificationReason: 'mixed_intents' | 'unapproved_saju_scope' |
    'ambiguous_reference' | 'invalid_question' | null;
  addedModelCalls: 0;
  published: false;
}>;

export type ReaderConversationResponseCandidateV1 =
  | Readonly<{
      mode: 'ordinary_dialogue_candidate' | 'supportive_dialogue_candidate';
      intent: ReaderConversationIntentDecisionV1;
      officialSourceUnitRefs: readonly [];
      relationshipMemoryRefs: readonly [];
      suggestedResponseFocus: 'reply_to_current_user' | 'acknowledge_without_saju';
      addedModelCalls: 0;
      publicDisclosureAuthorized: false;
    }>
  | Readonly<{
      mode: 'official_summary_candidate';
      intent: ReaderConversationIntentDecisionV1;
      readingRef: string;
      readerCharacterId: string;
      officialArtifactResponseHash: string;
      sourceUnitRefs: readonly string[];
      requiredDisclosureRefs: readonly string[];
      /** Existing guarded Saju-authored exact-core fragment, not new interpretation. */
      excerpt: string;
      isCompleteOfficialReading: false;
      addedModelCalls: 0;
      publicDisclosureAuthorized: false;
    }>
  | Readonly<{
      mode: 'official_followup_output_hold';
      intent: ReaderConversationIntentDecisionV1;
      selectedSourceUnitRefs: readonly string[];
      outputHold: ReturnType<typeof guardCharacterStandardReaderFinalOutputV1>;
      addedModelCalls: 0;
      publicDisclosureAuthorized: false;
    }>
  | Readonly<{
      mode: 'hold';
      intent: ReaderConversationIntentDecisionV1;
      reason: 'clarification_required' | 'unavailable_official_source' |
        'source_mismatch' | 'source_closure_required' |
        'official_question_not_admitted' | 'official_latest_anchor_not_admitted' |
        'existing_guard_rejected' | 'security_gate_pending';
      addedModelCalls: 0;
      publicDisclosureAuthorized: false;
    }>;

const CONTROL = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u;
const OFFICIAL_WORDS = /(?:공식\s*사주|구매한\s*(?:사주|해석|리딩|보고서)|사주|명식|운세|대운|세운|월운|궁합|재물운|직업운|연애운|내\s*팔자|방금\s*본\s*[^\s]{1,12}\s*해석)/u;
const OFFICIAL_ACTION = /(?:요약|설명|해석|풀이|뜻|의미|알려|봐\s*줘|계산|예측|맞아|근거)/u;
const SUMMARY = /(?:요약|핵심|간단히|짧게|한\s*줄|정리)/u;
const SUPPORT = /(?:힘들어|괴로워|불안해|우울해|속상해|걱정돼|고민이|상담|지쳤어|외로워|답답해)/u;
const DIRECT_PRIOR_REFERENCE = /^(?:그\s*부분|그건|그거|방금\s*(?:말씀|설명)|아까\s*(?:말씀|설명)|지금\s*설명)/u;
const POSSIBLE_ATTACK = /(?:이전\s*지시(?:를)?\s*무시|시스템\s*프롬프트|비밀\s*키|관리자\s*권한|안전\s*검사\s*꺼|가드\s*우회)/u;
const POSSIBLE_HARM = /(?:죽고\s*싶|자해|스스로\s*해치|목숨을\s*끊)/u;
const POSSIBLE_THREAT = /(?:죽여\s*버릴|해치겠|폭행하겠)/u;
const MIXED_CONNECTOR = /(?:그리고|또\s*한|동시에|하면서|뿐만\s*아니라)/u;

function decide(
  primaryIntent: ReaderConversationPrimaryIntentV1,
  securitySignals: readonly ReaderConversationSecuritySignalV1[],
  clarificationReason: ReaderConversationIntentDecisionV1['clarificationReason'] = null,
): ReaderConversationIntentDecisionV1 {
  const official = primaryIntent === 'official_summary' ||
    primaryIntent === 'official_followup';
  return Object.freeze({
    schemaVersion: READER_CONVERSATION_SOURCE_ROUTING_VERSION_V1,
    primaryIntent,
    securitySignals: Object.freeze([...securitySignals]),
    riskAuthority: 'EXISTING_SECURITY_GATE_ONLY' as const,
    officialSourcePolicy: official
      ? 'REQUIRES_EXACT_SERVER_AUTHORITY' as const : 'DO_NOT_INJECT' as const,
    memorySourcePolicy: primaryIntent === 'ordinary' || primaryIntent === 'support'
      ? 'EXISTING_CONSENT_GRANT_AND_PIN_ONLY' as const : 'DO_NOT_INJECT' as const,
    clarificationReason,
    addedModelCalls: 0 as const,
    published: false as const,
  });
}

/**
 * Routing hint only: lexical intent and overlapping security signals are
 * independent axes. Never use this as a positive Security/Grant/Source decision
 * or to authorize the three-stage Se-yeon Shadow provider in production.
 */
export function classifyReaderConversationIntentV1(
  rawQuestion: unknown,
  admittedDomain: string | null = null,
): ReaderConversationIntentDecisionV1 {
  const text = typeof rawQuestion === 'string' ? rawQuestion.normalize('NFKC').trim() : '';
  const signals: ReaderConversationSecuritySignalV1[] = [];
  if (POSSIBLE_ATTACK.test(text)) signals.push('possible_prompt_injection');
  if (POSSIBLE_HARM.test(text)) signals.push('possible_self_harm');
  if (POSSIBLE_THREAT.test(text)) signals.push('possible_threat');
  if (text.length === 0 || text.length > 160 || CONTROL.test(text) ||
      /\s{3,}/u.test(text)) {
    return decide('clarification', signals, 'invalid_question');
  }

  const hasOfficialWords = OFFICIAL_WORDS.test(text);
  const explicitOfficial = hasOfficialWords && OFFICIAL_ACTION.test(text);
  const hasSupport = SUPPORT.test(text);
  const priorReference = DIRECT_PRIOR_REFERENCE.test(text);
  const multi = MIXED_CONNECTOR.test(text) &&
    ((explicitOfficial && hasSupport) ||
      (explicitOfficial && /(?:일상|잡담|농담|밥\s*먹|날씨)/u.test(text)));

  // Risk is never one of the mutually exclusive conversational intents.
  if (multi) return decide('clarification', signals, 'mixed_intents');

  if (explicitOfficial || priorReference) {
    if (admittedDomain === null) {
      return decide('clarification', signals, 'unapproved_saju_scope');
    }
    const lex = classifyCharacterStandardFollowupLexicalIntentV1(text, admittedDomain);
    if (lex === 'multiple_intents') return decide('clarification', signals, 'mixed_intents');
    if (lex === 'new_authority_required') {
      return decide('clarification', signals, 'unapproved_saju_scope');
    }
    if (explicitOfficial && SUMMARY.test(text) &&
        !/(?:다시\s*계산|새\s*계산|내년|다음\s*달)/u.test(text)) {
      // Preserve the independent intent and risk axes for the Security Gate,
      // but never treat a broad summary phrase as purchase/domain authority.
      // Actual source access is held earlier when any risk signal exists.
      if (signals.length !== 0) return decide('official_summary', signals);
      const summaryRef = classifyExactOfficialReadingSummaryReferenceV1(
        text, admittedDomain,
      );
      if (summaryRef === 'admitted') return decide('official_summary', signals);
      return decide('clarification', signals,
        summaryRef === 'new_authority_required'
          ? 'unapproved_saju_scope' : 'ambiguous_reference');
    }
    if (lex === 'admitted') return decide('official_followup', signals);
    return decide('clarification', signals, 'ambiguous_reference');
  }
  if (hasSupport) return decide('support', signals);
  return decide('ordinary', signals);
}

export interface PrepareReaderConversationResponseCandidateInputV1 {
  readonly userText: unknown;
  /** Scope label from current server Reader admission only, not client state. */
  readonly admittedDomain?: string | null;
  /** Only server-minted RR-05/06 objects; no arbitrary source IDs or answers. */
  readonly official?: Readonly<{
    preflight: CharacterStandardReadingChatTurnPreflightV2;
    grounded: CharacterStandardChatGroundingV2;
    anchorAuthorityPort?: ValidatedStandardFollowupAnchorAuthorityPortV1;
    /** DB-origin actual Reader message order; needed for pronoun follow-ups. */
    recentMessageAuthorityPort?: Pick<ReaderContextNonMemoryReadAuthorityPortV1, 'readRecentMessages'>;
    useApprovedSajuAnchorContinuity?: true;
    guardedScene?: ReaderInterpretationPreviewEnvelopeV1;
    rendererDraft?: unknown;
  }>;
}

const preparedFollowupReviews = new WeakMap<CharacterStandardReaderOutputHoldV1, Readonly<{
  preflight: CharacterStandardReadingChatTurnPreflightV2;
  grounded: CharacterStandardChatGroundingV2;
  candidate: Extract<CharacterStandardReaderBoundedCandidateV1, { mode: 'semantic_guarded_candidate' }>;
}>>();

export type ReaderFollowupCurrentAuthorityV1 = Omit<
  Parameters<typeof recheckCharacterStandardReaderFinalHoldV1>[0], 'preflight' | 'outputHold'
> & Readonly<{
  anchorAuthorityPort: ValidatedStandardFollowupAnchorAuthorityPortV1;
  recentMessageAuthorityPort?: Pick<ReaderContextNonMemoryReadAuthorityPortV1, 'readRecentMessages'>;
  useApprovedSajuAnchorContinuity?: true;
}>;

/** A one-use reference for the private delivery pipeline. It contains no answer text. */
export interface ReviewedPrivateReaderFollowupV1 {
  readonly state: 'reviewed_private';
  readonly privateBodyHash: string;
  readonly sourceIdentityHash: string;
  readonly officialArtifactResponseHash: string;
  readonly evaluatorVersion: string;
  readonly candidateHashes: readonly string[];
}

const reviewedFollowupBodies = new WeakMap<ReviewedPrivateReaderFollowupV1, string>();

/** Only the server-owned protected commit may consume the reviewed text. */
export function consumeReviewedPrivateReaderFollowupBodyV1(
  candidate: ReviewedPrivateReaderFollowupV1,
): string | null {
  const body = reviewedFollowupBodies.get(candidate);
  reviewedFollowupBodies.delete(candidate);
  return body ?? null;
}

/** Runs the provider between two fresh owner/anchor checks, outside their DB transactions. */
export async function reviewPreparedReaderConversationFollowupV1(input: Readonly<{
  outputHold: CharacterStandardReaderOutputHoldV1;
  port: CharacterSajuConsultationShadowPortV1;
  withCurrentAuthority: <T>(check: (authority: ReaderFollowupCurrentAuthorityV1) => Promise<T>) => Promise<T>;
}>): Promise<ReviewedPrivateReaderFollowupV1 | null> {
  const plan = preparedFollowupReviews.get(input.outputHold);
  if (!plan || input.port.evaluateBatch === undefined) return null;
  preparedFollowupReviews.delete(input.outputHold);
  const { preflight, grounded, candidate } = plan;
  const hold = input.outputHold;
  const question = preflight.receivePlan.normalizedRequest.text;
  if (typeof question !== 'string') return null;
  const check = () => input.withCurrentAuthority(async authority => {
    await recheckCharacterStandardReaderFinalHoldV1({ ...authority, preflight, outputHold: hold });
    const latest = await prepareReaderLatestAnchorContinuityV1({ ...authority, preflight, grounded });
    return latest.mode !== 'hold'
      && latest.questionScope.scopeHash === hold.scopeHash
      && latest.questionScope.evidence.assistantMessageId === hold.assistantAnchorMessageId
      && latest.questionScope.evidence.selectionHash === hold.selectionHash;
  });
  return reviewPrivateReaderSegmentsV1({
    grounded, question, port: input.port, check,
    segments: candidate.utterance.segments,
    sourceUnitRefs: hold.sourceUnitRefs, sourceIdentityHash: hold.sourceIdentityHash,
    profile: getGuardedStandardReaderCandidateProfileV1(candidate),
  });
}

async function reviewPrivateReaderSegmentsV1(input: Readonly<{
  grounded: CharacterStandardChatGroundingV2;
  question: string;
  port: CharacterSajuConsultationShadowPortV1;
  check: () => Promise<boolean>;
  segments: readonly CharacterSajuUtteranceSegmentV1[];
  sourceUnitRefs: readonly string[];
  sourceIdentityHash: string;
  profile: CharacterReadingPerspectiveRefV1;
}>): Promise<ReviewedPrivateReaderFollowupV1 | null> {
  const { grounded, question, check, segments } = input;
  const { grounding, context } = grounded;
  const units = new Map(grounding.units.map(unit => [unit.unitId, unit]));
  const source = [];
  for (const segment of segments) {
    if (segment.kind === 'protected_disclosure' &&
        findReadingPublicTrustLanguageViolationV1(segment.text) !== null) return null;
    if (segment.kind !== 'semantic_realization') continue;
    const unitId = segment.sourceUnitRefs[0];
    const unit = unitId === undefined ? undefined : units.get(unitId);
    if (segment.sourceUnitRefs.length !== 1 || unit === undefined || unit.ambiguityRef !== undefined) return null;
    source.push({ unitId: unit.unitId, unit, purpose: segment.purpose, baselineText: segment.text });
  }
  if (source.length !== input.sourceUnitRefs.length ||
      source.some(({ unitId }, index) => unitId !== input.sourceUnitRefs[index])) return null;
  try {
    if (!await check()) return null;
    const result = await reviewCharacterSajuConsultationBatchV1({
      source, grounding, question, port: input.port,
      profile: input.profile,
      publishedCharacterVoice: Object.freeze({ speech: context.speech, persona: context.persona }),
    });
    if (result.mode !== 'reviewed_batch' || result.segments.some(({ text }) =>
      !text.trim() || findReadingPublicTrustLanguageViolationV1(text) !== null || /[\p{Cc}\p{Cf}]/u.test(text),
    )) return null;

    const reviewed = new Map(result.segments.map(segment => [segment.unitId, segment.text]));
    const body = segments.flatMap(segment => {
      if (segment.kind === 'protected_disclosure') return [segment.text];
      if (segment.kind !== 'semantic_realization') return [];
      return [reviewed.get(segment.sourceUnitRefs[0]!)!];
    }).join('\n\n');
    if (!body.trim() || !await check()) return null;
    const review: ReviewedPrivateReaderFollowupV1 = Object.freeze({
      state: 'reviewed_private',
      privateBodyHash: 'sha256:v1:' + createHash('sha256').update(body, 'utf8').digest('hex'),
      sourceIdentityHash: input.sourceIdentityHash,
      officialArtifactResponseHash: grounded.scope.officialArtifactResponseHash,
      evaluatorVersion: result.evaluatorVersion,
      candidateHashes: Object.freeze(result.segments.map(segment => segment.candidateHash)),
    });
    reviewedFollowupBodies.set(review, body);
    return review;
  } catch {
    return null;
  }
}

/** A purchased question uses the selected scene for entry and the acknowledged answer after it. */
export async function reviewPreparedPurchasedReaderQuestionV1(input: Readonly<{
  preflight: CharacterStandardReadingChatTurnPreflightV2;
  grounded: CharacterStandardChatGroundingV2;
  guardedScene: ReaderInterpretationPreviewEnvelopeV1;
  firstSceneQuestion?: Readonly<{ interpretationHash: string; segmentIndex: number }>;
  anchorAuthorityPort: ValidatedStandardFollowupAnchorAuthorityPortV1;
  port: CharacterSajuConsultationShadowPortV1;
  recheckCurrent: () => Promise<void>;
}>): Promise<Readonly<{
  reviewed: ReviewedPrivateReaderFollowupV1;
  sourceUnitRefs: readonly string[];
  focusedUnitRef: string;
  previousSafeMessageId: string | null;
}> | null> {
  const { grounded, guardedScene, firstSceneQuestion } = input;
  const question = input.preflight.receivePlan.normalizedRequest.text;
  if (typeof question !== 'string' || input.port.evaluateBatch === undefined) return null;
  const intent = classifyReaderConversationIntentV1(question, grounded.scope.sajuDomain);
  const assessment = inspectCharacterStandardFollowupSignalsV1(question, grounded.scope.sajuDomain);
  if (intent.primaryIntent !== 'official_followup' || intent.securitySignals.length !== 0 ||
      assessment.securitySignals.length !== 0) return null;

  try {
    assertServerGuardedReaderInterpretationSceneV2(guardedScene);
    if (guardedScene.officialReadingId !== grounded.scope.readingId ||
        guardedScene.readerCharacterId !== grounded.scope.readerCharacterId ||
        guardedScene.readerContentBundleId !== grounded.scope.readerContentBundleId ||
        guardedScene.officialArtifactResponseHash !== grounded.scope.officialArtifactResponseHash ||
        guardedScene.requestedDomain !== grounded.scope.sajuDomain ||
        guardedScene.sourceResponseHash !== grounded.grounding.sourceResponseHash ||
        guardedScene.groundingHash !== grounded.grounding.groundingHash) return null;

    const select = async () => {
      if (firstSceneQuestion !== undefined) {
        const scene = await prepareCharacterStandardReaderSceneSourceHandoffV1({
          ...input, expectedSceneInterpretationHash: firstSceneQuestion.interpretationHash,
          selectedSceneSegmentIndex: firstSceneQuestion.segmentIndex,
        });
        return scene.mode === 'hold' ? null : {
          ...scene, focusedUnitRef: scene.rootUnitId, previousSafeMessageId: null,
        };
      }
      const current = await prepareReaderLatestAnchorContinuityV1({
        ...input, useApprovedSajuAnchorContinuity: true,
      });
      if (current.mode === 'hold') return null;
      const evidence = current.questionScope.evidence;
      return { ...evidence, previousSafeMessageId: evidence.assistantMessageId };
    };
    const handoff = await select();
    if (handoff === null || handoff.requiredAmbiguityRefs.length !== 0) return null;
    const selected = new Set(handoff.selectedUnitIds);
    const semantic = guardedScene.utterance.segments.filter((segment): segment is Extract<
      CharacterSajuUtteranceSegmentV1, { kind: 'semantic_realization' }
    > =>
      segment.kind === 'semantic_realization' && segment.sourceUnitRefs.length === 1 &&
      selected.has(segment.sourceUnitRefs[0]!),
    );
    const sourceUnitRefs = Object.freeze(semantic.flatMap(segment => segment.sourceUnitRefs));
    if (sourceUnitRefs.length !== selected.size || new Set(sourceUnitRefs).size !== selected.size) return null;

    const disclosures = new Map(grounded.grounding.disclosures.map(disclosure => [disclosure.disclosureRef, disclosure]));
    const segments: CharacterSajuUtteranceSegmentV1[] = [...semantic];
    for (const disclosureRef of handoff.requiredDisclosureRefs) {
      const disclosure = disclosures.get(disclosureRef);
      if (!disclosure) return null;
      segments.push({ kind: 'protected_disclosure', disclosureRef, text: disclosure.text });
    }
    guardCharacterRendererOutput({
      rawOutput: { schemaVersion: 'v1', emotion: 'neutral', memoryProposals: [],
        relationshipEventProposals: [], suggestedActions: [] },
      context: grounded.context, allowedSuggestedActionKeys: [],
    });
    const check = async () => {
      await input.recheckCurrent();
      const current = await select();
      return current !== null && current.selectionHash === handoff.selectionHash &&
        current.previousSafeMessageId === handoff.previousSafeMessageId;
    };
    const sourceIdentityHash = 'sha256:v1:' + createHash('sha256').update(canonicalJson({
      selectionHash: handoff.selectionHash, question,
    })).digest('hex');
    const reviewed = await reviewPrivateReaderSegmentsV1({
      grounded, question, port: input.port, check, segments, sourceUnitRefs, sourceIdentityHash,
      profile: getGuardedReaderSceneProfileV2(guardedScene),
    });
    return reviewed === null ? null : Object.freeze({
      reviewed, sourceUnitRefs, focusedUnitRef: handoff.focusedUnitRef,
      previousSafeMessageId: handoff.previousSafeMessageId,
    });
  } catch {
    return null;
  }
}

function hold(
  intent: ReaderConversationIntentDecisionV1,
  reason: Extract<ReaderConversationResponseCandidateV1, {mode: 'hold'}>['reason'],
): ReaderConversationResponseCandidateV1 {
  return Object.freeze({
    mode: 'hold' as const, intent, reason, addedModelCalls: 0 as const,
    publicDisclosureAuthorized: false as const,
  });
}

/**
 * RR-05/06 offline Reader conversation handoff. Does not invoke providers,
 * read a DB, store memories, authorize a paid Reading or reveal a public reply.
 * The existing Reader Planner, grounding closure, bounded renderer, Semantic
 * Guard and Output Guard retain authority over official content.
 */
export async function prepareReaderConversationResponseCandidateV1(
  input: PrepareReaderConversationResponseCandidateInputV1,
): Promise<ReaderConversationResponseCandidateV1> {
  const intent = classifyReaderConversationIntentV1(
    input.userText, input.admittedDomain ?? null,
  );

  // This routing helper is NOT a Security authority. Even an otherwise
  // eligible Official Reading summary or ordinary/support request may carry
  // a security/prompt-injection/distress signal. Defer to the existing gate
  // BEFORE touching official sources, private memories or renderer drafts.
  // The gate must be run outside this helper; no positive security decision
  // or extra model call is created here.
  if (intent.securitySignals.length !== 0) {
    return hold(intent, 'security_gate_pending');
  }

  if (intent.primaryIntent === 'clarification') {
    return hold(intent, 'clarification_required');
  }

  // RR-05 independent instruction-override observations are negative-only:
  // catch disguised system/developer role instructions the conversational
  // hint regex missed. No provider, Official source, Memory or policy bypass.
  // Known risk candidates above still defer to the existing Security Gate.
  const inspected = inspectCharacterStandardFollowupSignalsV1(
    input.userText, input.admittedDomain ?? '',
  );
  if (inspected.securitySignals.includes('instruction_override_attempt') ||
      inspected.securitySignals.includes('invalid_input')) {
    return hold(intent, 'existing_guard_rejected');
  }

  // Ordinary chat and support NEVER consume even a supplied Official snapshot.
  // The existing consent Grant/Pin must separately authorize any personal
  // relationship memory before the normal Chat context assembler uses it.
  if (intent.primaryIntent === 'ordinary' || intent.primaryIntent === 'support') {
    return Object.freeze({
      mode: intent.primaryIntent === 'support'
        ? 'supportive_dialogue_candidate' as const
        : 'ordinary_dialogue_candidate' as const,
      intent,
      officialSourceUnitRefs: Object.freeze([]) as readonly [],
      relationshipMemoryRefs: Object.freeze([]) as readonly [],
      suggestedResponseFocus: intent.primaryIntent === 'support'
        ? 'acknowledge_without_saju' as const : 'reply_to_current_user' as const,
      addedModelCalls: 0 as const,
      publicDisclosureAuthorized: false as const,
    });
  }

  if (!input.official) return hold(intent, 'unavailable_official_source');
  const { preflight, grounded } = input.official;
  try {
    assertServerPreparedStandardChatPreflightV2(preflight);
    assertServerPreparedStandardChatGroundingV2(grounded);
  } catch {
    return hold(intent, 'unavailable_official_source');
  }
  const scope = grounded.scope;
  if (input.admittedDomain !== scope.sajuDomain ||
      preflight.scope.subjectId !== scope.subjectId ||
      preflight.scope.threadId !== scope.threadId ||
      preflight.scope.readerCharacterId !== scope.readerCharacterId ||
      preflight.scope.readingId !== scope.readingId ||
      preflight.scope.officialArtifactResponseHash !== scope.officialArtifactResponseHash ||
      preflight.receivePlan.normalizedRequest.text !== input.userText ||
      grounded.context.characterId !== scope.readerCharacterId ||
      grounded.grounding.readingRef !== scope.readingId) {
    return hold(intent, 'source_mismatch');
  }

  if (intent.primaryIntent === 'official_summary') {
    const scene = input.official.guardedScene;
    if (!scene) return hold(intent, 'unavailable_official_source');
    try {
      assertServerGuardedReaderInterpretationSceneV2(scene);
    } catch {
      return hold(intent, 'unavailable_official_source');
    }
    if (scene.mode !== 'reader_interpretation' ||
        scene.officialReadingId !== scope.readingId ||
        scene.readerCharacterId !== scope.readerCharacterId ||
        scene.readerContentBundleId !== scope.readerContentBundleId ||
        scene.officialArtifactResponseHash !== scope.officialArtifactResponseHash ||
        scene.groundingHash !== grounded.grounding.groundingHash ||
        scene.requestedDomain !== scope.sajuDomain) {
      return hold(intent, 'source_mismatch');
    }
    const first = scene.utterance.segments.find(s => s.kind === 'semantic_realization');
    if (!first || first.sourceUnitRefs.length !== 1) {
      return hold(intent, 'source_closure_required');
    }
    let source: ReturnType<typeof closeCharacterStandardReaderSourceFocusV1>;
    try {
      source = closeCharacterStandardReaderSourceFocusV1({
        grounded, rootUnitId: first.sourceUnitRefs[0]!,
      });
    } catch {
      return hold(intent, 'source_closure_required');
    }
    if (source.mode !== 'closed' || source.protectedOnly ||
        source.requiredAmbiguityRefs.length > 0 ||
        source.selectedUnitIds.length === 0 ||
        source.selectedUnitIds.length > 3) {
      return hold(intent, 'source_closure_required');
    }
    // An excerpt can only use verbatim already guard-approved segments. A
    // required Saju companion/disclosure must appear exactly once; otherwise
    // do not manufacture a short paraphrase or silently drop qualifications.
    const portions: string[] = [];
    for (const ref of source.selectedUnitIds) {
      const segments = scene.utterance.segments.filter(
        segment => segment.kind === 'semantic_realization' &&
          segment.sourceUnitRefs.length === 1 && segment.sourceUnitRefs[0] === ref,
      );
      if (segments.length !== 1 || !segments[0]?.text.trim()) {
        return hold(intent, 'source_closure_required');
      }
      portions.push(segments[0].text);
    }
    for (const ref of source.requiredDisclosureRefs) {
      const segments = scene.utterance.segments.filter(
        segment => segment.kind === 'protected_disclosure' &&
          segment.disclosureRef === ref,
      );
      if (segments.length !== 1 || !segments[0]?.text.trim()) {
        return hold(intent, 'source_closure_required');
      }
      portions.push(segments[0].text);
    }
    const excerpt = portions.join(' ');
    if (excerpt.length < 1 || excerpt.length > 280 || CONTROL.test(excerpt)) {
      return hold(intent, 'source_closure_required');
    }
    return Object.freeze({
      mode: 'official_summary_candidate' as const,
      intent, readingRef: scope.readingId,
      readerCharacterId: scope.readerCharacterId,
      officialArtifactResponseHash: scope.officialArtifactResponseHash,
      sourceUnitRefs: Object.freeze([...source.selectedUnitIds]),
      requiredDisclosureRefs: Object.freeze([...source.requiredDisclosureRefs]),
      excerpt, isCompleteOfficialReading: false as const,
      addedModelCalls: 0 as const,
      publicDisclosureAuthorized: false as const,
    });
  }

  if (!input.official.anchorAuthorityPort ||
      (!input.official.recentMessageAuthorityPort && input.official.useApprovedSajuAnchorContinuity !== true)) {
    // A DB-validated Saju Anchor alone does not prove it is the Reader's
    // most recent actual answer. No fallback to the old shortcut is allowed.
    return hold(intent, 'official_latest_anchor_not_admitted');
  }
  try {
    const continuity = await prepareReaderLatestAnchorContinuityV1({
      preflight,
      grounded,
      anchorAuthorityPort: input.official.anchorAuthorityPort,
      ...(input.official.recentMessageAuthorityPort === undefined ? {} :
        { recentMessageAuthorityPort: input.official.recentMessageAuthorityPort }),
      ...(input.official.useApprovedSajuAnchorContinuity === true ? { useApprovedSajuAnchorContinuity: true } : {}),
    });
    if (continuity.mode === 'hold') {
      return hold(intent, 'official_latest_anchor_not_admitted');
    }
    // The existing RR-05 classifier already minted and checked questionScope
    // while RR-08 confirmed exact latest Reader message ID and stable order.
    // Reusing it avoids a second DB Anchor lookup and any new model stage.
    const question = continuity.questionScope;
    const candidate = prepareCharacterStandardReaderBoundedCandidateV1({
      grounded, questionScope: question,
    });
    if (candidate.mode !== 'semantic_guarded_candidate') {
      return hold(intent, 'existing_guard_rejected');
    }
    if (input.official.rendererDraft === undefined) {
      return hold(intent, 'existing_guard_rejected');
    }
    const outputHold = guardCharacterStandardReaderFinalOutputV1({
      grounded, questionScope: question, candidate,
      rendererDraft: input.official.rendererDraft,
    });
    preparedFollowupReviews.set(outputHold, { preflight, grounded, candidate });
    return Object.freeze({
      mode: 'official_followup_output_hold' as const, intent,
      selectedSourceUnitRefs: Object.freeze([...candidate.sourceUnitRefs]),
      outputHold,
      addedModelCalls: 0 as const,
      publicDisclosureAuthorized: false as const,
    });
  } catch {
    return hold(intent, 'existing_guard_rejected');
  }
}
