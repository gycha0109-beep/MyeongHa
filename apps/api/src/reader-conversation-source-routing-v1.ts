import {
  classifyCharacterStandardFollowupLexicalIntentV1,
  classifyCharacterStandardFollowupQuestionScopeV1,
} from './character-standard-reading-chat-question-scope-v1.js';
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
} from './character-standard-reading-chat-bounded-candidate-v1.js';
import {
  assertServerGuardedReaderInterpretationSceneV2,
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
        'official_question_not_admitted' | 'existing_guard_rejected';
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
      return decide('official_summary', signals);
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
    guardedScene?: ReaderInterpretationPreviewEnvelopeV1;
    rendererDraft?: unknown;
  }>;
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

  if (intent.primaryIntent === 'clarification') {
    return hold(intent, 'clarification_required');
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

  if (!input.official.anchorAuthorityPort) {
    return hold(intent, 'unavailable_official_source');
  }
  try {
    const question = await classifyCharacterStandardFollowupQuestionScopeV1({
      preflight, grounded, anchorAuthorityPort: input.official.anchorAuthorityPort,
    });
    if (question.mode === 'hold') {
      return hold(intent, 'official_question_not_admitted');
    }
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
