import type { RelationshipStateBand } from '../../character-content/src/schema.js';
import type { CharacterIntegrityDecisionV1 } from './character-integrity-gate-v1.js';
import {
  guardCharacterDisclosureRetrievalV2,
  type CharacterDisclosureDecisionV2,
  type CharacterDisclosureRetrievedSourceV2,
} from './character-disclosure-gate-v2.js';
import { SEYEON_FACT_AUTHORITY_REGISTRY_V1 } from '../../character-content/src/seyeon-fact-authority-v1.js';
import {
  SEYEON_AUTHORED_PROJECTION_V2,
  SEYEON_BIBLE_SLICE_IDS_V2,
  type SeyeonBibleSliceIdV2,
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
  readonly relevance: number;
  readonly salience: number;
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
    readonly allowedActionKeys: readonly string[];
    readonly allowedExpressionStates: readonly string[];
  }>;
}

export interface AssembleSeyeonRuntimeContextV2Input {
  readonly relationship: SeyeonRelationshipContextV2 | null;
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
  return Object.freeze({
    memoryId: requireText(memory.memoryId, 'retrievedMemory.memoryId', 256),
    kind: memory.kind,
    claimKind: memory.claimKind,
    summary: requireText(memory.summary, 'retrievedMemory.summary', 4000),
    sourceRef,
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

export function assembleSeyeonRuntimeContextV2(
  input: AssembleSeyeonRuntimeContextV2Input,
): SeyeonRuntimeContextV2 {
  const maxRecentMessages = assertPositiveBoundedInteger(
    input.maxRecentMessages,
    12,
    24,
    'maxRecentMessages',
  );
  const maxRetrievedMemories = assertPositiveBoundedInteger(
    input.maxRetrievedMemories,
    8,
    16,
    'maxRetrievedMemories',
  );

  const recentConversation = Object.freeze(
    input.recentMessages
      .slice(-maxRecentMessages)
      .map(validateRecentMessage),
  );

  const retrievedMemories = Object.freeze(
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
    relationship: validateRelationship(input.relationship),
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
      allowedActionKeys: SEYEON_AUTHORED_PROJECTION_V2.actionKeys,
      allowedExpressionStates: SEYEON_AUTHORED_PROJECTION_V2.expressionStates,
    }),
  });
}