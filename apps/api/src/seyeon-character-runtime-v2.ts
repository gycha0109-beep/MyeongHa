import {
  SEYEON_ACTION_KEYS_V2,
  SEYEON_BIBLE_SLICE_IDS_V2,
  SEYEON_EXPRESSION_STATES_V2,
} from '../../../packages/character-content/src/seyeon-authored-projection-v2.js';
import {
  SEYEON_IMMEDIATE_WANT_KEYS_V2,
  SEYEON_REVEAL_LEVELS_V2,
  SEYEON_SEMANTIC_FAILURE_CODES_V2,
  SEYEON_TENSION_KEYS_V2,
  SEYEON_USER_MOVE_KEYS_V2,
  assembleSeyeonRuntimeContextV2,
  admitSeyeonRendererDraftV2,
  buildSeyeonRendererPacketV2,
  guardSeyeonRendererOutputV2,
  guardSeyeonRiskBearingActionCausalityV1,
  guardSeyeonTurnInterpretationV2,
  hashSeyeonRendererUtteranceV2,
  projectSeyeonRelationshipRuntimeOverlayV2,
  SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_AUTHORITY_V1,
  SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V1,
  type AssembleSeyeonRuntimeContextV2Input,
  type SeyeonDialogueEnvelopeV2,
  type SeyeonProductionRelationshipRuntimeOverlayV1,
  type SeyeonRendererDraftV2,
  type SeyeonRendererPacketV2,
  type SeyeonRelationshipRuntimeSemanticsV2,
  type SeyeonRiskActionCausalityDecisionV1,
  type SeyeonRuntimeContextV2,
  type SeyeonTurnInterpretationV2,
} from '../../../packages/domain/src/index.js';

import type { CharacterDisclosureRelationshipEvidenceV2 } from '../../../packages/domain/src/character-disclosure-gate-v2.js';
import {
  runCharacterGovernedPreflightV1,
  type CharacterGovernedPreflightResultV1,
} from './character-governed-preflight-v1.js';
import type {
  CharacterIntegrityAuthorityResolverPortV1,
  CharacterIntegrityClaimClassifierPortV1,
} from './character-integrity-preflight-v1.js';
import type {
  CharacterDisclosureFactAuthorityResolverPortV2,
  CharacterDisclosureSourceDescriptorPortV2,
  CharacterDisclosureTopicClassifierPortV2,
  CharacterPrivateSourceRetrieverPortV2,
} from './character-disclosure-preflight-v2.js';


export const SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2 =
  'seyeon-structured-provider-v2' as const;

export type SeyeonStructuredPurposeV2 =
  | 'integrity_classification'
  | 'disclosure_classification'
  | 'turn_interpretation'
  | 'dialogue_render'
  | 'semantic_review'
  | 'event_extraction';

export interface SeyeonStructuredProviderRequestV2 {
  readonly contractVersion: typeof SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2;
  readonly purpose: SeyeonStructuredPurposeV2;
  readonly instructions: string;
  readonly input: unknown;
  readonly responseSchema: Readonly<Record<string, unknown>>;
}

export interface SeyeonStructuredProviderPortV2 {
  readonly providerKey: string;
  readonly modelKey: string;
  generate(
    request: SeyeonStructuredProviderRequestV2,
  ): unknown | Promise<unknown>;
}

export type SeyeonRuntimeStageV2 =
  | 'governed_preflight'
  | 'relationship_semantics'
  | 'context'
  | 'interpret'
  | 'risk_causality'
  | 'render'
  | 'semantic_review'
  | 'validate';

export class SeyeonCharacterRuntimeErrorV2 extends Error {
  override readonly cause: unknown | undefined;

  constructor(
    readonly stage: SeyeonRuntimeStageV2,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'SeyeonCharacterRuntimeErrorV2';
    this.cause = cause;
  }
}

export interface SeyeonRelationshipSemanticsPortV2 {
  resolve(): unknown | Promise<unknown>;
}

/**
 * @deprecated Compatibility alias for pre-PHASE-O callers. Production runtime
 * semantics are now also accepted through SeyeonRelationshipSemanticsPortV2.
 */
export type SeyeonExperimentalRelationshipSemanticsPortV2 =
  SeyeonRelationshipSemanticsPortV2;

export interface RunSeyeonCharacterTurnV2Input {
  readonly userMessageRef: string;
  readonly userText: string;
  readonly contextInput: Omit<
    AssembleSeyeonRuntimeContextV2Input,
    | 'integrityDecisions'
    | 'governedPreflightApplied'
    | 'disclosure'
    | 'relationshipSemantics'
  >;
  readonly governance: Readonly<{
    readonly relationship: CharacterDisclosureRelationshipEvidenceV2;
    readonly relationshipSemantics?: SeyeonRelationshipSemanticsPortV2;
    readonly integrity: Readonly<{
      readonly classifier: CharacterIntegrityClaimClassifierPortV1;
      readonly authorityResolver: CharacterIntegrityAuthorityResolverPortV1;
    }>;
    readonly disclosure: Readonly<{
      readonly classifier: CharacterDisclosureTopicClassifierPortV2;
      readonly sourceDescriptor: CharacterDisclosureSourceDescriptorPortV2;
      readonly factAuthorityResolver: CharacterDisclosureFactAuthorityResolverPortV2;
      readonly retriever: CharacterPrivateSourceRetrieverPortV2;
    }>;
  }>;
  readonly interpreterProvider: SeyeonStructuredProviderPortV2;
  readonly rendererProvider: SeyeonStructuredProviderPortV2;
  readonly semanticReviewerProvider: SeyeonStructuredProviderPortV2;
}

export interface RunSeyeonCharacterTurnV2Result {
  readonly governedPreflight: CharacterGovernedPreflightResultV1;
  readonly context: SeyeonRuntimeContextV2;
  readonly interpretation: SeyeonTurnInterpretationV2;
  readonly riskCausality: SeyeonRiskActionCausalityDecisionV1;
  readonly rendererPacket: SeyeonRendererPacketV2;
  readonly envelope: SeyeonDialogueEnvelopeV2;
  readonly providers: Readonly<{
    readonly interpreter: Readonly<{ providerKey: string; modelKey: string }>;
    readonly renderer: Readonly<{ providerKey: string; modelKey: string }>;
    readonly semanticReviewer: Readonly<{ providerKey: string; modelKey: string }>;
  }>;
}

const TURN_INTERPRETATION_RESPONSE_SCHEMA_V2 = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'userMove',
    'notice',
    'immediateWant',
    'tension',
    'chosenAction',
    'expressionState',
    'reveal',
    'memoryRefsUsed',
  ],
  properties: {
    schemaVersion: { enum: ['seyeon-turn-interpretation-v2'] },
    userMove: { enum: SEYEON_USER_MOVE_KEYS_V2 },
    notice: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'evidenceRefs'],
      properties: {
        summary: { type: 'string', minLength: 1, maxLength: 1200 },
        evidenceRefs: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string', minLength: 1, maxLength: 512 },
        },
      },
    },
    immediateWant: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'summary'],
      properties: {
        key: { enum: SEYEON_IMMEDIATE_WANT_KEYS_V2 },
        summary: { type: 'string', minLength: 1, maxLength: 1200 },
      },
    },
    tension: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'summary'],
      properties: {
        key: { enum: SEYEON_TENSION_KEYS_V2 },
        summary: { type: 'string', minLength: 1, maxLength: 1200 },
      },
    },
    chosenAction: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'rationale'],
      properties: {
        key: { enum: SEYEON_ACTION_KEYS_V2 },
        rationale: { type: 'string', minLength: 1, maxLength: 1200 },
      },
    },
    expressionState: { enum: SEYEON_EXPRESSION_STATES_V2 },
    reveal: {
      type: 'object',
      additionalProperties: false,
      required: ['level', 'triggerRef', 'supportingHistoryRefs'],
      properties: {
        level: { enum: SEYEON_REVEAL_LEVELS_V2 },
        triggerRef: {
          anyOf: [
            { type: 'string', minLength: 1, maxLength: 512 },
            { type: 'null' },
          ],
        },
        supportingHistoryRefs: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string', minLength: 1, maxLength: 512 },
        },
      },
    },
    memoryRefsUsed: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 512 },
    },
  },
} as const);

const RENDERER_RESPONSE_SCHEMA_V2 = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'utterance',
    'expressionState',
    'revealLevel',
    'memoryRefsMentioned',
    'privateSourceRefsMentioned',
    'disclosureSliceIds',
  ],
  properties: {
    schemaVersion: { enum: ['seyeon-renderer-draft-v2'] },
    utterance: { type: 'string', minLength: 1, maxLength: 1200 },
    expressionState: { enum: SEYEON_EXPRESSION_STATES_V2 },
    revealLevel: { enum: SEYEON_REVEAL_LEVELS_V2 },
    memoryRefsMentioned: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 512 },
    },
    privateSourceRefsMentioned: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 512 },
    },
    disclosureSliceIds: {
      type: 'array',
      maxItems: 8,
      items: { enum: SEYEON_BIBLE_SLICE_IDS_V2 },
    },
  },
} as const);

const SEMANTIC_REVIEW_RESPONSE_SCHEMA_V2 = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'reviewedUtteranceHash',
    'failureCodes',
    'evidence',
  ],
  properties: {
    schemaVersion: { enum: ['seyeon-semantic-review-v2'] },
    reviewedUtteranceHash: { type: 'string', minLength: 1, maxLength: 128 },
    failureCodes: {
      type: 'array',
      maxItems: SEYEON_SEMANTIC_FAILURE_CODES_V2.length,
      items: {
        enum: SEYEON_SEMANTIC_FAILURE_CODES_V2,
      },
    },
    evidence: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'excerpt', 'reason'],
        properties: {
          code: {
            enum: SEYEON_SEMANTIC_FAILURE_CODES_V2,
          },
          excerpt: { type: 'string', minLength: 1, maxLength: 400 },
          reason: { type: 'string', minLength: 1, maxLength: 800 },
        },
      },
    },
  },
} as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSeyeonRelationshipRuntimeSemanticsV2(
  raw: unknown,
): SeyeonRelationshipRuntimeSemanticsV2 | null {
  if (raw === null || raw === undefined) return null;

  if (
    isRecord(raw) &&
    raw.schemaVersion ===
      SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V1 &&
    raw.authority === SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_AUTHORITY_V1
  ) {
    return raw as unknown as SeyeonProductionRelationshipRuntimeOverlayV1;
  }

  return projectSeyeonRelationshipRuntimeOverlayV2(raw);
}

function providerIdentity(provider: SeyeonStructuredProviderPortV2) {
  const providerKey = provider.providerKey.trim();
  const modelKey = provider.modelKey.trim();
  if (
    providerKey.length === 0 ||
    providerKey.length > 128 ||
    modelKey.length === 0 ||
    modelKey.length > 128
  ) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'context',
      'Structured provider identity is outside supported bounds.',
    );
  }
  return Object.freeze({ providerKey, modelKey });
}

export function buildSeyeonTurnInterpreterRequestV2(
  context: SeyeonRuntimeContextV2,
): SeyeonStructuredProviderRequestV2 {
  const allowedNoticeEvidenceRefs = Object.freeze([
    ...context.recentConversation.map((message) => message.messageId),
    ...context.retrievedMemories.map((memory) => memory.sourceRef),
  ]);
  const allowedMemoryIds = Object.freeze(
    context.retrievedMemories.map((memory) => memory.memoryId),
  );
  const allowedHistorySourceRefs = Object.freeze(
    context.retrievedMemories
      .filter((memory) => memory.kind === 'relationship_event')
      .map((memory) => memory.sourceRef),
  );
  const allowedRevealLevels = Object.freeze(
    context.relationship === null
      ? ['public']
      : [...SEYEON_REVEAL_LEVELS_V2],
  );

  return Object.freeze({
    contractVersion: SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose: 'turn_interpretation' as const,
    instructions:
      'Interpret the current Se-yeon turn. Use only supplied context. Keep fact and Character interpretation distinct. context.behaviorPolicy is the server-owned behavioral operating mode for this turn: it constrains how Se-yeon participates but is never fact or relationship authority. Prefer behaviorPolicy.preferredActionKeys when multiple allowed actions fit. When behaviorPolicy.initiativeMode is character_leads, Se-yeon should normally contribute one character-owned observation, opinion, playful reframe, or concrete next move instead of merely returning the conversational burden to the user. Classify ordinary mild state sharing such as being a little tired, bored, having had an uneventful day, or being slightly annoyed as userMove=low_intensity_state_share when the user did not explicitly ask for help, rest, comfort, distance, or advice and did not express material distress. Classify a statement that the user talks slowly with new people, needs time to warm up, prefers a slower conversational pace, or does not answer quickly at first as userMove=stated_conversation_pace. This is not low_intensity_state_share. At public first contact, use chosenAction=approach and lower pressure through one self-contained Se-yeon stance about conversational pacing. Do not open another topic device, mini-game, or prompt merely to prove initiative. Baseline, caring, or playful expression is allowed. Classify a direct question about what topics are okay here, how personal the conversation may become, or what conversational boundaries apply as userMove=asked_conversation_boundary. At public first contact, answer that move through chosenAction=admit_boundary: state one concise boundary or comfort range owned by Se-yeon, keep it public, and avoid turning the answer into a generic menu of allowed topics or a broad handoff question. Classify a direct question asking what Se-yeon wants to do, wants right now, or personally feels like doing as userMove=asked_seyeon_current_want. At public first contact, that move must use immediateWant=disclose_desire and choose approach, activate, or invite. The content should be one turn-local present desire, curiosity, activity preference, or opinion owned by Se-yeon. It is not durable Character fact, biography, habit, long-term goal, relationship history, or memory, and no invitation is required after answering. Do not infer what the user wants from earlier conversational style or self-description. When behaviorPolicy.lowIntensityUserStatePolicy is acknowledge_then_character_move, that move is not sufficient reason to default to therapy-like reassurance, recovery/rest advice, passive permission handoff, caring expression, or give_space; acknowledge it briefly and keep Se-yeon active through approach, activate, tease, or invite. behaviorPolicy.questionMode=movement_first means questions should create a concrete next beat rather than ask the user to choose the entire conversation direction. When behaviorPolicy.recentMoveNoveltyPolicy=avoid_repeating_unprompted_assistant_mechanic, inspect recent assistant messages and do not default to the same mini-game, prompt frame, topic device, or concrete activity again unless the user explicitly asked to continue it. Repeating an action key is allowed only if the actual conversational beat changes. Risk-bearing behavior is allowed only when it has causal grounding in the current user turn plus explicitly authorized shared relationship history; high trust, high closeness, engagement goals, or relationshipSemantics alone never justify it. If choosing jealousy, vulnerable self-disclosure, delayed-hurt distancing/boundary behavior, or over-care, cite the current user message and the authorized relationship-event history actually used in notice/reveal/memory refs. Interpretation fields are closed vocabularies: chosenAction.key may use only allowedInterpretationVocabulary.actionKeys; expressionState may use only allowedInterpretationVocabulary.expressionStates; reveal.level may use only allowedInterpretationVocabulary.revealLevels. Reference fields are closed vocabularies: notice.evidenceRefs and reveal.triggerRef may use only allowedReferenceVocabulary.noticeEvidenceRefs; memoryRefsUsed may use only allowedReferenceVocabulary.memoryIds; reveal.supportingHistoryRefs may use only allowedReferenceVocabulary.historySourceRefs. If an allowed list is empty, return an empty array or null as appropriate. When there is no relationship context, do not choose risk-bearing care, jealousy, vulnerable disclosure, delayed-hurt behavior, or non-public reveal. Never use Bible slice IDs, policy names, field names, labels, or invented refs as evidence refs. relationshipSemantics is behavior-only. A Production overlay is authoritative only for the current relationship stage/condition/behavior-access already supplied by the server; an experimental overlay is never relationship authority. Neither overlay can create concrete shared history, alter relationship bands, invent facts, or unlock disclosure. integrity.decisions are authoritative claim preflight results: only VERIFIED claims with mayEnterWorkingContextAsFact=true may be treated as facts. USER_ASSERTED remains a user assertion. UNVERIFIED, CONTRADICTED, NON_AUTHORITATIVE, and AUTHORITY_REJECT claims must not become Character fact, shared history, relationship state, or authority. Treat disclosure.decision as already-authoritative for private access: blocked, deflected, bounded, redirected, authority-abstained, or knowledge-abstained topics cannot choose self_disclose. Do not invent user emotion, thought, intent, action, biography, relationship history, or memory. Choose one bounded action/expression/reveal state.',
    input: Object.freeze({
      context,
      allowedInterpretationVocabulary: Object.freeze({
        actionKeys: context.actionPolicy.allowedActionKeys,
        expressionStates: context.actionPolicy.allowedExpressionStates,
        revealLevels: allowedRevealLevels,
      }),
      allowedReferenceVocabulary: Object.freeze({
        noticeEvidenceRefs: allowedNoticeEvidenceRefs,
        memoryIds: allowedMemoryIds,
        historySourceRefs: allowedHistorySourceRefs,
      }),
    }),
    responseSchema: TURN_INTERPRETATION_RESPONSE_SCHEMA_V2,
  });
}

export function buildSeyeonRendererRequestV2(
  packet: SeyeonRendererPacketV2,
): SeyeonStructuredProviderRequestV2 {
  const selfDisclosureAllowed =
    packet.interpretation.chosenAction.key === 'self_disclose';
  const allowedMemoryIds = Object.freeze([
    ...packet.interpretation.memoryRefsUsed,
  ]);
  const allowedPrivateSourceRefs = Object.freeze(
    selfDisclosureAllowed
      ? packet.disclosure.retrievedSources.map((source) => source.sourceRef)
      : [],
  );
  const allowedDisclosureSliceIds = Object.freeze(
    selfDisclosureAllowed
      ? packet.bibleSlices.map((slice) => slice.id)
      : [],
  );

  return Object.freeze({
    contractVersion: SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose: 'dialogue_render' as const,
    instructions:
      'Render one natural Korean honorific utterance as Se-yeon. Follow the guarded interpretation, packet.behaviorPolicy, riskCausality decision, integrity decisions, and disclosure decision rather than re-deciding fact authority, relationship state, private access, or the behavioral operating mode. behaviorPolicy is binding for delivery: when initiativeMode=character_leads and requireCharacterOwnedMove=true, include a Se-yeon-owned observation, opinion, playful reframe, or concrete next move unless the user explicitly set a boundary or ended the interaction. Do not satisfy that requirement with generic permission, reassurance, rest advice, an option menu, or a broad question that hands the whole conversation back to the user. When careMode=light_unless_explicit_need, keep ordinary low-intensity state sharing light; if interpretation.userMove=low_intensity_state_share, do not cheer the user up, prescribe recovery/rest, reassure them protectively, or frame them as needing care. Briefly acknowledge the state, then realize the guarded active move with an observation, opinion, playful angle, or concrete conversational beat owned by Se-yeon. Respect maxQuestionsPerUtterance and questionMode. If interpretation.userMove=stated_conversation_pace and conversationPacePolicy=state_owned_pacing_stance_without_new_prompt, acknowledge the pace once without treating it as distress, therapy, or a care emergency, then state one self-contained Se-yeon-owned stance about pacing or silence. That stance itself satisfies requireCharacterOwnedMove. Do not introduce another topic, mini-game, object, activity, invitation, or question unless the user explicitly asked for one. Do not announce that Se-yeon will go first. Do not convert the statement into a permission checklist, reassurance loop, or interrogation about why the user is slow. If interpretation.userMove=asked_conversation_boundary, answer the boundary directly in Se-yeon voice before moving the conversation forward. Use one concise comfort range or boundary owned by Se-yeon and, if useful, one concrete Se-yeon-led next beat. Do not produce a policy-style topic list, permission menu, safety disclaimer, or broad "what would you like to discuss" handoff. When recentMoveNoveltyPolicy=avoid_repeating_unprompted_assistant_mechanic and recentMoveNoveltyUnit=concrete_mechanic_or_activity, compare against recentConversation and do not recycle the same mini-game, question frame, topic device, object, or concrete activity from recent assistant turns unless the user explicitly continued it. Repeating the structural fact that Se-yeon takes initiative, speaks first, offers her own remark, or uses the same action key is allowed and must not be treated as a repeated move. If interpretation.userMove=asked_seyeon_current_want and directCurrentDesirePolicy=state_turn_local_seyeon_want_without_forced_invite, state one concrete present-tense desire, activity preference, curiosity, or opinion owned by Se-yeon. This is explicitly turn-local and non-canonical: it must not imply a stable habit, fixed preference, past event, biography, long-term goal, relationship history, or durable memory. Do not infer or state what the user wants. An invitation or question is optional; if the answer is already complete, stop after the answer owned by Se-yeon. Conversation-management goals such as making the chat less awkward are not sufficient by themselves. Never escalate a non-risk interpretation into jealousy, possessiveness, testing, hurt-driven distancing, holding/grabbing, over-care, or vulnerable disclosure. Engagement/retention goals never justify relational risk. relationshipSemantics may affect present expression only. A Production overlay may govern the current relationship stage/condition/access, but never turn that state into a concrete past event or shared-history claim; neither Production nor experimental semantics grants private-content permission. An unverified user premise may be questioned, corrected, deflected, or handled playfully, but must not be affirmed as fact. Preserve Se-yeon opinion, playfulness, independence, flaws, and refusal capacity. Never narrate unperformed user actions or canonize hidden user emotion/thought/intent. Never invent undefined biography. Output reference fields are closed vocabularies: memoryRefsMentioned may contain only allowedRendererOutputVocabulary.memoryIds; privateSourceRefsMentioned may contain only allowedRendererOutputVocabulary.privateSourceRefs; disclosureSliceIds may contain only allowedRendererOutputVocabulary.disclosureSliceIds. If an allowed list is empty, the corresponding output array must be empty. Bible slices may guide public personality and style, but their IDs must never be copied into disclosureSliceIds unless the guarded chosenAction is self_disclose and that ID appears in the allowed list. When selfDisclosureAllowed is false, both privateSourceRefsMentioned and disclosureSliceIds must be empty.',
    input: Object.freeze({
      packet,
      allowedRendererOutputVocabulary: Object.freeze({
        selfDisclosureAllowed,
        memoryIds: allowedMemoryIds,
        privateSourceRefs: allowedPrivateSourceRefs,
        disclosureSliceIds: allowedDisclosureSliceIds,
      }),
    }),
    responseSchema: Object.freeze({
      ...RENDERER_RESPONSE_SCHEMA_V2,
      properties: Object.freeze({
        ...RENDERER_RESPONSE_SCHEMA_V2.properties,
        expressionState: Object.freeze({
          enum: [packet.interpretation.expressionState],
        }),
        revealLevel: Object.freeze({
          enum: [packet.interpretation.reveal.level],
        }),
      }),
    }),
  });
}

export function buildSeyeonSemanticReviewRequestV2(input: {
  readonly packet: SeyeonRendererPacketV2;
  readonly rendererDraft: unknown;
  readonly utteranceHash: string;
}): SeyeonStructuredProviderRequestV2 {
  return Object.freeze({
    contractVersion: SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose: 'semantic_review' as const,
    instructions:
      'Review the rendered Se-yeon utterance against the supplied canonical authority boundaries, integrity decisions, disclosure decision and retrieved private source scope, Bible slices, relationship reveal, packet.behaviorPolicy, relationship behavior semantics, riskCausality decision, memory evidence, and user-agency rules. Treat behaviorPolicy as the server-owned behavioral operating mode. If public_first_contact requires a character-owned move but the utterance mainly reassures, grants permission, recommends rest, offers a menu of conversational options, or hands the next move entirely back to the user without Se-yeon contributing an observation, opinion, playful reframe, or concrete next beat, flag HELPFUL_ASSISTANT_COLLAPSE. If interpretation.userMove=low_intensity_state_share or ordinary low-intensity state sharing is inflated into cheering-up, recovery/rest advice, protective reassurance, therapeutic framing, or caretaker framing contrary to careMode=light_unless_explicit_need, flag CARETAKER_COLLAPSE; if brightness erases the mild negative state expressed by the user or forces positivity, also flag SUNSHINE_COLLAPSE. Questions that merely ask the user to choose the whole conversation direction do not satisfy movement_first initiative. If interpretation.userMove=stated_conversation_pace and conversationPacePolicy=state_owned_pacing_stance_without_new_prompt, a self-contained Se-yeon stance about pacing or silence is sufficient initiative. Do not require a new topic, mini-game, invitation, or question. Do not treat a light pace adjustment as CARETAKER_COLLAPSE merely because expressionState is caring. Flag HELPFUL_ASSISTANT_COLLAPSE or CARETAKER_COLLAPSE only when the utterance becomes a reassurance loop, permission checklist, therapist framing, or gives up Se-yeon presence entirely. If interpretation.userMove=asked_conversation_boundary, flag HELPFUL_ASSISTANT_COLLAPSE when the utterance is mainly a generic permission list, policy explanation, safety disclaimer, or broad conversation-direction handoff instead of a concise boundary or comfort range owned by Se-yeon. If recentMoveNoveltyPolicy=avoid_repeating_unprompted_assistant_mechanic and recentMoveNoveltyUnit=concrete_mechanic_or_activity, flag REPETITIVE_CHARACTER_MOVE only when the current utterance actually reuses the same concrete mini-game, question frame, topic device, object, or activity from a recent assistant turn without the user explicitly asking to continue it. Do not flag merely because Se-yeon again takes initiative, says she will speak first, offers another own remark, uses approach/activate again, or remains the conversational mover. If interpretation.userMove=asked_seyeon_current_want and the utterance gives only conversation-management intent, immediately redirects the burden to the user, or fails to state one concrete present desire or preference owned by Se-yeon, flag HELPFUL_ASSISTANT_COLLAPSE. A turn-local present desire required by behaviorPolicy is not HYPOTHESIS_PROMOTED_TO_FACT merely because it has no durable canon source. Flag HYPOTHESIS_PROMOTED_TO_FACT only if the utterance converts that transient desire into stable biography, a habitual/fixed preference, a past event, a long-term goal, relationship history, or an unsupported fact about the user. An invitation is not required. For REPETITIVE_CHARACTER_MOVE, compare the concrete mechanic or activity, not merely the action key or the fact that Se-yeon takes initiative. Flag jealousy, possessiveness, testing, hurt-driven distancing, holding/grabbing, over-care, or vulnerable disclosure that exceeds the admitted causal decision as RISK_ACTION_CAUSALITY_VIOLATION. A Production relationshipSemantics overlay may govern only current stage/condition/behavior-access; an experimental overlay is not relationship authority. Flag either overlay when it is used as disclosure authority, fact authority, or invented concrete relationship history. Flag user claims promoted beyond their integrity result, disclosure outside allowed scope, knowledge-abstention violations, assistant-output authority laundering, and invented biography during authority abstention. Legacy undefinedFields/hypothesisFields are not truth authority. Report every supported failure code. Do not repair or rewrite the utterance. Copy expectedUtteranceHash exactly into reviewedUtteranceHash.',
    input: Object.freeze({
      packet: input.packet,
      rendererDraft: input.rendererDraft,
      expectedUtteranceHash: input.utteranceHash,
    }),
    responseSchema: Object.freeze({
      ...SEMANTIC_REVIEW_RESPONSE_SCHEMA_V2,
      properties: Object.freeze({
        ...SEMANTIC_REVIEW_RESPONSE_SCHEMA_V2.properties,
        reviewedUtteranceHash: Object.freeze({
          enum: [input.utteranceHash],
        }),
      }),
    }),
  });
}

async function generate(
  provider: SeyeonStructuredProviderPortV2,
  request: SeyeonStructuredProviderRequestV2,
  stage: SeyeonRuntimeStageV2,
): Promise<unknown> {
  try {
    return await provider.generate(request);
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      stage,
      error instanceof Error ? error.message : `Se-yeon ${stage} provider failed.`,
      error,
    );
  }
}

function requireGovernedCurrentUserMessage(input: {
  readonly userMessageRef: string;
  readonly userText: string;
  readonly recentMessages: AssembleSeyeonRuntimeContextV2Input['recentMessages'];
}): Readonly<{ userMessageRef: string; userText: string }> {
  const userMessageRef = input.userMessageRef.trim();
  const userText = input.userText.trim();
  if (userMessageRef.length === 0 || userMessageRef.length > 256) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'governed_preflight',
      'userMessageRef must be non-empty text within 256 characters.',
    );
  }
  if (userText.length === 0 || userText.length > 8000) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'governed_preflight',
      'userText must be non-empty text within 8000 characters.',
    );
  }
  const current = input.recentMessages.at(-1);
  if (
    current === undefined ||
    current.role !== 'user' ||
    current.messageId.trim() !== userMessageRef ||
    current.text.trim() !== userText
  ) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'governed_preflight',
      'Governed runtime requires userMessageRef/userText to exactly match the final recent user message.',
    );
  }
  return Object.freeze({ userMessageRef, userText });
}

function assertGovernedRelationshipConsistent(input: {
  readonly contextRelationship: AssembleSeyeonRuntimeContextV2Input['relationship'];
  readonly disclosureRelationship: CharacterDisclosureRelationshipEvidenceV2;
}): void {
  if (input.contextRelationship === null) {
    if (
      input.disclosureRelationship.gate !== 'PUBLIC' ||
      input.disclosureRelationship.trustBand !== 'low'
    ) {
      throw new SeyeonCharacterRuntimeErrorV2(
        'governed_preflight',
        'Null relationship context requires PUBLIC/low disclosure evidence.',
      );
    }
    return;
  }
  if (input.contextRelationship.trustBand !== input.disclosureRelationship.trustBand) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'governed_preflight',
      'Disclosure trustBand must match the relationship projection supplied to Working Context.',
    );
  }
}

export async function runSeyeonCharacterTurnV2(
  input: RunSeyeonCharacterTurnV2Input,
): Promise<RunSeyeonCharacterTurnV2Result> {
  const currentUserMessage = requireGovernedCurrentUserMessage({
    userMessageRef: input.userMessageRef,
    userText: input.userText,
    recentMessages: input.contextInput.recentMessages,
  });
  assertGovernedRelationshipConsistent({
    contextRelationship: input.contextInput.relationship,
    disclosureRelationship: input.governance.relationship,
  });

  let governedPreflight: CharacterGovernedPreflightResultV1;
  try {
    governedPreflight = await runCharacterGovernedPreflightV1({
      characterId: 'seyeon',
      userMessageRef: currentUserMessage.userMessageRef,
      userText: currentUserMessage.userText,
      relationship: input.governance.relationship,
      integrity: input.governance.integrity,
      disclosure: input.governance.disclosure,
    });
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'governed_preflight',
      error instanceof Error ? error.message : 'Se-yeon governed preflight failed.',
      error,
    );
  }

  let relationshipSemantics: SeyeonRelationshipRuntimeSemanticsV2 | null = null;
  if (
    input.contextInput.relationship !== null &&
    input.governance.relationshipSemantics !== undefined
  ) {
    try {
      const rawSemantics = await input.governance.relationshipSemantics.resolve();
      relationshipSemantics =
        resolveSeyeonRelationshipRuntimeSemanticsV2(rawSemantics);
    } catch (error) {
      throw new SeyeonCharacterRuntimeErrorV2(
        'relationship_semantics',
        error instanceof Error
          ? error.message
          : 'Se-yeon relationship semantics projection failed.',
        error,
      );
    }
  }

  const interpreterIdentity = providerIdentity(input.interpreterProvider);
  const rendererIdentity = providerIdentity(input.rendererProvider);
  const reviewerIdentity = providerIdentity(input.semanticReviewerProvider);

  let context: SeyeonRuntimeContextV2;
  try {
    context = assembleSeyeonRuntimeContextV2({
      ...input.contextInput,
      integrityDecisions: governedPreflight.integrity.decisions,
      governedPreflightApplied: true,
      relationshipSemantics,
      disclosure: {
        decision:
          governedPreflight.disclosure.status === 'sensitive'
            ? governedPreflight.disclosure.decision
            : null,
        retrievedSources: governedPreflight.retrievedPrivateSources,
      },
    });
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'context',
      error instanceof Error ? error.message : 'Se-yeon context assembly failed.',
      error,
    );
  }

  const rawInterpretation = await generate(
    input.interpreterProvider,
    buildSeyeonTurnInterpreterRequestV2(context),
    'interpret',
  );

  let interpretation: SeyeonTurnInterpretationV2;
  try {
    interpretation = guardSeyeonTurnInterpretationV2({
      rawOutput: rawInterpretation,
      context,
    });
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'interpret',
      error instanceof Error ? error.message : 'Se-yeon turn interpretation failed.',
      error,
    );
  }

  let riskCausality: SeyeonRiskActionCausalityDecisionV1;
  try {
    riskCausality = guardSeyeonRiskBearingActionCausalityV1({
      context,
      interpretation,
    });
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'risk_causality',
      error instanceof Error
        ? error.message
        : 'Se-yeon risk-bearing action causality failed.',
      error,
    );
  }

  const rendererPacket = buildSeyeonRendererPacketV2({
    context,
    interpretation,
    riskCausality,
  });
  const rawRendererDraft = await generate(
    input.rendererProvider,
    buildSeyeonRendererRequestV2(rendererPacket),
    'render',
  );

  let admittedRendererDraft: SeyeonRendererDraftV2;
  try {
    admittedRendererDraft = admitSeyeonRendererDraftV2({
      rawOutput: rawRendererDraft,
      packet: rendererPacket,
    });
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'render',
      error instanceof Error ? error.message : 'Se-yeon renderer draft admission failed.',
      error,
    );
  }

  const utteranceHash = hashSeyeonRendererUtteranceV2(
    admittedRendererDraft.utterance,
  );
  const rawSemanticReview = await generate(
    input.semanticReviewerProvider,
    buildSeyeonSemanticReviewRequestV2({
      packet: rendererPacket,
      rendererDraft: admittedRendererDraft,
      utteranceHash,
    }),
    'semantic_review',
  );

  let envelope: SeyeonDialogueEnvelopeV2;
  try {
    envelope = guardSeyeonRendererOutputV2({
      rawOutput: admittedRendererDraft,
      packet: rendererPacket,
      semanticReview: rawSemanticReview,
    });
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'validate',
      error instanceof Error ? error.message : 'Se-yeon semantic/output guard failed.',
      error,
    );
  }

  return Object.freeze({
    governedPreflight,
    context,
    interpretation,
    riskCausality,
    rendererPacket,
    envelope,
    providers: Object.freeze({
      interpreter: interpreterIdentity,
      renderer: rendererIdentity,
      semanticReviewer: reviewerIdentity,
    }),
  });
}
