import type { RelationshipStateBand } from '../../character-content/src/schema.js';
import type { CharacterIntegrityDecisionV1 } from './character-integrity-gate-v1.js';
import {
  SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_AUTHORITY_V2,
  SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V2,
  type SeyeonRelationshipRuntimeOverlayV2,
} from './seyeon-relationship-runtime-overlay-v2.js';
import {
  SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_AUTHORITY_V1,
  SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V1,
  type SeyeonProductionRelationshipRuntimeOverlayV1,
} from './seyeon-production-relationship-runtime-v1.js';
import {
  guardCharacterDisclosureRetrievalV2,
  type CharacterDisclosureDecisionV2,
  type CharacterDisclosureRetrievedSourceV2,
} from './character-disclosure-gate-v2.js';
import { SEYEON_FACT_AUTHORITY_REGISTRY_V1 } from '../../character-content/src/seyeon-fact-authority-v1.js';
import {
  SEYEON_AUTHORED_PROJECTION_V2,
  SEYEON_BIBLE_SLICE_IDS_V2,
  type SeyeonActionKeyV2,
  type SeyeonBibleSliceIdV2,
  type SeyeonExpressionStateV2,
} from '../../character-content/src/seyeon-authored-projection-v2.js';

export const SEYEON_RUNTIME_CONTEXT_SCHEMA_VERSION_V2 =
  'seyeon-runtime-context-v2' as const;

export const SEYEON_CONTEXT_FOCUS_KEYS_V2 = Object.freeze([
  'choice',
  'care',
  'conflict',
  'intimacy',
  'memory',
  'mundane',
  'expression',
] as const);

export type SeyeonContextFocusKeyV2 =
  (typeof SEYEON_CONTEXT_FOCUS_KEYS_V2)[number];

export interface SeyeonRelationshipContextV2 {
  readonly stageKey: string;
  readonly closenessBand: RelationshipStateBand;
  readonly trustBand: RelationshipStateBand;
  readonly frictionBand: RelationshipStateBand;
  readonly revision: number;
  readonly policyVersion: string;
}

export type SeyeonRelationshipRuntimeSemanticsV2 =
  | SeyeonRelationshipRuntimeOverlayV2
  | SeyeonProductionRelationshipRuntimeOverlayV1;

export interface SeyeonRecentMessageV2 {
  readonly messageId: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export type SeyeonRetrievedMemoryKindV2 =
  | 'life_fact'
  | 'memory'
  | 'relationship_event';

export type SeyeonRetrievedClaimKindV2 =
  | 'fact'
  | 'character_interpretation';

export interface SeyeonRetrievedMemoryV2 {
  readonly memoryId: string;
  readonly kind: SeyeonRetrievedMemoryKindV2;
  readonly claimKind: SeyeonRetrievedClaimKindV2;
  readonly summary: string;
  readonly sourceRef: string;
  readonly causalAuthority?: 'authorized_shared_history';
  readonly relevance: number;
  readonly salience: number;
}

export type SeyeonRuntimeInteractionDepthV2 =
  | 'public_first_contact'
  | 'established_relationship';

export type SeyeonRuntimeInitiativeModeV2 =
  | 'character_leads'
  | 'balanced';

export type SeyeonRuntimeCareModeV2 =
  | 'light_unless_explicit_need'
  | 'relationship_calibrated';

export type SeyeonRuntimeQuestionModeV2 =
  | 'movement_first'
  | 'relationship_calibrated';

export interface SeyeonRuntimeBehaviorPolicyV2 {
  readonly interactionDepth: SeyeonRuntimeInteractionDepthV2;
  readonly initiativeMode: SeyeonRuntimeInitiativeModeV2;
  readonly careMode: SeyeonRuntimeCareModeV2;
  readonly questionMode: SeyeonRuntimeQuestionModeV2;
  readonly maxQuestionsPerUtterance: number;
  readonly requireCharacterOwnedMove: boolean;
  readonly permissionHandoffAsDefaultForbidden: true;
  readonly therapyFramingAsDefaultForbidden: true;
  readonly lowIntensityUserStatePolicy:
    | 'acknowledge_then_character_move'
    | 'relationship_calibrated';
  readonly lowIntensityExpressionPolicy:
    | 'runtime_clamp_baseline_or_playful'
    | 'relationship_calibrated';
  readonly recentMoveNoveltyPolicy:
    | 'avoid_repeating_unprompted_assistant_mechanic'
    | 'relationship_calibrated';
  readonly recentMoveNoveltyUnit:
    | 'concrete_mechanic_or_activity'
    | 'relationship_calibrated';
  readonly initiativePatternMayRepeat: true;
  readonly conversationPacePolicy:
    | 'state_owned_pacing_stance_without_new_prompt'
    | 'relationship_calibrated';
  readonly directCurrentDesirePolicy:
    | 'state_turn_local_seyeon_want_without_forced_invite'
    | 'relationship_calibrated';
  readonly turnLocalPresentDesireNeverDurableAuthority: true;
  readonly preferredActionKeys: readonly SeyeonActionKeyV2[];
}

export interface SeyeonRuntimeContextV2 {
  readonly schemaVersion: typeof SEYEON_RUNTIME_CONTEXT_SCHEMA_VERSION_V2;
  readonly character: Readonly<{
    readonly characterId: 'seyeon';
    readonly displayName: '세연';
    readonly authoredProjectionVersion: string;
    readonly sourceBibleBlobSha: string;
    readonly sourceRuntimeBlobSha: string;
    readonly coreAnchor: readonly string[];
  }>;
  readonly authorityBoundaries: Readonly<{
    readonly factAuthorityRegistryVersion: string;
    readonly factAuthorityRegistrySourceBibleBlobSha: string;
    readonly legacyProjectionFieldsAreNonAuthoritative: true;
    readonly userClaimRequiresIntegrityDecision: true;
    readonly assistantOutputNeverAuthority: true;
  }>;
  readonly integrity: Readonly<{
    readonly decisions: readonly CharacterIntegrityDecisionV1[];
    readonly governedPreflightApplied: boolean;
    readonly unverifiedClaimsMayEnterAsFacts: false;
    readonly claimsMayCreateRelationshipEvents: false;
    readonly claimsMayMutateRelationshipState: false;
  }>;
  readonly relationship: SeyeonRelationshipContextV2 | null;
  readonly relationshipSemantics: SeyeonRelationshipRuntimeSemanticsV2 | null;
  readonly bibleSlices: readonly Readonly<{
    readonly id: SeyeonBibleSliceIdV2;
    readonly sourceSections: readonly string[];
    readonly runtimePurpose: string;
    readonly invariants: readonly string[];
  }>[];
  readonly recentConversation: readonly SeyeonRecentMessageV2[];
  readonly retrievedMemories: readonly SeyeonRetrievedMemoryV2[];
  readonly disclosure: Readonly<{
    readonly decision: CharacterDisclosureDecisionV2 | null;
    readonly retrievedSources: readonly CharacterDisclosureRetrievedSourceV2[];
  }>;
  readonly retrievalPolicy: Readonly<{
    readonly callbackRequiresSourceRef: true;
    readonly factAndInterpretationRemainDistinct: true;
    readonly anotherCharacterPrivateHistoryForbidden: true;
    readonly privateCharacterContentRequiresDisclosureDecision: true;
    readonly userClaimRequiresIntegrityDecision: true;
    readonly assistantOutputNeverAuthority: true;
    readonly legacyUndefinedAndHypothesisFieldsNeverTruthAuthority: true;
  }>;
  readonly actionPolicy: Readonly<{
    readonly allowedActionKeys: readonly SeyeonActionKeyV2[];
    readonly allowedExpressionStates: readonly SeyeonExpressionStateV2[];
  }>;
  readonly behaviorPolicy: SeyeonRuntimeBehaviorPolicyV2;
}

export interface AssembleSeyeonRuntimeContextV2Input {
  readonly relationship: SeyeonRelationshipContextV2 | null;
  readonly relationshipSemantics?: SeyeonRelationshipRuntimeSemanticsV2 | null;
  readonly integrityDecisions?: readonly CharacterIntegrityDecisionV1[];
  readonly governedPreflightApplied?: boolean;
  readonly recentMessages: readonly SeyeonRecentMessageV2[];
  readonly retrievedMemories: readonly SeyeonRetrievedMemoryV2[];
  readonly disclosure: Readonly<{
    readonly decision: CharacterDisclosureDecisionV2 | null;
    readonly retrievedSources: readonly CharacterDisclosureRetrievedSourceV2[];
  }>;
  readonly focuses?: readonly SeyeonContextFocusKeyV2[];
  readonly additionalBibleSliceIds?: readonly SeyeonBibleSliceIdV2[];
  readonly maxRecentMessages?: number;
  readonly maxRetrievedMemories?: number;
}

const ALWAYS_ON_SLICE_IDS = Object.freeze([
  'A_character_compass',
  'R3_attention',
  'R4_want_tension',
  'R5_actions',
  'R11_relationship_reveal',
  'R13_drift_risks',
  'R14_guards',
] as const satisfies readonly SeyeonBibleSliceIdV2[]);

const FOCUS_SLICE_IDS = Object.freeze({
  choice: Object.freeze([
    'C1_values',
    'C7_real_flaw',
    'C8_choice_style',
    'R7_question_strategy',
  ]),
  care: Object.freeze([
    'F3_care',
    'F4_receiving_help',
    'R8_care_strategy',
  ]),
  conflict: Object.freeze([
    'C4_fear',
    'C9_pressure_shift',
    'F6_triggers',
    'F7_conflict_repair',
    'R9_conflict_repair',
  ]),
  intimacy: Object.freeze([
    'F5_trust_respect',
    'G_affection_intimacy',
    'R10_affection_intimacy',
  ]),
  memory: Object.freeze([
    'R12_memory_behavior',
  ]),
  mundane: Object.freeze([
    'D_mundane_life',
  ]),
  expression: Object.freeze([
    'E_expression',
    'R6_expression_states',
  ]),
} as const satisfies Record<
  SeyeonContextFocusKeyV2,
  readonly SeyeonBibleSliceIdV2[]
>);

function assertPositiveBoundedInteger(
  value: number | undefined,
  fallback: number,
  max: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > max) {
    throw new TypeError(`${label} must be an integer between 1 and ${max}.`);
  }
  return resolved;
}

function requireText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TypeError(`${label} must be non-empty text within ${maxLength} characters.`);
  }
  return normalized;
}

function validateRelationship(
  relationship: SeyeonRelationshipContextV2 | null,
): SeyeonRelationshipContextV2 | null {
  if (relationship === null) return null;
  if (!Number.isSafeInteger(relationship.revision) || relationship.revision < 0) {
    throw new TypeError('Se-yeon relationship revision must be a non-negative integer.');
  }
  return Object.freeze({
    stageKey: requireText(relationship.stageKey, 'relationship.stageKey', 128),
    closenessBand: relationship.closenessBand,
    trustBand: relationship.trustBand,
    frictionBand: relationship.frictionBand,
    revision: relationship.revision,
    policyVersion: requireText(
      relationship.policyVersion,
      'relationship.policyVersion',
      128,
    ),
  });
}

function validateRelationshipSemanticsOverlay(
  overlay: SeyeonRelationshipRuntimeSemanticsV2 | null | undefined,
  relationship: SeyeonRelationshipContextV2 | null,
): SeyeonRelationshipRuntimeSemanticsV2 | null {
  if (overlay === null || overlay === undefined) return null;
  if (relationship === null) {
    throw new TypeError(
      'Relationship semantics cannot create a relationship context.',
    );
  }

  if (
    overlay.schemaVersion ===
      SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V1 &&
    overlay.authority ===
      SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_AUTHORITY_V1
  ) {
    if (overlay.characterId !== 'seyeon') {
      throw new TypeError(
        'Production Se-yeon relationship runtime overlay characterId is invalid.',
      );
    }
    if (
      overlay.source.relationshipRevision !== relationship.revision ||
      overlay.source.policyVersion !== relationship.policyVersion ||
      overlay.source.attainedStage !== relationship.stageKey
    ) {
      throw new TypeError(
        'Production relationship overlay must be pinned to the exact relationship revision/stage/policy used for this turn.',
      );
    }
    if (
      !(['STABLE', 'OPEN_CONFLICT', 'RESOLVED_RECENTLY'] as const).includes(
        overlay.currentCondition,
      )
    ) {
      throw new TypeError(
        'Production relationship overlay currentCondition is invalid.',
      );
    }
    if (
      !(['STAGE_ALIGNED', 'RESTRICTED_BY_CONFLICT', 'CAUTIOUS_AFTER_REPAIR'] as const).includes(
        overlay.behaviorAccess,
      )
    ) {
      throw new TypeError(
        'Production relationship overlay behaviorAccess is invalid.',
      );
    }
    if (
      overlay.constraints.mayOverrideRelationshipState !== true ||
      overlay.constraints.mayOverrideRelationshipBands !== false ||
      overlay.constraints.mayUnlockDisclosure !== false ||
      overlay.constraints.mayCreateCharacterFact !== false ||
      overlay.constraints.mayCreateSharedHistory !== false ||
      overlay.constraints.mayCreateRelationshipEvent !== false ||
      overlay.constraints.mayMutateRelationshipState !== false ||
      overlay.constraints.mayAppendDurableMemory !== false
    ) {
      throw new TypeError(
        'Production relationship overlay authority must remain limited to current relationship behavior state.',
      );
    }

    return Object.freeze({
      schemaVersion:
        SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V1,
      authority: SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_AUTHORITY_V1,
      characterId: 'seyeon' as const,
      source: Object.freeze({ ...overlay.source }),
      currentCondition: overlay.currentCondition,
      behaviorAccess: overlay.behaviorAccess,
      constraints: Object.freeze({
        mayOverrideRelationshipState: true as const,
        mayOverrideRelationshipBands: false as const,
        mayUnlockDisclosure: false as const,
        mayCreateCharacterFact: false as const,
        mayCreateSharedHistory: false as const,
        mayCreateRelationshipEvent: false as const,
        mayMutateRelationshipState: false as const,
        mayAppendDurableMemory: false as const,
      }),
    });
  }

  if (overlay.schemaVersion !== SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V2) {
    throw new TypeError(
      'Se-yeon relationship runtime overlay schemaVersion is invalid.',
    );
  }
  if (overlay.authority !== SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_AUTHORITY_V2) {
    throw new TypeError(
      'Experimental relationship runtime overlay must remain non-authoritative.',
    );
  }
  if (
    overlay.source.schemaVersion !== 'seyeon-relationship-state-shadow-v2' ||
    overlay.source.authority !== 'experimental_shadow_not_production_authority'
  ) {
    throw new TypeError(
      'Experimental relationship runtime overlay source must remain the experimental shadow.',
    );
  }
  if (overlay.characterId !== 'seyeon') {
    throw new TypeError('Se-yeon relationship runtime overlay characterId is invalid.');
  }
  if (
    !(['STABLE', 'OPEN_CONFLICT', 'RESOLVED_RECENTLY'] as const).includes(
      overlay.currentCondition,
    )
  ) {
    throw new TypeError(
      'Se-yeon relationship runtime overlay currentCondition is invalid.',
    );
  }
  if (
    !(['STAGE_ALIGNED', 'RESTRICTED_BY_CONFLICT', 'CAUTIOUS_AFTER_REPAIR'] as const).includes(
      overlay.behaviorAccess,
    )
  ) {
    throw new TypeError(
      'Se-yeon relationship runtime overlay behaviorAccess is invalid.',
    );
  }
  for (const value of Object.values(overlay.constraints)) {
    if (value !== false) {
      throw new TypeError(
        'Experimental relationship semantics cannot gain runtime authority.',
      );
    }
  }

  return Object.freeze({
    schemaVersion: SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_VERSION_V2,
    authority: SEYEON_RELATIONSHIP_RUNTIME_OVERLAY_AUTHORITY_V2,
    source: Object.freeze({
      schemaVersion: 'seyeon-relationship-state-shadow-v2' as const,
      authority: 'experimental_shadow_not_production_authority' as const,
    }),
    characterId: 'seyeon' as const,
    currentCondition: overlay.currentCondition,
    behaviorAccess: overlay.behaviorAccess,
    constraints: Object.freeze({
      mayOverrideRelationshipState: false as const,
      mayOverrideRelationshipBands: false as const,
      mayUnlockDisclosure: false as const,
      mayCreateCharacterFact: false as const,
      mayCreateSharedHistory: false as const,
      mayCreateRelationshipEvent: false as const,
      mayMutateRelationshipState: false as const,
      mayAppendDurableMemory: false as const,
    }),
  });
}

function validateRecentMessage(
  message: SeyeonRecentMessageV2,
): SeyeonRecentMessageV2 {
  return Object.freeze({
    messageId: requireText(message.messageId, 'recentMessage.messageId', 256),
    role: message.role,
    text: requireText(message.text, 'recentMessage.text', 8000),
  });
}

function validateRetrievedMemory(
  memory: SeyeonRetrievedMemoryV2,
): SeyeonRetrievedMemoryV2 {
  if (!Number.isFinite(memory.relevance) || memory.relevance < 0 || memory.relevance > 1) {
    throw new TypeError('retrievedMemory.relevance must be between 0 and 1.');
  }
  if (!Number.isFinite(memory.salience) || memory.salience < 0 || memory.salience > 1) {
    throw new TypeError('retrievedMemory.salience must be between 0 and 1.');
  }
  const sourceRef = requireText(memory.sourceRef, 'retrievedMemory.sourceRef', 512);
  if (sourceRef.startsWith('bible:') || sourceRef.startsWith('runtime:')) {
    throw new TypeError(
      'Character-authored private source content must enter through governed disclosure retrieval.',
    );
  }
  if (
    memory.causalAuthority !== undefined &&
    memory.causalAuthority !== 'authorized_shared_history'
  ) {
    throw new TypeError('retrievedMemory.causalAuthority is invalid.');
  }
  if (
    memory.causalAuthority === 'authorized_shared_history' &&
    (memory.kind !== 'relationship_event' || memory.claimKind !== 'fact')
  ) {
    throw new TypeError(
      'Only factual relationship_event memory may be authorized as shared-history causal evidence.',
    );
  }
  return Object.freeze({
    memoryId: requireText(memory.memoryId, 'retrievedMemory.memoryId', 256),
    kind: memory.kind,
    claimKind: memory.claimKind,
    summary: requireText(memory.summary, 'retrievedMemory.summary', 4000),
    sourceRef,
    ...(memory.causalAuthority === undefined
      ? {}
      : { causalAuthority: memory.causalAuthority }),
    relevance: memory.relevance,
    salience: memory.salience,
  });
}

function validateIntegrityDecisions(
  decisions: readonly CharacterIntegrityDecisionV1[],
): readonly CharacterIntegrityDecisionV1[] {
  if (decisions.length > 8) {
    throw new TypeError('Se-yeon runtime context accepts at most 8 integrity decisions.');
  }
  const claimIds = new Set<string>();
  return Object.freeze(
    decisions.map((decision, index) => {
      if (decision.schemaVersion !== 'character-integrity-decision-v1') {
        throw new TypeError(
          'integrityDecisions[' + index + '] has an unsupported schemaVersion.',
        );
      }
      if (claimIds.has(decision.claim.claimId)) {
        throw new TypeError('Se-yeon integrity decision claim ids must be unique.');
      }
      claimIds.add(decision.claim.claimId);
      if (decision.mayCreateRelationshipEvent || decision.mayMutateRelationshipState) {
        throw new TypeError(
          'Integrity decision violates immutable relationship boundaries.',
        );
      }
      if (decision.result !== 'VERIFIED' && decision.mayEnterWorkingContextAsFact) {
        throw new TypeError(
          'Only VERIFIED integrity decisions may enter Working Context as fact.',
        );
      }
      return decision;
    }),
  );
}

export function resolveSeyeonBibleSliceSelectionV2(input: {
  readonly focuses?: readonly SeyeonContextFocusKeyV2[];
  readonly additionalBibleSliceIds?: readonly SeyeonBibleSliceIdV2[];
  readonly hasRetrievedMemories: boolean;
}): readonly SeyeonBibleSliceIdV2[] {
  const selected = new Set<SeyeonBibleSliceIdV2>(ALWAYS_ON_SLICE_IDS);

  for (const focus of input.focuses ?? []) {
    for (const sliceId of FOCUS_SLICE_IDS[focus]) selected.add(sliceId);
  }
  if (input.hasRetrievedMemories) selected.add('R12_memory_behavior');

  const allowed = new Set<SeyeonBibleSliceIdV2>(SEYEON_BIBLE_SLICE_IDS_V2);
  for (const sliceId of input.additionalBibleSliceIds ?? []) {
    if (!allowed.has(sliceId)) {
      throw new TypeError(`Unknown Se-yeon Bible slice: ${sliceId}`);
    }
    selected.add(sliceId);
  }

  return Object.freeze([...selected]);
}

export function resolveSeyeonRuntimeBehaviorPolicyV2(input: {
  readonly relationship: SeyeonRelationshipContextV2 | null;
}): SeyeonRuntimeBehaviorPolicyV2 {
  if (input.relationship === null) {
    return Object.freeze({
      interactionDepth: 'public_first_contact' as const,
      initiativeMode: 'character_leads' as const,
      careMode: 'light_unless_explicit_need' as const,
      questionMode: 'movement_first' as const,
      maxQuestionsPerUtterance: 1,
      requireCharacterOwnedMove: true,
      permissionHandoffAsDefaultForbidden: true as const,
      therapyFramingAsDefaultForbidden: true as const,
      lowIntensityUserStatePolicy: 'acknowledge_then_character_move' as const,
      lowIntensityExpressionPolicy:
        'runtime_clamp_baseline_or_playful' as const,
      recentMoveNoveltyPolicy:
        'avoid_repeating_unprompted_assistant_mechanic' as const,
      recentMoveNoveltyUnit: 'concrete_mechanic_or_activity' as const,
      initiativePatternMayRepeat: true as const,
      conversationPacePolicy:
        'state_owned_pacing_stance_without_new_prompt' as const,
      directCurrentDesirePolicy:
        'state_turn_local_seyeon_want_without_forced_invite' as const,
      turnLocalPresentDesireNeverDurableAuthority: true as const,
      preferredActionKeys: Object.freeze([
        'approach',
        'activate',
        'tease',
        'invite',
        'admit_boundary',
        'accept_care',
      ] as const),
    });
  }

  return Object.freeze({
    interactionDepth: 'established_relationship' as const,
    initiativeMode: 'balanced' as const,
    careMode: 'relationship_calibrated' as const,
    questionMode: 'relationship_calibrated' as const,
    maxQuestionsPerUtterance: 2,
    requireCharacterOwnedMove: false,
    permissionHandoffAsDefaultForbidden: true as const,
    therapyFramingAsDefaultForbidden: true as const,
    lowIntensityUserStatePolicy: 'relationship_calibrated' as const,
    lowIntensityExpressionPolicy: 'relationship_calibrated' as const,
    recentMoveNoveltyPolicy: 'relationship_calibrated' as const,
    recentMoveNoveltyUnit: 'relationship_calibrated' as const,
    initiativePatternMayRepeat: true as const,
    conversationPacePolicy: 'relationship_calibrated' as const,
    directCurrentDesirePolicy: 'relationship_calibrated' as const,
    turnLocalPresentDesireNeverDurableAuthority: true as const,
    preferredActionKeys: Object.freeze([
      ...SEYEON_AUTHORED_PROJECTION_V2.actionKeys,
    ]),
  });
}

/**
 * Shared pre-Provider selection boundary. The Production authority adapter
 * and final Context assembler MUST use the exact same normalization,
 * relevance/salience sorting and bounded limit. This is selection only,
 * NOT durable Grant authority or permission to reveal.
 */
export function selectSeyeonRuntimeRetrievedMemoriesV2(input: Readonly<{
  readonly retrievedMemories: readonly SeyeonRetrievedMemoryV2[];
  readonly maxRetrievedMemories?: number;
}>): readonly SeyeonRetrievedMemoryV2[] {
  const maxRetrievedMemories = assertPositiveBoundedInteger(
    input.maxRetrievedMemories, 8, 16, 'maxRetrievedMemories',
  );
  return Object.freeze(
    input.retrievedMemories
      .map(validateRetrievedMemory)
      .sort(
        (left, right) =>
          right.relevance - left.relevance ||
          right.salience - left.salience ||
          left.memoryId.localeCompare(right.memoryId),
      )
      .slice(0, maxRetrievedMemories),
  );
}

export function assembleSeyeonRuntimeContextV2(
  input: AssembleSeyeonRuntimeContextV2Input,
): SeyeonRuntimeContextV2 {
  const maxRecentMessages = assertPositiveBoundedInteger(
    input.maxRecentMessages,
    12,
    24,
    'maxRecentMessages',
  );
  const relationship = validateRelationship(input.relationship);
  const relationshipSemantics = validateRelationshipSemanticsOverlay(
    input.relationshipSemantics,
    relationship,
  );

  const recentConversation = Object.freeze(
    input.recentMessages
      .slice(-maxRecentMessages)
      .map(validateRecentMessage),
  );

  const retrievedMemories = selectSeyeonRuntimeRetrievedMemoriesV2({
    retrievedMemories: input.retrievedMemories,
    ...(input.maxRetrievedMemories === undefined
      ? {}
      : { maxRetrievedMemories: input.maxRetrievedMemories }),
  });

  if (
    input.disclosure.decision !== null &&
    input.disclosure.decision.characterId !== 'seyeon'
  ) {
    throw new TypeError('Se-yeon runtime context requires a Se-yeon disclosure decision.');
  }
  if (
    input.disclosure.decision === null &&
    input.disclosure.retrievedSources.length > 0
  ) {
    throw new TypeError(
      'Private Character content cannot be supplied without a disclosure decision.',
    );
  }
  const disclosureSources =
    input.disclosure.decision === null
      ? Object.freeze([] as CharacterDisclosureRetrievedSourceV2[])
      : guardCharacterDisclosureRetrievalV2({
          decision: input.disclosure.decision,
          retrievedSources: input.disclosure.retrievedSources,
        });
  const integrityDecisions = validateIntegrityDecisions(
    input.integrityDecisions ?? [],
  );

  const sliceIds = resolveSeyeonBibleSliceSelectionV2({
    ...(input.focuses === undefined ? {} : { focuses: input.focuses }),
    ...(input.additionalBibleSliceIds === undefined
      ? {}
      : { additionalBibleSliceIds: input.additionalBibleSliceIds }),
    hasRetrievedMemories: retrievedMemories.length > 0,
  });

  const bibleSlices = Object.freeze(
    sliceIds.map((id) => SEYEON_AUTHORED_PROJECTION_V2.bibleSlices[id]),
  );

  const allowedActionKeys = Object.freeze(
    SEYEON_AUTHORED_PROJECTION_V2.actionKeys.filter((key) => {
      if (retrievedMemories.length === 0 && key === 'remember_naturally') {
        return false;
      }
      if (
        relationship === null &&
        (key === 'narrow_choices' || key === 'care_practically')
      ) {
        return false;
      }
      return true;
    }),
  );
  const allowedExpressionStates = Object.freeze(
    relationship === null
      ? SEYEON_AUTHORED_PROJECTION_V2.expressionStates.filter((state) =>
          ['baseline', 'energized', 'playful', 'embarrassed', 'caring'].includes(
            state,
          ),
        )
      : [...SEYEON_AUTHORED_PROJECTION_V2.expressionStates],
  );
  const behaviorPolicy = resolveSeyeonRuntimeBehaviorPolicyV2({
    relationship,
  });

  return Object.freeze({
    schemaVersion: SEYEON_RUNTIME_CONTEXT_SCHEMA_VERSION_V2,
    character: Object.freeze({
      characterId: 'seyeon',
      displayName: '세연',
      authoredProjectionVersion: SEYEON_AUTHORED_PROJECTION_V2.schemaVersion,
      sourceBibleBlobSha: SEYEON_AUTHORED_PROJECTION_V2.source.bible.gitBlobSha,
      sourceRuntimeBlobSha: SEYEON_AUTHORED_PROJECTION_V2.source.runtime.gitBlobSha,
      coreAnchor: SEYEON_AUTHORED_PROJECTION_V2.coreAnchor,
    }),
    authorityBoundaries: Object.freeze({
      factAuthorityRegistryVersion: SEYEON_FACT_AUTHORITY_REGISTRY_V1.schemaVersion,
      factAuthorityRegistrySourceBibleBlobSha:
        SEYEON_FACT_AUTHORITY_REGISTRY_V1.sourceBible.gitBlobSha,
      legacyProjectionFieldsAreNonAuthoritative: true as const,
      userClaimRequiresIntegrityDecision: true as const,
      assistantOutputNeverAuthority: true as const,
    }),
    integrity: Object.freeze({
      decisions: integrityDecisions,
      governedPreflightApplied: input.governedPreflightApplied ?? false,
      unverifiedClaimsMayEnterAsFacts: false as const,
      claimsMayCreateRelationshipEvents: false as const,
      claimsMayMutateRelationshipState: false as const,
    }),
    relationship,
    relationshipSemantics,
    bibleSlices,
    recentConversation,
    retrievedMemories,
    disclosure: Object.freeze({
      decision: input.disclosure.decision,
      retrievedSources: disclosureSources,
    }),
    retrievalPolicy: Object.freeze({
      callbackRequiresSourceRef: true as const,
      factAndInterpretationRemainDistinct: true as const,
      anotherCharacterPrivateHistoryForbidden: true as const,
      privateCharacterContentRequiresDisclosureDecision: true as const,
      userClaimRequiresIntegrityDecision: true as const,
      assistantOutputNeverAuthority: true as const,
      legacyUndefinedAndHypothesisFieldsNeverTruthAuthority: true as const,
    }),
    actionPolicy: Object.freeze({
      allowedActionKeys,
      allowedExpressionStates,
    }),
    behaviorPolicy,
  });
}