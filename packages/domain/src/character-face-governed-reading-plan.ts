import { createHash } from 'node:crypto';

import {
  assertCharacterFaceNamedProfileCompatibilityV1,
  type CharacterFaceNamedProfileBundleV1,
} from './character-face-named-profile-registry.js';
import {
  buildCharacterFaceProtectedInterpretationSegmentsV1,
  selectCharacterFaceGovernedInterpretationsV1,
  type CharacterFaceGovernedInterpretationHandoffV1,
  type CharacterFaceGovernedInterpretationSelectionV1,
  type CharacterFaceProtectedInterpretationSegmentV1,
} from './character-face-governed-interpretation.js';
import {
  resolveCharacterFaceFollowUpFramingV1,
} from './character-face-delivery-profile.js';
import type {
  CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';
import { canonicalJson } from './registry.js';

export const CHARACTER_FACE_GOVERNED_READING_PLAN_SCHEMA_VERSION_V1 =
  'character-face-governed-reading-plan-v1' as const;

export const CHARACTER_FACE_GOVERNED_READING_PLAN_DECISION_SCHEMA_VERSION_V1 =
  'character-face-governed-reading-plan-decision-v1' as const;

export const CHARACTER_FACE_GOVERNED_SELECTION_POLICY_V1 =
  'upstream_order_bounded_by_character_max_units' as const;

export type CharacterFaceGovernedReadingBeatV1 =
  | Readonly<{
      kind: 'protected_interpretation';
      interpretationRef: string;
      lensKey: string;
      direction: CharacterFaceProtectedInterpretationSegmentV1['direction'];
      evidenceStatus: CharacterFaceProtectedInterpretationSegmentV1['evidenceStatus'];
      purpose: 'lead' | 'expand';
    }>
  | Readonly<{
      kind: 'follow_up_question';
      sourceInterpretationRefs: readonly string[];
      sourceLensKeys: readonly string[];
      questionStrategy: string;
      framingKey: string;
      text: string;
    }>;

export interface CharacterFaceGovernedReadingPlanV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_GOVERNED_READING_PLAN_SCHEMA_VERSION_V1;
  readonly planId: string;
  readonly characterId: string;
  readonly characterContentVersion: string;
  readonly topicKey: string;
  readonly sourceResultHash: string;
  readonly faceBundleHash: string;
  readonly handoffHash: string;
  readonly selectionPolicy:
    typeof CHARACTER_FACE_GOVERNED_SELECTION_POLICY_V1;
  readonly capabilityVersion: string;
  readonly perspectiveVersion: string;
  readonly deliveryVersion: string;
  readonly selection:
    CharacterFaceGovernedInterpretationSelectionV1;
  readonly beats:
    readonly CharacterFaceGovernedReadingBeatV1[];
}

export interface CharacterFaceGovernedReadingPlanDecisionV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_GOVERNED_READING_PLAN_DECISION_SCHEMA_VERSION_V1;
  readonly mode: 'governed_interpretation_plan';
  readonly plan: CharacterFaceGovernedReadingPlanV1;
  readonly protectedSegments:
    readonly CharacterFaceProtectedInterpretationSegmentV1[];
}

export class CharacterFaceGovernedReadingPlanErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterFaceGovernedReadingPlanErrorV1';
  }
}

function fail(message: string): never {
  throw new CharacterFaceGovernedReadingPlanErrorV1(message);
}

function sha256Json(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

function assertFaceRuntime(
  context: CharacterRuntimeContextWithFaceGroundingV1,
): asserts context is CharacterRuntimeContextWithFaceGroundingV1 & {
  readonly face: NonNullable<CharacterRuntimeContextWithFaceGroundingV1['face']>;
} {
  if (context.face === null) {
    fail('Governed Face reading plan requires an admitted Face runtime context.');
  }
  if (context.saju !== null) {
    fail('Governed Face reading plan does not allow mixed Saju and Face context.');
  }
}

function assertNamedProfileRuntimeCompatibility(
  input: Readonly<{
    context: CharacterRuntimeContextWithFaceGroundingV1;
    profiles: CharacterFaceNamedProfileBundleV1;
  }>,
): void {
  const faceProfileVersion =
    input.profiles.capability.sourceFaceProfileVersion;

  try {
    assertCharacterFaceNamedProfileCompatibilityV1({
      authoringSource: input.profiles.authoringSource,
      faceProfileVersion,
      capability: input.profiles.capability,
      perspective: input.profiles.perspective,
      delivery: input.profiles.delivery,
    });
  } catch (error) {
    fail(
      `Governed Face named profile is not internally compatible: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (
    input.context.characterId !== input.profiles.authoringSource.characterId ||
    input.context.contentVersion !== input.profiles.authoringSource.contentVersion
  ) {
    fail('Governed Face named profile does not match the active Character runtime.');
  }

  if (
    input.context.voiceAuthority.characterId !== input.context.characterId ||
    input.context.voiceAuthority.contentVersion !== input.context.contentVersion ||
    input.context.voiceAuthority.surface !== 'face_product'
  ) {
    fail('Governed Face reading plan requires active Face voice authority.');
  }
}

function assertHandoffMatchesFaceRuntime(
  input: Readonly<{
    context: CharacterRuntimeContextWithFaceGroundingV1 & {
      readonly face: NonNullable<CharacterRuntimeContextWithFaceGroundingV1['face']>;
    };
    handoff: CharacterFaceGovernedInterpretationHandoffV1;
  }>,
): void {
  if (input.handoff.topicKey !== input.context.face.topicKey) {
    fail('Governed Face interpretation topicKey does not match the active Face runtime.');
  }

  if (
    input.handoff.sourceResultHash !==
    input.context.face.groundingRef.sourceResultHash
  ) {
    fail(
      'Governed Face interpretation sourceResultHash does not match the active Face analysis.',
    );
  }
}

function resolveFollowUp(
  input: Readonly<{
    context: CharacterRuntimeContextWithFaceGroundingV1;
    profiles: CharacterFaceNamedProfileBundleV1;
    selection: CharacterFaceGovernedInterpretationSelectionV1;
  }>,
): Extract<CharacterFaceGovernedReadingBeatV1, { kind: 'follow_up_question' }> | null {
  if (input.selection.orderedInterpretationIds.length === 0) {
    return null;
  }

  for (const rawStrategy of input.profiles.authoringSource.questioning.preferredStrategies) {
    const questionStrategy = rawStrategy.trim();
    if (questionStrategy.length === 0) continue;

    const framing = resolveCharacterFaceFollowUpFramingV1({
      profile: input.profiles.delivery,
      questionStrategy,
    });
    if (framing === null) continue;

    return Object.freeze({
      kind: 'follow_up_question' as const,
      sourceInterpretationRefs: Object.freeze([
        ...input.selection.orderedInterpretationIds,
      ]),
      sourceLensKeys: Object.freeze([
        ...input.selection.selectedLensKeys,
      ]),
      questionStrategy,
      framingKey: framing.key,
      text: framing.text,
    });
  }

  return null;
}

export function buildCharacterFaceGovernedReadingPlanV1(
  input: Readonly<{
    context: CharacterRuntimeContextWithFaceGroundingV1;
    handoff: CharacterFaceGovernedInterpretationHandoffV1;
    profiles: CharacterFaceNamedProfileBundleV1;
  }>,
): CharacterFaceGovernedReadingPlanDecisionV1 {
  assertFaceRuntime(input.context);
  assertNamedProfileRuntimeCompatibility({
    context: input.context,
    profiles: input.profiles,
  });
  assertHandoffMatchesFaceRuntime({
    context: input.context,
    handoff: input.handoff,
  });

  const selection =
    selectCharacterFaceGovernedInterpretationsV1({
      handoff: input.handoff,
      preferredLensOrder: Object.freeze([]),
      maxUnits: input.profiles.perspective.selection.maxUnits,
    });

  const protectedSegments =
    buildCharacterFaceProtectedInterpretationSegmentsV1({
      handoff: input.handoff,
      selection,
    });

  const protectedBeats: CharacterFaceGovernedReadingBeatV1[] =
    protectedSegments.map((segment, index) =>
      Object.freeze({
        kind: 'protected_interpretation' as const,
        interpretationRef: segment.interpretationId,
        lensKey: segment.lensKey,
        direction: segment.direction,
        evidenceStatus: segment.evidenceStatus,
        purpose: index === 0 ? ('lead' as const) : ('expand' as const),
      }),
    );

  const followUp = resolveFollowUp({
    context: input.context,
    profiles: input.profiles,
    selection,
  });

  const beats = Object.freeze([
    ...protectedBeats,
    ...(followUp === null ? [] : [followUp]),
  ]);

  const withoutPlanId = {
    schemaVersion:
      CHARACTER_FACE_GOVERNED_READING_PLAN_SCHEMA_VERSION_V1,
    characterId: input.context.characterId,
    characterContentVersion: input.context.contentVersion,
    topicKey: input.context.face.topicKey,
    sourceResultHash: input.handoff.sourceResultHash,
    faceBundleHash: input.context.face.groundingRef.bundleHash,
    handoffHash: input.handoff.handoffHash,
    selectionPolicy:
      CHARACTER_FACE_GOVERNED_SELECTION_POLICY_V1,
    capabilityVersion: input.profiles.capability.capabilityVersion,
    perspectiveVersion: input.profiles.perspective.perspectiveVersion,
    deliveryVersion: input.profiles.delivery.deliveryVersion,
    selection,
    beats,
  } as const;

  const plan = Object.freeze({
    ...withoutPlanId,
    planId:
      `character_face_governed_plan_${sha256Json(withoutPlanId).slice(0, 24)}`,
  }) satisfies CharacterFaceGovernedReadingPlanV1;

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_GOVERNED_READING_PLAN_DECISION_SCHEMA_VERSION_V1,
    mode: 'governed_interpretation_plan' as const,
    plan,
    protectedSegments,
  });
}
